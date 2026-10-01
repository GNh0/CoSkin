import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { workspaceBundle } from "./workspace-bundle.mjs";
import {
  mediaCacheLimits,
  mediaMemoryBytes,
} from "../src/core/media-budget.js";

const compiled = await build({
  stdin: {
    contents:
      'export {Controller} from "./src/renderer/controller.js"; export {defaultThemes} from "./src/core/default-themes.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [workspaceBundle()],
});
const { Controller, defaultThemes } = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);

function media(width, height, encodedBytes) {
  return {
    width,
    height,
    ...(encodedBytes === undefined
      ? {}
      : { videoUrl: "blob:synthetic", encodedBytes }),
    frames: [{ image: { close() {} }, delay: 0 }],
  };
}

function runtime(assets, active = []) {
  const controller = Object.create(Controller.prototype);
  const doc = structuredClone(defaultThemes[0]);
  doc.assets = Object.fromEntries(
    assets.map((_, i) => [
      "assets/test" + i + ".mp4",
      String(i).padStart(64, "0"),
    ]),
  );
  const values = new Map(
    Object.values(doc.assets).map((hash, i) => [hash, assets[i]]),
  );
  const calls = [];
  Object.assign(controller, {
    adapter: {
      supportedTargets: doc.manifest.requirements.required
        .filter((key) => key.startsWith("target:"))
        .map((key) => key.slice(7)),
    },
    decorations: new Map(
      active.map((item, i) => [
        i,
        { players: new Map([["background", { media: item }]]) },
      ]),
    ),
    assetCache: new Map(active.map((item, i) => ["active." + i, item])),
    async loadMedia(hash) {
      calls.push(hash);
      return (
        this.assetCache.get(hash) || this.storeMedia(hash, values.get(hash))
      );
    },
  });
  return { controller, doc, calls, summary: { documents: { global: doc } } };
}

test("a supported 4K video passes both runtime cache admission and application preparation with the old HD theme active", async () => {
  const uhd = media(3840, 2160, 21930134);
  const old = media(1920, 1080, 21 * 1024 * 1024);
  assert.ok(mediaMemoryBytes(uhd) > mediaCacheLimits.standard);
  assert.ok(
    mediaMemoryBytes(uhd) + mediaMemoryBytes(old) < mediaCacheLimits.uhdVideo,
  );
  const { controller, summary, calls } = runtime([uhd], [old]);
  assert.equal(await controller.prepare(summary), true);
  assert.equal(calls.length, 1);
  assert.equal(controller.assetCache.get("active.0"), old);
  assert.equal(controller.assetCache.get("0".repeat(64)), uhd);
});

test("the complete prepared collection uses one budget independently of UHD asset order", async () => {
  const assets = [
    media(4096, 4096),
    media(4096, 4096),
    media(256, 512),
    media(3840, 2160, 10000),
  ];
  const bytes = assets.reduce(
    (total, item) => total + mediaMemoryBytes(item),
    0,
  );
  assert.ok(
    bytes > mediaCacheLimits.standard && bytes < mediaCacheLimits.uhdVideo,
  );
  for (const ordered of [assets, [...assets].reverse()]) {
    const { controller, summary } = runtime(ordered);
    assert.equal(await controller.prepare(summary), true);
  }
});

test("standard collections retain 128MiB and oversized UHD collections still fail", async () => {
  const normal = runtime([
    media(4096, 4096),
    media(4096, 4096),
    media(256, 512),
  ]);
  await assert.rejects(
    normal.controller.prepare(normal.summary),
    /메모리 예산/,
  );
  const tooLarge = runtime([
    media(3840, 2160, 21930134),
    media(3840, 2160, 21930134),
  ]);
  await assert.rejects(
    tooLarge.controller.prepare(tooLarge.summary),
    /메모리 예산/,
  );
  const gif = media(1024, 1024);
  gif.frames = Array.from({ length: 33 }, () => ({ image: { close() {} } }));
  const { controller } = runtime([]);
  assert.throws(
    () => controller.storeMedia("oversized-gif", gif),
    /메모리 예산/,
  );
});

test("shared asset hashes across bindings are admitted and counted once", async () => {
  const { controller, summary, calls, doc } = runtime([
    media(3840, 2160, 21930134),
  ]);
  summary.documents["project:example"] = structuredClone(doc);
  summary.documents["project:example"].assets["assets/alias.mp4"] = "0".repeat(
    64,
  );
  assert.equal(await controller.prepare(summary), true);
  assert.equal(calls.length, 1);
});

test("the runtime cache evicts unused entries at its count limit and preserves active media", () => {
  const old = media(1, 1);
  let closed = 0;
  const { controller } = runtime([], [old]);
  for (let i = 0; i < 63; i++) {
    const image = media(1, 1);
    image.frames[0].image.close = () => closed++;
    controller.storeMedia("unused." + i, image);
  }
  controller.storeMedia("new", media(1, 1));
  assert.equal(controller.assetCache.size, 64);
  assert.equal(controller.assetCache.get("active.0"), old);
  assert.equal(controller.assetCache.has("unused.0"), false);
  assert.equal(closed, 1);
});
