import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";
import { workspaceBundle } from "./workspace-bundle.mjs";

const compiled = await build({
  stdin: {
    contents:
      'export * from "./src/renderer/media-source.js"; export {disposeMedia} from "./src/renderer/media.js"; export {MEDIA_LIMITS} from "./src/core/media-limits.js";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  plugins: [workspaceBundle()],
});
const token = "a".repeat(64);
const source = (changes = {}) => ({
  available: true,
  token,
  url: `http://127.0.0.1:45129/media/${token}`,
  mime: "video/webm",
  length: 262 * 1024 * 1024,
  ...changes,
});
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function runtime() {
  const requests = [],
    fetches = [],
    videos = [],
    bitmaps = [],
    revoked = [],
    allocations = [];
  let request = async (op) => {
    if (op === "asset-open") return source();
    assert.equal(op, "asset-media-release");
    return { ok: true };
  };
  let fetcher = async () => {
    throw Error("A direct video must not be fetched into a Blob");
  };
  let metadata = (video) => queueMicrotask(() => video.onloadedmetadata?.());
  let decoder = async (image) => image;
  class NativeURL extends URL {
    static createObjectURL() {
      throw Error("A direct source must not become an object URL");
    }
    static revokeObjectURL(value) {
      revoked.push(value);
    }
  }
  class TrackedBlob extends Blob {
    constructor(parts, configuration) {
      super(parts, configuration);
      allocations.push({ type: "blob", bytes: this.size });
    }
  }
  class TrackedArray extends Uint8Array {
    constructor(value, ...rest) {
      if (typeof value === "number" && value > 4 * 1024 * 1024)
        throw Error("Whole video allocation is forbidden");
      super(value, ...rest);
      allocations.push({ type: "array", bytes: this.byteLength });
    }
  }
  const context = vm.createContext({
    module: { exports: {} },
    URL: NativeURL,
    Blob: TrackedBlob,
    Uint8Array: TrackedArray,
    AbortController,
    DOMException,
    setTimeout,
    clearTimeout,
    atob,
    fetch: (...arguments_) => {
      fetches.push(arguments_);
      return fetcher(...arguments_);
    },
    document: {
      documentElement: { lang: "en" },
      body: { append() {} },
      createElement(tag) {
        assert.equal(tag, "video");
        const video = {
          style: {},
          dataset: {},
          videoWidth: 1280,
          videoHeight: 720,
          duration: 223.57,
          set src(value) {
            this.loadedURL = value;
            metadata(this);
          },
          set currentTime(value) {
            this.seek = value;
            queueMicrotask(() => this.onseeked?.());
          },
          play: () => Promise.resolve(),
          pause() {
            this.paused = true;
          },
          load() {
            this.reset = true;
          },
          remove() {
            this.removed = true;
          },
          removeAttribute(value) {
            assert.equal(value, "src");
            this.srcRemoved = true;
          },
        };
        videos.push(video);
        return video;
      },
    },
    createImageBitmap: async (input) => {
      const image = {
        width: input.videoWidth || 1,
        height: input.videoHeight || 1,
        closed: 0,
        close() {
          this.closed++;
        },
      };
      bitmaps.push(image);
      return decoder(image);
    },
  });
  vm.runInContext(compiled.outputFiles[0].text, context);
  const controller = {
    async request(op, data) {
      requests.push({ op, data });
      return request(op, data);
    },
  };
  return {
    ...context.module.exports,
    controller,
    requests,
    fetches,
    videos,
    bitmaps,
    revoked,
    allocations,
    document: context.document,
    request: (callback) => {
      request = callback;
    },
    fetch: (callback) => {
      fetcher = callback;
    },
    metadata: (callback) => {
      metadata = callback;
    },
    decode: (callback) => {
      decoder = callback;
    },
  };
}

test("a validated loopback capability opens without a source-byte transfer", async () => {
  const api = runtime();
  const opened = await api.openAssetSource(api.controller, token);
  assert.equal(opened.url, source().url);
  assert.equal(opened.length, source().length);
  assert.deepEqual(
    api.requests.map((call) => call.op),
    ["asset-open"],
  );
  assert.equal(api.fetches.length, 0);
  assert.equal(api.allocations.length, 0);
});

test("a renderer with a CSP meta policy performs no native host request and preserves the policy", async () => {
  const api = runtime();
  const policy = Object.freeze({
    httpEquiv: "Content-Security-Policy",
    content: "default-src 'self'; media-src 'self' blob:",
  });
  api.document.querySelectorAll = (selector) => {
    assert.equal(selector, 'meta[http-equiv="Content-Security-Policy" i]');
    return [policy];
  };
  assert.equal(api.canUseNativeAssetURLs(), false);
  assert.equal(await api.openAssetSource(api.controller, token), null);
  assert.equal(api.requests.length, 0);
  assert.equal(api.fetches.length, 0);
  assert.equal(api.videos.length, 0);
  assert.equal(api.allocations.length, 0);
  assert.equal(policy.content, "default-src 'self'; media-src 'self' blob:");
});

test("an unavailable or older host falls back without inventing a media capability", async () => {
  const api = runtime();
  api.request(async () => ({ available: false }));
  assert.equal(await api.openAssetSource(api.controller, token), null);
  api.request(async () => {
    throw Error("unsupported operation");
  });
  assert.equal(await api.openAssetSource(api.controller, token), null);
  assert.equal(api.requests.length, 2);
  assert.equal(api.allocations.length, 0);
});

const invalidSources = [
  ["foreign host", { url: `http://example.com:45129/media/${token}` }],
  ["lookalike host", { url: `http://127.0.0.1.evil:45129/media/${token}` }],
  ["HTTPS", { url: `https://127.0.0.1:45129/media/${token}` }],
  ["credentials", { url: `http://name:secret@127.0.0.1:45129/media/${token}` }],
  ["missing explicit port", { url: `http://127.0.0.1/media/${token}` }],
  [
    "different capability path",
    { url: `http://127.0.0.1:45129/media/${"b".repeat(64)}` },
  ],
  ["query string", { url: source().url + "?token=other" }],
  ["fragment", { url: source().url + "#other" }],
  ["non-capability token", { token: "wrong" }],
  ["foreign MIME", { mime: "application/javascript" }],
  ["zero length", { length: 0 }],
  ["fractional length", { length: 1.5 }],
  ["oversized video", { length: 512 * 1024 * 1024 + 1 }],
  ["oversized image", { mime: "image/png", length: 25 * 1024 * 1024 + 1 }],
];
for (const [name, changes] of invalidSources) {
  test(`an invalid ${name} is rejected and its advertised lease released`, async () => {
    const api = runtime();
    const descriptor = source(changes);
    api.request(async (op) =>
      op === "asset-open" ? descriptor : { ok: true },
    );
    await assert.rejects(api.openAssetSource(api.controller, token));
    assert.deepEqual(
      api.requests.map((call) => call.op),
      ["asset-open", "asset-media-release"],
    );
    assert.equal(api.requests[1].data.token, descriptor.token);
    assert.equal(api.fetches.length, 0);
    assert.equal(api.videos.length, 0);
  });
}

test("cancellation before open sends no host request", async () => {
  const api = runtime();
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    api.openAssetSource(api.controller, token, abort.signal),
    { name: "AbortError" },
  );
  assert.equal(api.requests.length, 0);
});

