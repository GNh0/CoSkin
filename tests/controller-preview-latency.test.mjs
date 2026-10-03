import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import { build } from "esbuild";
import { workspaceBundle } from "./workspace-bundle.mjs";

const compiled = await build({
  stdin: { contents: 'export {Controller} from "./src/renderer/controller.js";', resolveDir: process.cwd() },
  bundle: true, write: false, platform: "node", format: "esm",
  plugins: [{
    name: "isolated-preview-decoder",
    setup(builder) {
      builder.onResolve({ filter: /\/media\.js$/ }, () => ({ path: "media", namespace: "latency-mock" }));
      builder.onResolve({ filter: /\/media-source\.js$/ }, () => ({ path: "source", namespace: "latency-mock" }));
      builder.onLoad({ filter: /.*/, namespace: "latency-mock" }, ({ path }) => ({
        contents: path === "media" ? `
          export class MediaPlayer {}
          export const decodeMedia = (bytes, mime, poster) => globalThis.previewFixture.decode(bytes, mime, poster);
          export const disposeMedia = (media) => { for (const frame of media.frames) frame.image.close(); };
        ` : `
          export const openAssetSource = async () => null;
          export const releaseAssetSource = async () => {};
          export const decodeAssetSource = () => { throw Error("Unexpected native URL"); };
        `, loader: "js",
      }));
    },
  }, workspaceBundle()],
});
const { Controller } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const hash = "a".repeat(64);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6bfwAAAAASUVORK5CYII=", "base64");
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
let originalDocument, originalBitmap, bitmaps, fixture;
function bitmap(width = 1, height = 1) {
  const image = { width, height, closed: 0, close() { this.closed++; } };
  bitmaps.push(image);
  return image;
}
beforeEach(() => {
  originalDocument = globalThis.document;
  originalBitmap = globalThis.createImageBitmap;
  bitmaps = [];
  fixture = globalThis.previewFixture = {
    cacheEntered: deferred(), cacheFinished: deferred(), canvasDraws: [],
    async decode(bytes, mime, poster) {
      return { mime, width: 1, height: 1, videoUrl: "blob:fixture", encodedBytes: bytes.size,
        frames: [{ image: poster || bitmap(), delay: 0 }] };
    },
  };
  globalThis.createImageBitmap = async () => bitmap();
  globalThis.document = {
    documentElement: { lang: "en" },
    createElement(name) {
      assert.equal(name, "canvas");
      return { width: 0, height: 0,
        getContext() { return { drawImage(image) { fixture.canvasDraws.push(image); } }; },
        toBlob(callback) { fixture.encode = callback; fixture.cacheEntered.resolve(); },
      };
    },
  };
});
afterEach(() => {
  globalThis.document = originalDocument;
  globalThis.createImageBitmap = originalBitmap;
  delete globalThis.previewFixture;
});

function runtime({ poster = true, blockVideo = false } = {}) {
  const videoStarted = deferred(), continueVideo = deferred();
  const calls = [];
  const controller = Object.create(Controller.prototype);
  const target = { target: "app.background" };
  const decoration = { target, serialized: "sha256:" + hash, players: new Map() };
  Object.assign(controller, {
    preview: {}, pending: new Map(), assetCache: new Map(), assetPending: new Map(), decorations: new Map([["app", decoration]]),
    panel: { notify(message) { throw Error(message); } },
    render() {
      const media = this.asset("sha256:" + hash);
      if (media) decoration.players.set("background", { media });
      decoration.serialized = "sha256:" + hash;
    },
    async request(operation, data) {
      calls.push({ operation, ...data });
      if (operation === "asset-poster-read") return poster ? { token: "poster", length: png.length, mime: "image/png" } : { available: false };
      if (operation === "asset-read") {
        videoStarted.resolve();
        if (blockVideo) await continueVideo.promise;
        return { token: "video", length: 8, chunkBytes: 24 * 1024, mime: "video/webm" };
      }
      if (operation === "transfer-read") return { data: (data.token === "poster" ? png : Buffer.alloc(8)).toString("base64") };
      if (operation === "transfer-begin") return { token: "write-poster", chunkBytes: 24 * 1024 };
      if (operation === "transfer-append" || operation === "asset-poster-write") return { ok: true };
      if (operation === "transfer-cancel") {
        if (data.token === "write-poster") fixture.cacheFinished.resolve();
        return { ok: true };
      }
      throw Error("Unexpected operation: " + operation);
    },
  });
  return { controller, decoration, calls, videoStarted, continueVideo };
}

test("preview displays the small cached poster while the full video transfer is still blocked", { timeout: 2000 }, async () => {
  const { controller, decoration, calls, videoStarted, continueVideo } = runtime({ blockVideo: true });
  assert.equal(controller.asset("sha256:" + hash), "");
  const loading = controller.assetPending.get(hash);
  await videoStarted.promise;
  const poster = controller.asset("sha256:" + hash);
  assert.equal(poster.mime, "image/png");
  assert.equal(decoration.players.get("background").media, poster);
  assert.equal(controller.assetCache.has(hash), false);
  assert.equal(calls.findIndex((call) => call.operation === "asset-read") > calls.findIndex((call) => call.operation === "asset-poster-read"), true);
  assert.equal(poster.frames[0].image.closed, 0);
  continueVideo.resolve();
  const media = await loading;
  await nextTurn();
  assert.equal(decoration.players.get("background").media, media);
  assert.equal(media.mime, "video/webm");
  assert.equal(controller.assetCache.has("poster:" + hash), false);
  assert.equal(poster.frames[0].image.closed, 1);
  assert.equal(media.frames[0].image.closed, 0);
  const diagnostics = controller.previewDiagnostics();
  assert.equal(diagnostics.recentLoads.length, 1);
  assert.equal(diagnostics.recentLoads[0].cachedPoster, true);
  assert.equal(diagnostics.recentLoads[0].state, "ready");
  assert.ok(diagnostics.recentLoads[0].firstImageMs <= diagnostics.recentLoads[0].totalMs);
  assert.equal(JSON.stringify(diagnostics).includes(hash), false);
});

test("newly decoded preview resolves before a stalled derived PNG cache write", { timeout: 2000 }, async () => {
  const { controller, calls } = runtime({ poster: false });
  let resolved = false;
  const loading = controller.loadMedia(hash).then((media) => { resolved = true; return media; });
  await fixture.cacheEntered.promise;
  await nextTurn();
  assert.equal(resolved, true, "Derived cache encoding must not block media display");
  const media = await loading;
  assert.equal(controller.assetCache.get(hash), media);
  assert.equal(fixture.canvasDraws[0], media.frames[0].image, "Capture owned pixels before later disposal");
  assert.equal(calls.some((call) => call.operation === "transfer-begin"), false);
  fixture.encode(new Blob([png], { type: "image/png" }));
  await fixture.cacheFinished.promise;
  assert.equal(media.frames[0].image.closed, 0);
});
