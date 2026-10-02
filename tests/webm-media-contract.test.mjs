import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";
import { workspaceBundle } from "./workspace-bundle.mjs";
import { validateManifest } from "../src/core/engine.ts";
import { MEDIA_LIMITS, isVideoMime } from "../src/core/media-limits.js";
import {
  mediaCacheBudget,
  mediaMemoryBytes,
} from "../src/core/media-budget.js";

const MiB = 1024 * 1024;
const sampleManifest = JSON.parse(
  fs.readFileSync("docs/examples/manifest.json", "utf8"),
);
function manifest(path, bytes) {
  const document = structuredClone(sampleManifest);
  document.files = [
    ...(path === "theme.json"
      ? []
      : [{ path: "theme.json", bytes: 200, sha256: "0".repeat(64) }]),
    { path, bytes, sha256: "1".repeat(64) },
  ];
  return document;
}

test("large WebM/MP4 manifest entries admit both original source sizes and the 512MiB boundary", () => {
  for (const path of ["assets/source.webm", "assets/source.mp4"])
    for (const bytes of [2848499, 241975918, 512 * MiB])
      assert.doesNotThrow(
        () => validateManifest(manifest(path, bytes)),
        `${path} ${bytes}B`,
      );
});

test("video, image/GIF and JSON manifest limits remain consistent with package admission", () => {
  for (const path of ["assets/source.webm", "assets/source.mp4"])
    assert.throws(() => validateManifest(manifest(path, 512 * MiB + 1)));
  for (const path of [
    "assets/source.gif",
    "assets/source.png",
    "assets/source.jpeg",
  ]) {
    assert.doesNotThrow(() => validateManifest(manifest(path, 25 * MiB)));
    assert.throws(() => validateManifest(manifest(path, 25 * MiB + 1)));
  }
  assert.doesNotThrow(() => validateManifest(manifest("theme.json", 2 * MiB)));
  assert.throws(() => validateManifest(manifest("theme.json", 2 * MiB + 1)));
});

test("GIF encoded/frame limits remain separate from video limits and ordinary cache budgets", () => {
  assert.equal(MEDIA_LIMITS.bytes, 25 * MiB);
  assert.equal(MEDIA_LIMITS.videoBytes, 512 * MiB);
  assert.equal(MEDIA_LIMITS.frames, 240);
  assert.equal(MEDIA_LIMITS.totalFramePixels, 32000000);
  assert.equal(isVideoMime("video/webm"), true);
  assert.equal(isVideoMime("video/mp4"), true);
  assert.equal(isVideoMime("image/gif"), false);
  assert.equal(isVideoMime("video/avi"), false);
});

test("cache selection retains standard128/UHD256/large768 budgets for active and incoming media", () => {
  const media = (width, height, encodedBytes = 0, video = false) => ({
    width,
    height,
    encodedBytes,
    frames: [{}],
    ...(video ? { videoUrl: "blob:test" } : {}),
  });
  const gif = media(1024, 1024, 25 * MiB);
  const uhd = media(3840, 2160, 21 * MiB, true);
  const source = media(1440, 931, 241975918, true);
  assert.equal(mediaCacheBudget(gif, []), 128 * MiB);
  assert.equal(mediaCacheBudget(uhd, []), 256 * MiB);
  assert.equal(mediaCacheBudget(null, [uhd]), 256 * MiB);
  assert.equal(mediaCacheBudget(source, []), 768 * MiB);
  assert.equal(mediaCacheBudget(gif, [source]), 768 * MiB);
  assert.equal(mediaCacheBudget(null, []), 128 * MiB);
  assert.equal(mediaCacheBudget(media(3840, 2160, 512 * MiB), []), 128 * MiB);
  assert.equal(mediaMemoryBytes(source), 1440 * 931 * 16 + 241975918);
});

const compiled = await build({
  stdin: {
    contents: 'export {Controller} from "./src/renderer/controller.js";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [workspaceBundle()],
});
const { Controller } = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);

for (const op of ["asset-write", "import"])
  for (const elapsed of [31000, 305000]) {
    test(`${op} accepts a reply after ${elapsed}ms including transfer/decode preparation`, async (t) => {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const previous = globalThis.window;
      const requests = [];
      globalThis.window = {
        __coskinRequest: (payload) => requests.push(JSON.parse(payload)),
      };
      t.after(() => {
        if (previous === undefined) delete globalThis.window;
        else globalThis.window = previous;
      });
      const controller = Object.assign(Object.create(Controller.prototype), {
        next: 0,
        pending: new Map(),
        sessionId: "test-session",
      });
      const reply = controller.request(op, { token: "completed-upload" });
      const observed = reply.then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      t.mock.timers.tick(elapsed);
      await Promise.resolve();
      assert.equal(
        controller.pending.has(requests[0].requestId),
        true,
        "the outer request needs headroom beyond a valid inner decoder and staging time",
      );
      controller.response(requests[0].requestId, { stored: true }, null);
      assert.deepEqual(await observed, { value: { stored: true } });
    });
  }

test("heavy commit requests retain the 15 minute bound and clear stalled requests", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const previous = globalThis.window;
  globalThis.window = { __coskinRequest() {} };
  t.after(() => {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  });
  const controller = Object.assign(Object.create(Controller.prototype), {
    next: 0,
    pending: new Map(),
    sessionId: "test-session",
  });
  const operations = [
    "asset-write",
    "import",
    "apply",
    "enable",
    "inherit",
    "export",
    "save",
    "create",
  ];
  const rejected = Promise.all(
    operations.map((op) =>
      assert.rejects(controller.request(op), /시간이 초과/),
    ),
  );
  t.mock.timers.tick(15 * 60 * 1000 - 1);
  assert.equal(controller.pending.size, operations.length);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(controller.pending.size, 0);
});

test("ordinary transfer chunk requests retain their short bounded timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const previous = globalThis.window;
  globalThis.window = { __coskinRequest() {} };
  t.after(() => {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  });
  const controller = Object.assign(Object.create(Controller.prototype), {
    next: 0,
    pending: new Map(),
    sessionId: "test-session",
  });
  const reply = controller.request("transfer-read", {
    token: "stalled-chunk",
    offset: 0,
  });
  const rejected = assert.rejects(reply, /시간이 초과/);
  t.mock.timers.tick(30001);
  await rejected;
  assert.equal(controller.pending.size, 0);
});
