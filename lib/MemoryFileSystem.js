const MemoryStream = require('memory-stream');
const nodePath = require('path');

const UNIX_SEP_REGEX = /\//g;
const WIN_SEP_REGEX = /\\/g;

class MemoryFileSystem {
    constructor() {
        this.storage = {};
        this.cwd = '/';
        this.root = process.cwd();
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
        
        if (!this.storage[filename]) {
            // Create a new stream for this file
            const stream = new MemoryStream();
            
            this.storage[filename] = {
                stream: stream,
                memoryStream: stream,
                size: 0
            };
        }
        
        this.storage[filename].stream.write(data);
        this.storage[filename].size += data.length;
        return true;
    }

    // Close handle and process file if needed
    async closeHandle(handle) {
        const filename = handle.toString();
        
        if (this.storage[filename]) {
            // End the stream
            if (this.storage[filename].stream) {
                this.storage[filename].stream.end();
            }
            
            // Wait for the memory stream to finish
            await new Promise(resolve => {
                this.storage[filename].memoryStream.on('finish', async () => {
                    try {
                        // Get the buffer from memory stream
                        const buffer = this.storage[filename].memoryStream.toBuffer();
                        console.log('Buffer.toString():', buffer.toString());
                        resolve();
                    } catch (err) {
                        console.error('Error processing file:', err);
                        resolve();
                    }
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
        for (const filename in this.storage) {
            if (this.storage[filename].memoryStream) {
                return {
                    filename,
                    buffer: this.storage[filename].memoryStream.toBuffer(),
                    size: this.storage[filename].size
                };
            }
        }
        return null;
    }

    // Remove the uploaded file
    removeUploaded() {
        for (const filename in this.storage) {
            delete this.storage[filename];
            break;
        }
    }
}

module.exports = MemoryFileSystem;