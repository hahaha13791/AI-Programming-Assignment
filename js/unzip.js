(function () {
  // Reads a ZIP file (a compressed MusicXML .mxl) in the browser, with no library: the central directory gives
  // each entry's name and where its data is; stored entries are copied and deflated ones go through the browser's
  // DecompressionStream('deflate-raw'), which works on file:// pages. ZIP64 and encrypted entries are not read.
  const EOCD = 0x06054b50; // end of central directory
  const CENTRAL = 0x02014b50;
  const LOCAL = 0x04034b50;

  class ZipError extends Error {}

  function isZip(bytes) {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  }

  // The central directory: [{ name, method, flags, compressedSize, size, offset }].
  function entries(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // The end record is the last 22 bytes, unless a comment (up to 65535 bytes) follows it.
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
      if (view.getUint32(i, true) === EOCD) {
        end = i;
        break;
      }
    }
    if (end < 0) throw new ZipError('압축 파일 끝을 찾지 못했어요');
    const count = view.getUint16(end + 10, true);
    let pos = view.getUint32(end + 16, true);
    if (count === 0xffff || pos === 0xffffffff) throw new ZipError('너무 큰 압축 파일(ZIP64)은 읽지 못해요');
    const decoder = new TextDecoder();
    const list = [];
    for (let k = 0; k < count; k++) {
      if (pos + 46 > bytes.length || view.getUint32(pos, true) !== CENTRAL) throw new ZipError('압축 파일 목록이 깨져 있어요');
      const nameLength = view.getUint16(pos + 28, true);
      const extraLength = view.getUint16(pos + 30, true);
      const commentLength = view.getUint16(pos + 32, true);
      list.push({
        flags: view.getUint16(pos + 8, true),
        method: view.getUint16(pos + 10, true),
        compressedSize: view.getUint32(pos + 20, true),
        size: view.getUint32(pos + 24, true),
        offset: view.getUint32(pos + 42, true),
        name: decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength)),
      });
      pos += 46 + nameLength + extraLength + commentLength;
    }
    return list;
  }

  async function inflate(data) {
    if (typeof DecompressionStream !== 'function') throw new ZipError('이 브라우저는 압축을 풀 수 없어요');
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // The bytes of one entry (from entries()).
  async function extract(bytes, entry) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const at = entry.offset;
    if (at + 30 > bytes.length || view.getUint32(at, true) !== LOCAL) throw new ZipError('압축 파일 내용이 깨져 있어요');
    if (entry.flags & 1) throw new ZipError('암호가 걸린 압축 파일은 읽지 못해요');
    const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
    const data = bytes.subarray(start, start + entry.compressedSize);
    if (data.length !== entry.compressedSize) throw new ZipError('압축 파일 내용이 잘려 있어요');
    let out;
    try {
      if (entry.method === 0) out = data.slice();
      else if (entry.method === 8) out = await inflate(data);
      else throw new ZipError('이 압축 방식은 읽지 못해요');
    } catch (error) {
      if (error instanceof ZipError) throw error;
      throw new ZipError('압축을 풀지 못했어요');
    }
    if (out.length !== entry.size) throw new ZipError('압축을 풀지 못했어요');
    return out;
  }

  window.Unzip = { isZip, entries, extract, ZipError };
})();
