// Contained app media fits below native chrome instead of losing its top edge
// behind an opaque header. The background paint still fills the whole target.
export function containedBackgroundTop(bounds, headers) {
  if (!(bounds.width > 0 && bounds.height > 0)) return 0;
  const bottom = bounds.top + bounds.height;
  const right = bounds.left + bounds.width;
  let chromeBottom = bounds.top;
  for (const header of headers) {
    if (
      header.width > 0 &&
      header.height > 0 &&
      header.left < right &&
      header.left + header.width > bounds.left &&
      header.top < bottom &&
      header.top + header.height > bounds.top
    )
      chromeBottom = Math.max(chromeBottom, header.top + header.height);
  }
  if (chromeBottom === bounds.top) return 0;
  // Leave a small gutter below the native titlebar's fading lower edge.
  return Math.max(
    0,
    Math.min(bounds.height - 1, chromeBottom - bounds.top + 16),
  );
}
