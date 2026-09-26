import test from "node:test";
import assert from "node:assert/strict";
import { playbackBudget } from "../src/core/motion-playback.ts";
test("확인 재생은 긴 반복과 지연 및 순차 idle 시간을 보존한다", () => {
  const effect = { durationMs: 3500, iterations: 2, delayMs: 100 };
  assert.equal(
    playbackBudget({ mode: "effects", events: { enter: [effect] } }),
    7100,
  );
  assert.equal(
    playbackBudget({
      mode: "effects",
      events: {
        enter: [{ ...effect, durationMs: 5000, iterations: 3 }],
        idle: [{ ...effect, durationMs: 100, iterations: 2 }],
      },
    }),
    15400,
  );
  assert.equal(
    playbackBudget({
      mode: "effects",
      events: {
        enter: [effect, { ...effect, durationMs: 500 }],
        idle: [{ ...effect, iterations: "infinite" }],
      },
    }),
    15100,
  );
  assert.equal(playbackBudget({ mode: "none" }), 0);
});
