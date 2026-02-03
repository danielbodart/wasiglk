import { describe, expect, test } from 'bun:test';
import { parseRemGlkUpdate, type RemGlkUpdate } from '../src/protocol';

// Default image URL resolver for tests
const noopResolver = () => undefined;

describe('parseRemGlkUpdate', () => {
  test('parses init update', () => {
    const update: RemGlkUpdate = {
      type: 'init',
      gen: 1,
      support: ['graphics', 'hyperlinks'],
    };

    const results = parseRemGlkUpdate(update, noopResolver);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('init');
    if (results[0].type === 'init') {
      expect(results[0].support).toContain('graphics');
    }
  });

  test('parses content update with plain text', () => {
    const update: RemGlkUpdate = {
      type: 'update',
      gen: 2,
      content: [
        {
          id: 1,
          text: [{ style: 'normal', text: 'Hello, world!' }],
        },
      ],
    };

    const results = parseRemGlkUpdate(update, noopResolver);

    const contentUpdate = results.find((u) => u.type === 'content');
    expect(contentUpdate).toBeDefined();
    expect(contentUpdate?.type).toBe('content');
    if (contentUpdate?.type === 'content') {
      expect(contentUpdate.windowId).toBe(1);
      expect(contentUpdate.content).toHaveLength(1);
      expect(contentUpdate.content[0].type).toBe('text');
      expect(contentUpdate.content[0].text).toBe('Hello, world!');
    }
  });

  test('parses content with string spans', () => {
    const update: RemGlkUpdate = {
      type: 'update',
      gen: 3,
      content: [
        {
          id: 1,
          text: ['Plain text as string'],
        },
      ],
    };

    const results = parseRemGlkUpdate(update, noopResolver);

    const contentUpdate = results.find((u) => u.type === 'content');
    expect(contentUpdate?.type).toBe('content');
    if (contentUpdate?.type === 'content') {
      expect(contentUpdate.content[0].text).toBe('Plain text as string');
    }
  });

  test('parses content with image special span', () => {
    const imageUrlResolver = (num: number) =>
      num === 5 ? 'blob:test-image-5' : undefined;

    const update: RemGlkUpdate = {
      type: 'update',
      gen: 4,
      content: [
        {
          id: 1,
          text: [
            {
              special: {
                type: 'image',
                image: 5,
                width: 100,
                height: 80,
              },
            },
          ],
        },
      ],
    };

    const results = parseRemGlkUpdate(update, imageUrlResolver);

    const contentUpdate = results.find((u) => u.type === 'content');
    expect(contentUpdate?.type).toBe('content');
    if (contentUpdate?.type === 'content') {
      expect(contentUpdate.content).toHaveLength(1);
      expect(contentUpdate.content[0].type).toBe('image');
      expect(contentUpdate.content[0].imageNumber).toBe(5);
      expect(contentUpdate.content[0].imageUrl).toBe('blob:test-image-5');
      expect(contentUpdate.content[0].width).toBe(100);
      expect(contentUpdate.content[0].height).toBe(80);
    }
  });

  test('parses content with flowbreak special span', () => {
    const update: RemGlkUpdate = {
      type: 'update',
      gen: 5,
      content: [
        {
          id: 1,
          text: [{ special: { type: 'flowbreak' } }],
        },
      ],
    };

    const results = parseRemGlkUpdate(update, noopResolver);

    const contentUpdate = results.find((u) => u.type === 'content');
    expect(contentUpdate?.type).toBe('content');
    if (contentUpdate?.type === 'content') {
      expect(contentUpdate.content).toHaveLength(1);
      expect(contentUpdate.content[0].type).toBe('flowbreak');
    }
  });

  test('parses input request for line input', () => {
    const update: RemGlkUpdate = {
      type: 'update',
      gen: 6,
      input: [{ id: 1, type: 'line', maxlen: 255 }],
    };

    const results = parseRemGlkUpdate(update, noopResolver);

    const inputUpdate = results.find((u) => u.type === 'input-request');
    expect(inputUpdate?.type).toBe('input-request');
    if (inputUpdate?.type === 'input-request') {
      expect(inputUpdate.inputType).toBe('line');
      expect(inputUpdate.windowId).toBe(1);
      expect(inputUpdate.maxLength).toBe(255);
    }
  });

  test('parses input request for char input', () => {
    const update: RemGlkUpdate = {
      type: 'update',
      gen: 7,
      input: [{ id: 2, type: 'char' }],
    };

    const results = parseRemGlkUpdate(update, noopResolver);

    const inputUpdate = results.find((u) => u.type === 'input-request');
    expect(inputUpdate?.type).toBe('input-request');
    if (inputUpdate?.type === 'input-request') {
      expect(inputUpdate.inputType).toBe('char');
      expect(inputUpdate.windowId).toBe(2);
    }
  });

  test('parses window update', () => {
    const update: RemGlkUpdate = {
      type: 'update',
      gen: 8,
      windows: [
        {
          id: 1,
          type: 'buffer',
          rock: 0,
          left: 0,
          top: 0,
          width: 80,
          height: 25,
        },
      ],
    };

    const results = parseRemGlkUpdate(update, noopResolver);

    const windowUpdate = results.find((u) => u.type === 'window');
    expect(windowUpdate?.type).toBe('window');
    if (windowUpdate?.type === 'window') {
      expect(windowUpdate.windows).toHaveLength(1);
      expect(windowUpdate.windows[0].id).toBe(1);
      expect(windowUpdate.windows[0].type).toBe('buffer');
    }
  });

  test('parses error update', () => {
    const update: RemGlkUpdate = {
      type: 'error',
      gen: 0,
      message: 'Something went wrong',
    };

    const results = parseRemGlkUpdate(update, noopResolver);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('error');
    if (results[0].type === 'error') {
      expect(results[0].message).toBe('Something went wrong');
    }
  });

  test('parses clear flag', () => {
    const update: RemGlkUpdate = {
      type: 'update',
      gen: 9,
      content: [
        {
          id: 1,
          clear: true,
          text: [],
        },
      ],
    };

    const results = parseRemGlkUpdate(update, noopResolver);

    const contentUpdate = results.find((u) => u.type === 'content');
    expect(contentUpdate?.type).toBe('content');
    if (contentUpdate?.type === 'content') {
      expect(contentUpdate.clear).toBe(true);
    }
  });
});
