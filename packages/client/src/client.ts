/**
 * WasiGlk Client
 *
 * Main client class that orchestrates the interpreter lifecycle
 * and exposes updates via async iterator.
 */

import { BlorbParser } from './blorb';
import { detectFormat, type FormatInfo, type StoryFormat } from './format';
import {
  type ClientUpdate,
  type InputEvent,
  type Metrics,
  type RemGlkUpdate,
  parseRemGlkUpdate,
} from './protocol';
import { createWasi, type WasiInstance } from './wasi';

export interface ClientConfig {
  /** URL to the story file */
  storyUrl?: string;

  /** Story file data (alternative to storyUrl) */
  storyData?: Uint8Array;

  /** URL to the interpreter WASM module (auto-detected if not provided) */
  interpreterUrl?: string;

  /** Interpreter WASM data (alternative to interpreterUrl) */
  interpreterData?: ArrayBuffer;

  /** Override format detection */
  format?: StoryFormat;
}

export interface UpdatesConfig {
  /** Display width in characters */
  width: number;

  /** Display height in characters */
  height: number;

  /** Character width in pixels (optional) */
  charWidth?: number;

  /** Character height in pixels (optional) */
  charHeight?: number;
}

export class WasiGlkClient {
  private storyData: Uint8Array;
  private interpreterData: ArrayBuffer;
  private formatInfo: FormatInfo;
  private blorb: BlorbParser | null = null;
  private wasi: WasiInstance | null = null;
  private instance: WebAssembly.Instance | null = null;
  private running = false;
  private inputResolve: ((value: string) => void) | null = null;
  private pendingUpdates: ClientUpdate[] = [];
  private updateResolve: ((value: IteratorResult<ClientUpdate>) => void) | null = null;
  private storyUrl: string | null;

  private constructor(
    storyData: Uint8Array,
    interpreterData: ArrayBuffer,
    formatInfo: FormatInfo,
    blorb: BlorbParser | null,
    storyUrl: string | null
  ) {
    this.storyData = storyData;
    this.interpreterData = interpreterData;
    this.formatInfo = formatInfo;
    this.blorb = blorb;
    this.storyUrl = storyUrl;
  }

  /**
   * Create a new client instance
   */
  static async create(config: ClientConfig): Promise<WasiGlkClient> {
    // Load story data
    let storyData: Uint8Array;
    let storyUrl: string | null = null;

    if (config.storyData) {
      storyData = config.storyData;
    } else if (config.storyUrl) {
      storyUrl = config.storyUrl;
      const response = await fetch(config.storyUrl);
      if (!response.ok) {
        throw new Error(`Failed to load story: ${response.status}`);
      }
      storyData = new Uint8Array(await response.arrayBuffer());
    } else {
      throw new Error('Either storyUrl or storyData must be provided');
    }

    // Detect format
    const formatInfo = config.format
      ? { format: config.format, interpreter: getInterpreterName(config.format), isBlorb: false }
      : detectFormat(storyUrl, storyData);

    // Parse Blorb if applicable
    let blorb: BlorbParser | null = null;
    let executableData = storyData;

    if (formatInfo.isBlorb || BlorbParser.isBlorb(storyData)) {
      blorb = new BlorbParser(storyData);
      const exec = blorb.getExecutable();
      if (exec) {
        executableData = exec.data;
        // Update format based on executable type
        if (exec.type === 'GLUL') {
          formatInfo.format = 'glulx';
          formatInfo.interpreter = 'glulxe';
        } else if (exec.type === 'ZCOD') {
          formatInfo.format = 'zcode';
          formatInfo.interpreter = 'bocfel';
        }
      }
    }

    // Load interpreter
    let interpreterData: ArrayBuffer;
    if (config.interpreterData) {
      interpreterData = config.interpreterData;
    } else {
      const interpreterUrl =
        config.interpreterUrl ?? `/${formatInfo.interpreter}.wasm`;
      const response = await fetch(interpreterUrl);
      if (!response.ok) {
        throw new Error(`Failed to load interpreter: ${response.status}`);
      }
      interpreterData = await response.arrayBuffer();
    }

    return new WasiGlkClient(
      executableData,
      interpreterData,
      formatInfo,
      blorb,
      storyUrl
    );
  }

  /**
   * Get the detected format info
   */
  get format(): FormatInfo {
    return this.formatInfo;
  }

