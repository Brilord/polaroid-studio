type ZipFile = {
  name: string;
  data: Uint8Array;
};

const encoder = new TextEncoder();

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;

  for (let index = 0; index < data.length; index += 1) {
    crc ^= data[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

function createHeader(size: number) {
  const buffer = new ArrayBuffer(size);
  return {
    buffer,
    view: new DataView(buffer),
  };
}

export function createZipBlob(files: ZipFile[]) {
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const name = encoder.encode(file.name.replace(/^\/+/, ''));
    const checksum = crc32(file.data);
    const localHeader = createHeader(30);

    writeUint32(localHeader.view, 0, 0x04034b50);
    writeUint16(localHeader.view, 4, 20);
    writeUint16(localHeader.view, 6, 0);
    writeUint16(localHeader.view, 8, 0);
    writeUint16(localHeader.view, 10, 0);
    writeUint16(localHeader.view, 12, 0);
    writeUint32(localHeader.view, 14, checksum);
    writeUint32(localHeader.view, 18, file.data.length);
    writeUint32(localHeader.view, 22, file.data.length);
    writeUint16(localHeader.view, 26, name.length);
    writeUint16(localHeader.view, 28, 0);

    chunks.push(new Uint8Array(localHeader.buffer), name, file.data);

    const centralHeader = createHeader(46);
    writeUint32(centralHeader.view, 0, 0x02014b50);
    writeUint16(centralHeader.view, 4, 20);
    writeUint16(centralHeader.view, 6, 20);
    writeUint16(centralHeader.view, 8, 0);
    writeUint16(centralHeader.view, 10, 0);
    writeUint16(centralHeader.view, 12, 0);
    writeUint16(centralHeader.view, 14, 0);
    writeUint32(centralHeader.view, 16, checksum);
    writeUint32(centralHeader.view, 20, file.data.length);
    writeUint32(centralHeader.view, 24, file.data.length);
    writeUint16(centralHeader.view, 28, name.length);
    writeUint16(centralHeader.view, 30, 0);
    writeUint16(centralHeader.view, 32, 0);
    writeUint16(centralHeader.view, 34, 0);
    writeUint16(centralHeader.view, 36, 0);
    writeUint32(centralHeader.view, 38, 0);
    writeUint32(centralHeader.view, 42, offset);

    centralDirectory.push(new Uint8Array(centralHeader.buffer), name);
    offset += localHeader.buffer.byteLength + name.length + file.data.length;
  });

  const centralDirectoryOffset = offset;
  centralDirectory.forEach((chunk) => {
    chunks.push(chunk);
    offset += chunk.length;
  });

  const endHeader = createHeader(22);
  writeUint32(endHeader.view, 0, 0x06054b50);
  writeUint16(endHeader.view, 4, 0);
  writeUint16(endHeader.view, 6, 0);
  writeUint16(endHeader.view, 8, files.length);
  writeUint16(endHeader.view, 10, files.length);
  writeUint32(endHeader.view, 12, offset - centralDirectoryOffset);
  writeUint32(endHeader.view, 16, centralDirectoryOffset);
  writeUint16(endHeader.view, 20, 0);
  chunks.push(new Uint8Array(endHeader.buffer));

  const blobParts = chunks.map((chunk) =>
    new Uint8Array(chunk).buffer
  );
  return new Blob(blobParts, { type: 'application/zip' });
}
