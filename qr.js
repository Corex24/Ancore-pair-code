const fs = require('fs');
const QRCode = require('qrcode');
const pino = require('pino');
const express = require('express');
const { upload } = require('./mega');
const { makeid } = require('./gen-id');
const {
  default: makeWASocket,
  Browsers,
  delay,
  useMultiFileAuthState
} = require('@whiskeysockets/baileys');

const router = express.Router();

// Store active sessions
const activeSessions = new Map();

function removeFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    fs.rmSync(filePath, { recursive: true, force: true });
    return true;
  } catch (e) {
    console.log('Error deleting file:', e);
    return false;
  }
}

// Status endpoint
router.get('/status', (req, res) => {
  const sessionId = req.query.sessionId;
  
  if (!sessionId) {
    return res.status(400).json({ 
      connected: false, 
      error: 'Session ID is required' 
    });
  }
  
  const sessionData = activeSessions.get(sessionId);
  
  if (sessionData && sessionData.connected) {
    res.json({
      connected: true,
      sessionId: sessionData.sessionId,
      userJid: sessionData.userJid,
      timestamp: sessionData.timestamp
    });
  } else {
    res.json({
      connected: false,
      message: 'Session not found or not connected yet'
    });
  }
});

router.get('/', async (req, res) => {
  const id = makeid();
  
  // Ensure temp directory exists
  const tempDir = './temp';
  if (!fs.existsSync(tempDir)) {
    try {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log('Created temp directory');
    } catch (error) {
      console.error('Failed to create temp directory:', error);
      return res.status(500).json({ error: 'Failed to create temp directory' });
    }
  }
  
  console.log('Starting QR generation with ID:', id);
  
  // Store initial session data
  activeSessions.set(id, {
    connected: false,
    sessionId: null,
    userJid: null,
    timestamp: Date.now()
  });

  async function ANCORE_MAIN() {
    console.log('Initializing WhatsApp connection...');
    
    try {
      const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
      
      let sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: Browsers.ubuntu('Ancore'),
        generateHighQualityLinkPreview: true
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect, qr } = s;
        
        console.log('Connection update:', { connection, hasQR: !!qr });

        if (qr && !res.headersSent) {
          console.log('QR code received, generating image...');
          try {
            // Set proper headers for QR code image
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            
            const qrBuffer = await QRCode.toBuffer(qr, {
              errorCorrectionLevel: 'H',
              margin: 2,
              width: 300,
              color: {
                dark: '#000000',
                light: '#FFFFFF'
              }
            });
            
            console.log('QR code generated successfully, buffer size:', qrBuffer.length);
            return res.end(qrBuffer);
          } catch (qrError) {
            console.error("QR generation error:", qrError);
            if (!res.headersSent) {
              res.status(500).json({ error: "QR generation failed", details: qrError.message });
            }
            return;
          }
        }

        if (connection === "open") {
          console.log('WhatsApp connection established for user:', sock.user.id);
          try {
            await delay(3000);
            let rf = __dirname + `/temp/${id}/creds.json`;

            if (!fs.existsSync(rf)) {
              console.error('Credentials file not found:', rf);
              throw new Error('Credentials file not found');
            }

            console.log('Uploading credentials to MEGA...');
            const mega_url = await upload(fs.createReadStream(rf), `${sock.user.id}.json`);
            let md = "Ancore_" + mega_url.replace('https://mega.nz/file/', '');

            // Update session data with the actual session ID
            activeSessions.set(id, {
              connected: true,
              sessionId: md,
              userJid: sock.user.id,
              timestamp: Date.now()
            });

            console.log('Session created successfully:', md);

            // Send session ID to user
            await sock.sendMessage(sock.user.id, { text: md });

            // Send welcome message
            const desc = `> *⚡ Welcome to Ancore💙!*

——————————————————
*Your Session Id has been successfully created*
*Keep Session Id Safe!* Don't share it with anyone!
——————————————————
> *STAY UPDATED ⚡:*
Telegram Group: https://t.me/+UfO-wlwfOaM3NmE0
WhatsApp Channel: https://whatsapp.com/channel/0029Vb6nHar2phHORBFhOn3p
——————————————————
> *Ancore Repo:*
https://github.com/Corex24/Ancore.git
——————————————————
Having issues deploying Ancore?
Message *Corex*:
http://wa.me/2348036869669 OR http://t.me/corex2410

(c) Created by Corex with 💙`;

            await sock.sendMessage(sock.user.id, { text: desc });
            console.log('Welcome message sent successfully');
          } catch (error) {
            console.error("Error in session creation:", error);
          }

          // Cleanup connection
          try {
            await delay(2000);
            await sock.ws.close();
          } catch (closeError) {
            console.error("Error closing connection:", closeError);
          }
          
          // Clean up temp files
          removeFile('./temp/' + id);
          console.log(`${sock.user.id} CONNECTED ✅ CLEANED UP`);
        } else if (connection === "close") {
          const shouldRetry = lastDisconnect?.error?.output?.statusCode !== 401;
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          
          console.log('Connection closed:', { statusCode, shouldRetry });
          
          if (shouldRetry) {
            console.log('Retrying connection in 10 seconds...');
            await delay(10000);
            ANCORE_MAIN().catch(console.error);
          } else {
            console.log('Not retrying - authentication failed');
            removeFile('./temp/' + id);
            activeSessions.delete(id);
            if (!res.headersSent) {
              res.status(401).json({ error: "Authentication failed" });
            }
          }
        }
      });

      // Handle socket errors
      sock.ev.on('connection.error', (error) => {
        console.error('Socket connection error:', error);
      });

    } catch (err) {
      console.error("Service error:", err);
      removeFile('./temp/' + id);
      activeSessions.delete(id);
      if (!res.headersSent) {
        res.status(500).json({ 
          error: "Service unavailable", 
          details: err.message,
          stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
      }
    }
  }

  // Add timeout for QR generation
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.log('QR generation timeout after 60 seconds');
      res.status(408).json({ error: "QR generation timeout - please try again" });
    }
    activeSessions.delete(id);
    removeFile('./temp/' + id);
  }, 60000); // 60 seconds timeout

  try {
    await ANCORE_MAIN();
  } catch (error) {
    console.error('ANCORE_MAIN error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Internal server error", 
        details: error.message 
      });
    }
  } finally {
    clearTimeout(timeout);
  }
});

// Clean up old sessions periodically
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  for (const [sessionId, sessionData] of activeSessions.entries()) {
    if (now - sessionData.timestamp > oneHour) {
      activeSessions.delete(sessionId);
      console.log('Cleaned up old session:', sessionId);
    }
  }
}, 30 * 60 * 1000); // Clean every 30 minutes

module.exports = router;
