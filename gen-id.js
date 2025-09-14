const crypto = require('crypto');

function makeid(num = 4) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  
  // Validate input
  if (typeof num !== 'number' || num < 1) {
    num = 4; // Default to 4 if invalid
  }
  
  let result = "";
  const randomBytes = crypto.randomBytes(num);
  
  for (let i = 0; i < num; i++) {
    result += characters.charAt(randomBytes[i] % characters.length);
  }
  
  return result;
}

module.exports = {makeid};