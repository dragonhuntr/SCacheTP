const path = require('path');
const fs = require('fs');
const UploadSftpServer = require('../index');

// Create a new server instance
const server = new UploadSftpServer({
  port: 2222,
  debug: true,
  hostKeys: [fs.readFileSync(path.join(__dirname, '../keys/host_key'))],
  users: [
    { username: 'testuser', password: 'password123' }
  ],
  onUpload: (fileData) => {
    console.log(`File uploaded: ${fileData.filename}`);
    console.log(`Size: ${fileData.size} bytes`);
    
    // Write to disk as an example
    fs.writeFileSync(
      path.join(__dirname, 'uploads', path.basename(fileData.filename)),
      fileData.buffer
    );
  },
  onConnect: () => console.log('Client connected'),
  onDisconnect: () => console.log('Client disconnected'),
  onAuthenticated: (username) => console.log(`User ${username} authenticated`)
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Start the server
server.listen().then(({ port, host }) => {
  console.log(`Server running at ${host}:${port}`);
  console.log(`Test user: testuser / password123`);
});

// Handle process termination
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await server.close();
  process.exit(0);
});