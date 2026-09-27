import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: ["src/renderer/media.js"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
});
function runtime(video) {
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    remove() {},
    getContext: () => ({ clearRect() {}, drawImage() {} }),
  };
  const revoked = [];
  let closed = 0;
  const context = vm.createContext({
    module: { exports: {} },
    document: {
      createElement: (tag) => (tag === "video" ? video : canvas),
      body: { append() {} },
    },
    URL: {
      createObjectURL: () => "blob:local-video",
      revokeObjectURL: (url) => revoked.push(url),
    },
    Blob,
    Uint8Array,
    setTimeout,
    clearTimeout,
    createImageBitmap: async () => ({
      width: video.videoWidth,
      height: video.videoHeight,
      close() {
        closed++;
      },
    }),
  });
  new vm.Script(compiled.outputFiles[0].text).runInContext(context);
  return { ...context.module.exports, canvas, revoked, closed: () => closed };
}
function videoStub() {
  return {
    style: {},
    dataset: {},
    paused: true,
    time: 0,
    set currentTime(value) {
      this.time = value;
      queueMicrotask(() => this.onseeked?.());
    },
    get currentTime() {
      return this.time;
    },
    readyState: 4,
    duration: 93.5,
    videoWidth: 1920,
    videoHeight: 1080,
    set src(value) {
      this.url = value;
      queueMicrotask(() => this.onloadedmetadata?.());
    },
    play() {
      this.paused = false;
      return Promise.resolve();
    },
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
}
test("muted video remains on the native playback path during scroll and obeys poster, fit and disposal", async () => {
  const video = videoStub();
  const api = runtime(video);
  const media = {
    videoUrl: "blob:local-video",
    width: 1920,
    height: 1080,
    frames: [{ image: {}, delay: 0 }],
  };
  const player = new api.MediaPlayer(
    media,
    { append() {}, getBoundingClientRect: () => ({ width: 800, height: 500 }) },
    "cover",
  );
  player.setPlaying(true);
  await Promise.resolve();
  assert.equal(video.muted, true);
  assert.equal(video.loop, true);
  assert.equal(video.playsInline, true);
  assert.equal(video.style.display, "block");
  const snapshots = [];
  const frozen = {
    width: 800,
    height: 500,
    style: {},
    getContext: () => ({
      clearRect() {},
      drawImage: (...args) => snapshots.push(args),
    }),
  };
  player.snapshot(frozen);
  assert.equal(frozen.style.visibility, "visible");
  assert.equal(snapshots[0][0], video);
  assert.ok(
    snapshots[0][1] < 0,
    "cover preserves the centered crop during exit transitions",
  );
  assert.equal(snapshots[0][4], 500);
  video.currentTime = 12;
  player.pause(true);
  player.pause(false);
  assert.equal(video.currentTime, 12);
  assert.equal(video.paused, false);
  player.setVisible(false);
  assert.equal(video.paused, true);
  assert.equal(video.currentTime, 12);
  player.setVisible(true);
  await Promise.resolve();
  assert.equal(video.paused, false);
  assert.equal(
    video.currentTime,
    12,
    "minimize preserves the playback position",
  );
  player.updateAppearance("stretch", { x: 1, y: 0 });
  assert.equal(video.style.objectFit, "fill");
  assert.equal(video.style.objectPosition, "100% 0%");
  player.setPlaying(false);
  assert.equal(video.paused, true);
  assert.equal(video.currentTime, 0);
  assert.equal(api.canvas.style.visibility, "visible");
  player.dispose();
  assert.equal(video.url, "");
  assert.equal(video.removed, true);
  assert.equal(video.paused, true);
  assert.equal(video.removed, true);
});
test("video admission captures one poster and releases URLs on invalid duration and normal disposal", async () => {
  const video = videoStub();
  const api = runtime(video);
  const media = await api.decodeMedia(new Uint8Array([1, 2, 3]), "video/mp4");
  assert.equal(media.frames.length, 1);
  assert.equal(media.duration, 93.5);
  assert.equal(media.encodedBytes, 3);
  assert.equal(video.url, "");
  api.disposeMedia(media);
  assert.equal(api.closed(), 1);
  assert.deepEqual(api.revoked, ["blob:local-video"]);
  video.duration = Infinity;
  await assert.rejects(
    api.decodeMedia(new Uint8Array([1]), "video/mp4"),
    /길이/,
  );
  assert.equal(api.revoked.length, 2);
});
