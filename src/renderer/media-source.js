import { throwIfAborted } from "./file-transfer.js";
import { MEDIA_LIMITS, isVideoMime } from "../core/media-limits.js";
import { decodeMedia, decodeVideoURL, disposeMedia } from "./media.js";
const releasedSources = new WeakSet();
// Preserve the application's CSP. A constrained renderer uses its Blob transfer path.
export const canUseNativeAssetURLs = () => !globalThis.document?.querySelectorAll?.('meta[http-equiv="Content-Security-Policy" i]')?.length;

export async function releaseAssetSource(controller, source) {
  if (!source?.token || typeof source !== "object" || releasedSources.has(source)) return;
  releasedSources.add(source);
  await controller.request("asset-media-release", { token: source.token }).catch(() => {});
}

// The URL is a short-lived capability on CoSkin's own loopback server.
export async function openAssetSource(controller, hash, signal) {
  throwIfAborted(signal);
  if (!canUseNativeAssetURLs()) return null;
  let source;
  try {
    source = await controller.request("asset-open", { hash });
    if (source?.available === false) { throwIfAborted(signal); return null; }
    const url = new URL(source?.url);
    if (source?.available !== true || !/^[a-f0-9]{64}$/.test(source.token) ||
        url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port ||
        url.username || url.password || url.search || url.hash || url.pathname !== "/media/" + source.token ||
        !["video/mp4", "video/webm", "image/png", "image/jpeg", "image/gif"].includes(source.mime) ||
        !Number.isSafeInteger(source.length) || source.length < 1 ||
        source.length > (isVideoMime(source.mime) ? MEDIA_LIMITS.videoBytes : MEDIA_LIMITS.bytes))
      throw Error("미디어 직접 연결 계약 오류");
    throwIfAborted(signal);
    return source;
  } catch (error) {
    await releaseAssetSource(controller, source);
    throwIfAborted(signal);
    if (error?.name === "AbortError") throw error;
    if (source?.available === true) throw error;
    return null; // An older host keeps its bounded transfer path.
  }
}

export async function fetchAssetSource(source, signal) {
  throwIfAborted(signal);
  const response = await globalThis.fetch(source.url, { cache: "no-store", credentials: "omit", signal });
  if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== source.mime)
    throw Error("미디어 직접 읽기 실패");
  const blob = await response.blob();
  throwIfAborted(signal);
  if (blob.size !== source.length) throw Error("미디어 직접 읽기 크기 오류");
  return blob;
}

export async function decodeAssetSource(controller, source, signal, poster) {
  let media;
  try {
    if (isVideoMime(source.mime)) {
      const ownedPoster = poster; poster = null;
      media = await decodeVideoURL(source.url, source.mime, ownedPoster);
    } else media = await decodeMedia(await fetchAssetSource(source, signal), source.mime);
    if (isVideoMime(source.mime)) {
      media.sourceBytes = source.length;
      media.releaseSource = () => releaseAssetSource(controller, source);
    } else await releaseAssetSource(controller, source);
    throwIfAborted(signal);
    return media;
  } catch (error) {
    if (media) disposeMedia(media);
    else poster?.close();
    await releaseAssetSource(controller, source);
    throw error;
  }
}
