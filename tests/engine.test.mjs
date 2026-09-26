import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  resolve,
  validateTheme,
  pathValid,
  keyframes,
  EFFECTS,
} from "../src/core/engine.ts";
test("예제 선언형 계약을 검증한다", () => {
  validateTheme(
    JSON.parse(fs.readFileSync("docs/examples/theme.json", "utf8")),
    ["assets/search.png"],
  );
});
test("범위를 합성한 후 상태 우선순위를 계산한다", () => {
  const global = {
    rules: [
      {
        target: "sidebar.thread-row",
        states: {
          base: {
            style: {
              background: { color: "#000000", opacity: 0.1 },
              text: { color: "#ffffff" },
            },
          },
          selected: { style: { background: { opacity: 0.2 } } },
          hover: { style: { background: { opacity: 0.3 } } },
          selectedHover: { style: { background: { opacity: 0.4 } } },
          focusVisible: { style: { border: { color: "#ffffff" } } },
          disabled: { motion: { mode: "none" } },
        },
      },
    ],
  };
  const thread = {
    rules: [
      {
        target: "sidebar.thread-row",
        states: { base: { style: { background: { color: "#445566" } } } },
      },
    ],
  };
  assert.deepEqual(
    resolve([global, thread], "sidebar.thread-row", null, {
      selected: true,
      hover: true,
      disabled: true,
    }),
    {
      style: {
        background: { color: "#445566", opacity: 0.4 },
        text: { color: "#ffffff" },
      },
      motion: { mode: "none" },
    },
  );
});
test("효과 없음은 상속한 효과를 차단하고 정적 배경을 유지한다", () => {
  const a = {
    rules: [
      {
        target: "navigation.search",
        states: {
          base: {
            style: { background: { opacity: 0.2 } },
            motion: { mode: "effects", events: { enter: [] } },
          },
        },
      },
    ],
  };
  const b = {
    rules: [
      {
        target: "navigation.search",
        states: { base: { motion: { mode: "none" } } },
      },
    ],
  };
  const value = resolve([a, b], "navigation.search", null, {});
  assert.equal(value.motion.mode, "none");
  assert.equal(value.style.background.opacity, 0.2);
});
test("null은 지정된 레이어를 지우고 다른 레이어를 보존한다", () => {
  const a = {
    rules: [
      {
        target: "navigation.search",
        states: {
          base: {
            style: { background: { opacity: 0.2 }, icon: { opacity: 1 } },
          },
        },
      },
    ],
  };
  const b = {
    rules: [
      {
        target: "navigation.search",
        states: { base: { style: { background: null } } },
      },
    ],
  };
  assert.deepEqual(resolve([a, b], "navigation.search", null, {}).style, {
    background: null,
    icon: { opacity: 1 },
  });
});
test("경로 횡단·예약 파일·외부 경로를 거절한다", () => {
  for (const path of [
    "../assets/a.png",
    "assets/../a.png",
    "assets//a.png",
    "assets/con.png",
    "assets/a.",
    "C:/a.png",
    "assets\\a.png",
    "https://x/a.png",
    "Assets/a.png",
  ])
    assert.equal(pathValid(path), false, path);
  assert.equal(pathValid("assets/icon-1.png"), true);
});
test("미지의 속성·자산 참조·임의 CSS를 거절한다", () => {
  for (const style of [
    { background: { color: "red" } },
    { background: { image: "assets/missing.png" } },
    { background: { css: "display:none" } },
    { text: { opacity: -1 } },
  ])
    assert.throws(() =>
      validateTheme(
        {
          profiles: [
            {
              id: "x",
              name: "x",
              rules: [
                {
                  id: "r",
                  target: "navigation.search",
                  states: { base: { style } },
                },
              ],
            },
          ],
        },
        [],
      ),
    );
});
test("모든 등록 효과는 코드 소유 키프레임을 생성한다", () => {
  for (const [effect, spec] of Object.entries(EFFECTS)) {
    const parameters = Object.fromEntries(
      Object.entries(spec.parameters).map(([k, v]) => [k, v[0]]),
    );
    assert.ok(
      keyframes({ effect, parameters, reverse: false }).length >= 2,
      effect,
    );
  }
});
const example = () =>
  JSON.parse(fs.readFileSync("docs/examples/theme.json", "utf8"));
