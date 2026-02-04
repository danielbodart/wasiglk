/**
 * OPFS Type Declarations
 *
 * These types are for the Origin Private File System APIs that aren't
 * fully included in TypeScript's lib.dom.d.ts yet.
 */

interface FileSystemSyncAccessHandle {
  close(): void;
  flush(): void;
  getSize(): number;
  read(buffer: ArrayBuffer | ArrayBufferView, options?: { at: number }): number;
  truncate(to: number): void;
  write(buffer: ArrayBuffer | ArrayBufferView, options?: { at: number }): number;
}

interface FileSystemFileHandle {
  createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle>;
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}

interface StorageManager {
  getDirectory(): Promise<FileSystemDirectoryHandle>;
}
