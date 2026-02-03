import { describe, expect, test } from 'bun:test';
import { BlorbParser } from '../src/blorb';

/**
 * Helper to create a properly formatted Blorb file
 * The resource index entries need absolute file positions
 */
function createBlorb(
  resources: Array<{
    usage: string;
    number: number;
    type: string;
    data: Uint8Array;
  }>
): Uint8Array {
  // Calculate positions and sizes
  // RIdx chunk comes first after FORM header
  const ridxEntrySize = 12; // usage(4) + number(4) + position(4)
  const ridxDataSize = 4 + resources.length * ridxEntrySize;
  const ridxChunkSize = 8 + ridxDataSize; // type(4) + length(4) + data

  // Calculate chunk positions (absolute file positions)
  let currentPos = 12 + ridxChunkSize; // After FORM header and RIdx
  if (ridxChunkSize % 2 !== 0) currentPos++; // Padding

  const chunkPositions: number[] = [];
  let totalDataSize = ridxChunkSize;

  for (const res of resources) {
    chunkPositions.push(currentPos);
    const chunkSize = 8 + res.data.length;
    currentPos += chunkSize;
    if (chunkSize % 2 !== 0) {
      currentPos++;
      totalDataSize += 1;
    }
    totalDataSize += chunkSize;
  }

  // Create buffer
  const formSize = 4 + totalDataSize; // IFRS + chunks
  const buffer = new ArrayBuffer(8 + formSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // FORM header
  bytes.set(new TextEncoder().encode('FORM'), 0);
  view.setUint32(4, formSize, false);
  bytes.set(new TextEncoder().encode('IFRS'), 8);

  // RIdx chunk
  let offset = 12;
  bytes.set(new TextEncoder().encode('RIdx'), offset);
  view.setUint32(offset + 4, ridxDataSize, false);
  view.setUint32(offset + 8, resources.length, false);

  // Resource entries
  for (let i = 0; i < resources.length; i++) {
    const entryOffset = offset + 12 + i * 12;
    bytes.set(new TextEncoder().encode(resources[i].usage), entryOffset);
    view.setUint32(entryOffset + 4, resources[i].number, false);
    view.setUint32(entryOffset + 8, chunkPositions[i], false);
  }

  offset = 12 + ridxChunkSize;
  if (ridxChunkSize % 2 !== 0) offset++;

  // Data chunks
  for (let i = 0; i < resources.length; i++) {
    bytes.set(new TextEncoder().encode(resources[i].type), offset);
    view.setUint32(offset + 4, resources[i].data.length, false);
    bytes.set(resources[i].data, offset + 8);
    offset += 8 + resources[i].data.length;
    if (resources[i].data.length % 2 !== 0) offset++;
  }

  return bytes;
}

// Create a minimal PNG with proper structure
function createMinimalPng(width: number, height: number): Uint8Array {
  const buffer = new ArrayBuffer(33);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // PNG signature
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // IHDR chunk: length
  view.setUint32(8, 13, false);
  // IHDR chunk: type
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  // Width and height
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  // Bit depth, color type, compression, filter, interlace
  bytes[24] = 8;
  bytes[25] = 2;
  bytes[26] = 0;
  bytes[27] = 0;
  bytes[28] = 0;
  // CRC (fake)
  view.setUint32(29, 0, false);

  return bytes;
}

// Create a minimal JPEG with proper structure
function createMinimalJpeg(width: number, height: number): Uint8Array {
  const buffer = new ArrayBuffer(20);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // SOI marker
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  // APP0 marker
  bytes[2] = 0xff;
  bytes[3] = 0xe0;
  view.setUint16(4, 5, false); // Length
  // SOF0 marker (baseline DCT)
  bytes[9] = 0xff;
  bytes[10] = 0xc0;
  view.setUint16(11, 8, false); // Length
  bytes[13] = 8; // Precision
  view.setUint16(14, height, false);
  view.setUint16(16, width, false);

  return bytes;
}

describe('BlorbParser', () => {
  test('isBlorb detects valid Blorb files', () => {
    const blorb = createBlorb([]);
    expect(BlorbParser.isBlorb(blorb)).toBe(true);
  });

  test('isBlorb rejects non-Blorb files', () => {
    const notBlorb = new Uint8Array([0x47, 0x6c, 0x75, 0x6c]); // "Glul"
    expect(BlorbParser.isBlorb(notBlorb)).toBe(false);
  });

  test('isBlorb rejects files that are too short', () => {
    const tooShort = new Uint8Array([0x46, 0x4f, 0x52, 0x4d]); // "FORM" only
    expect(BlorbParser.isBlorb(tooShort)).toBe(false);
  });

  test('parses executable chunk', () => {
    const glulxCode = new Uint8Array([
      0x47, 0x6c, 0x75, 0x6c, // "Glul"
      0x00, 0x03, 0x01, 0x02, // Version
      0x00, 0x00, 0x00, 0x00, // Padding
    ]);

    const blorb = createBlorb([
      { usage: 'Exec', number: 0, type: 'GLUL', data: glulxCode },
    ]);

    const parser = new BlorbParser(blorb);
    const exec = parser.getExecutable();

    expect(exec).not.toBeNull();
    expect(exec?.type).toBe('GLUL');
    expect(exec?.data.length).toBe(glulxCode.length);
  });

  test('parses PNG image dimensions', () => {
    const png = createMinimalPng(320, 240);

    const blorb = createBlorb([
      { usage: 'Pict', number: 1, type: 'PNG ', data: png },
    ]);

    const parser = new BlorbParser(blorb);
    const info = parser.getImageInfo(1);

    expect(info).not.toBeNull();
    expect(info?.width).toBe(320);
    expect(info?.height).toBe(240);
  });

  test('parses JPEG image dimensions', () => {
    const jpeg = createMinimalJpeg(640, 480);

    const blorb = createBlorb([
      { usage: 'Pict', number: 2, type: 'JPEG', data: jpeg },
    ]);

    const parser = new BlorbParser(blorb);
    const info = parser.getImageInfo(2);

    expect(info).not.toBeNull();
    expect(info?.width).toBe(640);
    expect(info?.height).toBe(480);
  });

  test('returns null for non-existent image', () => {
    const blorb = createBlorb([]);
    const parser = new BlorbParser(blorb);

    expect(parser.getImage(999)).toBeNull();
    expect(parser.getImageInfo(999)).toBeNull();
  });

  test('creates blob URL for image', () => {
    const png = createMinimalPng(100, 100);

    const blorb = createBlorb([
      { usage: 'Pict', number: 1, type: 'PNG ', data: png },
    ]);

    const parser = new BlorbParser(blorb);
    const url = parser.getImageUrl(1);

    expect(url).toBeDefined();
    expect(url).toMatch(/^blob:/);

    // Same URL should be returned (cached)
    expect(parser.getImageUrl(1)).toBe(url);

    parser.dispose();
  });

  test('getImageNumbers returns all picture resource numbers', () => {
    const png1 = createMinimalPng(100, 100);
    const png2 = createMinimalPng(200, 200);

    const blorb = createBlorb([
      { usage: 'Pict', number: 1, type: 'PNG ', data: png1 },
      { usage: 'Pict', number: 5, type: 'PNG ', data: png2 },
    ]);

    const parser = new BlorbParser(blorb);
    const numbers = parser.getImageNumbers();

    expect(numbers).toContain(1);
    expect(numbers).toContain(5);
    expect(numbers).toHaveLength(2);
  });
});
