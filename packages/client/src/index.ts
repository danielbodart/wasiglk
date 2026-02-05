/**
 * @module
 *
 * TypeScript client library for running Interactive Fiction interpreters
 * compiled to WebAssembly with Zig. Run classic text adventures in the
 * browser via Web Workers and JSPI.
 *
 * @example
 * ```typescript
 * import { createClient } from '@bodar/wasiglk';
 *
 * const client = await createClient({
 *   storyUrl: '/stories/adventure.gblorb',
 *   workerUrl: '/worker.js',
 * });
 *
 * for await (const update of client.updates({ width: 80, height: 24 })) {
 *   if (update.type === 'content') {
 *     for (const span of update.content) {
 *       if (span.type === 'text') process.stdout.write(span.text ?? '');
 *     }
 *   }
 * }
 * ```
 */

// Main client API
export { WasiGlkClient, createClient } from './client';
export type { ClientConfig, UpdatesConfig } from './client';

// Protocol types
export type {
  ClientUpdate,
  ContentClientUpdate,
  InputRequestClientUpdate,
  WindowClientUpdate,
  ErrorClientUpdate,
  TimerClientUpdate,
  ProcessedContentSpan,
  WindowUpdate,
  ImageAlignment,
  Metrics,
} from './protocol';

// Blorb parser
export { BlorbParser } from './blorb';
export type { BlorbImage, BlorbResource } from './blorb';

// Format detection
export { detectFormat, detectFormatFromUrl, detectFormatFromData } from './format';
export type { StoryFormat, FormatInfo } from './format';

// Renderers (optional)
export type { GraphicsRenderer } from './renderers/types';
export { colorToCSS } from './renderers/types';
export { SvgRenderer } from './renderers/svg';

// Worker message types (for advanced use cases)
export type {
  MainToWorkerMessage,
  WorkerToMainMessage,
  FilesystemMode,
} from './worker/messages';
