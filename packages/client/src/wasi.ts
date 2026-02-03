/**
 * JSPI-enabled WASI Implementation
 *
 * This implements WASI using JavaScript Promise Integration (JSPI)
 * to allow synchronous WASM code to suspend while waiting for input.
 */

import type { InputEvent, RemGlkUpdate } from './protocol';

export interface WasiOptions {
  args: string[];
  env: Record<string, string>;
  storyData: Uint8Array;
}

export interface WasiInstance {
  getImports(): WebAssembly.Imports;
  setMemory(memory: WebAssembly.Memory): void;
  setStdinProvider(provider: () => Promise<string>): void;
  setStdoutHandler(handler: (data: RemGlkUpdate) => void): void;
}

/**
 * Create a JSPI-enabled WASI instance
 */
export function createWasi(options: WasiOptions): WasiInstance {
  const { args, env, storyData } = options;

  let memory: WebAssembly.Memory | null = null;
  let stdinProvider: () => Promise<string> = async () => '';
  let stdoutHandler: (data: RemGlkUpdate) => void = () => {};

  // File descriptors: 0=stdin, 1=stdout, 2=stderr, 3+=files
  const openFiles = new Map<
    number,
    { data: Uint8Array; pos: number; writable: boolean; isDir?: boolean }
  >();
  let nextFd = 4;

  // Stdin/stdout buffers
  let stdinBuffer = '';
  let stdinPos = 0;
  let stdoutBuffer = '';

  // Helpers
  function readString(ptr: number, len: number): string {
    if (!memory) throw new Error('Memory not set');
    const bytes = new Uint8Array(memory.buffer, ptr, len);
    return new TextDecoder().decode(bytes);
  }

  function writeBytes(ptr: number, data: Uint8Array): void {
    if (!memory) throw new Error('Memory not set');
    const target = new Uint8Array(memory.buffer, ptr, data.length);
    target.set(data);
  }

  function readIovecs(iovsPtr: number, iovsLen: number): Array<{ ptr: number; len: number }> {
    if (!memory) throw new Error('Memory not set');
    const iovecs: Array<{ ptr: number; len: number }> = [];
    const view = new DataView(memory.buffer);
    for (let i = 0; i < iovsLen; i++) {
      const base = iovsPtr + i * 8;
      const ptr = view.getUint32(base, true);
      const len = view.getUint32(base + 4, true);
      iovecs.push({ ptr, len });
    }
    return iovecs;
  }

  function processStdout(): void {
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const json = JSON.parse(line) as RemGlkUpdate;
          stdoutHandler(json);
        } catch {
          // Non-JSON output - ignore
        }
      }
    }
  }

  // WASI imports
  const wasiImports = {
    args_sizes_get(argcPtr: number, argvBufSizePtr: number): number {
      if (!memory) return 8;
      const view = new DataView(memory.buffer);
      view.setUint32(argcPtr, args.length, true);
      let bufSize = 0;
      for (const arg of args) {
        bufSize += new TextEncoder().encode(arg).length + 1;
      }
      view.setUint32(argvBufSizePtr, bufSize, true);
      return 0;
    },

    args_get(argvPtr: number, argvBufPtr: number): number {
      if (!memory) return 8;
      const view = new DataView(memory.buffer);
      let bufOffset = 0;
      for (let i = 0; i < args.length; i++) {
        view.setUint32(argvPtr + i * 4, argvBufPtr + bufOffset, true);
        const bytes = new TextEncoder().encode(args[i] + '\0');
        writeBytes(argvBufPtr + bufOffset, bytes);
        bufOffset += bytes.length;
      }
      return 0;
    },

    environ_sizes_get(countPtr: number, sizePtr: number): number {
      if (!memory) return 8;
      const view = new DataView(memory.buffer);
      const entries = Object.entries(env);
      view.setUint32(countPtr, entries.length, true);
      let size = 0;
      for (const [k, v] of entries) {
        size += new TextEncoder().encode(`${k}=${v}`).length + 1;
      }
      view.setUint32(sizePtr, size, true);
      return 0;
    },

    environ_get(environPtr: number, environBufPtr: number): number {
      if (!memory) return 8;
      const view = new DataView(memory.buffer);
      const entries = Object.entries(env);
      let bufOffset = 0;
      for (let i = 0; i < entries.length; i++) {
        view.setUint32(environPtr + i * 4, environBufPtr + bufOffset, true);
        const bytes = new TextEncoder().encode(
          `${entries[i][0]}=${entries[i][1]}\0`
        );
        writeBytes(environBufPtr + bufOffset, bytes);
        bufOffset += bytes.length;
      }
      return 0;
    },

    clock_time_get(
      _clockId: number,
      _precision: bigint,
      timePtr: number
    ): number {
      if (!memory) return 8;
      const view = new DataView(memory.buffer);
      const now = BigInt(Date.now()) * 1000000n;
      view.setBigUint64(timePtr, now, true);
      return 0;
    },

    clock_res_get(_clockId: number, resPtr: number): number {
      if (!memory) return 8;
      const view = new DataView(memory.buffer);
      view.setBigUint64(resPtr, 1000000n, true);
      return 0;
    },

    fd_close(fd: number): number {
      if (fd >= 3) {
        openFiles.delete(fd);
      }
      return 0;
    },

    fd_fdstat_get(fd: number, statPtr: number): number {
      if (!memory) return 8;
      const view = new DataView(memory.buffer);
      if (fd <= 2) {
        view.setUint8(statPtr, 2); // character device
      } else {
        view.setUint8(statPtr, 4); // regular file
      }
      view.setUint16(statPtr + 2, 0, true);
      view.setBigUint64(statPtr + 8, 0xffffffffffffffffn, true);
      view.setBigUint64(statPtr + 16, 0xffffffffffffffffn, true);
      return 0;
    },

    fd_fdstat_set_flags(_fd: number, _flags: number): number {
      return 0;
    },

    fd_prestat_get(fd: number, prestatPtr: number): number {
      if (fd === 3) {
        if (!memory) return 8;
        const view = new DataView(memory.buffer);
        view.setUint8(prestatPtr, 0); // __WASI_PREOPENTYPE_DIR
        view.setUint32(prestatPtr + 4, 1, true);
        return 0;
      }
      return 8; // EBADF
    },

    fd_prestat_dir_name(fd: number, pathPtr: number, _pathLen: number): number {
      if (fd === 3) {
        if (!memory) return 8;
        new Uint8Array(memory.buffer, pathPtr, 1)[0] = '/'.charCodeAt(0);
        return 0;
      }
      return 8; // EBADF
    },

    fd_seek(
      fd: number,
      offset: bigint,
      whence: number,
      newOffsetPtr: number
    ): number {
      if (!memory) return 8;
      const view = new DataView(memory.buffer);
      const file = openFiles.get(fd);
      if (!file) {
        view.setBigUint64(newOffsetPtr, 0n, true);
        return 8; // EBADF
      }

      let newPos: number;
      switch (whence) {
        case 0: // SEEK_SET
          newPos = Number(offset);
          break;
        case 1: // SEEK_CUR
          newPos = file.pos + Number(offset);
          break;
        case 2: // SEEK_END
          newPos = file.data.length + Number(offset);
          break;
        default:
          return 28; // EINVAL
      }

      file.pos = Math.max(0, Math.min(newPos, file.data.length));
      view.setBigUint64(newOffsetPtr, BigInt(file.pos), true);
      return 0;
    },

    fd_tell(fd: number, offsetPtr: number): number {
      if (!memory) return 8;
      const view = new DataView(memory.buffer);
      const file = openFiles.get(fd);
      if (!file) return 8; // EBADF
      view.setBigUint64(offsetPtr, BigInt(file.pos), true);
      return 0;
    },

    fd_write(
      fd: number,
      iovsPtr: number,
      iovsLen: number,
      nwrittenPtr: number
    ): number {
      if (!memory) return 8;
      const view = new DataView(memory.buffer);
      const iovecs = readIovecs(iovsPtr, iovsLen);

      let totalWritten = 0;
      for (const { ptr, len } of iovecs) {
        const data = readString(ptr, len);
        totalWritten += len;

        if (fd === 1) {
          stdoutBuffer += data;
        } else if (fd === 2) {
          console.error(data);
        }
      }

      if (fd === 1) {
        processStdout();
      }

      view.setUint32(nwrittenPtr, totalWritten, true);
      return 0;
    },

    // This is the SUSPENDING import - async function
    fd_read: async (
      fd: number,
      iovsPtr: number,
      iovsLen: number,
      nreadPtr: number
    ): Promise<number> => {
      if (!memory) return 8;
      const view = new DataView(memory.buffer);
      const iovecs = readIovecs(iovsPtr, iovsLen);

      let totalRead = 0;

      for (const { ptr, len } of iovecs) {
        if (totalRead > 0) break;

        if (fd === 0) {
          // stdin
          if (stdinPos >= stdinBuffer.length) {
            processStdout();
            const input = await stdinProvider();
            stdinBuffer = input + '\n';
            stdinPos = 0;
          }

          const available = stdinBuffer.length - stdinPos;
          const toRead = Math.min(len, available);
          const bytes = new TextEncoder().encode(
            stdinBuffer.substring(stdinPos, stdinPos + toRead)
          );
          writeBytes(ptr, bytes);
          stdinPos += toRead;
          totalRead += bytes.length;
        } else {
          const file = openFiles.get(fd);
          if (!file) {
            view.setUint32(nreadPtr, 0, true);
            return 8; // EBADF
          }

          const available = file.data.length - file.pos;
          const toRead = Math.min(len, available);
          const target = new Uint8Array(memory!.buffer, ptr, toRead);
          target.set(file.data.subarray(file.pos, file.pos + toRead));
          file.pos += toRead;
          totalRead += toRead;
        }
      }

      view.setUint32(nreadPtr, totalRead, true);
      return 0;
    },

    path_open(
      _dirFd: number,
      _dirFlags: number,
      pathPtr: number,
      pathLen: number,
      _oflags: number,
      _fsRightsBase: bigint,
      _fsRightsInheriting: bigint,
      _fdflags: number,
      fdPtr: number
    ): number {
      if (!memory) return 8;
      const view = new DataView(memory.buffer);
      const path = readString(pathPtr, pathLen);

      if (path === 'story.ulx' || path === '/story.ulx') {
        const fd = nextFd++;
        openFiles.set(fd, {
          data: storyData,
          pos: 0,
          writable: false,
        });
        view.setUint32(fdPtr, fd, true);
        return 0;
      }

      view.setUint32(fdPtr, 0, true);
      return 44; // ENOENT
    },

    path_filestat_get(
      _fd: number,
      _flags: number,
      pathPtr: number,
      pathLen: number,
      statPtr: number
    ): number {
      if (!memory) return 8;
      const path = readString(pathPtr, pathLen);
      const view = new DataView(memory.buffer);

      if (path === 'story.ulx' || path === '/story.ulx') {
        view.setBigUint64(statPtr, 0n, true); // dev
        view.setBigUint64(statPtr + 8, 1n, true); // ino
        view.setUint8(statPtr + 16, 4); // filetype (regular)
        view.setBigUint64(statPtr + 24, 1n, true); // nlink
        view.setBigUint64(statPtr + 32, BigInt(storyData.length), true); // size
        view.setBigUint64(statPtr + 40, 0n, true); // atim
        view.setBigUint64(statPtr + 48, 0n, true); // mtim
        view.setBigUint64(statPtr + 56, 0n, true); // ctim
        return 0;
      }

      return 44; // ENOENT
    },

    path_create_directory(): number {
      return 63; // ENOSYS
    },

    path_remove_directory(): number {
      return 63; // ENOSYS
    },

    path_unlink_file(): number {
      return 63; // ENOSYS
    },

    path_rename(): number {
      return 63; // ENOSYS
    },

    random_get(bufPtr: number, bufLen: number): number {
      if (!memory) return 8;
      const buf = new Uint8Array(memory.buffer, bufPtr, bufLen);
      crypto.getRandomValues(buf);
      return 0;
    },

    proc_exit(code: number): never {
      throw new Error(`Process exited with code ${code}`);
    },

    sched_yield(): number {
      return 0;
    },

    poll_oneoff(
      _inPtr: number,
      _outPtr: number,
      _nsubscriptions: number,
      neventsPtr: number
    ): number {
      if (!memory) return 8;
      const view = new DataView(memory.buffer);
      view.setUint32(neventsPtr, 0, true);
      return 0;
    },
  };

  // Initialize preopen directory
  openFiles.set(3, { data: new Uint8Array(0), pos: 0, writable: false, isDir: true });

  return {
    getImports(): WebAssembly.Imports {
      // Wrap fd_read as suspending for JSPI
      const imports = { ...wasiImports };
      // @ts-expect-error - WebAssembly.Suspending is a JSPI API
      imports.fd_read = new WebAssembly.Suspending(wasiImports.fd_read);
      return { wasi_snapshot_preview1: imports };
    },

    setMemory(mem: WebAssembly.Memory): void {
      memory = mem;
    },

    setStdinProvider(provider: () => Promise<string>): void {
      stdinProvider = provider;
    },

    setStdoutHandler(handler: (data: RemGlkUpdate) => void): void {
      stdoutHandler = handler;
    },
  };
}
