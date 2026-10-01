import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";
import { workspaceBundle } from "./workspace-bundle.mjs";

const compiled = await build({
  stdin: {
    contents:
      'export {drawPreviewScene} from "./src/renderer/preview-scene.js"; export {downloadBytes} from "./src/renderer/file-transfer.js"; export {defaultThemes} from "./src/core/default-themes.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  plugins: [workspaceBundle()],
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
    videos = [],
    bitmaps = [],
    urls = [],
    revoked = [];
  let decode = async (image) => image;
  const drawContext = new Proxy(
    {},
    {
      get: (target, key) => target[key] || (() => {}),
    },
  );
  const context = vm.createContext({
    module: { exports: {} },
    document: {
      documentElement: { lang: "en" },
      body: { append() {} },
      createElement(tag) {
        assert.equal(tag, "video");
        const video = {
          style: {},
          dataset: {},
          duration: 93.5,
          videoWidth: 1920,
          videoHeight: 1080,
          set src(value) {
            this.url = value;
            queueMicrotask(() => this.onloadedmetadata?.());
          },
          set currentTime(value) {
            this.time = value;
            queueMicrotask(() => this.onseeked?.());
          },
          play: () => Promise.resolve(),
          pause() {
            this.paused = true;
          },
          load() {},
          remove() {
            this.removed = true;
          },
          removeAttribute(key) {
            if (key === "src") this.url = "";
          },
        };
        videos.push(video);
        return video;
      },
    },
    navigator: { language: "en" },
    URL: {
      createObjectURL() {
        const url = "blob:synthetic-video-" + urls.length;
        urls.push(url);
        return url;
      },
      revokeObjectURL(url) {
        revoked.push(url);
      },
    },
    createImageBitmap: async () => {
      const image = {
        width: 1920,
        height: 1080,
        closed: 0,
        close() {
          this.closed++;
        },
      };
      bitmaps.push(image);
      return decode(image);
    },
    Blob,
    Uint8Array,
    setTimeout,
    clearTimeout,
    atob,
    structuredClone,
  });
  vm.runInContext(compiled.outputFiles[0].text, context);
  const api = context.module.exports;
  const doc = structuredClone(api.defaultThemes[0]);
  const path = "assets/test.mp4",
    hash = "a".repeat(64);
  doc.assets = { [path]: hash };
  const rules = doc.theme.profiles[0].rules;
  for (const target of ["app.background", "sidebar.surface"])
    rules.find(
      (rule) => rule.target === target,
    ).states.base.style.background.image = path;
  let request = async (op) => {
    if (op === "asset-read")
      return { token: "synthetic", length: 3, mime: "video/mp4" };
    if (op === "transfer-read") return { data: "AQID" };
    assert.equal(op, "transfer-cancel");
  };
  const controller = {
    async request(op, data) {
      requests.push({ op, data });
      return request(op, data);
    },
  };
  return {
    ...api,
    doc,
    controller,
    drawContext,
    requests,
    videos,
    bitmaps,
    urls,
    revoked,
    decode: (callback) => {
      decode = callback;
    },
    request: (callback) => {
      request = callback;
    },
    ops: (op) => requests.filter((call) => call.op === op),
  };
}

test("an already cancelled scene never opens an asset transfer", async () => {
  const api = runtime(),
    owner = new AbortController();
  owner.abort();
  await assert.rejects(
    api.drawPreviewScene(
      api.drawContext,
      api.controller,
      api.doc,
      owner.signal,
    ),
    { name: "AbortError" },
  );
  assert.equal(api.requests.length, 0);
  assert.equal(api.bitmaps.length, 0);
});

test("cancellation while asset-read is pending releases its lease without requesting chunks", async () => {
  const api = runtime(),
    owner = new AbortController();
  api.request(async (op) => {
    if (op === "asset-read") {
      owner.abort();
      return { token: "synthetic", length: 3, mime: "video/mp4" };
    }
    assert.equal(op, "transfer-cancel");
  });
  await assert.rejects(
    api.drawPreviewScene(
      api.drawContext,
      api.controller,
      api.doc,
      owner.signal,
    ),
    { name: "AbortError" },
  );
  assert.equal(api.ops("transfer-read").length, 0);
  assert.equal(api.ops("transfer-cancel").length, 1);
  assert.equal(api.bitmaps.length, 0);
  assert.equal(api.urls.length, 0);
});

test("cancellation after a chunk response prevents remaining reads and always cancels the transfer", async () => {
  const api = runtime(),
    owner = new AbortController();
  api.request(async (op) => {
    if (op === "transfer-read") {
      owner.abort();
      return { data: Buffer.alloc(24 * 1024).toString("base64") };
    }
    assert.equal(op, "transfer-cancel");
  });
  await assert.rejects(
    api.downloadBytes(
      api.controller,
      { token: "synthetic", length: 72 * 1024 },
      owner.signal,
    ),
    { name: "AbortError" },
  );
  assert.equal(api.ops("transfer-read").length, 1);
  assert.equal(api.ops("transfer-cancel").length, 1);
});

test("a cancelled video decode closes its late poster, revokes its URL and removes the video element", async () => {
  const api = runtime(),
    owner = new AbortController();
  const started = deferred(),
    poster = deferred();
  api.decode(async (image) => {
    started.resolve();
    await poster.promise;
    return image;
  });
  const result = api.drawPreviewScene(
    api.drawContext,
    api.controller,
    api.doc,
    owner.signal,
  );
  await started.promise;
  owner.abort();
  poster.resolve();
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(api.bitmaps.length, 1);
  assert.equal(api.bitmaps[0].closed, 1);
  assert.deepEqual(api.revoked, api.urls);
  assert.equal(api.urls.length, 1);
  assert.equal(api.videos[0].removed, true);
  assert.equal(api.videos[0].paused, true);
  assert.equal(api.videos[0].url, "");
  assert.equal(api.ops("transfer-cancel").length, 1);
});

test("a cancelled static decode closes its late bitmap exactly once", async () => {
  const api = runtime(),
    owner = new AbortController();
  api.request(async (op) => {
    if (op === "asset-read")
      return { token: "synthetic", length: 3, mime: "image/png" };
    if (op === "transfer-read") return { data: "AQID" };
    assert.equal(op, "transfer-cancel");
  });
  api.decode(async (image) => {
    owner.abort();
    return image;
  });
  await assert.rejects(
    api.drawPreviewScene(
      api.drawContext,
      api.controller,
      api.doc,
      owner.signal,
    ),
    { name: "AbortError" },
  );
  assert.equal(api.bitmaps.length, 1);
  assert.equal(api.bitmaps[0].closed, 1);
  assert.equal(api.urls.length, 0);
  assert.equal(api.ops("transfer-cancel").length, 1);
});

test("successful scene drawing shares one video within its targets and releases all decoded media afterwards", async () => {
  const api = runtime();
  await api.drawPreviewScene(api.drawContext, api.controller, api.doc);
  assert.equal(api.ops("asset-read").length, 1);
  assert.equal(api.ops("transfer-read").length, 1);
  assert.equal(api.ops("transfer-cancel").length, 1);
  assert.equal(api.bitmaps.length, 1);
  assert.equal(api.bitmaps[0].closed, 1);
  assert.deepEqual(api.revoked, api.urls);
  assert.equal(api.videos[0].removed, true);
});

test("existing download callers without a signal receive complete bytes and release their lease", async () => {
  const api = runtime();
  const bytes = await api.downloadBytes(api.controller, {
    token: "synthetic",
    length: 3,
  });
  assert.deepEqual([...bytes], [1, 2, 3]);
  assert.equal(api.ops("transfer-read").length, 1);
  assert.equal(api.ops("transfer-cancel").length, 1);
});
