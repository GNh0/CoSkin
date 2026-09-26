import { drawPreviewScene } from "./preview-scene.js";
import { applicationLocale } from "./locale.js";
import { t } from "./messages.js";
// Synthetic previews never read or capture the current chat DOM.
const cache = new Map();
let queue = Promise.resolve();
export function previewUrl(controller, id, revision, width = 640) {
  const key =
    id +
    ":" +
    revision +
    ":" +
    width +
    ":" +
    applicationLocale(document, navigator);
  if (cache.has(key)) return cache.get(key);
  const promise = queue.then(async () => {
    const doc = await controller.request("read", { id, revision });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = width * 0.625;
    const context = canvas.getContext("2d");
    context.scale(width / 640, width / 640);
    await drawPreviewScene(context, controller, doc);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    const url = URL.createObjectURL(blob);
    return url;
  });
  queue = promise.catch(() => {});
  cache.set(key, promise);
  while (cache.size > 48) {
    const oldest = cache.keys().next().value;
    const old = cache.get(oldest);
    cache.delete(oldest);
    old.then(URL.revokeObjectURL).catch(() => {});
  }
  return promise;
}
export function mountPreview(panel, container, id, revision, width = 640) {
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    observer.disconnect();
    previewUrl(panel.c, id, revision, width)
      .then((url) => {
        if (!container.isConnected) return;
        const image = document.createElement("img");
        image.src = url;
        image.alt = t("previewAlt");
        image.style.cssText =
          "width:100%;height:100%;object-fit:contain;border-radius:8px";
        container.replaceChildren(image);
      })
      .catch((error) => {
        if (container.isConnected) container.textContent = error.message;
      });
  });
  observer.observe(container);
  panel.pageResources.push(() => observer.disconnect());
}
export function disposePreviews() {
  for (const promise of cache.values())
    promise.then(URL.revokeObjectURL).catch(() => {});
  cache.clear();
}
