/**
 * AsyncFSAFile - A file with an external File System Access handle.
 *
 * In-memory buffer is the source of truth. External file is written
 * on fd_close() via JSPI (handled in interpreter.worker.ts).
 */

import { File as WasiFile } from '@bjorn3/browser_wasi_shim';

/**
 * Read file contents from a FileSystemFileHandle.
 * Returns a regular File since we don't need to write back.
 */
export async function readFileFromHandle(
  handle: FileSystemFileHandle
): Promise<WasiFile> {
  const file = await handle.getFile();
  const data = new Uint8Array(await file.arrayBuffer());
  console.log(`[async-fsa] Read ${data.length} bytes from external file`);
  return new WasiFile(data, { readonly: true });
}

/**
 * Create an AsyncFSAFile for writing.
 * Starts with empty buffer, retains handle for write on close.
 */
export function createAsyncFSAFile(
  handle: FileSystemFileHandle
): AsyncFSAFile {
  console.log(`[async-fsa] Created for write`);
  return new AsyncFSAFile(handle);
}

/**
 * File with an external handle for syncing to File System Access API.
 * Inherits all behavior from WasiFile - async write is handled at JSPI layer.
 */
export class AsyncFSAFile extends WasiFile {
  readonly externalHandle: FileSystemFileHandle;

  constructor(handle: FileSystemFileHandle) {
    super(new Uint8Array(0));
    this.externalHandle = handle;
  }
}
