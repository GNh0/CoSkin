import { localizedFailure } from "./error-messages.js";
import { MEDIA_LIMITS } from "../core/media-limits.js";
const CHUNK_BYTES = 24 * 1024;
const LARGE_CHUNK_BYTES = 256 * 1024;
const transferChunkBytes = (chunkBytes = CHUNK_BYTES) => {
  if (chunkBytes !== CHUNK_BYTES && chunkBytes !== LARGE_CHUNK_BYTES)
    throw new Error(localizedFailure({ code: "validation" }));
  return chunkBytes;
};
const base64Bytes = (bytes) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += CHUNK_BYTES)
    binary += String.fromCharCode(
      ...bytes.subarray(index, index + CHUNK_BYTES),
    );
  return btoa(binary);
};

export function throwIfAborted(signal) {
  if (signal?.aborted)
    throw (
      signal.reason || new DOMException("Operation cancelled", "AbortError")
    );
}

export async function downloadBytes(
  controller,
  { token, length, chunkBytes },
  signal,
) {
  try {
    if (
      !Number.isSafeInteger(length) ||
      length < 1 ||
      length > MEDIA_LIMITS.transferBytes
    )
      throw new Error(localizedFailure({ code: "validation" }));
    chunkBytes = transferChunkBytes(chunkBytes);
    throwIfAborted(signal);
    const bytes = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += chunkBytes) {
      throwIfAborted(signal);
      const { data } = await controller.request("transfer-read", {
        token,
        offset,
      });
      throwIfAborted(signal);
      const binary = atob(data);
      if (binary.length !== Math.min(chunkBytes, length - offset))
        throw new Error(localizedFailure({ code: "validation" }));
      for (let index = 0; index < binary.length; index++)
        bytes[offset + index] = binary.charCodeAt(index);
    }
    return bytes;
  } finally {
    await controller.request("transfer-cancel", { token }).catch(() => {});
  }
}

export async function uploadFile(controller, file, operation) {
  if (
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > MEDIA_LIMITS.transferBytes
  )
    throw new Error(localizedFailure({ code: "validation" }));
  const { token, chunkBytes } = await controller.request("transfer-begin", {
    length: file.size,
    chunkBytes:
      file.size > MEDIA_LIMITS.bytes ? LARGE_CHUNK_BYTES : CHUNK_BYTES,
  });
  try {
    const size = transferChunkBytes(chunkBytes);
    for (let offset = 0; offset < file.size; offset += size) {
      const bytes = new Uint8Array(
        await file.slice(offset, offset + size).arrayBuffer(),
      );
      const data = base64Bytes(bytes);
      await controller.request("transfer-append", { token, offset, data });
    }
    return await controller.request(operation, { token });
  } finally {
    await controller.request("transfer-cancel", { token }).catch(() => {});
  }
}

// Videos can become a native Blob without a second whole-file typed array.
export async function downloadBlob(controller, {token, length, chunkBytes, mime}, signal) {
  try {
    if (!Number.isSafeInteger(length) || length < 1 || length > MEDIA_LIMITS.transferBytes)
      throw new Error(localizedFailure({code: "validation"}));
    chunkBytes = transferChunkBytes(chunkBytes);
    const parts = [];
    for (let offset = 0; offset < length; offset += chunkBytes) {
      throwIfAborted(signal);
      const {data} = await controller.request("transfer-read", {token, offset});
      throwIfAborted(signal);
      const binary = atob(data);
      if (binary.length !== Math.min(chunkBytes, length - offset))
        throw new Error(localizedFailure({code: "validation"}));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      parts.push(bytes);
    }
    throwIfAborted(signal);
    return new Blob(parts, {type: mime});
  } finally { await controller.request("transfer-cancel", {token}).catch(() => {}); }
}
