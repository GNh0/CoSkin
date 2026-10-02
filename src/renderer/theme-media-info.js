import { h } from "./components.js";
import { appearanceText } from "./appearance-messages.js";
import { ResourceQueue } from "./resource-queue.js";

export function formatMediaDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const value = Math.max(1, Math.round(seconds));
  const pad = (v) => String(v).padStart(2, "0");
  return value >= 3600
    ? `${Math.floor(value / 3600)}:${pad(Math.floor(value / 60) % 60)}:${pad(value % 60)}`
    : `${Math.floor(value / 60)}:${pad(value % 60)}`;
}
export function backgroundMediaLabel(info) {
  const kind = ["image", "animated", "video", "none"].includes(info?.kind)
    ? info.kind
    : "unknown";
  return (
    appearanceText(kind) +
    (kind === "video"
      ? " · " +
        (formatMediaDuration(info.durationSeconds) ??
          appearanceText("durationUnknown"))
      : "")
  );
}

// Only visible badges read container headers. This queue never downloads or decodes a video.
export class BackgroundInfoCache {
  constructor(controller) {
    this.controller = controller;
    this.cache = new Map();
    this.pending = new Map();
    this.queue = new ResourceQueue(2);
  }
  read(id, revision, profile, signal) {
    if (signal.aborted) return Promise.reject(signal.reason);
    const key = JSON.stringify([id, revision, profile]);
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
    let job = this.pending.get(key);
    if (!job) {
      job = { owners: new Set() };
      this.pending.set(key, job);
      // Start after the first owner has subscribed, including cache hits on the same page.
      job.promise = Promise.resolve()
        .then(() =>
          this.queue.run(async () => {
            if (![...job.owners].some((owner) => !owner.aborted))
              throw new DOMException("Badge removed", "AbortError");
            const result = await this.controller.request(
              "background-media-info",
              { id, revision, ...(profile ? { profile } : {}) },
            );
            this.cache.set(key, result);
            while (this.cache.size > 256)
              this.cache.delete(this.cache.keys().next().value);
            return result;
          }),
        )
        .finally(() => {
          if (this.pending.get(key) === job) this.pending.delete(key);
        });
      job.promise.catch(() => {});
    }
    job.owners.add(signal);
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        job.owners.delete(signal);
        signal.removeEventListener("abort", abort);
      };
      const abort = () => {
        cleanup();
        reject(signal.reason);
      };
      signal.addEventListener("abort", abort, { once: true });
      job.promise.then(
        (value) => {
          cleanup();
          signal.aborted ? reject(signal.reason) : resolve(value);
        },
        (error) => {
          cleanup();
          reject(error);
        },
      );
    });
  }
  dispose() {
    this.queue.dispose();
    this.cache.clear();
  }
}
export function mediaBadge(panel, id, revision, profile) {
  const badge = h("span", {
    class: "background-media-badge",
    hidden: "",
    "aria-live": "polite",
  });
  const owner = new AbortController();
  let requested = false;
  const load = () => {
    if (owner.signal.aborted || requested) return;
    requested = true;
    panel.c.backgroundInfo ??= new BackgroundInfoCache(panel.c);
    panel.c.backgroundInfo
      .read(id, revision, profile, owner.signal)
      .then((info) => {
        if (!owner.signal.aborted && badge.isConnected) {
          badge.textContent = backgroundMediaLabel(info);
          badge.hidden = false;
        }
      })
      .catch(() => {
        if (!owner.signal.aborted && badge.isConnected) {
          badge.textContent = appearanceText("unknown");
          badge.hidden = false;
        }
      });
  };
  // The preview owns visibility observation; a badge never adds another observer.
  panel.pageResources.push(() => owner.abort());
  return { element: badge, load };
}
