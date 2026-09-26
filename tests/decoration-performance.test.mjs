import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

test("행의 동일 스타일 및 불투명도 전환은 미디어 재생성과 위치 측정을 요구하지 않는다", async () => {
  const bundle = await build({
    entryPoints: ["src/renderer/layers.js"],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    plugins: [
      {
        name: "isolated-decoration",
        setup(builder) {
          builder.onResolve({ filter: /media\.js$/ }, () => ({
            path: "media",
            namespace: "mock-media",
          }));
          builder.onLoad({ filter: /.*/, namespace: "mock-media" }, () => ({
            contents:
              "export class MediaPlayer { constructor(media){ this.media = media; } updateAppearance(){} dispose(){} }",
            loader: "js",
          }));
          builder.onResolve({ filter: /.*/ }, (args) => ({
            path: args.importer
              ? path.posix.normalize(
                  path.posix.join(path.posix.dirname(args.importer), args.path),
                )
              : args.path,
            namespace: "source",
          }));
          builder.onLoad({ filter: /.*/, namespace: "source" }, (args) => ({
            contents: fs.readFileSync(
              path.join(process.cwd(), args.path),
              "utf8",
            ),
            loader: args.path.endsWith(".ts") ? "ts" : "js",
          }));
        },
      },
    ],
  });
  const context = vm.createContext({ module: { exports: {} } });
  vm.runInContext(bundle.outputFiles[0].text, context);
  const decoration = Object.create(context.module.exports.Decoration.prototype);
  let writes = 0,
    positions = 0;
  const original = { background: { color: "#123456", opacity: 0.4 } };
  Object.assign(decoration, {
    style: original,
    styleFingerprint: JSON.stringify(original),
    layers: {
      background: {
        style: {},
        removeAttribute() {
          writes++;
        },
      },
    },
    root: { style: {} },
    target: { el: { style: {} }, target: "sidebar.project-row" },
    nativeRadius: "8px",
    players: new Map(),
    paintSurfaces: [],
    paintScope: { set() {} },
    position() {
      positions++;
    },
    restoreIcon() {},
    restoreText() {},
    restoreBackground() {},
  });
  decoration.set(structuredClone(original));
  assert.equal(writes, 0);
  assert.equal(positions, 0);
  decoration.set({ background: { color: "#123456", opacity: 0.5 } });
  assert.equal(writes, 1);
  assert.equal(positions, 0);
  assert.equal(decoration.layers.background.style.opacity, "0.5");
  assert.equal(decoration.players.size, 0);
  let ready = null;
  decoration.asset = () => ready;
  decoration.icon = { style: { visibility: "visible" } };
  decoration.restoreIcon = function () {
    if (this.iconVisibility !== undefined)
      this.icon.style.visibility = this.iconVisibility;
  };
  decoration.layers.icon = {
    style: {},
    removeAttribute() {
      writes++;
    },
  };
  const iconStyle = {
    icon: { image: "sha256:delayed", opacity: 1, sizePx: 26 },
  };
  decoration.set(iconStyle);
  assert.equal(decoration.icon.style.visibility, "visible");
  assert.equal(decoration.players.has("icon"), false);
  const beforeReadyPositions = positions;
  ready = { frames: [{}] };
  decoration.set(structuredClone(iconStyle));
  assert.equal(positions, beforeReadyPositions + 1);
  assert.equal(decoration.players.get("icon").media, ready);
  assert.equal(decoration.icon.style.visibility, "hidden");
  const player = decoration.players.get("icon");
  const stableWrites = writes;
  decoration.set(structuredClone(iconStyle));
  assert.equal(decoration.players.get("icon"), player);
  assert.equal(writes, stableWrites);
  ready = { frames: [{}] };
  decoration.set(structuredClone(iconStyle));
  assert.notEqual(decoration.players.get("icon"), player);
  assert.equal(decoration.players.get("icon").media, ready);
  ready = null;
  decoration.set(structuredClone(iconStyle));
  assert.equal(decoration.players.has("icon"), false);
  assert.equal(decoration.icon.style.visibility, "visible");
  const mediaPauses = [];
  let animationPauses = 0,
    animationResumes = 0;
  const animation = {
    playState: "running",
    pause() {
      this.playState = "paused";
      animationPauses++;
    },
    play() {
      this.playState = "running";
      animationResumes++;
    },
  };
  const alreadyPaused = {
    playState: "paused",
    play() {
      throw Error("다른 이유로 정지한 효과 재개 금지");
    },
  };
  context.document = { hidden: false };
  decoration.animations = [animation, alreadyPaused];
  decoration.players = new Map([
    ["background", { pause: (value) => mediaPauses.push(value) }],
  ]);
  decoration.setScrollPaused(true, false);
  decoration.setScrollPaused(true, false);
  assert.equal(animationPauses, 1);
  assert.deepEqual(mediaPauses, [false], "효과 정지와 배경 GIF 재생은 독립");
  decoration.setScrollPaused(true, true);
  assert.equal(animationPauses, 1, "미디어만 바뀌면 효과 재정지 없음");
  decoration.setScrollPaused(false);
  assert.equal(animationResumes, 1);
  assert.deepEqual(mediaPauses, [false, true, false]);
});
