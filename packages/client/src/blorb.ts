/**
 * Blorb File Parser
 *
 * Parses IFF/FORM Blorb files to extract:
 * - Executable story data (GLUL, ZCOD, etc.)
 * - Image resources (PNG, JPEG)
 * - Resource index
 */

/** An image extracted from a Blorb file. */
export interface BlorbImage {
  number: number;
  format: 'png' | 'jpeg';
  data: Uint8Array;
  width: number;
  height: number;
}

/** A resource entry from the Blorb resource index. */
export interface BlorbResource {
  usage: string;
  number: number;
  chunkIndex: number;
}

interface BlorbChunk {
  type: string;
  data: Uint8Array;
  offset: number;
}

// FourCC constants
const FORM = 0x464f524d; // 'FORM'
const IFRS = 0x49465253; // 'IFRS'
const RIdx = 0x52496478; // 'RIdx'
const PNG_ = 0x504e4720; // 'PNG '
const JPEG = 0x4a504547; // 'JPEG'
// FourCC type IDs: GLUL=0x474c554c ZCOD=0x5a434f44
// Usage IDs: Pict=0x50696374 Snd=0x536e6420 Exec=0x45786563 Data=0x44617461

function fourccToString(val: number): string {
  return String.fromCharCode(
    (val >> 24) & 0xff,
    (val >> 16) & 0xff,
    (val >> 8) & 0xff,
    val & 0xff
  );
}

/** Parser for IFF/FORM Blorb files containing story data and resources. */
export class BlorbParser {
  private data: Uint8Array;
  private view: DataView;
  private chunks: BlorbChunk[] = [];
  private resources: BlorbResource[] = [];
  private imageCache = new Map<number, BlorbImage>();
  private blobUrlCache = new Map<number, string>();

  constructor(data: Uint8Array) {
    this.data = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.parse();
  }

  /**
   * Check if data is a Blorb file (starts with FORM...IFRS)
   */
  static isBlorb(data: Uint8Array): boolean {
    if (data.length < 12) return false;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const form = view.getUint32(0, false);
    const ifrs = view.getUint32(8, false);
    return form === FORM && ifrs === IFRS;
  }

  /**
   * Get the executable story data from the Blorb
   */
  getExecutable(): { type: string; data: Uint8Array } | null {
    const execResource = this.resources.find(
      (r) => r.usage === 'Exec' && r.number === 0
    );
    if (!execResource) return null;

    const chunk = this.chunks[execResource.chunkIndex];
    if (!chunk) return null;

    return {
      type: fourccToString(this.view.getUint32(chunk.offset - 8, false)),
      data: chunk.data,
    };
  }

  /**
   * Get image by resource number
   */
  getImage(imageNum: number): BlorbImage | null {
    // Check cache
    if (this.imageCache.has(imageNum)) {
      return this.imageCache.get(imageNum)!;
    }

    // Find resource
    const resource = this.resources.find(
      (r) => r.usage === 'Pict' && r.number === imageNum
    );
    if (!resource) return null;

    const chunk = this.chunks[resource.chunkIndex];
    if (!chunk) return null;

    // Determine format
    const chunkType = this.view.getUint32(chunk.offset - 8, false);
    let format: 'png' | 'jpeg';
    if (chunkType === PNG_) {
      format = 'png';
    } else if (chunkType === JPEG) {
      format = 'jpeg';
    } else {
      return null;
    }

    // Get dimensions
    const dimensions =
      format === 'png'
        ? this.getPngDimensions(chunk.data)
        : this.getJpegDimensions(chunk.data);

    if (!dimensions) return null;

    const image: BlorbImage = {
      number: imageNum,
      format,
      data: chunk.data,
      width: dimensions.width,
      height: dimensions.height,
    };

    this.imageCache.set(imageNum, image);
    return image;
  }

  /**
   * Get all image resource numbers
   */
  getImageNumbers(): number[] {
    return this.resources
      .filter((r) => r.usage === 'Pict')
      .map((r) => r.number);
  }

  /**
   * Get a blob URL for an image (cached)
   */
  getImageUrl(imageNum: number): string | undefined {
    // Check cache
    if (this.blobUrlCache.has(imageNum)) {
      return this.blobUrlCache.get(imageNum);
    }

    const image = this.getImage(imageNum);
    if (!image) return undefined;

    const mimeType = image.format === 'png' ? 'image/png' : 'image/jpeg';
    // Create a copy of the data to ensure proper ArrayBuffer type for Blob
    const blob = new Blob([new Uint8Array(image.data)], { type: mimeType });
    const url = URL.createObjectURL(blob);

    this.blobUrlCache.set(imageNum, url);
    return url;
  }