test("a descriptor arriving after cancellation is released without decode or fallback", async () => {
  const api = runtime(),
    pending = deferred(),
    abort = new AbortController();
  api.request(async (op) =>
    op === "asset-open" ? pending.promise : { ok: true },
  );
  const opened = api.openAssetSource(api.controller, token, abort.signal);
  const rejected = assert.rejects(opened, { name: "AbortError" });
  abort.abort();
  pending.resolve(source());
  await rejected;
  assert.deepEqual(
    api.requests.map((call) => call.op),
    ["asset-open", "asset-media-release"],
  );
  assert.equal(api.fetches.length, 0);
  assert.equal(api.videos.length, 0);
});

test("image fetch is native, has no credentials/cache, and receives the caller's AbortSignal", async () => {
  const api = runtime(),
    abort = new AbortController(),
    descriptor = source({ mime: "image/png", length: 3 });
  api.fetch(async (_url, options) => {
    assert.equal(options.signal, abort.signal);
    assert.equal(options.credentials, "omit");
    assert.equal(options.cache, "no-store");
    return {
      ok: true,
      headers: new Headers({ "content-type": "image/png; charset=binary" }),
      blob: async () => new Blob(["PNG"], { type: "image/png" }),
    };
  });
  const blob = await api.fetchAssetSource(descriptor, abort.signal);
  assert.equal(blob.size, 3);
  assert.equal(api.fetches.length, 1);
  assert.equal(api.requests.length, 0);
});

test("native image fetch abort propagates and decode releases the capability once", async () => {
  const api = runtime(),
    abort = new AbortController(),
    descriptor = source({ mime: "image/png", length: 3 });
  api.fetch(
    (_url, options) =>
      new Promise((_resolve, reject) =>
        options.signal.addEventListener(
          "abort",
          () => reject(options.signal.reason),
          { once: true },
        ),
      ),
  );
  const decoding = api.decodeAssetSource(
    api.controller,
    descriptor,
    abort.signal,
  );
  const rejected = assert.rejects(decoding, { name: "AbortError" });
  abort.abort();
  await rejected;
  assert.deepEqual(
    api.requests.map((call) => call.op),
    ["asset-media-release"],
  );
  assert.equal(api.bitmaps.length, 0);
  assert.equal(api.videos.length, 0);
});

