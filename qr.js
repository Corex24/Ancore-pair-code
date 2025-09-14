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
  useMultiFileAuthState,
  jidNormalizedUser,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const router = express.Router();

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

router.get('/', async (req, res) => {
  const id = makeid();
  const num = req.query.number;

  async function ANCORE_MAIN() {
    const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
    try {
      let sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Desktop")
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect, qr } = s;

        if (qr) {
          const qrBuffer = await QRCode.toBuffer(qr);
          res.end(qrBuffer);
        }

        if (connection === "open") {
          try {
            await delay(5000);
            let rf = __dirname + `/temp/${id}/creds.json`;

            const mega_url = await upload(fs.createReadStream(rf), `${sock.user.id}.json`);
            let md = "Ancore_" + mega_url.replace('https://mega.nz/file/', '');

            // Send session ID
            await sock.sendMessage(sock.user.id, { text: md });

            // Send welcome message
            const desc = `> *⚡ Welcome to Ancore💙!*

——————————————————
*Your Session Id has been successfully created*
*Keep Session Id Safe!* Don’t share it with anyone!
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
            console.error("Error sending session file:", error);
          }

          await delay(10);
          await sock.ws.close();
          await removeFile('./temp/' + id);
          console.log(`${sock.user.id} CONNECTED ✅ CLEANED UP`);
        } else if (
          connection === "close" &&
          lastDisconnect?.error?.output?.statusCode !== 401
        ) {
          await delay(10);
          ANCORE_MAIN();
        }
      });
    } catch (err) {
      console.log("Service restarted");
      await removeFile('./temp/' + id);
      if (!res.headersSent) {
        res.send({ code: "❗ Service Unavailable" });
      }
    }
  }

  await ANCORE_MAIN();
});

// Optional: restart the process every 3 minutes
setInterval(() => {
  console.log("RESTARTING PROCESS ...");
  process.exit();
}, 180000);

module.exports = router;
