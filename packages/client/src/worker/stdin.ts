/**
 * Async Stdin for JSPI
 */

import { Fd, Inode, wasi } from '@bjorn3/browser_wasi_shim';

export type InputProvider = () => Promise<string>;

/**
 * Async stdin that suspends WASM execution while waiting for input via JSPI.
 */
export class AsyncStdinFd extends Fd {
  private inputProvider: InputProvider;
  private buffer: Uint8Array = new Uint8Array(0);
  private position = 0;
  private ino = Inode.issue_ino();

  constructor(inputProvider: InputProvider) {
    super();
    this.inputProvider = inputProvider;
  }

  fd_fdstat_get(): { ret: number; fdstat: wasi.Fdstat | null } {
    const fdstat = new wasi.Fdstat(wasi.FILETYPE_CHARACTER_DEVICE, 0);
    fdstat.fs_rights_base = BigInt(wasi.RIGHTS_FD_READ);
    return { ret: wasi.ERRNO_SUCCESS, fdstat };
  }

  fd_filestat_get(): { ret: number; filestat: wasi.Filestat | null } {
    return {
      ret: wasi.ERRNO_SUCCESS,
      filestat: new wasi.Filestat(this.ino, wasi.FILETYPE_CHARACTER_DEVICE, 0n),
    };
  }

  /** Async read - called via JSPI wrapper */
  async fd_read_async(size: number): Promise<{ ret: number; data: Uint8Array }> {
    if (this.position >= this.buffer.length) {
      const input = await this.inputProvider();
      this.buffer = new TextEncoder().encode(input + '\n');
      this.position = 0;
    }
    return this.readFromBuffer(size);
  }

  /** Sync read - returns buffered data only */
  fd_read(size: number): { ret: number; data: Uint8Array } {
    return this.readFromBuffer(size);
  }

  private readFromBuffer(size: number): { ret: number; data: Uint8Array } {
    const available = this.buffer.length - this.position;
    if (available === 0) {
      return { ret: wasi.ERRNO_SUCCESS, data: new Uint8Array(0) };
    }
    const toRead = Math.min(size, available);
    const data = this.buffer.slice(this.position, this.position + toRead);
    this.position += toRead;
    return { ret: wasi.ERRNO_SUCCESS, data };
  }
}
