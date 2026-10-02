import test from "node:test";
import assert from "node:assert/strict";
import { containedBackgroundTop } from "../src/renderer/media-viewport.js";
import { build } from "esbuild";
import { workspaceBundle } from "./workspace-bundle.mjs";

test("contain 배경은 실제 메뉴·페이지 제목 아래에 전체 영상 비율을 맞춘다", () => {
  const bounds = { top: 0, left: 0, width: 1522, height: 927 };
  const headers = [
    { top: 0, left: 0, width: 1522, height: 46 },
    { top: 44, left: 364, width: 1154, height: 52 },
  ];
  const top = containedBackgroundTop(bounds, headers);
  const source = { width: 952, height: 930 };
  const scale = Math.min(
    bounds.width / source.width,
    (bounds.height - top) / source.height,
  );
  assert.equal(top, 112);
  assert.equal(
    (source.width * scale) / (source.height * scale),
    source.width / source.height,
  );
  assert.ok(top >= 96, "영상 상단이 불투명한 두 제목 바 아래에 있음");
  assert.ok(
    top + source.height * scale <= bounds.height,
    "영상 하단도 대상 영역 안에 있음",
  );
});

test("숨기거나 화면 밖인 제목 바는 여백을 만들지 않고 실제 작은 창도 남은 공간에 맞춘다", () => {
  const bounds = { top: 10, left: 20, width: 540, height: 400 };
  assert.equal(
    containedBackgroundTop(bounds, [
      { top: 10, left: 20, width: 0, height: 50 },
      { top: 10, left: 600, width: 20, height: 50 },
      { top: 500, left: 20, width: 540, height: 50 },
    ]),
    0,
  );
  assert.equal(
    containedBackgroundTop(bounds, [
      { top: 10, left: 20, width: 540, height: 50 },
    ]),
    66,
  );
  assert.equal(
    containedBackgroundTop({ ...bounds, height: 20 }, [
      { top: 10, left: 20, width: 540, height: 50 },
    ]),
    19,
  );
  assert.equal(containedBackgroundTop({ ...bounds, height: 0 }, []), 0);
});

test("native 영상과 정지 미리보기는 같은 안전영역과 비율을 쓰며 크기 변경에도 재생 위치를 보존한다", async (t) => {
  const bundle = await build({
    stdin: {
      contents: 'export {MediaPlayer} from "./src/renderer/media.js";',
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [workspaceBundle()],
  });
  const { MediaPlayer } = await import(
    "data:text/javascript;base64," +
      Buffer.from(bundle.outputFiles[0].text).toString("base64")
  );
  const originalDocument = globalThis.document;
  const draws = [];
  const canvas = {
    style: {},
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect() {},
      drawImage(...args) {
        draws.push(args);
      },
    }),
    remove() {},
  };
  const video = {
    style: {},
    paused: true,
    readyState: 4,
    currentTime: 42,
    play() {
      this.paused = false;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
    },
    removeAttribute() {},
    load() {},
    remove() {},
  };
  globalThis.document = {
    createElement: (tag) => (tag === "video" ? video : canvas),
  };
  t.after(() => {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  });
  let height = 400;
  const parent = {
    getBoundingClientRect: () => ({ width: 540, height }),
    append() {},
  };
  const media = {
    width: 952,
    height: 930,
    frames: [{ image: {}, delay: 0 }],
    videoUrl: "blob:test",
  };
  const player = new MediaPlayer(media, parent, "contain", { x: 0.5, y: 0.5 });
  t.after(() => player.dispose());
  player.setViewportTop(66);
  assert.equal(video.style.objectFit, "contain");
  assert.equal(video.style.objectPosition, "50% 50%");
  assert.equal(video.style.top, "66px");
  assert.equal(video.style.height, "calc(100% - 66px)");
  assert.equal(canvas.style.top, video.style.top);
  assert.equal(canvas.style.height, video.style.height);
  assert.equal(canvas.height, 334);
  const [x, y, width, drawnHeight] = draws.at(-1).slice(1);
  assert.ok(x >= 0 && y >= 0 && y + drawnHeight <= 334);
  assert.ok(Math.abs(width / drawnHeight - 952 / 930) < 1e-12);
  player.setPlaying(true);
  await Promise.resolve();
  const source = video.src;
  height = 200;
  player.resize();
  assert.equal(canvas.height, 134);
  assert.equal(video.currentTime, 42);
  assert.equal(video.src, source);
  assert.equal(video.paused, false);
  player.setViewportTop(0);
  assert.equal(canvas.height, 200);
  assert.equal(video.style.top, "0px");
  assert.equal(video.style.height, "100%");
  assert.equal(video.currentTime, 42);
});
