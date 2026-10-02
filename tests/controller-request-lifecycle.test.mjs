import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { build } from "esbuild";
import { workspaceBundle } from "./workspace-bundle.mjs";

const compiled = await build({
  stdin: {
    contents: 'export {Controller} from "./src/renderer/controller.js";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  plugins: [workspaceBundle()],
});
const token = "a".repeat(64);
const descriptor = () => ({
  available: true,
  token,
  url: `http://127.0.0.1:45129/media/${token}`,
  mime: "video/webm",
  length: 262 * 1024 * 1024,
});
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6bfwAAAAASUVORK5CYII=",
  "base64",
);
function runtime() {
  const sent = [],
    timers = new Map(),
    videos = [],
    bitmaps = [],
    revoked = [];
  let timerId = 0,
    binding = () => {},
    metadata = (video) => queueMicrotask(() => video.onloadedmetadata?.()),
    decoder = async (image) => image;
  class NativeURL extends URL {
    static createObjectURL() {
      throw Error("Direct video must retain its URL");
    }
    static revokeObjectURL(value) {
      revoked.push(value);
    }
  }
  const window = {
    __coskinRequest(message) {
      const request = JSON.parse(message);
      sent.push(request);
      return binding(request);
    },
  };
  const document = {
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
        pause() {},
        load() {},
        remove() {
          this.removed = true;
        },
        removeAttribute() {},
      };
      videos.push(video);
      return video;
    },
  };
  const context = vm.createContext({
    module: { exports: {} },
    window,
    document,
    navigator: { language: "en" },
    crypto: webcrypto,
    AbortController,
    DOMException,
    URL: NativeURL,
    Blob,
    Uint8Array,
    atob,
    structuredClone,
    matchMedia: () => ({ matches: false }),
    performance: { now: () => 0 },
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    clearInterval(id) {
      timers.delete(id);
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
  const { Controller } = context.module.exports;
  const controller = () => {
    const value = new Controller("1.0.0");
    value.sessionId = "verified-session";
    return value;
  };
  return {
    controller,
    sent,
    timers,
    window,
    document,
    videos,
    bitmaps,
    revoked,
    binding: (callback) => {
      binding = callback;
    },
    metadata: (callback) => {
      metadata = callback;
    },
    decode: (callback) => {
      decoder = callback;
    },
  };
}

test("actual controllers isolate equal sequence numbers with separate cryptographic request epochs", async () => {
  const api = runtime(),
    first = api.controller(),
    second = api.controller();
  let firstResolved = false,
    secondResolved = false;
  const a = first.request("list").then((value) => {
    firstResolved = true;
    return value;
  });
  const b = second.request("list").then((value) => {
    secondResolved = true;
    return value;
  });
  const [requestA, requestB] = api.sent;
  assert.match(requestA.requestId, /^[a-f0-9]{32}:1$/);
  assert.match(requestB.requestId, /^[a-f0-9]{32}:1$/);
  assert.notEqual(requestA.requestId, requestB.requestId);
  assert.equal(requestA.contractVersion, 1);
  assert.equal(requestA.sessionId, "verified-session");
  first.response(requestB.requestId, "wrong first");
  second.response(requestA.requestId, "wrong second");
  await Promise.resolve();
  assert.equal(firstResolved, false);
  assert.equal(secondResolved, false);
  first.response(requestA.requestId, "first");
  second.response(requestB.requestId, "second");
  assert.equal(await a, "first");
  assert.equal(await b, "second");
  assert.equal(first.pending.size, 0);
  assert.equal(second.pending.size, 0);
  assert.equal(api.timers.size, 0);
});

test("request metadata cannot be overridden by data and binding throws clear pending state and timers", async () => {
  const api = runtime(),
    controller = api.controller();
  api.binding(() => {
    throw Error("binding disconnected");
  });
  await assert.rejects(
    controller.request("list", {
      op: "overwrite",
      requestId: "fake",
      contractVersion: 900,
      sessionId: "fake",
    }),
    /binding disconnected/,
  );
  assert.equal(api.sent[0].op, "list");
  assert.match(api.sent[0].requestId, /^[a-f0-9]{32}:1$/);
  assert.equal(api.sent[0].contractVersion, 1);
  assert.equal(api.sent[0].sessionId, "verified-session");
  assert.equal(controller.pending.size, 0);
  assert.equal(api.timers.size, 0);
});

test("a synchronous host response clears the request timer before the binding returns", async () => {
  const api = runtime(),
    controller = api.controller();
  api.binding((request) =>
    controller.response(request.requestId, { ok: true }),
  );
  assert.equal((await controller.request("list")).ok, true);
  assert.equal(controller.pending.size, 0);
  assert.equal(api.timers.size, 0);
});

test("a request timeout clears pending ownership and ignores a late response", async () => {
  const api = runtime(),
    controller = api.controller();
  const request = controller.request("list");
  const rejected = assert.rejects(request, /시간이 초과/);
  const [timerId, timer] = [...api.timers][0];
  assert.equal(timer.delay, 30000);
  api.timers.delete(timerId);
  timer.callback();
  await rejected;
  controller.response(api.sent[0].requestId, "too late");
  assert.equal(controller.pending.size, 0);
  assert.equal(api.timers.size, 0);
});

test("dispose aborts resources, rejects live requests, and sends owner cleanup without creating another timer", async () => {
  const api = runtime(),
    controller = api.controller();
  const request = controller.request("asset-open", { hash: token });
  const rejected = assert.rejects(request, /연결이 종료/);
  controller.dispose();
  await rejected;
  assert.equal(controller.disposed, true);
  assert.equal(controller.assetAbort.signal.aborted, true);
  assert.deepEqual(
    api.sent.map((call) => call.op),
    ["asset-open", "transfer-cancel-owner"],
  );
  assert.equal(controller.pending.size, 0);
  assert.equal(api.timers.size, 0);
  controller.dispose();
  assert.equal(api.sent.length, 2);
  await assert.rejects(
    controller.request("asset-read", { hash: token }),
    /연결이 종료/,
  );
  assert.equal(api.sent.length, 2);
});

test("all three disposal cleanup operations still reach the binding without awaiting a response", async () => {
  const api = runtime(),
    controller = api.controller();
  controller.dispose();
  for (const op of [
    "transfer-cancel",
    "transfer-cancel-owner",
    "asset-media-release",
  ]) {
    const result = await controller.request(op, { token });
    assert.equal(result.ok, true);
    assert.equal(api.sent.at(-1).op, op);
    assert.equal(api.sent.at(-1).token, token);
  }
  assert.equal(controller.pending.size, 0);
  assert.equal(api.timers.size, 0);
});

test("a failed cleanup binding after disposal rejects without leaving a pending timer", async () => {
  const api = runtime(),
    controller = api.controller();
  controller.dispose();
  api.binding(() => {
    throw Error("cleanup binding disconnected");
  });
  await assert.rejects(
    controller.request("asset-media-release", { token }),
    /cleanup binding disconnected/,
  );
  assert.equal(controller.pending.size, 0);
  assert.equal(api.timers.size, 0);
});

test("a response to the disposed controller's request cannot settle a fresh controller request", async () => {
  const api = runtime(),
    first = api.controller();
  const old = first.request("asset-open", { hash: token });
  const rejected = assert.rejects(old, /연결이 종료/);
  const oldId = api.sent[0].requestId;
  first.dispose();
  await rejected;
  const second = api.controller();
  let resolved = false;
  const fresh = second.request("asset-open", { hash: token }).then((value) => {
    resolved = true;
    return value;
  });
  const newId = api.sent.at(-1).requestId;
  second.response(oldId, descriptor());
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.equal(second.pending.size, 1);
  second.response(newId, descriptor());
  assert.equal((await fresh).token, token);
  assert.equal(api.timers.size, 0);
});

test("loadMedia closes a cached poster and releases native source once when video decoding fails", async () => {
  const api = runtime(),
    controller = api.controller(),
    calls = [];
  api.metadata((video) => queueMicrotask(() => video.onerror?.()));
  controller.request = async (op, data) => {
    calls.push({ op, data });
    if (op === "asset-open") return descriptor();
    if (op === "asset-poster-read")
      return { token: "poster", length: png.length, mime: "image/png" };
    if (op === "transfer-read") return { data: png.toString("base64") };
    if (op === "transfer-cancel" || op === "asset-media-release")
      return { ok: true };
    throw Error("Unexpected source fallback: " + op);
  };
  await assert.rejects(controller.loadMedia(token), /재생할 수 없습니다/);
  assert.equal(api.bitmaps.length, 1);
  assert.equal(api.bitmaps[0].closed, 1);
  assert.equal(
    calls.filter((call) => call.op === "asset-media-release").length,
    1,
  );
  assert.equal(controller.assetCache.size, 0);
  assert.equal(controller.assetPending.size, 0);
  assert.equal(api.timers.size, 0);
});

test("CSP Blob fallback closes a cached poster if the video transfer fails before decoding", async () => {
  const api = runtime(), controller = api.controller(), calls = [];
  api.document.querySelectorAll = () => [{}];
  controller.request = async (op, data) => {
    calls.push({ op, data });
    if (op === "asset-read") return { token: "video", length: 4, mime: "video/webm" };
    if (op === "asset-poster-read") return { token: "poster", length: png.length, mime: "image/png" };
    if (op === "transfer-read") {
      if (data.token === "video") throw Error("video transfer disconnected");
      return { data: png.toString("base64") };
    }
    if (op === "transfer-cancel" || op === "transfer-cancel-owner") return { ok: true };
    throw Error("Unexpected operation: " + op);
  };
  await assert.rejects(controller.loadMedia(token), /video transfer disconnected/);
  assert.equal(api.bitmaps.length, 1);
  assert.equal(api.bitmaps[0].closed, 1);
  assert.equal(api.videos.length, 0);
  assert.equal(controller.assetPending.size, 0);
  assert.equal(controller.assetCache.size, 0);
  assert.deepEqual(calls.filter(call => call.op === "transfer-cancel").map(call => call.data.token).sort(), ["poster", "video"]);
  controller.dispose();
  assert.equal(api.bitmaps[0].closed, 1);
});

test("loadMedia cancellation during poster decode releases both source and discarded poster", async () => {
  const api = runtime(),
    controller = api.controller(),
    calls = [];
  api.decode(async (image) => {
    controller.assetAbort.abort();
    return image;
  });
  controller.request = async (op, data) => {
    calls.push({ op, data });
    if (op === "asset-open") return descriptor();
    if (op === "asset-poster-read")
      return { token: "poster", length: png.length, mime: "image/png" };
    if (op === "transfer-read") return { data: png.toString("base64") };
    if (op === "transfer-cancel" || op === "asset-media-release")
      return { ok: true };
    throw Error("Unexpected source fallback: " + op);
  };
  await assert.rejects(controller.loadMedia(token), { name: "AbortError" });
  assert.equal(api.bitmaps[0].closed, 1);
  assert.equal(api.videos.length, 0);
  assert.equal(
    calls.filter((call) => call.op === "asset-media-release").length,
    1,
  );
  assert.equal(controller.assetPending.size, 0);
  assert.equal(api.timers.size, 0);
});

test("loadMedia cancellation before a late native descriptor releases it without a poster read or fallback", async () => {
  const api = runtime(),
    controller = api.controller(),
    calls = [];
  let finishOpen;
  const late = new Promise((resolve) => {
    finishOpen = resolve;
  });
  controller.request = async (op, data) => {
    calls.push({ op, data });
    if (op === "asset-open") return late;
    assert.equal(op, "asset-media-release");
    return { ok: true };
  };
  const load = controller.loadMedia(token);
  const rejected = assert.rejects(load, { name: "AbortError" });
  controller.assetAbort.abort();
  finishOpen(descriptor());
  await rejected;
  assert.deepEqual(
    calls.map((call) => call.op),
    ["asset-open", "asset-media-release"],
  );
  assert.equal(api.bitmaps.length, 0);
  assert.equal(api.videos.length, 0);
  assert.equal(controller.assetPending.size, 0);
  assert.equal(api.timers.size, 0);
});

test("loadMedia retains the native lease in its cache and controller disposal closes poster and lease once", async () => {
  const api = runtime(),
    controller = api.controller(),
    calls = [];
  controller.request = async (op, data) => {
    calls.push({ op, data });
    if (op === "asset-open") return descriptor();
    if (op === "asset-poster-read")
      return { token: "poster", length: png.length, mime: "image/png" };
    if (op === "transfer-read") return { data: png.toString("base64") };
    if (
      [
        "transfer-cancel",
        "asset-media-release",
        "transfer-cancel-owner",
      ].includes(op)
    )
      return { ok: true };
    throw Error("Unexpected source or poster rewrite: " + op);
  };
  const media = await controller.loadMedia(token);
  assert.equal(media.videoUrl, descriptor().url);
  assert.equal(media.sourceBytes, descriptor().length);
  assert.equal(media.encodedBytes, 0);
  assert.equal(controller.assetCache.get(token), media);
  assert.equal(
    calls.filter((call) => call.op === "asset-media-release").length,
    0,
  );
  assert.equal(await controller.loadMedia(token), media);
  assert.equal(calls.filter((call) => call.op === "asset-open").length, 1);
  controller.dispose();
  controller.dispose();
  await Promise.resolve();
  assert.equal(api.bitmaps[0].closed, 1);
  assert.equal(
    calls.filter((call) => call.op === "asset-media-release").length,
    1,
  );
  assert.equal(
    calls.filter((call) => call.op === "transfer-cancel-owner").length,
    1,
  );
  assert.equal(controller.assetCache.size, 0);
  assert.equal(controller.assetPending.size, 0);
  assert.equal(api.revoked.length, 0);
  assert.equal(api.timers.size, 0);
});
