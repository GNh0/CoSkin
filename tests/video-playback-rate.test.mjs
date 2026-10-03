import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { workspaceBundle } from "./workspace-bundle.mjs";
import { validateTheme } from "../src/core/engine.ts";

test("동영상 배속은 실제 테마 계약에서 허용 범위를 검사한다", () => {
  const theme = (rate) => ({
    profiles: [
      {
        id: "default",
        name: "기본",
        rules: [
          {
            id: "bg",
            target: "app.background",
            states: {
              base: {
                style: {
                  background: {
                    image: "assets/motion.webm",
                    videoPlaybackRate: rate,
                  },
                },
              },
            },
          },
        ],
      },
    ],
  });
  for (const rate of [undefined, null, 0.1, 0.35, 0.75, 1, 4]) {
    const doc = theme(rate);
    if (rate === undefined)
      delete doc.profiles[0].rules[0].states.base.style.background
        .videoPlaybackRate;
    validateTheme(doc, ["assets/motion.webm"]);
  }
  for (const rate of [0, -1, 4.01, NaN, Infinity, "0.35"])
    assert.throws(() => validateTheme(theme(rate), ["assets/motion.webm"]));
});

test("같은 원본을 쓰는 두 플레이어는 독립 배속을 적용하고 재생 위치·최소화 복원을 보존한다", async (t) => {
  const result = await build({
    stdin: {
      contents: 'export {MediaPlayer} from "./src/renderer/media.js"',
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
      Buffer.from(result.outputFiles[0].text).toString("base64")
  );
  const before = globalThis.document;
  globalThis.document = {
    createElement(tag) {
      if (tag === "canvas")
        return {
          style: {},
          getContext: () => ({ clearRect() {}, drawImage() {} }),
          remove() {},
        };
      return {
        style: {},
        paused: true,
        readyState: 4,
        currentTime: 2,
        playbackRate: 1,
        defaultPlaybackRate: 1,
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
    },
  };
  t.after(() => {
    if (before === undefined) delete globalThis.document;
    else globalThis.document = before;
  });
  const media = {
    width: 504,
    height: 902,
    videoUrl: "blob:original",
    frames: [{ image: {}, delay: 0 }],
  };
  const parent = {
    append() {},
    getBoundingClientRect: () => ({ width: 504, height: 902 }),
  };
  const eclipse = new MediaPlayer(media, parent),
    teresse = new MediaPlayer(media, parent);
  t.after(() => {
    eclipse.dispose();
    teresse.dispose();
  });
  eclipse.setPlaybackRate(0.35);
  teresse.setPlaybackRate(0.75);
  eclipse.setPlaying(true);
  teresse.setPlaying(true);
  await Promise.resolve();
  assert.equal(eclipse.video.playbackRate, 0.35);
  assert.equal(teresse.video.playbackRate, 0.75);
  assert.equal(eclipse.video.defaultPlaybackRate, 0.35);
  assert.equal(eclipse.video.currentTime, 2);
  eclipse.setVisible(false);
  assert.equal(eclipse.video.paused, true);
  eclipse.setVisible(true);
  await Promise.resolve();
  assert.equal(eclipse.video.paused, false);
  assert.equal(eclipse.video.currentTime, 2);
  assert.equal(eclipse.video.playbackRate, 0.35);
  eclipse.setPlaybackRate();
  assert.equal(eclipse.video.playbackRate, 1);
  assert.equal(eclipse.video.currentTime, 2);
  assert.equal(teresse.video.playbackRate, 0.75);
  assert.equal(media.videoUrl, "blob:original");
});
