export const MEDIA_LIMITS: {
  bytes: number;
  videoBytes: number;
  transferBytes: number;
  dimension: number;
  pixels: number;
  frames: number;
  totalFramePixels: number;
  minDelayMs: number;
  maxDurationMs: number;
  maxLoops: number;
};
export function isVideoMime(mime: string): boolean;
export function inspectGif(bytes: Uint8Array): {
  width: number;
  height: number;
  frames: number;
  duration: number;
  loops: number;
};
