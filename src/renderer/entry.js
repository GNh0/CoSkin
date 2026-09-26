import { downloadBytes } from "./file-transfer.js";
import { Controller, validateDocument, decodeImage } from "./controller.js";
window.__coskinReady = (async () => {
  if (window.__coskin) return window.__coskin.status();
  const controller = new Controller(window.__coskinHostVersion);
  window.__coskin = controller;
  window.__coskinValidate = validateDocument;
  window.__coskinDecode = async (transfer, mime) =>
    decodeImage(await downloadBytes(controller, transfer), mime);
  try {
    return await controller.start(window.__coskinSessionId);
  } catch (error) {
    controller.dispose();
    throw error;
  }
})();
