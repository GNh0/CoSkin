import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  validateCustomEffects,
  hydrateCustomProfile,
} from "../src/core/custom-effects.ts";
import { keyframes, validateTheme } from "../src/core/engine.ts";
const definition = JSON.parse(
  fs.readFileSync("docs/examples/soft-rise.coskin-effect.json", "utf8"),
).definition;
test("사용자 효과는 수치 계약으로 컴파일하고 정적 불투명도 및 역방향 위치를 보존한다", () => {
  validateCustomEffects([definition]);
  const effect = {
    id: "one",
    layer: "background",
    effect: definition.id,
    effectVersion: 1,
    durationMs: 500,
    delayMs: 0,
    easing: "ease-out",
    iterations: 1,
    reverse: true,
    parameters: {},
  };
  const profile = {
    id: "default",
    name: "default",
    rules: [
      {
        id: "rule",
        target: "main.surface",
        states: {
          base: {
            motion: {
              mode: "effects",
              trigger: "hover",
              events: { enter: [effect] },
            },
          },
        },
      },
    ],
  };
  const theme = { profiles: [profile], customEffects: [definition] };
  validateTheme(theme);
  const hydrated = hydrateCustomProfile(profile, [definition]);
  const frames = keyframes(
    hydrated.rules[0].states.base.motion.events.enter[0],
    { opacity: 0.25 },
  );
  assert.deepEqual(
    frames.map((frame) => frame.offset),
    [0, 0.35, 1],
  );
  assert.deepEqual(
    frames.map((frame) => frame.opacity),
    [0.25, 0.2, 0],
  );
  assert.equal(
    profile.rules[0].states.base.motion.events.enter[0].customDefinition,
    undefined,
  );
});
test("사용자 효과의 코드·URL·비유한 수치·중복 위치·무제한 반복을 거절한다", () => {
  for (const mutate of [
    (d) => (d.frames[0].values.url = "https://example.com"),
    (d) => (d.frames[0].values.opacity = NaN),
    (d) => (d.frames[1].offset = 0),
    (d) => (d.frames[0].values.transform = "rotate(1deg)"),
    (d) => (d.version = 2),
    (d) => (d.name = "x".repeat(81)),
    (d) => (d.frames[0].values.translateYPx = 1001),
  ]) {
    const bad = structuredClone(definition);
    mutate(bad);
    assert.throws(() => validateCustomEffects([bad]));
  }
  assert.throws(() => validateCustomEffects(Array(33).fill(definition)));
  const effect = {
    id: "one",
    layer: "background",
    effect: definition.id,
    effectVersion: 1,
    durationMs: 500,
    delayMs: 0,
    easing: "ease-out",
    iterations: "infinite",
    reverse: false,
    parameters: {},
  };
  assert.throws(() =>
    validateTheme({
      profiles: [
        {
          id: "default",
          name: "default",
          rules: [
            {
              id: "rule",
              target: "main.surface",
              states: {
                base: {
                  motion: { mode: "effects", events: { idle: [effect] } },
                },
              },
            },
          ],
        },
      ],
      customEffects: [definition],
    }),
  );
});
