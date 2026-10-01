import { localizedFailure } from "./error-messages.js";
const CHUNK_BYTES = 24 * 1024;

export function throwIfAborted(signal) {
  if (signal?.aborted)
    throw (
      signal.reason || new DOMException("Operation cancelled", "AbortError")
    );
}

export async function downloadBytes(controller, { token, length }, signal) {
  if (!Number.isSafeInteger(length) || length < 1 || length > 100 * 1024 * 1024)
    throw new Error(localizedFailure({ code: "validation" }));
  try {
    throwIfAborted(signal);
    const bytes = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += CHUNK_BYTES) {
      throwIfAborted(signal);
      const { data } = await controller.request("transfer-read", {
        token,
        offset,
      });
      throwIfAborted(signal);
      const binary = atob(data);
      if (binary.length !== Math.min(CHUNK_BYTES, length - offset))
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
  const { token } = await controller.request("transfer-begin", {
    length: file.size,
  });
  try {
    for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
      const bytes = new Uint8Array(
        await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer(),
      );
      const data = btoa(String.fromCharCode(...bytes));
      await controller.request("transfer-append", { token, offset, data });
    }
    return await controller.request(operation, { token });
  } finally {
    await controller.request("transfer-cancel", { token }).catch(() => {});
  }
}