test("잘못된 색상 타입·빈 ID·중복 대상·미리보기 자산 참조를 거절한다", () => {
  const invalid = [];
  let value = example();
  value.profiles[0].rules[0].states.base.style.background.color = ["#ffffff"];
  invalid.push(value);
  value = example();
  value.profiles[0].rules[0].id = "";
  invalid.push(value);
  value = example();
  value.profiles[0].rules.push(structuredClone(value.profiles[0].rules[0]));
  invalid.push(value);
  value = example();
  value.profiles[0].rules[0].states.base.style.icon = {
    image: "preview/search.png",
  };
  invalid.push(value);
  value = example();
  value.profiles[0].id = "x".repeat(10000);
  invalid.push(value);
  for (const theme of invalid)
    assert.throws(() =>
      validateTheme(theme, ["assets/search.png", "preview/search.png"]),
    );
});
import { UiSession } from "../src/core/ui-session.ts";
test("UI modes are exclusive and preview/edit return to their originating page", () => {
  const session = new UiSession();
  session.show("detail");
  session.preview();
  assert.equal(session.previewing, true);
  assert.equal(session.editing, false);
  session.finish();
  assert.deepEqual(session.view, { kind: "page", page: "detail" });
  session.edit();
  assert.equal(session.previewing, false);
  assert.equal(session.editing, true);
  session.hide();
  assert.equal(session.editing, false);
  session.show();
  assert.equal(session.page, "detail");
});
import { createTimeline, advanceTimeline } from "../src/core/media-timeline.ts";
test("finite GIF loop metadata preserves the last frame; infinite GIF loops continue", () => {
  const finite = createTimeline(0, 20);
  assert.equal(advanceTimeline(finite, [20, 30], 1, 19), false);
  assert.equal(advanceTimeline(finite, [20, 30], 1, 20), true);
  assert.equal(finite.index, 1);
  assert.equal(advanceTimeline(finite, [20, 30], 1, 50), false);
  assert.equal(finite.ended, true);
  assert.equal(finite.index, 1);
  const infinite = createTimeline(0, 20);
  for (let now = 20; now < 1000; now += 30)
    advanceTimeline(infinite, [20, 30], 0, now);
  assert.equal(infinite.ended, false);
  assert.ok(infinite.completedLoops > 1);
});
import { defaultThemes } from "../src/core/default-themes.ts";
import { validateManifest } from "../src/core/engine.ts";
test("built-in themes are real, distinct validated themes without external assets", () => {
  assert.equal(defaultThemes.length, 3);
  const colors = new Set();
  for (const doc of defaultThemes) {
    validateManifest(doc.manifest);
    validateTheme(doc.theme, []);
    assert.equal(Object.keys(doc.assets).length, 0);
    colors.add(
      doc.theme.profiles[0].rules[0].states.base.style.background.color,
    );
  }
  assert.equal(colors.size, 3);
});