  /**
   * Get image dimensions without loading full image data
   */
  getImageInfo(imageNum: number): { width: number; height: number } | null {
    const image = this.getImage(imageNum);
    if (!image) return null;
    return { width: image.width, height: image.height };
  }

  /**
   * Revoke all blob URLs (call when done)
   */
  dispose(): void {
    for (const url of this.blobUrlCache.values()) {
      URL.revokeObjectURL(url);
    }
    this.blobUrlCache.clear();
    this.imageCache.clear();
  }

  private parse(): void {
    // Validate header
    if (this.data.length < 12) {
      throw new Error('Blorb file too small');
    }

    const formId = this.view.getUint32(0, false);
    if (formId !== FORM) {
      throw new Error('Not a valid IFF file (missing FORM)');
    }

    const totalLength = this.view.getUint32(4, false) + 8;
    const typeId = this.view.getUint32(8, false);
    if (typeId !== IFRS) {
      throw new Error('Not a Blorb file (missing IFRS)');
    }

    // Parse all chunks first
    let ridxData: Uint8Array | null = null;
    let pos = 12;
    while (pos < totalLength && pos < this.data.length) {
      if (pos + 8 > this.data.length) break;

      const chunkType = this.view.getUint32(pos, false);
      const chunkLen = this.view.getUint32(pos + 4, false);
      const dataStart = pos + 8;

      if (dataStart + chunkLen > this.data.length) break;

      const chunkData = this.data.subarray(dataStart, dataStart + chunkLen);

      this.chunks.push({
        type: fourccToString(chunkType),
        data: chunkData,
        offset: dataStart,
      });

      // Save RIdx data for later (after all chunks are discovered)
      if (chunkType === RIdx) {
        ridxData = chunkData;
      }

      // Advance to next chunk (with padding)
      pos = dataStart + chunkLen;
      if (pos & 1) pos++;
    }

    // Now parse resource index (all chunks are known)
    if (ridxData) {
      this.parseResourceIndex(ridxData);
    }
  }

  private parseResourceIndex(data: Uint8Array): void {
    if (data.length < 4) return;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const numResources = view.getUint32(0, false);

    for (let i = 0; i < numResources && 4 + i * 12 + 12 <= data.length; i++) {
      const offset = 4 + i * 12;
      const usage = view.getUint32(offset, false);
      const resNum = view.getUint32(offset + 4, false);
      const startPos = view.getUint32(offset + 8, false);

      // Find chunk at this position
      const chunkIndex = this.chunks.findIndex(
        (c) => c.offset === startPos + 8 || c.offset - 8 === startPos
      );

      if (chunkIndex >= 0) {
        this.resources.push({
          usage: fourccToString(usage),
          number: resNum,
          chunkIndex,
        });
      }
    }
  }

  private getPngDimensions(
    data: Uint8Array
  ): { width: number; height: number } | null {
    // PNG: signature (8 bytes) + IHDR chunk (length 4 + type 4 + width 4 + height 4)
    if (data.length < 24) return null;

    // Check PNG signature
    if (
      data[0] !== 0x89 ||
      data[1] !== 0x50 ||
      data[2] !== 0x4e ||
      data[3] !== 0x47
    ) {
      return null;
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    // Width and height are at offset 16 and 20 in the file
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);

    return { width, height };
  }

  private getJpegDimensions(
    data: Uint8Array
  ): { width: number; height: number } | null {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;

    while (pos < data.length) {
      // Find marker
      if (data[pos] !== 0xff) {
        pos++;
        continue;
      }

      // Skip padding
      while (pos < data.length && data[pos] === 0xff) {
        pos++;
      }

      if (pos >= data.length) break;

      const marker = data[pos];
      pos++;

      // Check for SOF markers (Start Of Frame)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        if (pos + 7 > data.length) break;
        const height = view.getUint16(pos + 3, false);
        const width = view.getUint16(pos + 5, false);
        return { width, height };
      }

      // Skip markers without data
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        continue;
      }

      // Skip marker with length
      if (pos + 2 > data.length) break;
      const len = view.getUint16(pos, false);
      pos += len;
    }

    return null;
  }
}
