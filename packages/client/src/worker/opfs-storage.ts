/**
 * OPFS Storage Manager
 *
 * Manages Origin Private File System storage for all persistent files.
 * Provides async file handle creation and pre-loading of existing files.
 */

import { SyncOPFSFile, Directory, type Inode } from '@bjorn3/browser_wasi_shim';

export interface OpfsStorageConfig {
  storyId: string;
}

/** Files that should not be persisted (read-only game files) */
const READ_ONLY_FILES = new Set(['story.ulx']);

/**
 * Manages OPFS directory for persistent files.
 *
 * Directory structure: /wasiglk/[storyId]/
 * Mirrors the WASI filesystem structure.
 */
export class OpfsStorage {
  private rootDir: FileSystemDirectoryHandle | null = null;
  private readonly storyId: string;
  /** Track all open handles for cleanup */
  private readonly openHandles: FileSystemSyncAccessHandle[] = [];

  private constructor(storyId: string) {
    this.storyId = storyId;
  }

  /**
   * Check if OPFS is available in this environment.
   * Requires secure context (HTTPS or localhost) and Worker context.
   */
  static isAvailable(): boolean {
    return typeof navigator?.storage?.getDirectory === 'function';
  }

  /**
   * Check if a path should be persisted to OPFS.
   * Excludes read-only files like story.ulx.
   */
  static shouldPersist(path: string): boolean {
    // Get the filename (last component of path)
    const filename = path.split('/').pop() ?? path;
    return !READ_ONLY_FILES.has(filename);
  }

  /**
   * Create and initialize OPFS storage manager.
   * Pre-loads existing files from OPFS into a directory structure.
   *
   * @returns OpfsStorage instance and root directory contents
   */
  static async create(config: OpfsStorageConfig): Promise<{
    manager: OpfsStorage;
    rootContents: Map<string, Inode>;
  }> {
    const manager = new OpfsStorage(config.storyId);
    const rootContents = await manager.initialize();
    return { manager, rootContents };
  }

  /**
   * Initialize OPFS directory structure and load existing files.
   */
  private async initialize(): Promise<Map<string, Inode>> {
    const rootContents = new Map<string, Inode>();

    try {
      // Get OPFS root
      const opfsRoot = await navigator.storage.getDirectory();

      // Create directory structure: /wasiglk/[storyId]/
      const wasiglkDir = await opfsRoot.getDirectoryHandle('wasiglk', { create: true });
      this.rootDir = await wasiglkDir.getDirectoryHandle(this.storyId, { create: true });

      // Recursively load all files from OPFS
      await this.loadDirectory(this.rootDir, rootContents);

      const fileCount = this.openHandles.length;
      console.log(`[opfs] Loaded ${fileCount} existing files for story ${this.storyId}`);
    } catch (err) {
      console.error('[opfs] Initialization failed:', err);
      throw err;
    }

    return rootContents;
  }

  /**
   * Recursively load files from an OPFS directory into a Map.
   */
  private async loadDirectory(
    dirHandle: FileSystemDirectoryHandle,
    contents: Map<string, Inode>,
  ): Promise<void> {
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === 'file') {
        try {
          const fileHandle = handle as FileSystemFileHandle;
          const syncHandle = await fileHandle.createSyncAccessHandle();
          this.openHandles.push(syncHandle);
          contents.set(name, new SyncOPFSFile(syncHandle));
        } catch (err) {
          console.warn(`[opfs] Failed to open existing file ${name}:`, err);
        }
      } else if (handle.kind === 'directory') {
        // Recursively load subdirectory
        const subDirHandle = handle as FileSystemDirectoryHandle;
        const subContents = new Map<string, Inode>();
        await this.loadDirectory(subDirHandle, subContents);
        contents.set(name, new Directory(subContents));
      }
    }
  }

  /**
   * Create a new file in OPFS and return its sync access handle.
   * Supports nested paths like "saves/game.sav".
   *
   * @param path - Path to file (relative to WASI root)
   * @returns FileSystemSyncAccessHandle for the new file
   */
  async createFile(path: string): Promise<FileSystemSyncAccessHandle> {
    if (!this.rootDir) {
      throw new Error('OpfsStorage not initialized');
    }

    // Parse path into directory components and filename
    const parts = path.split('/').filter(p => p.length > 0);
    const filename = parts.pop();
    if (!filename) {
      throw new Error(`Invalid path: ${path}`);
    }

    // Navigate/create directories as needed
    let currentDir = this.rootDir;
    for (const dirName of parts) {
      currentDir = await currentDir.getDirectoryHandle(dirName, { create: true });
    }

    // Create the file
    const fileHandle = await currentDir.getFileHandle(filename, { create: true });
    const syncHandle = await fileHandle.createSyncAccessHandle();
    this.openHandles.push(syncHandle);
    return syncHandle;
  }

  /**
   * Delete a file from OPFS.
   *
   * @param path - Path to file (relative to WASI root)
   */
  async deleteFile(path: string): Promise<void> {
    if (!this.rootDir) {
      throw new Error('OpfsStorage not initialized');
    }

    // Parse path into directory components and filename
    const parts = path.split('/').filter(p => p.length > 0);
    const filename = parts.pop();
    if (!filename) {
      throw new Error(`Invalid path: ${path}`);
    }

    // Navigate to parent directory
    let currentDir = this.rootDir;
    for (const dirName of parts) {
      currentDir = await currentDir.getDirectoryHandle(dirName);
    }

    await currentDir.removeEntry(filename);
  }

  /**
   * Close all open file handles.
   * Should be called when the interpreter terminates to release locks.
   */
  close(): void {
    for (const handle of this.openHandles) {
      try {
        handle.close();
      } catch (err) {
        console.warn('[opfs] Failed to close handle:', err);
      }
    }
    this.openHandles.length = 0;
    console.log('[opfs] Closed all file handles');
  }
}
