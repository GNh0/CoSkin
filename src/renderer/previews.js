import { drawPreviewScene } from "./preview-scene.js";
import { applicationLocale } from "./locale.js";
import { throwIfAborted } from "./file-transfer.js";
import { t } from "./messages.js";

// Completed PNGs and pending work have separate bounds. A gallery page has
// at most 96 entries; disappearing containers relinquish their pending work.
export const previewLimits = Object.freeze({ cache: 48, pending: 96 });
const cache = new Map();
const jobs = new Map();
const queue = [];
let current = null;

function cancel(job) {
  if (job.finished || job.cancelled) return;
  job.cancelled = true;
  job.abort.abort();
  if (jobs.get(job.key) === job) jobs.delete(job.key);
  const at = queue.indexOf(job);
  if (at >= 0) queue.splice(at, 1);
  job.reject(job.abort.signal.reason);
}

function subscribe(job, signal) {
  if (!signal) {
    job.keepAlive = true;
    return job.promise;
  }
  if (signal.aborted) return Promise.reject(signal.reason);
  const owner = {};
  job.owners.add(owner);
  return new Promise((resolve, reject) => {
    const release = () => {
      job.owners.delete(owner);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      release();
      reject(signal.reason);
      if (!job.keepAlive && !job.owners.size) cancel(job);
    };
    signal.addEventListener("abort", abort, { once: true });
    job.promise.then(
      (url) => {
        release();
        signal.aborted ? reject(signal.reason) : resolve(url);
      },
      (error) => {
        release();
        reject(error);
      },
    );
  });
}

async function startNext() {
  if (current || !queue.length) return;
  const job = queue.shift();
  current = job;
  const signal = job.abort.signal;
  let url;
  let retained = false;
  try {
    throwIfAborted(signal);
    const doc = await job.controller.request("read", {
      id: job.id,
      revision: job.revision,
    });
    throwIfAborted(signal);
    const canvas = document.createElement("canvas");
    canvas.width = job.width;
    canvas.height = job.width * 0.625;
    const context = canvas.getContext("2d");
    context.scale(job.width / 640, job.width / 640);
    await drawPreviewScene(context, job.controller, doc, signal);
    throwIfAborted(signal);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    throwIfAborted(signal);
    if (!blob) throw Error(t("previewFailed"));
    url = URL.createObjectURL(blob);
    throwIfAborted(signal);
    job.url = url;
    cache.set(job.key, job);
    retained = true;
    while (cache.size > previewLimits.cache) {
      const oldest = cache.keys().next().value;
      URL.revokeObjectURL(cache.get(oldest).url);
      cache.delete(oldest);
    }
    job.resolve(url);
  } catch (error) {
    job.reject(error);
  } finally {
    if (url && !retained) URL.revokeObjectURL(url);
    job.finished = true;
    if (jobs.get(job.key) === job) jobs.delete(job.key);
    current = null;
    queueMicrotask(startNext);
  }
}

// Synthetic previews never read or capture the current chat DOM.
export function previewUrl(
  controller,
  id,
  revision,
  width = 640,
  { signal } = {},
) {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const key =
    id +
    ":" +
    revision +
    ":" +
    width +
    ":" +
    applicationLocale(document, navigator);
  if (cache.has(key)) {
    const job = cache.get(key);
    cache.delete(key);
    cache.set(key, job);
    return subscribe(job, signal);
  }
  if (jobs.has(key)) return subscribe(jobs.get(key), signal);
  const job = {
    key,
    controller,
    id,
    revision,
    width,
    abort: new AbortController(),
    owners: new Set(),
  };
  job.promise = new Promise((resolve, reject) => {
    job.resolve = resolve;
    job.reject = reject;
  });
  // Queue eviction also serves direct callers; do not leave an unhandled
  // rejection when such a caller abandons an evicted preview promise.
  job.promise.catch(() => {});
  jobs.set(key, job);
  queue.push(job);
  const promise = subscribe(job, signal);
  while (jobs.size > previewLimits.pending) cancel(queue[0]);
  queueMicrotask(startNext);
  return promise;
}

export function mountPreview(
  panel,
  container,
  id,
  revision,
  width = 640,
  { onVisible } = {},
) {
  const owner = new AbortController();
  const observer = new IntersectionObserver((entries) => {
    if (owner.signal.aborted || !entries.some((entry) => entry.isIntersecting))
      return;
    observer.disconnect();
    onVisible?.();
    previewUrl(panel.c, id, revision, width, { signal: owner.signal })
      .then((url) => {
        if (owner.signal.aborted || !container.isConnected) return;
        const image = document.createElement("img");
        image.src = url;
        image.alt = t("previewAlt");
        image.style.cssText =
          "width:100%;height:100%;object-fit:contain;border-radius:8px";
        container.replaceChildren(image);
      })
      .catch((error) => {
        if (
          !owner.signal.aborted &&
          error.name !== "AbortError" &&
          container.isConnected
        )
          container.textContent = error.message;
      });
  });
  observer.observe(container);
  panel.pageResources.push(() => {
    owner.abort();
    observer.disconnect();
  });
}
export function disposePreviews() {
  for (const job of [...jobs.values()]) cancel(job);
  for (const job of cache.values()) URL.revokeObjectURL(job.url);
  cache.clear();
}
