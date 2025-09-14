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
  
  // Set proper headers for QR code image
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Store initial session data
  activeSessions.set(id, {
    connected: false,
    sessionId: null,
    userJid: null,
    timestamp: Date.now()
  });

  async function ANCORE_MAIN() {
    const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
    
    try {
      let sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: Browsers.chrome("Windows")
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect, qr } = s;

        if (qr && !res.headersSent) {
          try {
            const qrBuffer = await QRCode.toBuffer(qr, {
              errorCorrectionLevel: 'H',
              margin: 2,
              width: 300
            });
            res.end(qrBuffer);
          } catch (qrError) {
            console.error("QR generation error:", qrError);
            if (!res.headersSent) {
              res.status(500).send("QR generation failed");
            }
          }
        }

        if (connection === "open") {
          try {
            await delay(3000);
            let rf = __dirname + `/temp/${id}/creds.json`;

            const mega_url = await upload(fs.createReadStream(rf), `${sock.user.id}.json`);
            let md = "Ancore_" + mega_url.replace('https://mega.nz/file/', '');

            // Update session data
            activeSessions.set(id, {
              connected: true,
              sessionId: md,
              userJid: sock.user.id,
              timestamp: Date.now()
            });

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
          } catch (error) {
            console.error("Error in session creation:", error);
          }

          // Cleanup
          try {
            await sock.ws.close();
          } catch (closeError) {
            console.error("Error closing connection:", closeError);
          }
          removeFile('./temp/' + id);
          console.log(`${sock.user.id} CONNECTED ✅ CLEANED UP`);
        } else if (
          connection === "close" &&
          lastDisconnect?.error?.output?.statusCode !== 401
        ) {
          await delay(10000);
          ANCORE_MAIN().catch(console.error);
        }
      });
    } catch (err) {
      console.log("Service error:", err);
      removeFile('./temp/' + id);
      activeSessions.delete(id);
      if (!res.headersSent) {
        res.status(500).send("Service unavailable");
      }
    }
  }

  // Add timeout for QR generation
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(408).send("QR generation timeout");
    }
    activeSessions.delete(id);
  }, 30000);

  try {
    await ANCORE_MAIN();
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
    }
  }
}, 30 * 60 * 1000); // Clean every 30 minutes

module.exports = router;