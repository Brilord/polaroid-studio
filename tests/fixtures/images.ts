import { deflateSync } from 'node:zlib';

export type ImageFixture = {
  name: string;
  mimeType: 'image/png';
  buffer: Buffer;
};

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const crc32 = (buffer: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Buffer) => {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
};

const createPng = (width: number, height: number) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + x * 3;
      row[offset] = Math.round((x / Math.max(width - 1, 1)) * 255);
      row[offset + 1] = Math.round((y / Math.max(height - 1, 1)) * 255);
      row[offset + 2] = 180;
    }
    rows.push(row);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

export const squareImage: ImageFixture = {
  name: 'square-polaroid.png',
  mimeType: 'image/png',
  buffer: createPng(8, 8),
};

export const portraitImage: ImageFixture = {
  name: 'portrait-polaroid.png',
  mimeType: 'image/png',
  buffer: createPng(8, 16),
};

export const landscapeImage: ImageFixture = {
  name: 'landscape-polaroid.png',
  mimeType: 'image/png',
  buffer: createPng(16, 8),
};

export const largeImage: ImageFixture = {
  name: 'large-polaroid.png',
  mimeType: 'image/png',
  buffer: createPng(64, 64),
};

export const batchImages = [squareImage, portraitImage, landscapeImage];
