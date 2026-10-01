export const mediaCacheLimits = Object.freeze({
  standard: 128 * 1024 * 1024,
  uhdVideo: 256 * 1024 * 1024,
  assets: 64,
});

export function mediaMemoryBytes(media) {
  return (
    media.width *
      media.height *
      (media.videoUrl ? 4 : media.frames.length) *
      4 +
    (media.encodedBytes || 0)
  );
}

export function mediaCacheBudget(incoming, active) {
  // Reserve room for a 4K video's poster, compressed bytes and native buffers,
  // plus the current 1080p video while its replacement is prepared.
  // Animated images keep their existing limit; unused videos do not raise it.
  const uhd = (media) =>
    !!media?.videoUrl && media.width * media.height >= 3840 * 2160;
  return uhd(incoming) || [...active].some(uhd)
    ? mediaCacheLimits.uhdVideo
    : mediaCacheLimits.standard;
}
