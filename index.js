const express = require('express');
const app = express();
const bodyParser = require("body-parser");
const path = require('path'); // Import the path module
require('events').EventEmitter.defaultMaxListeners = 500;

const PORT = process.env.PORT || 8000;

// Routers
let server = require('./qr');       // QR backend
let code = require('./pair');       // Pair backend  // Custom session backend

// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname))); // Serve static files from the root directory

// API routes
app.use('/server', server);
app.use('/code', code);
 // backend route for custom sessions

// Frontend pages
app.get('/pair', (req, res) => {
  res.sendFile(path.join(__dirname, 'pair.html'));
});

app.get('/qr', (req, res) => {
  res.sendFile(path.join(__dirname, 'qr.html'));
});

// Main landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'main.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`
Server running on http://localhost:${PORT}`);
});

module.exports = app;

/**╔═════════════ ANCORE-MD ═════════════╗
║💙  Your WhatsApp has been linked 💙
║
║   🧑 User: <Your WhatsApp Name>
║   🆔 JID: <Your WhatsApp JID>
║   🔗 Session: Ancore_<randomID or customID>
║
║   ✅ Pair/QR/Custom login successful
║   📌 Now deploy your bot to activate
║
║💙 Thank you for choosing Ancore 💙
╚════════════════════════════════════╝
 */