  /**
   * Get the Blorb parser (if story is a Blorb file)
   */
  getBlorb(): BlorbParser | null {
    return this.blorb;
  }

  /**
   * Get image URL by resource number (from Blorb)
   */
  getImageUrl(imageNum: number): string | undefined {
    return this.blorb?.getImageUrl(imageNum);
  }

  /**
   * Send text input to the interpreter
   */
  sendInput(value: string): void {
    if (this.inputResolve) {
      const resolve = this.inputResolve;
      this.inputResolve = null;
      resolve(value);
    }
  }

  /**
   * Send character input to the interpreter
   */
  sendChar(char: string): void {
    this.sendInput(char);
  }

  /**
   * Stop the interpreter
   */
  stop(): void {
    this.running = false;
    this.blorb?.dispose();

    // Resolve any pending update request
    if (this.updateResolve) {
      this.updateResolve({ value: undefined as any, done: true });
      this.updateResolve = null;
    }
  }

  /**
   * Async iterator that yields updates from the interpreter
   */
  async *updates(config: UpdatesConfig): AsyncIterableIterator<ClientUpdate> {
    if (this.running) {
      throw new Error('Client is already running');
    }

    this.running = true;

    try {
      // Initialize WASI
      this.wasi = createWasi({
        args: [this.formatInfo.interpreter, 'story.ulx'],
        env: {},
        storyData: this.storyData,
      });

      // Set up input provider
      this.wasi.setStdinProvider(async () => {
        // First call returns init message
        if (!this.instance) {
          return JSON.stringify({
            type: 'init',
            gen: 0,
            metrics: {
              width: config.width,
              height: config.height,
              charwidth: config.charWidth,
              charheight: config.charHeight,
            },
          } satisfies InputEvent);
        }

        // Subsequent calls wait for user input
        return new Promise<string>((resolve) => {
          this.inputResolve = resolve;
        });
      });

      // Set up output handler
      this.wasi.setStdoutHandler((update: RemGlkUpdate) => {
        const clientUpdates = parseRemGlkUpdate(update, (imageNum) =>
          this.blorb?.getImageUrl(imageNum)
        );

        for (const clientUpdate of clientUpdates) {
          if (this.updateResolve) {
            const resolve = this.updateResolve;
            this.updateResolve = null;
            resolve({ value: clientUpdate, done: false });
          } else {
            this.pendingUpdates.push(clientUpdate);
          }
        }
      });

      // Compile and instantiate WASM
      const module = await WebAssembly.compile(this.interpreterData);
      const imports = this.wasi.getImports();
      this.instance = await WebAssembly.instantiate(module, imports);

      // Set memory reference
      this.wasi.setMemory(this.instance.exports.memory as WebAssembly.Memory);

      // Get and wrap main function
      const main =
        (this.instance.exports._start as Function) ||
        (this.instance.exports.main as Function);

      if (!main) {
        throw new Error('No _start or main export found');
      }

      // @ts-expect-error - WebAssembly.promising is a JSPI API
      const promisedMain = WebAssembly.promising(main);

      // Start interpreter in background
      const interpreterPromise = promisedMain().catch((err: Error) => {
        if (!err.message?.includes('Process exited')) {
          console.error('Interpreter error:', err);
          this.pendingUpdates.push({
            type: 'error',
            message: err.message,
          });
        }
        this.running = false;
      });

      // Yield updates as they come
      while (this.running) {
        if (this.pendingUpdates.length > 0) {
          yield this.pendingUpdates.shift()!;
        } else {
          // Wait for next update
          const result = await new Promise<IteratorResult<ClientUpdate>>(
            (resolve) => {
              this.updateResolve = resolve;

              // Check if interpreter has stopped
              if (!this.running) {
                resolve({ value: undefined as any, done: true });
              }
            }
          );

          if (result.done) break;
          yield result.value;
        }
      }

      // Wait for interpreter to finish
      await interpreterPromise;
    } finally {
      this.running = false;
    }
  }
}

function getInterpreterName(format: StoryFormat): string {
  switch (format) {
    case 'glulx':
      return 'glulxe';
    case 'zcode':
      return 'bocfel';
    case 'hugo':
      return 'hugo';
    case 'tads2':
    case 'tads3':
      return 'tads';
    default:
      return 'glulxe';
  }
}

/**
 * Convenience function to create a client
 */
export async function createClient(
  config: ClientConfig
): Promise<WasiGlkClient> {
  return WasiGlkClient.create(config);
}
