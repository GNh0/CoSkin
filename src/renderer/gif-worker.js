import { parseGIF, decompressFrames } from "gifuct-js";
import { inspectGif, MEDIA_LIMITS } from "../core/media-limits.js";
self.onmessage = (event) => {
  try {
    const bytes = new Uint8Array(event.data);
    const metadata = inspectGif(bytes);
    const parsed = parseGIF(bytes.buffer);
    const frames = decompressFrames(parsed, true);
    if (frames.length !== metadata.frames) throw Error("GIF 프레임 수 불일치");
    const canvas = new OffscreenCanvas(metadata.width, metadata.height),
      context = canvas.getContext("2d");
    const patchCanvas = new OffscreenCanvas(1, 1),
      patchContext = patchCanvas.getContext("2d");
    const output = [];
    let previous = null;
    for (const frame of frames) {
      if (previous?.disposalType === 2)
        context.clearRect(
          previous.dims.left,
          previous.dims.top,
          previous.dims.width,
          previous.dims.height,
        );
      else if (previous?.disposalType === 3 && previous.snapshot)
        context.putImageData(previous.snapshot, 0, 0);
      const snapshot =
        frame.disposalType === 3
          ? context.getImageData(0, 0, metadata.width, metadata.height)
          : null;
      patchCanvas.width = frame.dims.width;
      patchCanvas.height = frame.dims.height;
      patchContext.putImageData(
        new ImageData(frame.patch, frame.dims.width, frame.dims.height),
        0,
        0,
      );
      context.drawImage(patchCanvas, frame.dims.left, frame.dims.top);
      output.push({
        image: canvas.transferToImageBitmap(),
        delay: Math.max(MEDIA_LIMITS.minDelayMs, frame.delay || 100),
      });
      /* transfer clears the canvas; restore the composite for the next disposal step. */ context.drawImage(
        output[output.length - 1].image,
        0,
        0,
      );
      previous = { ...frame, snapshot };
    }
    self.postMessage(
      {
        ok: true,
        width: metadata.width,
        height: metadata.height,
        loops: metadata.loops,
        frames: output,
      },
      output.map((f) => f.image),
    );
  } catch (error) {
    self.postMessage({ ok: false, error: String(error.message || error) });
  }
};
