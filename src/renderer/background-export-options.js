export function backgroundExportFormats(kind) {
  return kind === "image"
    ? ["original", "jpg", "png"]
    : ["original", "jpg", "png", "mp4", "webm", "gif"];
}

export function backgroundExportRequest(identity, state) {
  if (!backgroundExportFormats(state.info?.kind).includes(state.format))
    throw new RangeError("format");
  const resolution =
    state.format === "original" ? "original" : state.resolution;
  if (!["original", "720", "1080", "custom"].includes(resolution))
    throw new RangeError("resolution");
  const quality = ["jpg", "mp4", "webm"].includes(state.format)
    ? state.quality
    : "high";
  if (!["high", "standard", "compact"].includes(quality))
    throw new RangeError("quality");
  const width = resolution === "custom" ? Number(state.width) : 1920;
  const height = resolution === "custom" ? Number(state.height) : 1080;
  const timeSeconds =
    ["jpg", "png"].includes(state.format) && state.info?.kind !== "image"
      ? Number(state.timeSeconds)
      : 0;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2 ||
    width > 8192 ||
    height > 8192 ||
    width * height > 33554432 ||
    !Number.isFinite(timeSeconds) ||
    timeSeconds < 0 ||
    timeSeconds > 604800 ||
    (state.info?.durationSeconds && timeSeconds >= state.info.durationSeconds)
  )
    throw new RangeError("dimensions or time");
  return {
    ...identity,
    format: state.format,
    resolution,
    width,
    height,
    keepAspect: resolution !== "custom" || state.keepAspect !== false,
    quality,
    timeSeconds,
  };
}
