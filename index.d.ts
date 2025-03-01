/// <reference types="node" />
import { Buffer } from 'buffer';
import { Server } from 'ssh2';

declare class MemoryFileSystem {
  constructor();
  setCurrentUser(username: string): void;
  openFile(filename: string): Buffer;
  openDirectory(path: string): Buffer;
  readDirectory(): Array<{filename: string; longname: string; attrs: any}>;
  writeData(handle: Buffer, offset: number, data: Buffer): boolean;
  closeHandle(handle: Buffer): Promise<void>;
  getAttributes(): {
    mode: number;
    uid: number;
    gid: number;
    size: number;
    atime: Date;
    mtime: Date;
    isDirectory: () => boolean;
  };
  getUploaded(): UploadedFileData | null;
  removeUploaded(): void;
}

export interface AuthInfo {
  connection: { 
    ip: string;
    [key: string]: any;
  };
  username: string;
  password: string | null;
  method: string;
}

export interface UploadedFileData {
  filename: string;
  username: string;
  buffer: Buffer;
  size: number;
}

export interface ServerOptions {
  /**
   * Port to listen on
   * @default 2222
   */
  port?: number;
  
  /**
   * Host to bind to
   * @default '0.0.0.0'
   */
  host?: string;
  
  /**
   * Array of private keys (as Buffers) for the server
   * @default []
   */
  hostKeys: Buffer[];
  
  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
  
  /**
   * Array of user objects with username and password properties
   * @default []
   */
  users?: Array<{username: string; password: string}>;
  
  /**
   * Custom authentication handler function
   * @default null
   */
  authHandler?: (authInfo: AuthInfo, filesystem: MemoryFileSystem) => boolean | Promise<boolean>;
  
  /**
   * Called when a file is uploaded
   */
  onUpload?: (fileData: UploadedFileData) => void;
  
  /**
   * Called when a client connects
   */
  onConnect?: (client: any) => void;
  
  /**
   * Called when a client disconnects
   */
  onDisconnect?: (client: any) => void;
  
  /**
   * Called when a user is authenticated
   */
  onAuthenticated?: (username: string) => void;
  
  /**
   * Called when an error occurs
   */
  onError?: (error: Error) => void;
}

declare class UploadSftpServer {
  /**
   * Create a new SFTP server for handling file uploads
   * @param options Server configuration options
   */
  constructor(options: ServerOptions);
  
  /**
   * Start the SFTP server
   * @param port Optional port to override the one specified in constructor
   * @param host Optional host to override the one specified in constructor
   * @returns Promise that resolves with server info when server is started
   */
  listen(port?: number, host?: string): Promise<{port: number; host: string}>;
  
  /**
   * Stop the SFTP server
   * @returns Promise that resolves when server is stopped
   */
  close(): Promise<void>;
  
  /**
   * The underlying SSH2 server instance
   */
  server: Server;
}

export = UploadSftpServer; 