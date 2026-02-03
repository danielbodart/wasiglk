/**
 * Interpreter Worker
 *
 * Runs the WASM interpreter in a Web Worker using browser_wasi_shim.
 * Uses JSPI for async stdin.
 */

import {
  WASI,
  File,
  Directory,
  PreopenDirectory,
  ConsoleStdout,
  WASIProcExit,
  wasi,
  type Inode,
} from '@bjorn3/browser_wasi_shim';
import { AsyncStdinFd } from './stdin';
import type { MainToWorkerMessage, WorkerToMainMessage } from './messages';
import type { InputEvent, RemGlkUpdate } from '../protocol';

let inputResolve: ((value: string) => void) | null = null;
let generation = 0;
let currentInputRequest: { windowId: number; type: 'line' | 'char' } | null = null;

function post(msg: WorkerToMainMessage): void {
  self.postMessage(msg);
}

self.onmessage = async (e: MessageEvent<MainToWorkerMessage>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    await runInterpreter(msg);
  } else if (msg.type === 'input' && inputResolve) {
    const resolve = inputResolve;
    inputResolve = null;
    // Format as RemGlk input event
    const inputEvent = {
      type: currentInputRequest?.type ?? 'line',
      gen: generation,
      window: currentInputRequest?.windowId ?? 0,
      value: msg.value,
    };
    resolve(JSON.stringify(inputEvent));
  } else if (msg.type === 'stop') {
    self.close();
  }
};

async function runInterpreter(msg: MainToWorkerMessage & { type: 'init' }): Promise<void> {
  try {
    // stdin: async for JSPI
    const stdin = new AsyncStdinFd(async () => {
      if (generation === 0) {
        generation = 1;
        return JSON.stringify({
          type: 'init',
          gen: 0,
          metrics: {
            width: msg.metrics.width,
            height: msg.metrics.height,
            charwidth: msg.metrics.charWidth,
            charheight: msg.metrics.charHeight,
          },
        } satisfies InputEvent);
      }
      post({ type: 'waiting-for-input' });
      return new Promise<string>(resolve => { inputResolve = resolve; });
    });

    // stdout: parse JSON updates
    const stdout = ConsoleStdout.lineBuffered((line: string) => {
      if (!line.trim()) return;
      try {
        const update = JSON.parse(line) as RemGlkUpdate;
        // Track generation for input responses
        if (update.gen !== undefined) {
          generation = update.gen;
        }
        // Track current input request
        if (update.input && update.input.length > 0) {
          currentInputRequest = {
            windowId: update.input[0].id,
            type: update.input[0].type,
          };
        }
        post({ type: 'update', data: update });
      } catch {
        console.log('[interpreter]', line);
      }
    });

    // stderr
    const stderr = ConsoleStdout.lineBuffered(line => console.error('[interpreter]', line));

    // Filesystem: story file + saves directory
    const root = new PreopenDirectory('/', new Map<string, Inode>([
      ['story.ulx', new File(msg.story, { readonly: true })],
      ['saves', new Directory(new Map())], // TODO: OPFS persistence
    ]));

    // Create WASI and instantiate
    const wasiInstance = new WASI(msg.args, [], [stdin, stdout, stderr, root]);
    const module = await WebAssembly.compile(msg.interpreter);
    const imports = wrapFdReadWithJSPI(wasiInstance, stdin);
    const instance = await WebAssembly.instantiate(module, imports);
    wasiInstance.inst = instance as { exports: { memory: WebAssembly.Memory } };

    post({ type: 'ready' });

    // Run with JSPI
    const main = (instance.exports._start ?? instance.exports.main) as Function | undefined;
    if (!main) throw new Error('No _start or main export found');

    // @ts-expect-error - JSPI API
    const promisedMain = WebAssembly.promising(main);

    try {
      await promisedMain();
      post({ type: 'exit', code: 0 });
    } catch (err) {
      if (err instanceof WASIProcExit) {
        post({ type: 'exit', code: err.code });
      } else {
        throw err;
      }
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}

function wrapFdReadWithJSPI(wasiInstance: WASI, stdin: AsyncStdinFd): WebAssembly.Imports {
  const imports = wasiInstance.wasiImport;

  const asyncFdRead = async (fd: number, iovsPtr: number, iovsLen: number, nreadPtr: number): Promise<number> => {
    if (fd !== 0) {
      return imports.fd_read(fd, iovsPtr, iovsLen, nreadPtr) as number;
    }

    const memory = wasiInstance.inst.exports.memory;
    const view = new DataView(memory.buffer);
    const bytes = new Uint8Array(memory.buffer);

    let nread = 0;
    for (let i = 0; i < iovsLen; i++) {
      const buf = view.getUint32(iovsPtr + i * 8, true);
      const len = view.getUint32(iovsPtr + i * 8 + 4, true);
      const { ret, data } = await stdin.fd_read_async(len);
      if (ret !== wasi.ERRNO_SUCCESS) {
        view.setUint32(nreadPtr, nread, true);
        return ret;
      }
      bytes.set(data, buf);
      nread += data.length;
      if (data.length < len) break;
    }
    view.setUint32(nreadPtr, nread, true);
    return wasi.ERRNO_SUCCESS;
  };

  return {
    wasi_snapshot_preview1: {
      ...imports,
      // @ts-expect-error - JSPI API
      fd_read: new WebAssembly.Suspending(asyncFdRead),
    },
  };
}
