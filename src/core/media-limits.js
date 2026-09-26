export const MEDIA_LIMITS = {
  bytes: 25 * 1024 * 1024,
  dimension: 16384,
  pixels: 32000000,
  frames: 240,
  totalFramePixels: 32000000,
  minDelayMs: 20,
  maxDurationMs: 600000,
  maxLoops: 100,
};
export function inspectGif(bytes) {
  const fail = () => {
    throw Error("GIF 구조 또는 디코딩 한도 오류");
  };
  if (
    bytes.length < 14 ||
    !["GIF87a", "GIF89a"].includes(String.fromCharCode(...bytes.subarray(0, 6)))
  )
    fail();
  const width = bytes[6] | (bytes[7] << 8),
    height = bytes[8] | (bytes[9] << 8);
  if (
    !width ||
    !height ||
    width > MEDIA_LIMITS.dimension ||
    height > MEDIA_LIMITS.dimension ||
    width * height > MEDIA_LIMITS.pixels
  )
    fail();
  let position = 13;
  if (bytes[10] & 128) position += 3 * (1 << ((bytes[10] & 7) + 1));
  let loops = 1;
  let frames = 0,
    duration = 0,
    delay = 100;
  const blocks = () => {
    while (true) {
      if (position >= bytes.length) fail();
      const size = bytes[position++];
      if (!size) return;
      position += size;
      if (position > bytes.length) fail();
    }
  };
  while (position < bytes.length) {
    const tag = bytes[position++];
    if (tag === 0x3b) {
      if (!frames || position !== bytes.length) fail();
      return { width, height, frames, duration, loops };
    }
    if (tag === 0x21) {
      if (position >= bytes.length) fail();
      const label = bytes[position++];
      if (label === 0xf9) {
        if (
          position + 6 > bytes.length ||
          bytes[position] !== 4 ||
          bytes[position + 5] !== 0
        )
          fail();
        delay = Math.max(
          20,
          (bytes[position + 2] | (bytes[position + 3] << 8)) * 10,
        );
        position += 6;
      } else {
        if (
          label === 0xff &&
          position + 17 <= bytes.length &&
          bytes[position] === 11 &&
          String.fromCharCode(
            ...bytes.subarray(position + 1, position + 12),
          ) === "NETSCAPE2.0" &&
          bytes[position + 12] === 3 &&
          bytes[position + 13] === 1
        ) {
          const count = bytes[position + 14] | (bytes[position + 15] << 8);
          if (count > MEDIA_LIMITS.maxLoops) fail();
          loops = count === 0 ? 0 : count + 1;
        }
        blocks();
      }
    } else if (tag === 0x2c) {
      if (position + 9 > bytes.length) fail();
      const left = bytes[position] | (bytes[position + 1] << 8),
        top = bytes[position + 2] | (bytes[position + 3] << 8),
        w = bytes[position + 4] | (bytes[position + 5] << 8),
        h = bytes[position + 6] | (bytes[position + 7] << 8),
        flags = bytes[position + 8];
      position += 9;
      if (!w || !h || left + w > width || top + h > height) fail();
      if (flags & 128) position += 3 * (1 << ((flags & 7) + 1));
      if (
        position >= bytes.length ||
        bytes[position] < 2 ||
        bytes[position] > 8
      )
        fail();
      position++;
      blocks();
      frames++;
      duration += delay;
      delay = 100;
      if (
        frames > MEDIA_LIMITS.frames ||
        width * height * frames > MEDIA_LIMITS.totalFramePixels ||
        duration > MEDIA_LIMITS.maxDurationMs
      )
        fail();
    } else fail();
  }
  fail();
}