test("image content-type or actual-length mismatch is rejected before bitmap allocation", async () => {
  for (const response of [
    {
      ok: false,
      headers: new Headers({ "content-type": "image/png" }),
      blob: async () => new Blob(["PNG"]),
    },
    {
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      blob: async () => new Blob(["PNG"]),
    },
    {
      ok: true,
      headers: new Headers({ "content-type": "image/png" }),
      blob: async () => new Blob(["bad size"]),
    },
  ]) {
    const api = runtime();
    api.fetch(async () => response);
    await assert.rejects(
      api.decodeAssetSource(
        api.controller,
        source({ mime: "image/png", length: 3 }),
      ),
    );
    assert.equal(api.bitmaps.length, 0);
    assert.deepEqual(
      api.requests.map((call) => call.op),
      ["asset-media-release"],
    );
  }
});

test("a decoded native image releases its source immediately while its frame retains normal ownership", async () => {
  const api = runtime(),
    descriptor = source({ mime: "image/png", length: 3 });
  api.fetch(async () => ({
    ok: true,
    headers: new Headers({ "content-type": "image/png" }),
    blob: async () => new Blob(["PNG"], { type: "image/png" }),
  }));
  const media = await api.decodeAssetSource(api.controller, descriptor);
  assert.equal(media.mime, "image/png");
  assert.equal(api.bitmaps[0].closed, 0);
  assert.deepEqual(
    api.requests.map((call) => call.op),
    ["asset-media-release"],
  );
  api.disposeMedia(media);
  api.disposeMedia(media);
  await Promise.resolve();
  assert.equal(api.bitmaps[0].closed, 1);
  assert.equal(api.requests.length, 1);
});

test("a large direct video keeps native URL playback and releases its source only once on disposal", async () => {
  const api = runtime(),
    descriptor = source();
  const media = await api.decodeAssetSource(api.controller, descriptor);
  assert.equal(media.videoUrl, descriptor.url);
  assert.equal(media.sourceBytes, descriptor.length);
  assert.equal(media.encodedBytes, 0);
  assert.equal(media.frames.length, 1);
  assert.equal(api.videos[0].loadedURL, descriptor.url);
  assert.equal(api.videos[0].crossOrigin, "anonymous");
  assert.ok(
    api.videos[0].paused &&
      api.videos[0].removed &&
      api.videos[0].srcRemoved &&
      api.videos[0].reset,
  );
  assert.equal(api.fetches.length, 0);
  assert.equal(api.allocations.length, 0);
  assert.equal(api.requests.length, 0);
  api.disposeMedia(media);
  api.disposeMedia(media);
  await Promise.resolve();
  assert.equal(api.bitmaps[0].closed, 1);
  assert.deepEqual(
    api.requests.map((call) => call.op),
    ["asset-media-release"],
  );
  assert.equal(api.revoked.length, 0);
});

test("a provided poster transfers ownership to direct video without an extra seek or bitmap decode", async () => {
  const api = runtime();
  const poster = {
    width: 1024,
    height: 576,
    closed: 0,
    close() {
      this.closed++;
    },
  };
  const media = await api.decodeAssetSource(
    api.controller,
    source(),
    undefined,
    poster,
  );
  assert.equal(media.frames[0].image, poster);
  assert.equal(api.bitmaps.length, 0);
  assert.equal(api.videos[0].seek, undefined);
  assert.equal(poster.closed, 0);
  api.disposeMedia(media);
  api.disposeMedia(media);
  await Promise.resolve();
  assert.equal(poster.closed, 1);
  assert.deepEqual(
    api.requests.map((call) => call.op),
    ["asset-media-release"],
  );
});

test("a native video decoder failure closes the handed-off poster and releases the source", async () => {
  const api = runtime();
  const poster = {
    closed: 0,
    close() {
      this.closed++;
    },
  };
  api.metadata((video) => queueMicrotask(() => video.onerror?.()));
  await assert.rejects(
    api.decodeAssetSource(api.controller, source(), undefined, poster),
    /재생할 수 없습니다/,
  );
  assert.equal(poster.closed, 1);
  assert.ok(api.videos[0].removed);
  assert.deepEqual(
    api.requests.map((call) => call.op),
    ["asset-media-release"],
  );
  assert.equal(api.revoked.length, 0);
  assert.equal(api.allocations.length, 0);
});

test("cancellation at a completed direct-video decode closes its frame and releases its capability", async () => {
  const api = runtime(),
    abort = new AbortController();
  api.decode(async (image) => {
    abort.abort();
    return image;
  });
  await assert.rejects(
    api.decodeAssetSource(api.controller, source(), abort.signal),
    { name: "AbortError" },
  );
  assert.equal(api.bitmaps[0].closed, 1);
  assert.deepEqual(
    api.requests.map((call) => call.op),
    ["asset-media-release"],
  );
  assert.equal(api.allocations.length, 0);
  assert.equal(
    api.revoked.length,
    0,
    "a loopback capability is never treated as an owned blob URL",
  );
});
