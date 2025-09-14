const mega = require("megajs");

// MEGA account credentials
const email = 'darkwebagent096@gmail.com';
const password = 'Darknetofficialgh@@2144';

// Upload function to MEGA
async function upload(fileStream, filename) {
    return new Promise((resolve, reject) => {
        try {
            // Create MEGA storage instance
            const storage = new mega.Storage({
                email: email,
                password: password,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }, (error) => {
                if (error) {
                    console.error('MEGA login error:', error);
                    return reject(error);
                }

                // Upload the file
                const uploadOptions = {
                    name: filename,
                    allowUploadBuffering: true
                };

                const uploadStream = storage.upload(uploadOptions);
                
                // Pipe the file stream to MEGA upload
                fileStream.pipe(uploadStream);
                
                // Handle upload completion
                uploadStream.on('complete', (file) => {
                    file.link((error, link) => {
                        if (error) {
                            console.error('Error getting file link:', error);
                            return reject(error);
                        }
                        
                        console.log('File uploaded successfully:', link);
                        storage.close();
                        resolve(link);
                    });
                });
                
                // Handle upload errors
                uploadStream.on('error', (error) => {
                    console.error('Upload error:', error);
                    storage.close();
                    reject(error);
                });
            });
        } catch (error) {
            console.error('Upload exception:', error);
            reject(error);
        }
    });
}

module.exports = { upload };