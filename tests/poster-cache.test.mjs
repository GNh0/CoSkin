import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readPoster, storePoster, POSTER_LIMITS } from "../src/renderer/poster-cache.js";

const hash = "a".repeat(64);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6bfwAAAAASUVORK5CYII=", "base64");
let originalDocument, originalBitmap, canvases, decoded;
beforeEach(() => {
  originalDocument = globalThis.document;
  originalBitmap = globalThis.createImageBitmap;
  canvases = []; decoded = [];
  globalThis.document = { documentElement: { lang: "en" }, createElement(name) {
    assert.equal(name, "canvas");
    const canvas = { width: 0, height: 0, draw: [], getContext() { return { drawImage: (...args) => canvas.draw.push(args) }; },
      toBlob(callback, mime) { assert.equal(mime, "image/png"); callback(new Blob([png], { type: mime })); } };
    canvases.push(canvas); return canvas;
  } };
  globalThis.createImageBitmap = async (blob) => {
    assert.equal(blob.type, "image/png");
    const image = { width: 1, height: 1, closed: 0, close() { this.closed++; } };
    decoded.push(image); return image;
  };
});
afterEach(() => { globalThis.document = originalDocument; globalThis.createImageBitmap = originalBitmap; });

function readHost(descriptor = {}) {
  const calls = [];
  return { calls, async request(op, data) {
    calls.push({ op, ...data });
    if (op === "asset-poster-read") return { token: "poster", length: png.length, mime: "image/png", ...descriptor };
    if (op === "transfer-read") return { data: png.toString("base64") };
    if (op === "transfer-cancel") return { ok: true };
    throw Error("Must not fetch original media for a cached preview");
  } };
}
function writeHost() {
  const calls = []; const parts = [];
  return { calls, parts, async request(op, data) {
    calls.push({ op, ...data });
    if (op === "transfer-begin") return { token: "poster-upload", chunkBytes: 24 * 1024 };
    if (op === "transfer-append") { parts.push(Buffer.from(data.data, "base64")); return { ok: true }; }
    if (op === "asset-poster-write") return { stored: true, hash: data.hash };
    if (op === "transfer-cancel") return { ok: true };
    throw Error("Must not alter source assets");
  } };
}

