import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

test("실제 Controller·Decoration·GIF는 휠 범위와 숨김을 분리하고 소유한 효과만 재개한다", async () => {
  const bundle = await build({
    stdin: {
      contents:
        'export {Controller} from "./src/renderer/controller.js"; export {Decoration} from "./src/renderer/layers.js"; export {MediaPlayer} from "./src/renderer/media.js";',
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "worker-placeholder",
        setup(builder) {
          builder.onResolve({ filter: /^gifuct-js$/ }, () => ({
            path: "gifuct",
            namespace: "fixture-lib",
          }));
          builder.onLoad({ filter: /.*/, namespace: "fixture-lib" }, () => ({
            contents:
              "export function parseGIF(){} export function decompressFrames(){}",
            loader: "js",
          }));
          builder.onResolve({ filter: /gif-worker\.json$/ }, () => ({
            path: "worker",
            namespace: "fixture",
          }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: 'export default ""',
            loader: "js",
          }));
          builder.onResolve({ filter: /.*/ }, (args) => ({
            path: path.posix.normalize(
              path.posix.join(
                args.namespace === "source"
                  ? path.posix.dirname(args.importer)
                  : "",
                args.path,
              ),
            ),
            namespace: "source",
          }));
          builder.onLoad({ filter: /.*/, namespace: "source" }, (args) => ({
            contents: fs.readFileSync(
              path.join(process.cwd(), args.path),
              "utf8",
            ),
            loader: args.path.endsWith(".css")
              ? "text"
              : args.path.endsWith(".ts")
                ? "ts"
                : "js",
          }));
        },
      },
    ],
  });
  let now = 0,
    id = 0;
  const timers = new Map();
  const document = {
    hidden: false,
    createElement: () => ({
      style: {},
      getContext: () => ({ clearRect() {}, drawImage() {} }),
      remove() {},
    }),
  };
  const context = vm.createContext({
    module: { exports: {} },
    structuredClone,
    document,
    performance: { now: () => now },
    setTimeout: (callback, delay) => {
      timers.set(++id, { callback, at: now + delay });
      return id;
    },
    clearTimeout: (key) => timers.delete(key),
  });
  vm.runInContext(bundle.outputFiles[0].text, context);
  const { Controller, Decoration, MediaPlayer } = context.module.exports;
  let unusedClosed = 0;
  const activeVideo = {
    width: 1920,
    height: 1080,
    videoUrl: "blob:active-hd",
    encodedBytes: 21 * 1024 * 1024,
    frames: [{ image: { close() {} } }],
  };
  const uhdVideo = {
    width: 3840,
    height: 2160,
    videoUrl: "blob:uhd",
    encodedBytes: 21930134,
    frames: [{ image: { close() {} } }],
  };
  const budgetController = Object.create(Controller.prototype);
  Object.assign(budgetController, {
    decorations: new Map([
      [1, { players: new Map([["background", { media: activeVideo }]]) }],
    ]),
    assetCache: new Map([
      ["active", activeVideo],
      [
        "unused",
        {
          width: 4800,
          height: 4800,
          frames: [{ image: { close: () => unusedClosed++ } }],
        },
      ],
    ]),
  });
  assert.equal(budgetController.storeMedia("uhd", uhdVideo), uhdVideo);
  assert.equal(budgetController.assetCache.get("active"), activeVideo);
  assert.equal(budgetController.assetCache.has("unused"), false);
  assert.equal(unusedClosed, 1);
  budgetController.decorations.clear();
  budgetController.assetCache.clear();
  const oversizedGif = {
    width: 1024,
    height: 1024,
    frames: Array.from({ length: 33 }, () => ({ image: { close() {} } })),
  };
  assert.throws(
    () => budgetController.storeMedia("gif", oversizedGif),
    /메모리 예산/,
    "4K 영상 지원이 GIF의 기존 메모리 한도를 늘리지 않는다",
  );
  const advance = (ms) => {
    const end = now + ms;
    let budget = 100;
    while (budget--) {
      const next = [...timers]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) {
        now = end;
        return;
      }
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    throw Error("가짜 시계 실행 예산 초과");
  };
  const media = {
    width: 100,
    height: 30,
    frames: [
      { image: {}, delay: 100 },
      { image: {}, delay: 100 },
    ],
    loops: 0,
  };
  const makeDecoration = (target) => {
    const player = new MediaPlayer(media, {
      append() {},
      getBoundingClientRect: () => ({ width: 100, height: 30 }),
    });
    const d = Object.create(Decoration.prototype);
    Object.assign(d, {
      target: { target, el: {} },
      style: { background: {} },
      players: new Map([["background", player]]),
      animations: [],
    });
    d.setPlaying(true);
    return { d, player };
  };
  const background = makeDecoration("main.surface"),
    row = makeDecoration("sidebar.thread-row");
  const controller = Object.create(Controller.prototype);
  Object.assign(controller, {
    decorations: new Map([
      [1, background.d],
      [2, row.d],
    ]),
    render() {},
    stopReplay() {},
  });
  const chat = { closest: () => null };
  controller.onScroll({ type: "wheel", target: chat });
  advance(110);
  assert.equal(controller.scrolling, true);
  assert.equal(background.player.index, 1);
  assert.equal(row.player.index, 1);
  advance(40);
  const sidebar = { contains: (el) => el === row.d.target.el };
  controller.onScroll({ type: "wheel", target: { closest: () => sidebar } });
  assert.equal(row.player.scrollPaused, true);
  assert.equal(background.player.scrollPaused, false);
  advance(60);
  assert.equal(background.player.index, 0);
  assert.equal(row.player.index, 1);
  advance(90);
  assert.equal(row.player.scrollPaused, false);
  for (const native of [true, false]) {
    document.hidden = false;
    controller.nativeSuspended = false;
    controller.suspended = false;
    background.d.setPlaying(true);
    row.d.setPlaying(true);
    assert.equal(background.player.playRequested, true);
    assert.equal(row.player.playRequested, true);
    assert.ok(
      timers.size > 0,
      "각 숨김 조건은 실행 중인 공유 GIF 시계에서 시작한다",
    );
    document.hidden = !native;
    const before = [background.player.index, row.player.index];
    controller.suspend(native);
    assert.equal(controller.suspended, true);
    controller.onScroll({ type: "wheel", target: { closest: () => sidebar } });
    controller.onScroll({ type: "wheel", target: chat });
    advance(250);
    assert.equal(background.player.playRequested, true);
    assert.equal(row.player.playRequested, true);
    assert.deepEqual([background.player.index, row.player.index], before);
    assert.equal(
      timers.size,
      0,
      "숨김 휠과 idle 종료가 GIF 시계를 깨우지 않는다",
    );
    document.hidden = false;
    controller.suspend(false);
    assert.equal(controller.suspended, false);
    assert.deepEqual([background.player.index, row.player.index], before);
    advance(100);
    assert.notEqual(background.player.index, before[0]);
  }
  let resumed = 0;
  const owned = {
    playState: "running",
    pause() {
      this.playState = "paused";
    },
    play() {
      this.playState = "running";
      resumed++;
    },
  };
  const unrelated = {
    playState: "paused",
    play() {
      throw Error("별도 정지 효과 재개 금지");
    },
  };
  background.d.animations = [owned, unrelated];
  controller.onScroll({ type: "wheel", target: chat });
  assert.equal(owned.playState, "paused");
  advance(150);
  assert.equal(resumed, 1);
  background.player.dispose();
  row.player.dispose();
});