import { moveTargetState } from "../src/core/target-scope.ts";
test("전체 행으로 이동하면 미래 행에도 적용하고 다른 상태·대상은 보존한다", () => {
  const document = {
    manifest: {},
    assets: {},
    theme: { profiles: [{ id: "default", name: "Default", rules: [] }] },
    localOverrides: {
      default: [
        {
          id: "a",
          target: "sidebar.project-row",
          item: "a",
          states: {
            hover: {
              style: { background: { image: "assets/a.png", opacity: 0.65 } },
            },
            selected: { style: { background: { color: "#ffffff" } } },
          },
        },
        {
          id: "b",
          target: "sidebar.project-row",
          item: "b",
          states: { hover: { style: { background: { color: "#000000" } } } },
        },
        {
          id: "chat",
          target: "sidebar.thread-row",
          item: "a",
          states: { hover: { style: { text: { color: "#ffffff" } } } },
        },
      ],
    },
  };
  const before = structuredClone(document);
  moveTargetState(
    document,
    "default",
    "sidebar.project-row",
    "a",
    "hover",
    true,
  );
  const profile = document.theme.profiles[0];
  assert.equal(
    resolve([profile], "sidebar.project-row", "future", { hover: true }).style
      .background.image,
    "assets/a.png",
  );
  assert.equal(
    document.localOverrides.default.find((rule) => rule.id === "a").states
      .selected.style.background.color,
    "#ffffff",
  );
  assert.ok(
    !document.localOverrides.default.some(
      (rule) => rule.target === "sidebar.project-row" && rule.states.hover,
    ),
  );
  assert.ok(
    document.localOverrides.default.find((rule) => rule.id === "chat").states
      .hover,
  );
  moveTargetState(
    document,
    "default",
    "sidebar.project-row",
    "individual",
    "hover",
    false,
  );
  assert.equal(
    document.localOverrides.default.find((rule) => rule.item === "individual")
      .states.hover.style.background.image,
    "assets/a.png",
  );
  assert.equal(
    before.localOverrides.default[0].states.hover.style.background.opacity,
    0.65,
  );
});
test("페이드와 흐림은 정적 레이어의 불투명도·필터를 보존한다", () => {
  const effect = { effect: "fade", parameters: { from: 0 }, reverse: false };
  assert.deepEqual(keyframes(effect, { opacity: 0.25 }), [
    { opacity: 0 },
    { opacity: 0.25 },
  ]);
  assert.equal(
    keyframes(
      { ...effect, effect: "blur.clear", parameters: { blurPx: 8 } },
      { filter: "blur(3px)" },
    ).at(-1).filter,
    "blur(0px) blur(3px)",
  );
});
import { defaultTargetSelection } from "../src/core/target-scope.ts";
import { isMotionPaused } from "../src/core/motion-policy.ts";
test("행 우클릭은 전체 편집을 기본으로 하고 클릭한 ID는 보존한다", () => {
  for (const target of ["sidebar.project-row", "sidebar.thread-row"])
    assert.deepEqual(defaultTargetSelection(target, "picked"), {
      pickedItem: "picked",
      targetItem: null,
    });
  assert.equal(
    defaultTargetSelection("navigation.home", null).targetItem,
    null,
  );
});
test("앱 움직임 허용은 OS 감소 설정만 재정의하며 native 정지는 유지한다", () => {
  assert.equal(isMotionPaused(undefined, true, false), true);
  assert.equal(isMotionPaused("allow", true, false), false);
  assert.equal(isMotionPaused("allow", false, true), true);
  assert.equal(isMotionPaused("off", false, false), true);
});
import { inheritImageAppearance } from "../src/core/image-inheritance.ts";
test("같은 이미지의 조건별 맞춤을 통일해도 효과·다른 이미지·다른 대상은 유지한다", () => {
  const background = { image: "assets/a.png", fit: "cover", opacity: 0.45 };
  const motion = { mode: "effects", events: { enter: [] } };
  const local = {
    target: "sidebar.project-row",
    item: "one",
    states: {
      hover: {
        style: {
          background: {
            image: "assets/a.png",
            fit: "contain",
            opacity: 0.5,
            color: "#ffffff",
          },
        },
        motion,
      },
      selected: {
        style: { background: { image: "assets/b.png", fit: "contain" } },
      },
    },
  };
  const doc = {
    theme: {
      profiles: [
        {
          id: "default",
          rules: [
            {
              target: "sidebar.project-row",
              states: { base: { style: { background } } },
            },
          ],
        },
      ],
    },
    localOverrides: {
      default: [
        local,
        {
          target: "sidebar.thread-row",
          states: {
            hover: {
              style: { background: { image: "assets/a.png", fit: "contain" } },
            },
          },
        },
      ],
    },
  };
  const before = structuredClone(doc);
  assert.equal(
    inheritImageAppearance(
      doc,
      "default",
      "sidebar.project-row",
      null,
      "background",
      background,
    ),
    1,
  );
  assert.deepEqual(doc, before);
  inheritImageAppearance(
    doc,
    "default",
    "sidebar.project-row",
    null,
    "background",
    background,
    true,
  );
  assert.deepEqual(local.states.hover.style.background, {
    color: "#ffffff",
    opacity: 0.5,
  });
  assert.deepEqual(local.states.hover.motion, motion);
  assert.equal(local.states.selected.style.background.image, "assets/b.png");
  assert.equal(
    doc.localOverrides.default[1].states.hover.style.background.fit,
    "contain",
  );
});
test("이미지 계승 정리는 다른 항목의 기본 이미지와 명시적인 숨김을 보존한다", () => {
  const base = { image: "assets/a.png", fit: "cover", opacity: 0.45 };
  const hidden = {
    target: "sidebar.project-row",
    item: "hidden",
    states: {
      hover: { style: { background: { image: null, fit: "contain" } } },
    },
  };
  const other = {
    target: "sidebar.project-row",
    item: "other",
    states: {
      base: { style: { background: { image: "assets/b.png" } } },
      hover: { style: { background: { fit: "contain", opacity: 0.6 } } },
    },
  };
  const doc = {
    theme: {
      profiles: [
        {
          id: "default",
          rules: [
            {
              target: "sidebar.project-row",
              states: { base: { style: { background: base } } },
            },
          ],
        },
      ],
    },
    localOverrides: { default: [hidden, other] },
  };
  const before = structuredClone(doc);
  assert.equal(
    inheritImageAppearance(
      doc,
      "default",
      "sidebar.project-row",
      null,
      "background",
      base,
      true,
      true,
    ),
    0,
  );
  assert.deepEqual(doc, before);
});

test("결과물·소스 패널은 배경과 원래 텍스트를 독립적으로 합성한다", () => {
  const profile = {
    id: "summary",
    name: "Summary",
    rules: [
      {
        id: "summary.rule",
        target: "summary.surface",
        states: {
          base: { style: { background: { color: "#101d35", opacity: 0.65 } } },
        },
      },
    ],
  };
  validateTheme({ profiles: [profile] }, []);
  const state = resolve([profile], "summary.surface", null, {});
  assert.equal(state.style.background.opacity, 0.65);
  assert.equal(state.style.text, undefined);
  assert.equal(state.style.icon, undefined);
});
