import { downloadBytes, downloadBlob } from "./file-transfer.js";
import { Controller, validateDocument, decodeImage } from "./controller.js";
import { decodeVideoURL, decodeMedia, disposeMedia } from "./media.js";
import { fetchAssetSource, canUseNativeAssetURLs } from "./media-source.js";
import { isVideoMime } from "../core/media-limits.js";
window.__coskinReady = (async () => {
  if (window.__coskin) return window.__coskin.status();
  const controller = new Controller(window.__coskinHostVersion);
  window.__coskin = controller;
  window.__coskinValidate = validateDocument;
  window.__coskinDirectMediaAvailable = canUseNativeAssetURLs();
  window.__coskinDecode = async (transfer, mime) =>
    decodeImage(await (isVideoMime(mime) ? downloadBlob : downloadBytes)(controller, { ...transfer, mime }), mime);
  window.__coskinDecodeURL = async (source) => {
    const media = isVideoMime(source.mime) ? await decodeVideoURL(source.url, source.mime) : await decodeMedia(await fetchAssetSource(source), source.mime);
    if (media.videoUrl) media.releaseSource = () => {}; // The validating host owns this temporary lease.
    disposeMedia(media);
    return true;
  };
  try {
    return await controller.start(window.__coskinSessionId);
  } catch (error) {
    controller.dispose();
    throw error;
  }
})();
