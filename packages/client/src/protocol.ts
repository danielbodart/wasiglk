/**
 * RemGLK Protocol Types
 *
 * These types represent the JSON protocol used for communication
 * between the WASM interpreter and the client.
 */

// Input events (client -> interpreter)
export interface InitEvent {
  type: 'init';
  gen: number;
  metrics: Metrics;
}

export interface LineInputEvent {
  type: 'line';
  gen: number;
  window: number;
  value: string;
}

export interface CharInputEvent {
  type: 'char';
  gen: number;
  window: number;
  value: string;
}

export type InputEvent = InitEvent | LineInputEvent | CharInputEvent;

export interface Metrics {
  width: number;
  height: number;
  charwidth?: number;
  charheight?: number;
}

// Output updates (interpreter -> client)
export interface RemGlkUpdate {
  type: 'update' | 'init' | 'error';
  gen: number;
  windows?: WindowUpdate[];
  content?: ContentUpdate[];
  input?: InputRequest[];
  message?: string;
  support?: string[];
}

export interface WindowUpdate {
  id: number;
  type: 'buffer' | 'grid' | 'graphics' | 'pair';
  rock: number;
  left?: number;
  top?: number;
  width: number;
  height: number;
  gridwidth?: number;
  gridheight?: number;
}

export interface ContentUpdate {
  id: number;
  clear?: boolean;
  text?: ContentSpan[];
}

export type ContentSpan = string | TextSpan | SpecialSpan;

export interface TextSpan {
  style?: string;
  text: string;
  hyperlink?: number;
}

export interface SpecialSpan {
  special: SpecialContent;
}

export interface SpecialContent {
  type: 'image' | 'flowbreak' | 'setcolor' | 'fill';
  // Image fields
  image?: number;
  url?: string;
  alignment?: ImageAlignment;
  width?: number;
  height?: number;
  alttext?: string;
  // Graphics window fields
  color?: number;
  x?: number;
  y?: number;
}

export type ImageAlignment =
  | 'inlineup'
  | 'inlinedown'
  | 'inlinecenter'
  | 'marginleft'
  | 'marginright';

export const IMAGE_ALIGNMENT_VALUES: Record<number, ImageAlignment> = {
  1: 'inlineup',
  2: 'inlinedown',
  3: 'inlinecenter',
  4: 'marginleft',
  5: 'marginright',
};

export interface InputRequest {
  id: number;
  type: 'line' | 'char';
  gen?: number;
  maxlen?: number;
  initial?: string;
}

// Client update types (what we yield from the async iterator)
export type ClientUpdate =
  | InitClientUpdate
  | ContentClientUpdate
  | InputRequestClientUpdate
  | WindowClientUpdate
  | ErrorClientUpdate;

export interface InitClientUpdate {
  type: 'init';
  support: string[];
}

export interface ContentClientUpdate {
  type: 'content';
  windowId: number;
  clear: boolean;
  content: ProcessedContentSpan[];
}

export interface ProcessedContentSpan {
  type: 'text' | 'image' | 'flowbreak';
  // Text fields
  text?: string;
  style?: string;
  hyperlink?: number;
  // Image fields
  imageNumber?: number;
  imageUrl?: string;
  alignment?: ImageAlignment;
  width?: number;
  height?: number;
  alttext?: string;
}

export interface InputRequestClientUpdate {
  type: 'input-request';
  windowId: number;
  inputType: 'line' | 'char';
  maxLength?: number;
  initial?: string;
}

export interface WindowClientUpdate {
  type: 'window';
  windows: WindowUpdate[];
}

export interface ErrorClientUpdate {
  type: 'error';
  message: string;
}

/**
 * Parse a RemGLK update and convert to client updates
 */
export function parseRemGlkUpdate(
  update: RemGlkUpdate,
  resolveImageUrl: (imageNum: number) => string | undefined
): ClientUpdate[] {
  const clientUpdates: ClientUpdate[] = [];

  if (update.type === 'init') {
    clientUpdates.push({
      type: 'init',
      support: update.support ?? [],
    });
  }

  if (update.type === 'error') {
    clientUpdates.push({
      type: 'error',
      message: update.message ?? 'Unknown error',
    });
  }

  if (update.windows && update.windows.length > 0) {
    clientUpdates.push({
      type: 'window',
      windows: update.windows,
    });
  }

  if (update.content) {
    for (const content of update.content) {
      clientUpdates.push({
        type: 'content',
        windowId: content.id,
        clear: content.clear ?? false,
        content: processContentSpans(content.text ?? [], resolveImageUrl),
      });
    }
  }

  if (update.input) {
    for (const input of update.input) {
      clientUpdates.push({
        type: 'input-request',
        windowId: input.id,
        inputType: input.type,
        maxLength: input.maxlen,
        initial: input.initial,
      });
    }
  }

  return clientUpdates;
}

function processContentSpans(
  spans: ContentSpan[],
  resolveImageUrl: (imageNum: number) => string | undefined
): ProcessedContentSpan[] {
  const result: ProcessedContentSpan[] = [];

  for (const span of spans) {
    if (typeof span === 'string') {
      result.push({ type: 'text', text: span });
    } else if ('text' in span) {
      result.push({
        type: 'text',
        text: span.text,
        style: span.style,
        hyperlink: span.hyperlink,
      });
    } else if ('special' in span) {
      const special = span.special;
      if (special.type === 'image' && special.image !== undefined) {
        const url = resolveImageUrl(special.image) ?? special.url;
        result.push({
          type: 'image',
          imageNumber: special.image,
          imageUrl: url,
          alignment: typeof special.alignment === 'number'
            ? IMAGE_ALIGNMENT_VALUES[special.alignment]
            : special.alignment,
          width: special.width,
          height: special.height,
          alttext: special.alttext,
        });
      } else if (special.type === 'flowbreak') {
        result.push({ type: 'flowbreak' });
      }
    }
  }

  return result;
}
