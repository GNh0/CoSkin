import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { NativePaintScope } from "../src/renderer/native-paint.js";
import { blendColors, contrastRatio } from "../src/core/theme-colors.js";

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
  const composerChild = { radius: "22px" };
  const shell = { radius: "0px", querySelector: () => composerChild };
  const mainSurface = {
    radius: "0px 12px 4px 0px",
    querySelector: () => composerChild,
  };
  const composer = { querySelector: () => composerChild };
  const readRadius = (element) => ({ borderRadius: element.radius });
  assert.equal(
    context.module.exports.nativeRadiusFor(
      { target: "app.background", el: shell },
      readRadius,
    ),
    "0px",
    "the app shell must not inherit the nested composer radius",
  );
  assert.equal(
    context.module.exports.nativeRadiusFor(
      { target: "main.surface", el: mainSurface },
      readRadius,
    ),
    "0px 12px 4px 0px",
  );
  assert.equal(
    context.module.exports.nativeRadiusFor(
      { target: "composer.surface", el: composer },
      readRadius,
    ),
    "22px",
  );
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
  const values = new Map([
    ["color", { value: "white", priority: "important" }],
  ]);
  const header = {
    style: {
      getPropertyValue: (key) => values.get(key)?.value || "",
      getPropertyPriority: (key) => values.get(key)?.priority || "",
      setProperty(key, value, priority = "") {
        values.set(key, { value, priority });
      },
      removeProperty(key) {
        values.delete(key);
      },
    },
  };
  let sources = [{ element: header, chromeHeader: true }];
  const chrome = Object.create(context.module.exports.Decoration.prototype);
  Object.assign(chrome, {
    target: { target: "app.background", paintSources: () => sources },
    paintScope: new NativePaintScope(),
    paintSources: new Map(),
    style: {
      background: { color: "#221b29", opacity: 1 },
      border: { color: "#e6aebc" },
    },
  });
  for (const background of ["#221b29", "#faf4ff"]) {
    chrome.style.background.color = background;
    chrome.updatePaintSurfaces();
    assert.match(header.style.getPropertyValue("background-color"), /0\.96\)$/);
    const ink = header.style.getPropertyValue("--coskin-font-color");
    for (const wallpaper of ["#ffffff", "#000000"])
      assert.ok(
        contrastRatio(ink, blendColors(background, wallpaper, 0.96)) >= 4.5,
      );
    assert.equal(header.style.getPropertyValue("--coskin-font-shadow"), "none");
  }
  sources = [];
  chrome.updatePaintSurfaces();
  assert.equal(header.style.getPropertyValue("color"), "white");
  assert.equal(header.style.getPropertyPriority("color"), "important");
  for (const key of [
    "background-color",
    "--coskin-font-color",
    "--coskin-font-shadow",
  ])
    assert.equal(
      header.style.getPropertyValue(key),
      "",
      "Removed headers restore their original paint",
    );
  context.document = {
    querySelector: () => ({ getBoundingClientRect: () => ({ top: 44 }) }),
  };
  const video = { videoUrl: "blob:wallpaper" };
  const appLayer = {
    style: {},
    removeAttribute() { this.style = {}; },
  };
  const app = Object.create(context.module.exports.Decoration.prototype);
  Object.assign(app, {
    target: { target: "app.background", el: { style: {} } },
    root: { style: {} },
    layers: { background: appLayer },
    players: new Map([["background", { media: video, updateAppearance() {} }]]),
    asset: () => video,
    paintSources: new Map(),
    paintSurfaces: [],
    paintScope: { set() {} },
    nativeRadius: "0px",
    position() {},
    restoreIcon() {},
    restoreText() {},
    restoreBackground() {},
  });
  app.set({ background: { image: "assets/wallpaper.mp4", color: "#152B32" } });
  assert.equal(appLayer.style.clipPath, "inset(44px 0 0 0)");
  assert.equal(app.root.style.borderRadius, "0px");
  delete video.videoUrl;
  video.frames = [{ image: {} }, { image: {} }];
  app.set({ background: { image: "assets/wallpaper.gif", color: "#152B32" } });
  assert.equal(appLayer.style.clipPath, "inset(44px 0 0 0)");
  app.set({
    background: { image: "assets/wallpaper.gif", color: "#152B32" },
    border: { color: "#ffffff", radiusPx: 22 },
  });
  assert.equal(app.root.style.borderRadius, "0px");
  const sidebarLayer = {
    style: {},
    removeAttribute() { this.style = {}; },
  };
  const sidebar = Object.create(context.module.exports.Decoration.prototype);
  Object.assign(sidebar, {
    target: { target: "sidebar.surface", el: { style: {} } },
    root: { style: {} },
    layers: { background: sidebarLayer },
    players: new Map(),
    paintSources: new Map(),
    paintSurfaces: [],
    paintScope: { set() {} },
    nativeRadius: "0px",
    position() {},
    restoreIcon() {},
    restoreText() {},
    restoreBackground() {},
  });
  sidebar.set({ background: { color: "#152B32", opacity: 0.72, blurPx: 10 } });
  assert.equal(sidebarLayer.style.opacity, "1");
  assert.equal(sidebarLayer.style.backdropFilter, "blur(10px)");
  sidebar.set({ background: { color: "#152B32", opacity: 0.72 } });
  assert.equal(sidebarLayer.style.opacity, "0.72");
  assert.equal(sidebarLayer.style.backdropFilter, undefined);
});
