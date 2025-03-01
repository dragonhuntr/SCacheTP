const MemoryStream = require('memory-stream');
const nodePath = require('path');

const UNIX_SEP_REGEX = /\//g;
const WIN_SEP_REGEX = /\\/g;

class MemoryFileSystem {
    constructor() {
        this.storage = {};
        this.cwd = '/';
        this.root = process.cwd();
        this.currentUser = null; // Add tracking for current user
    }

    // Set the current user for this filesystem instance
    setCurrentUser(username) {
        this.currentUser = username;
        
        // Create user directory if it doesn't exist
        if (this.currentUser && !this.storage[this.currentUser]) {
            this.storage[this.currentUser] = {};
        }
    }

    _resolvePath(path = '.') {
        // Unix separators normalize nicer on both unix and win platforms
        const resolvedPath = path.replace(WIN_SEP_REGEX, '/');

        // Join cwd with new path
        const joinedPath = nodePath.isAbsolute(resolvedPath)
            ? nodePath.normalize(resolvedPath)
            : nodePath.join('/', this.cwd, resolvedPath);

        // Create local filesystem path using the platform separator
        const fsPath = nodePath.resolve(nodePath.join(this.root, joinedPath)
            .replace(UNIX_SEP_REGEX, nodePath.sep)
            .replace(WIN_SEP_REGEX, nodePath.sep));

        // Create client path using unix separator
        const clientPath = joinedPath.replace(WIN_SEP_REGEX, '/');

        return {
            clientPath,
            fsPath
        };
    }

    // Simple handle creation - just use the filename as the handle
    openFile(filename) {
        try {
            // Create a buffer to use as handle
            const handle = Buffer.from(filename);
            return handle;
        } catch (err) {
            throw err;
        }
    }

    // Simple directory opening - just return the path as handle
    openDirectory(path) {
        return Buffer.from(path);
    }

    // Return empty directory listing
    readDirectory() {
        return [{filename: '/', longname: '/', attrs: {}}]
    }

    // Write data to memory stream
    writeData(handle, offset, data) {
        const filename = handle.toString();
        
        if (!this.currentUser) {
            throw new Error('No user set for this filesystem');
        }
        
        if (!this.storage[this.currentUser][filename]) {
            // Create a new stream for this file
            const stream = new MemoryStream();
            
            this.storage[this.currentUser][filename] = {
                stream: stream,
                memoryStream: stream,
                size: 0
            };
        }
        
        this.storage[this.currentUser][filename].stream.write(data);
        this.storage[this.currentUser][filename].size += data.length;
        return true;
    }

    // Close handle and process file if needed
    async closeHandle(handle) {
        const filename = handle.toString();
        
        if (!this.currentUser) {
            return; // No user set
        }
        
        if (this.storage[this.currentUser] && this.storage[this.currentUser][filename]) {
            // End the stream
            if (this.storage[this.currentUser][filename].stream) {
                this.storage[this.currentUser][filename].stream.end();
            }
            
            // Wait for the memory stream to finish
            await new Promise(resolve => {
                this.storage[this.currentUser][filename].memoryStream.on('finish', async () => {
                    resolve();
                });
            });
        }
    }

    // Return fake attributes for all paths
    getAttributes() {
        const fakeTime = new Date();
        
        return {
            mode: 0o755,
            uid: 0,
            gid: 0,
            size: 0,
            atime: fakeTime,
            mtime: fakeTime,
            isDirectory: () => true
        };
    }

    // Get the uploaded file
    getUploaded() {
        if (!this.currentUser || !this.storage[this.currentUser]) {
            return null;
        }
        
        for (const filename in this.storage[this.currentUser]) {
            if (this.storage[this.currentUser][filename].memoryStream) {
                return {
                    filename,
                    username: this.currentUser,
                    buffer: this.storage[this.currentUser][filename].memoryStream.toBuffer(),
                    size: this.storage[this.currentUser][filename].size
                };
            }
        }
        return null;
    }

    // Remove the uploaded file
    removeUploaded() {
        if (!this.currentUser || !this.storage[this.currentUser]) {
            return;
        }
        
        for (const filename in this.storage[this.currentUser]) {
            delete this.storage[this.currentUser][filename];
            break;
        }
    }
}

module.exports = MemoryFileSystem;