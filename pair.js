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
let router = express.Router();
const pino = require("pino");

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

router.get('/', async (req, res) => {
  const id = makeid();
  let num = req.query.number;

  async function ANCORE_PAIR() {
    const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
    try {
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
        browser: Browsers.macOS("Safari")
      });

      // Request pairing code
      if (!sock.authState.creds.registered) {
        await delay(1500);
        num = num.replace(/[^0-9]/g, '');
        const code = await sock.requestPairingCode(num);
        if (!res.headersSent) {
          return res.send({ code });
        }
      }

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;

        if (connection === "open") {
          await delay(5000);
          const rf = __dirname + `/temp/${id}/creds.json`;

          try {
            const mega_url = await upload(fs.createReadStream(rf), `${sock.user.id}.json`);
            const string_session = mega_url.replace('https://mega.nz/file/', '');
            let ancore = "Ancore_" + string_session;

            // Send session ID
            await sock.sendMessage(sock.user.id, { text: ancore });

            // Send welcome message
            const scd = `> *⚡ Welcome to Ancore💙!*

——————————————————
*Your Session Id has been successfully created*
*Keep Session Id Safe!* Don’t share Session Id with anyone!
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

            await sock.sendMessage(sock.user.id, { text: scd });
          } catch (e) {
            console.error("Error sending session file:", e);
          }

          await delay(10);
          await sock.ws.close();
          removeFile('./temp/' + id);
          console.log(`${sock.user.id} CONNECTED ✅ CLEANED UP`);
        } 
        else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
          await delay(10);
          ANCORE_PAIR();
        }
      });
    } catch (err) {
      console.log("Service restarted");
      removeFile('./temp/' + id);
      if (!res.headersSent) {
        res.send({ code: "❗ Service Unavailable" });
      }
    }
  }

  await ANCORE_PAIR();
});

// Optional process restart (only if using PM2/Render auto-restart)
setInterval(() => {
  console.log("RESTARTING PROCESS ...");
  process.exit();
}, 180000);

module.exports = router;
