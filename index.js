const express = require('express');
const app = express();
const path = require('path');

const PORT = process.env.PORT || 8000;

// Routers
let server = require('./qr');
let code = require('./pair');

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// API routes
app.use('/server', server);
app.use('/code', code);

// Frontend pages with session ID support
app.get('/pair', (req, res) => {
  res.sendFile(path.join(__dirname, 'pair.html'));
});

app.get('/qr', (req, res) => {
  // Pass session ID as query parameter if available
  const sessionId = req.query.sessionId || '';
  res.sendFile(path.join(__dirname, 'qr.html'));
});

// Main landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'main.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong!');
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;