test("cached PNG downloads only the small poster and releases its transfer", async () => {
  const host = readHost(); const bitmap = await readPoster(host, hash.toUpperCase());
  assert.equal(bitmap, decoded[0]); assert.equal(bitmap.closed, 0);
  assert.deepEqual(host.calls.map(c => c.op), ["asset-poster-read", "transfer-read", "transfer-cancel"]);
  assert.equal(host.calls[0].hash, hash); bitmap.close();
});
test("cache miss and older unsupported host return null without touching original media", async () => {
  const host = readHost({ available: false });
  assert.equal(await readPoster(host, hash), null);
  assert.deepEqual(host.calls.map(c => c.op), ["asset-poster-read"]);
  assert.equal(await readPoster({ async request() { throw Error("unsupported op"); } }, hash), null);
  assert.equal(decoded.length, 0);
});
test("invalid source hash makes no request or canvas", async () => {
  const host = writeHost(); const bitmap = { width: 20, height: 40 };
  assert.equal(await readPoster(host, "../source.bin"), null);
  assert.equal(await storePoster(host, "bad", bitmap), false);
  assert.equal(host.calls.length, 0); assert.equal(canvases.length, 0);
});
for (const descriptor of [{ length: POSTER_LIMITS.bytes + 1 }, { mime: "video/webm" }, { length: 0 }]) {
  test(`unsafe poster descriptor ${JSON.stringify(descriptor)} is cancelled before allocation`, async () => {
    const host = readHost(descriptor);
    assert.equal(await readPoster(host, hash), null);
    assert.deepEqual(host.calls.map(c => c.op), ["asset-poster-read", "transfer-cancel"]);
    assert.equal(decoded.length, 0);
  });
}
test("oversized PNG dimensions are rejected before decoder allocation", async () => {
  const big = Buffer.from(png); big.writeUInt32BE(1601, 16);
  const host = readHost();
  const request = host.request.bind(host);
  host.request = async (op, data) => op === "transfer-read" ? { data: big.toString("base64") } : request(op, data);
  assert.equal(await readPoster(host, hash), null); assert.equal(decoded.length, 0);
  assert.equal(host.calls.at(-1).op, "transfer-cancel");
});
test("decoded poster geometry mismatch closes the discarded bitmap", async () => {
  globalThis.createImageBitmap = async () => { const image = { width: 1601, height: 1, closed: 0, close() { this.closed++; } }; decoded.push(image); return image; };
  assert.equal(await readPoster(readHost(), hash), null); assert.equal(decoded[0].closed, 1);
});
test("abort during decode closes the poster and does not turn cancellation into a cache miss", async () => {
  const abort = new AbortController();
  globalThis.createImageBitmap = async () => { const image = { width: 1, height: 1, closed: 0, close() { this.closed++; } }; decoded.push(image); abort.abort(); return image; };
  await assert.rejects(readPoster(readHost(), hash, abort.signal), { name: "AbortError" });
  assert.equal(decoded[0].closed, 1);
});
test("store preserves aspect ratio, uploads only a bounded PNG under its source hash, and retains the original bitmap", async () => {
  const host = writeHost(); const bitmap = { width: 3200, height: 1600, close() { throw Error("Source bitmap must stay owned by preview"); } };
  assert.equal(await storePoster(host, hash, bitmap), true);
  assert.deepEqual(canvases[0].draw[0], [bitmap, 0, 0, 1024, 512]);
  assert.equal(canvases[0].width, 0); assert.equal(canvases[0].height, 0);
  assert.deepEqual(Buffer.concat(host.parts), png);
  assert.deepEqual(host.calls.find(c => c.op === "asset-poster-write"), { op: "asset-poster-write", token: "poster-upload", hash });
  assert.equal(host.calls.at(-1).op, "transfer-cancel");
});
test("smaller source preview is not upscaled", async () => {
  const bitmap = { width: 128, height: 256 }; await storePoster(writeHost(), hash, bitmap);
  assert.deepEqual(canvases[0].draw[0], [bitmap, 0, 0, 128, 256]);
});
test("a failed cache upload returns false and cancels only the derived transfer", async () => {
  const host = writeHost(); const request = host.request.bind(host);
  host.request = async (op, data) => { if (op === "transfer-append") throw Error("cache write unavailable"); return request(op, data); };
  assert.equal(await storePoster(host, hash, { width: 40, height: 20 }), false);
  assert.deepEqual(host.calls.map(c => c.op), ["transfer-begin", "transfer-cancel"]);
  assert.equal(canvases[0].width, 0);
});
test("abort after transfer-begin still returns its token to cleanup", async () => {
  const host = writeHost(); const request = host.request.bind(host); const abort = new AbortController();
  host.request = async (op, data) => { const result = await request(op, data); if (op === "transfer-begin") abort.abort(); return result; };
  await assert.rejects(storePoster(host, hash, { width: 40, height: 20 }, abort.signal), { name: "AbortError" });
  assert.deepEqual(host.calls.map(c => c.op), ["transfer-begin", "transfer-cancel"]);
  assert.equal(canvases[0].width, 0);
});
test("abort while PNG encoding finishes promptly without any upload", async () => {
  const abort = new AbortController(); const host = writeHost(); const create = document.createElement;
  document.createElement = (...args) => { const canvas = create(...args); canvas.toBlob = () => queueMicrotask(() => abort.abort()); return canvas; };
  await assert.rejects(storePoster(host, hash, { width: 40, height: 20 }, abort.signal), { name: "AbortError" });
  assert.equal(host.calls.length, 0); assert.equal(canvases[0].width, 0);
});
