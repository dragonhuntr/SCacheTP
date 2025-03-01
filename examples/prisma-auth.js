const { PrismaClient } = require('@prisma/client');
const UploadSftpServer = require('scachetp');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

// Create and configure the SFTP server
function createSftpServer() {
  // Ensure the uploads directory exists
  const uploadsDir = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Create the server with Prisma authentication
  const server = new UploadSftpServer({
    port: process.env.SFTP_PORT || 2222,
    debug: process.env.NODE_ENV !== 'production',
    hostKeys: [fs.readFileSync(path.join(__dirname, '../../keys/host_key'))],
    
    // Custom auth handler using Prisma
    authHandler: async (authInfo) => {
      // Only handle password authentication
      if (authInfo.method !== 'password') {
        return false;
      }
      
      try {
        // Find the user in the database
        const user = await prisma.user.findUnique({
          where: { username: authInfo.username },
          select: {
            id: true,
            username: true,
            password: true
          },
        });

        // User not found or doesn't have SFTP access
        if (!user || !user.sftpAccess) {
          return false;
        }

        // Compare password (assuming passwords are hashed)
        // If using plain text passwords, just use: return user.password === authInfo.password;
        const passwordMatch = await bcrypt.compare(authInfo.password, user.password);
        
        // Return user object on successful auth (or just return true)
        return passwordMatch ? user : false;
      } catch (error) {
        console.error('SFTP authentication error:', error);
        return false;
      }
    },
    
    onUpload: async (fileData, reqid) => {
      console.log(reqid);
      console.log(`File uploaded: ${fileData.filename}`);
      console.log(`Size: ${fileData.size} bytes`);
      
      // Save the file to disk
      const filePath = path.join(uploadsDir, path.basename(fileData.filename));
      fs.writeFileSync(filePath, fileData.buffer);
      
      // Optionally log the upload to database
      try {
        await prisma.fileUpload.create({
          data: {
            filename: fileData.filename,
            size: fileData.size,
            path: filePath,
            uploadedAt: new Date(),
          },
        });
      } catch (error) {
        console.error('Error logging file upload to database:', error);
      }
    },
    onConnect: () => console.log('Client connected to SFTP'),
    onDisconnect: () => console.log('Client disconnected from SFTP'),
    onAuthenticated: (username) => console.log(`User ${username} authenticated to SFTP`),
  });

  return server;
}

module.exports = { createSftpServer };