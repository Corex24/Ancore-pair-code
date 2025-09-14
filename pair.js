const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers
} = require('@whiskeysockets/baileys');
const { upload } = require('./mega');
const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
const router = express.Router();
const pino = require("pino");

// Store active sessions for status checking
const activeSessions = new Map();

// Remove temporary files
function removeFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    fs.rmSync(filePath, { recursive: true, force: true });
    return true;
  } catch (e) {
    console.error('Error deleting file:', e);
    return false;
  }
}

// Function to validate and format international phone numbers
function validateAndFormatPhoneNumber(number) {
  // Remove all non-digit characters
  const cleaned = number.replace(/[^0-9]/g, '');
  
  // Check if the number is empty
  if (!cleaned) {
    return { valid: false, error: 'Phone number is required' };
  }
  
  // Check if the number already has a country code (starts with digits 1-9)
  if (cleaned.match(/^[1-9]/)) {
    // Number already has country code, validate length
    if (cleaned.length < 8 || cleaned.length > 15) {
      return { 
        valid: false, 
        error: 'Invalid phone number length. Should be between 8-15 digits including country code' 
      };
    }
    return { valid: true, formatted: cleaned };
  }
  
  // If we reach here, the number might be missing country code
  return { 
    valid: false, 
    error: 'Phone number must include country code (e.g., 1 for US, 44 for UK, 91 for India)' 
  };
}

// Status endpoint for frontend to check connection status
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
      sessionId: sessionData.finalSessionId,
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
  let num = req.query.number;

  console.log('Pairing request started with ID:', id, 'Number:', num);

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

  // Validate phone number
  if (!num) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  // Validate and format phone number
  const validationResult = validateAndFormatPhoneNumber(num);
  if (!validationResult.valid) {
    return res.status(400).json({ error: validationResult.error });
  }
  
  const formattedNumber = validationResult.formatted;
  console.log('Formatted number:', formattedNumber);

  // Store initial session data for status tracking
  activeSessions.set(id, {
    connected: false,
    finalSessionId: null,
    userJid: null,
    timestamp: Date.now(),
    phoneNumber: formattedNumber
  });

  // Set timeout for the entire process
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.log('Pairing process timeout for session:', id);
      res.status(408).json({ error: 'Pairing process timeout - please try again' });
    }
    activeSessions.delete(id);
    removeFile('./temp/' + id);
  }, 60000); // 60 seconds timeout

  async function ANCORE_PAIR() {
    console.log('Starting ANCORE_PAIR for session:', id);
    
    try {
      const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
      
      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: "fatal" }).child({ level: "fatal" })
          )
        },
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        syncFullHistory: false,
        browser: Browsers.ubuntu('Ancore')
      });

      // Request pairing code if not registered
      if (!sock.authState.creds.registered) {
        console.log('Requesting pairing code for:', formattedNumber);
        await delay(1500);
        
        try {
          const code = await sock.requestPairingCode(formattedNumber);
          console.log('Pairing code generated successfully:', code);
          
          if (!res.headersSent) {
            clearTimeout(timeout);
            return res.json({ 
              success: true,
              code,
              message: 'Pairing code generated successfully',
              sessionId: id, // Return backend session ID to frontend
              instructions: 'Enter this code in WhatsApp > Linked Devices > Link a Device'
            });
          }
        } catch (error) {
          console.error('Error requesting pairing code:', error);
          activeSessions.delete(id);
          removeFile('./temp/' + id);
          if (!res.headersSent) {
            clearTimeout(timeout);
            return res.status(500).json({ 
              error: 'Failed to generate pairing code',
              details: error.message,
              note: 'Make sure your phone number includes the correct country code'
            });
          }
        }
      } else {
        console.log('Device already registered');
        if (!res.headersSent) {
          clearTimeout(timeout);
          return res.status(400).json({ 
            error: 'Device already registered',
            message: 'This number is already linked to a WhatsApp session'
          });
        }
      }

      // Handle credentials updates
      sock.ev.on('creds.update', saveCreds);

      // Handle connection updates
      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        console.log('Connection update for session', id, ':', connection);

        if (connection === "open") {
          console.log(`Connected successfully to ${sock.user.id}`);
          
          try {
            await delay(3000); // Wait for connection to stabilize
            const rf = __dirname + `/temp/${id}/creds.json`;

            if (!fs.existsSync(rf)) {
              console.error('Credentials file not found:', rf);
              throw new Error('Credentials file not found');
            }

            // Upload session to MEGA
            console.log('Uploading session to MEGA...');
            const mega_url = await upload(fs.createReadStream(rf), `${sock.user.id}.json`);
            const string_session = mega_url.replace('https://mega.nz/file/', '');
            let ancore = "Ancore_" + string_session;

            // Update session data with final session ID
            activeSessions.set(id, {
              connected: true,
              finalSessionId: ancore,
              userJid: sock.user.id,
              timestamp: Date.now(),
              phoneNumber: formattedNumber
            });

            console.log('Session created successfully:', ancore);

            // Send session ID to user
            await sock.sendMessage(sock.user.id, { text: ancore });

            // Send welcome message
            const welcomeMessage = `> *⚡ Welcome to Ancore💙!*

——————————————————
*Your Session Id has been successfully created*
*Keep Session Id Safe!* Don't share Session Id with anyone!
——————————————————
                           
> *STAY UPDATED ⚡:*
Telegram Group:
https://t.me/+UfO-wlwfOaM3NmE0
                        
WhatsApp Channel:
https://whatsapp.com/channel/0029Vb6nHar2phHORBFhOn3p

——————————————————
> *Ancore Repo:*
https://github.com/Corex24/Ancore.git

——————————————————
Having problem deploying *Ancore*?
Message *Corex*
http://wa.me/2348036869669 
OR
http://t.me/corex2410

(c) Created by Corex with 💙`;

            await sock.sendMessage(sock.user.id, { text: welcomeMessage });
            console.log('Welcome message sent successfully');

          } catch (uploadError) {
            console.error("Error uploading session file:", uploadError);
            activeSessions.delete(id);
          }

          // Cleanup
          try {
            await delay(2000);
            await sock.ws.close();
          } catch (closeError) {
            console.error('Error closing connection:', closeError);
          }
          removeFile('./temp/' + id);
          console.log(`${sock.user.id} CONNECTED ✅ CLEANED UP`);
        } 
        else if (connection === "close") {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          console.log('Connection closed with status:', statusCode);
          
          if (statusCode === 401) {
            console.log('Authentication failed, not reconnecting');
            removeFile('./temp/' + id);
            activeSessions.delete(id);
          } else if (statusCode !== 440) { // Don't reconnect on connection replaced
            console.log('Connection closed, attempting to reconnect...');
            await delay(5000);
            ANCORE_PAIR().catch(console.error);
          }
        }
      });

      // Handle socket errors
      sock.ev.on('connection.error', (error) => {
        console.error('Socket connection error for session', id, ':', error);
      });

    } catch (err) {
      console.error("Error in ANCORE_PAIR:", err);
      removeFile('./temp/' + id);
      activeSessions.delete(id);
      if (!res.headersSent) {
        clearTimeout(timeout);
        res.status(500).json({ 
          error: 'Service unavailable', 
          details: err.message 
        });
      }
    }
  }

  await ANCORE_PAIR();
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'WhatsApp Pairing Service',
    timestamp: new Date().toISOString(),
    activeSessions: activeSessions.size
  });
});

// Clean up old sessions periodically (older than 1 hour)
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
