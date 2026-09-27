import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

test("실제 미디어 재생기는 스크롤 정지와 맞춤·크기 변경에서 캔버스 및 현재 프레임을 보존한다", async () => {
  const bundle = await build({
    entryPoints: ["src/renderer/media.js"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "unused-worker-payload",
        setup(builder) {
          builder.onResolve({ filter: /gif-worker\.json$/ }, () => ({
            path: "worker",
            namespace: "test-worker",
          }));
          builder.onLoad({ filter: /.*/, namespace: "test-worker" }, () => ({
            contents: 'export default ""',
            loader: "js",
          }));
          builder.onResolve({ filter: /.*/ }, (args) => ({
            path: args.importer
              ? path.posix.normalize(
                  path.posix.join(path.posix.dirname(args.importer), args.path),
                )
              : args.path,
            namespace: "test-source",
          }));
          builder.onLoad(
            { filter: /.*/, namespace: "test-source" },
            (args) => ({
              contents: fs.readFileSync(
                path.join(process.cwd(), args.path),
                "utf8",
              ),
              loader: args.path.endsWith(".ts") ? "ts" : "js",
            }),
          );
        },
      },
    ],
  });
  let now = 0,
    draws = 0,
    timerId = 0;
  const timers = new Map();
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    getContext: () => ({
      clearRect() {},
      drawImage() {
        draws++;
      },
    }),
    remove() {},
  };
  const context = vm.createContext({
    module: { exports: {} },
    document: { createElement: () => canvas },
    performance: { now: () => now },
    setTimeout: (callback) => {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  new vm.Script(bundle.outputFiles[0].text).runInContext(context);
  const { MediaPlayer } = context.module.exports;
  let width = 100;
  const parent = {
    getBoundingClientRect: () => ({ width, height: 30 }),
    append() {},
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
  const player = new MediaPlayer(media, parent, "cover", { x: 0.5, y: 0.5 });
  player.setPlaying(true);
  now = 100;
  const tick = [...timers.values()][0];
  timers.clear();
  tick();
  assert.equal(player.index, 1);
  const before = draws;
  player.pause(true);
  now = 1100;
  assert.equal(timers.size, 0);
  assert.equal(draws, before);
  player.setVisible(false);
  player.pause(true);
  player.setVisible(true);
  assert.equal(
    timers.size,
    0,
    "최소화와 스크롤 정지가 겹치면 두 조건이 모두 풀릴 때 재개",
  );
  player.pause(false);
  assert.equal(player.index, 1, "최소화 복원에서 첫 프레임으로 돌아가지 않음");
  player.pause(false);
  assert.equal(player.index, 1);
  assert.equal(draws, before);
  player.updateAppearance("cover", { x: 0.5, y: 0.5 });
  assert.equal(draws, before);
  player.updateAppearance("contain", { x: 0.5, y: 0.5 });
  assert.equal(player.index, 1);
  width = 200;
  player.resize();
  assert.equal(player.canvas, canvas);
  assert.equal(canvas.width, 200);
  assert.equal(player.index, 1);
  const row = new MediaPlayer(media, parent);
  row.setPlaying(true);
  row.pause(true);
  assert.equal(timers.size, 1);
  now = 1200;
  const sharedTick = [...timers.values()][0];
  timers.clear();
  sharedTick();
  assert.equal(player.index, 0, "행 정지 동안 동일 GIF의 배경 시계는 진행");
  assert.equal(timers.size, 1, "공유 미디어는 단일 시계를 유지");
  row.dispose();
  player.dispose();
  assert.equal(timers.size, 0);
});
