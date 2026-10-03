import { downloadBytes, uploadFile, throwIfAborted } from "./file-transfer.js";

export const POSTER_LIMITS = Object.freeze({ bytes: 4 * 1024 * 1024, dimension: 1600, storedDimension: 1024 });
const key = (hash) => typeof hash === "string" && /^[a-f0-9]{64}$/i.test(hash) ? hash.toLowerCase() : null;
const abortError = (error, signal) => {
  throwIfAborted(signal);
  if (error?.name === "AbortError") throw error;
};
function pngDimensions(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || !signature.every((value, index) => bytes[index] === value) ||
      String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  return width > 0 && height > 0 && width <= POSTER_LIMITS.dimension && height <= POSTER_LIMITS.dimension ? { width, height } : null;
}

/** The caller owns the returned bitmap. Missing/older hosts fall back without downloading source media here. */
export async function readPoster(controller, hash, signal) {
  throwIfAborted(signal);
  hash = key(hash);
  if (!hash) return null;
  let descriptor, bitmap;
  try {
    descriptor = await controller.request("asset-poster-read", { hash });
    if (descriptor?.available === false) { throwIfAborted(signal); return null; }
    if (typeof descriptor?.token !== "string" || !descriptor.token || descriptor.mime !== "image/png" ||
        !Number.isSafeInteger(descriptor.length) || descriptor.length < 33 || descriptor.length > POSTER_LIMITS.bytes) {
      if (descriptor?.token) await controller.request("transfer-cancel", { token: descriptor.token }).catch(() => {});
      throwIfAborted(signal);
      return null;
    }
    const bytes = await downloadBytes(controller, descriptor, signal);
    const dimensions = pngDimensions(bytes);
    if (!dimensions) return null;
    throwIfAborted(signal);
    bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    throwIfAborted(signal);
    if (bitmap.width !== dimensions.width || bitmap.height !== dimensions.height) {
      bitmap.close();
      return null;
    }
    return bitmap;
  } catch (error) {
    bitmap?.close();
    abortError(error, signal);
    return null;
  }
}

function pngBlob(canvas, signal) {
  return new Promise((resolve, reject) => {
    const finish = (error, blob) => {
      signal?.removeEventListener("abort", onAbort);
      error ? reject(error) : resolve(blob);
    };
    const onAbort = () => {
      try { throwIfAborted(signal); } catch (error) { finish(error); }
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    try { canvas.toBlob((blob) => finish(null, blob), "image/png"); }
    catch (error) { finish(error); }
  });
}

/** Best-effort derived PNG upload. This never closes or changes the source bitmap. */
export async function storePoster(controller, hash, bitmap, signal) {
  throwIfAborted(signal);
  hash = key(hash);
  if (!hash || !Number.isSafeInteger(bitmap?.width) || !Number.isSafeInteger(bitmap?.height) || bitmap.width < 1 || bitmap.height < 1) return false;
  let canvas;
  try {
    const scale = Math.min(1, POSTER_LIMITS.storedDimension / Math.max(bitmap.width, bitmap.height));
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return false;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await pngBlob(canvas, signal);
    throwIfAborted(signal);
    if (!blob || blob.type !== "image/png" || blob.size < 33 || blob.size > POSTER_LIMITS.bytes) return false;
    const posterTransfer = { async request(operation, data) {
      if (operation !== "transfer-cancel") throwIfAborted(signal);
      const result = await controller.request(operation, operation === "asset-poster-write" ? { ...data, hash } : data);
      // Always return a new transfer token to uploadFile so its finally can cancel it after an abort.
      if (operation !== "transfer-cancel" && operation !== "transfer-begin") throwIfAborted(signal);
      return result;
    } };
    const result = await uploadFile(posterTransfer, blob, "asset-poster-write");
    throwIfAborted(signal);
    return result != null && result?.available !== false && result?.stored !== false && result?.ok !== false;
  } catch (error) {
    abortError(error, signal);
    return false;
  } finally {
    if (canvas) canvas.width = canvas.height = 0;
  }
}

/** Capture pixels now; derived cache I/O must not delay displaying ready media. */
export function storePosterLater(controller, hash, bitmap, signal) {
  void storePoster(controller, hash, bitmap, signal).catch(() => {});
}
