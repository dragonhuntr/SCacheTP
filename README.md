# SCacheTP

A simple in-memory SFTP server that handles file uploads only. Uses [`ssh2`](https://github.com/mscdex/ssh2/) under the hood.

## Installation

```bash
npm install scachetp
```

## Features

- Simple SFTP server focused on file uploads
- In-memory file handling (no files written to disk by default)
- Custom authentication support
- Event callbacks for uploads, connections, and authentication

## Quick Start

```javascript
const UploadSftpServer = require('scachetp');
const fs = require('fs');
const path = require('path');

// Create a new server instance
const server = new UploadSftpServer({
  port: 2222,
  hostKeys: [fs.readFileSync(path.join(__dirname, 'host_key'))],
  users: [
    { username: 'testuser', password: 'password123' }
  ],
  onUpload: (fileData) => {
    console.log(`File uploaded: ${fileData.filename}`);
    console.log(`Size: ${fileData.size} bytes`);
    
    // Process the uploaded file (fileData.buffer contains the file content)
    // Example: save to disk
    fs.writeFileSync(
      path.join(__dirname, 'uploads', path.basename(fileData.filename)),
      fileData.buffer
    );
  }
});

// Start the server
server.listen().then(({ port, host }) => {
  console.log(`Server running at ${host}:${port}`);
});
```

## API Reference

### Constructor Options

The `UploadSftpServer` constructor accepts an options object with the following properties:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | Number | `2222` | Port to listen on |
| `host` | String | `'0.0.0.0'` | Host to bind to |
| `hostKeys` | Array | `[]` | Array of private keys (as Buffers) for the server |
| `debug` | Boolean | `false` | Enable debug logging |
| `users` | Array | `[]` | Array of user objects with `username` and `password` properties |
| `authHandler` | Function | `null` | Custom authentication handler function |

### Event Callbacks

You can provide callback functions for various events:

| Callback | Parameters | Description |
|----------|------------|-------------|
| `onUpload` | `(fileData)` | Called when a file is uploaded |
| `onConnect` | `(client)` | Called when a client connects |
| `onDisconnect` | `(client)` | Called when a client disconnects |
| `onAuthenticated` | `(username)` | Called when a user is authenticated |
| `onError` | `(error)` | Called when an error occurs |

The `fileData` object passed to `onUpload` contains:
- `filename`: The name of the uploaded file
- `username`: The username of the uploader
- `buffer`: The file content as a Buffer
- `size`: The size of the file in bytes

### Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `listen([port, host])` | Optional port and host | Promise | Starts the server |
| `close()` | None | Promise | Stops the server |

## Custom Authentication

You can provide a custom authentication handler function:

```javascript
const server = new UploadSftpServer({
  // ...other options
  authHandler: async (authInfo, filesystem) => {
    // authInfo contains: connection, username, password, method
    
    // Example: check against a database
    const user = await db.findUser(authInfo.username);
    if (user && user.password === authInfo.password) {
      return true; // Authentication successful
    }
    return false; // Authentication failed
  }
});
```

## Generating Host Keys

To generate a host key for your server:

```bash
ssh-keygen -t rsa -f host_key -N ""
```

## License

MIT 