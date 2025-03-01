const { Server, utils: { sftp: { STATUS_CODE } } } = require('ssh2');
const MemoryFileSystem = require('./lib/MemoryFileSystem');

class UploadSftpServer {
  constructor(options = {}) {
    this.options = {
      port: options.port || 2222,
      host: options.host || '0.0.0.0',
      hostKeys: options.hostKeys || [],
      debug: options.debug || false,
      users: options.users || [],
      authHandler: options.authHandler || null
    };
    
    // Create server with provided configuration
    this.server = new Server({
      hostKeys: this.options.hostKeys,
      debug: this.options.debug ? (msg) => console.log(msg) : false
    }, this._handleClient.bind(this));
    
    // Event callbacks
    this.onUpload = options.onUpload || null;
    this.onError = options.onError || null;
    this.onConnect = options.onConnect || null;
    this.onDisconnect = options.onDisconnect || null;
    this.onAuthenticated = options.onAuthenticated || null;
  }

  _handleClient(client) {
    if (this.onConnect) this.onConnect(client);
    
    // Create a filesystem instance for this client
    const filesystem = new MemoryFileSystem();

    client.on('authentication', async (ctx) => {
      try {
        // Custom authentication handler takes precedence if provided
        if (this.options.authHandler) {
          const authInfo = {
            connection: { ip: client.ip },
            username: ctx.username,
            password: ctx.method === 'password' ? ctx.password : null,
            method: ctx.method
          };
          
          try {
            // Call the custom auth handler
            const result = await Promise.resolve(this.options.authHandler(authInfo, filesystem));
            
            if (result === true || (result && typeof result === 'object')) {
              // Authentication successful
              if (this.options.debug) console.log(`User ${ctx.username} authenticated successfully via custom handler`);
              // Set the current user in the filesystem
              filesystem.setCurrentUser(ctx.username);
              ctx.accept();
              if (this.onAuthenticated) this.onAuthenticated(ctx.username);
            } else {
              // Authentication failed
              if (this.options.debug) console.log(`Authentication failed for ${ctx.username} via custom handler`);
              ctx.reject();
            }
            return;
          } catch (error) {
            if (this.options.debug) console.log(`Custom auth error: ${error.message}`);
            ctx.reject();
            return;
          }
        }
        
        // Default authentication logic (using users from options)
        const user = this.options.users.find(u => u.username === ctx.username);
        let allowed = !!user;

        // Only allow password authentication
        switch (ctx.method) {
          case 'password':
            if (!user || user.password !== ctx.password) {
              if (this.options.debug) console.log(`Authentication failed for ${ctx.username}`);
              return ctx.reject();
            }
            break;
          default:
            return ctx.reject(['password']);
        }

        if (allowed) {
          if (this.options.debug) console.log(`User ${ctx.username} authenticated successfully`);
          // Set the current user in the filesystem
          filesystem.setCurrentUser(ctx.username);
          ctx.accept();
          if (this.onAuthenticated) this.onAuthenticated(ctx.username);
        } else {
          ctx.reject();
        }
      } catch (error) {
        console.error('Authentication error:', error);
        ctx.reject();
      }
    }).on('ready', () => {
      if (this.options.debug) console.log('Client authenticated!');

      client.on('session', (accept, reject) => {
        const session = accept();
        session.on('sftp', (accept, reject) => {
          const sftp = accept();
          if (this.options.debug) console.log('SFTP session accepted');

          // Handle OPEN requests
          sftp.on('OPEN', (reqid, filename) => {
            if (this.options.debug) console.log(`OPEN: ${filename}`);
            try {
              const handle = filesystem.openFile(filename);
              sftp.handle(reqid, handle);
            } catch (err) {
              console.error(`Error opening file: ${err.message}`);
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          // Handle CLOSE requests
          sftp.on('CLOSE', async (reqid, handle) => {
            if (this.options.debug) console.log(`CLOSE: ${handle.toString()}`);
            try {
              await filesystem.closeHandle(handle);
              
              // Notify about uploaded file
              const uploadedFile = filesystem.getUploaded();
              if (uploadedFile && this.onUpload) {
                this.onUpload(uploadedFile);
                filesystem.removeUploaded();
              }
              
              sftp.status(reqid, STATUS_CODE.OK);
            } catch (err) {
              console.error(`Error closing handle: ${err.message}`);
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          // Handle READ requests - always return EOF
          sftp.on('READ', (reqid) => {
            sftp.status(reqid, STATUS_CODE.EOF);
          });

          // Handle WRITE requests
          sftp.on('WRITE', (reqid, handle, offset, data) => {
            if (this.options.debug) console.log(`WRITE: ${handle.toString()}, offset: ${offset}, ${data.length} bytes`);
            try {
              filesystem.writeData(handle, offset, data);
              sftp.status(reqid, STATUS_CODE.OK);
            } catch (err) {
              console.error(`Error writing data: ${err.message}`);
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          // Handle OPENDIR requests
          sftp.on('OPENDIR', (reqid, path) => {
            if (this.options.debug) console.log(`OPENDIR: ${path}`);
            try {
              const handle = filesystem.openDirectory(path);
              sftp.handle(reqid, handle);
            } catch (err) {
              console.error(`Error opening directory: ${err.message}`);
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          // Handle READDIR requests
          sftp.on('READDIR', (reqid, handle) => {
            if (this.options.debug) console.log(`READDIR: ${handle.toString()}`);
            // EOF as we don't have a real directory
            sftp.status(reqid, STATUS_CODE.EOF);
          });

          // Handle REALPATH
          sftp.on('REALPATH', (reqid, path) => {
            if (this.options.debug) console.log(`REALPATH: ${path}`);
            try {
              // Normalize the path
              const normalizedPath = path === '.' ? '/' : path;
              // Return a single name entry for the path
              sftp.name(reqid, [{
                filename: normalizedPath,
                longname: normalizedPath,
                attrs: filesystem.getAttributes()
              }]);
            } catch (err) {
              console.error(`Error resolving path: ${err.message}`);
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          // Handle FSTAT and STAT requests
          sftp.on('FSTAT', (reqid) => {
            const attrs = filesystem.getAttributes();
            sftp.attrs(reqid, attrs);
          });

          sftp.on('STAT', (reqid) => {
            const attrs = filesystem.getAttributes();
            sftp.attrs(reqid, attrs);
          });

          // Handle other requests with FAILURE responses
          ['MKDIR', 'REMOVE', 'RMDIR', 'RENAME'].forEach(method => {
            sftp.on(method, (reqid, ...args) => {
              if (this.options.debug) console.log(`${method}: ${args.join(', ')}`);
              sftp.status(reqid, STATUS_CODE.FAILURE);
            });
          });
        });
      });
    }).on('error', (err) => {
      console.error('Client error:', err);
      if (this.onError) this.onError(err);
    }).on('close', () => {
      if (this.options.debug) console.log('Client disconnected');
      if (this.onDisconnect) this.onDisconnect(client);
    });
  }

  listen(port, host) {
    const serverPort = port || this.options.port;
    const serverHost = host || this.options.host;
    
    return new Promise((resolve) => {
      this.server.listen(serverPort, serverHost, () => {
        if (this.options.debug) {
          console.log(`SFTP server listening on ${serverHost}:${serverPort}`);
        }
        resolve({ port: serverPort, host: serverHost });
      });
    });
  }

  close() {
    return new Promise((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }
}

module.exports = UploadSftpServer;