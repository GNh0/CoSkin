import test from "node:test";
import assert from "node:assert/strict";
import {
  paletteFromPixels,
  contrastRatio,
  readableThemeColor,
  blendColors,
} from "../src/core/theme-colors.js";
import { validateTheme } from "../src/core/engine.ts";
import { applyThemeTypography } from "../src/renderer/theme-typography.js";
test("automatic text stays near white over a bright video behind a dark translucent surface", () => {
  const surfaces = ["#000000", "#ffffff"].map((color) =>
    blendColors("#141820", color, 0.64),
  );
  const color = readableThemeColor("#997d77", surfaces);
  assert.ok(parseInt(color.slice(1, 3), 16) >= 235);
  for (const surface of surfaces)
    assert.ok(contrastRatio(color, surface) >= 4.5);
  const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
  assert.deepEqual(paletteFromPixels(pixels).bounds, ["#000000", "#ffffff"]);
});
test("automatic color considers changing video frames and nested sidebar surfaces without changing saved styles", () => {
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        drawImage() {},
        getImageData: () => ({
          data: new Uint8ClampedArray([150, 80, 100, 255]),
        }),
      }),
    }),
  };
  try {
    const media = { videoUrl: "blob:fixture", frames: [{ image: {} }] };
    const profiles = [
      {
        autoTextColor: true,
        rules: [
          {
            id: "wallpaper",
            target: "app.background",
            states: {
              base: { style: { background: { image: "video", opacity: 1 } } },
            },
          },
          {
            id: "sidebar",
            target: "sidebar.surface",
            states: {
              base: {
                style: { background: { color: "#171921", opacity: 0.91 } },
              },
            },
          },
        ],
      },
    ];
    const style = { background: { color: "#141820", opacity: 0.075 } };
    const final = { style: structuredClone(style) };
    assert.doesNotThrow(() =>
      applyThemeTypography(
        { style: structuredClone(style) },
        profiles,
        () => "",
        "main.surface",
      ),
    );
    applyThemeTypography(final, profiles, () => media, "main.surface");
    for (const frame of ["#000000", "#ffffff"])
      assert.ok(
        contrastRatio(
          final.style.text.color,
          blendColors("#141820", frame, final.style.background.opacity),
        ) >= 4.5,
      );
    assert.equal(style.background.opacity, 0.075);
    const row = { style: { background: { color: "#e4add0", opacity: 0.08 } } };
    applyThemeTypography(row, profiles, () => media, "sidebar.project-row");
    assert.equal(row.style.background.opacity, 0.08);
    assert.ok(
      contrastRatio(
        row.style.text.color,
        blendColors("#e4add0", blendColors("#171921", "#ffffff", 0.91), 0.08),
      ) >= 4.5,
    );
  } finally {
    delete globalThis.document;
  }
});
test("theme colors retain a palette tint and meet 4.5 contrast against the estimated surface across light, dark and mid tones", () => {
  for (const accent of ["#fa7dbb", "#0084ff", "#54e596"])
    for (const background of [
      "#ffffff",
      "#000000",
      "#777777",
      "#1b2838",
      "#dad7ee",
    ])
      assert.ok(
        contrastRatio(readableThemeColor(accent, background), background) >=
          4.5,
      );
  const pixels = new Uint8ClampedArray([
    255, 255, 255, 255, 210, 50, 120, 255, 220, 55, 125, 255, 0, 0, 0, 0,
  ]);
  const palette = paletteFromPixels(pixels);
  assert.equal(palette.accent, "#d7357b");
  assert.notEqual(readableThemeColor(palette.accent, "#181821"), "#ffffff");
});
test("automatic text has an explicit manual and original-color override and rejects nonboolean contract values", () => {
  const profiles = [{ rules: [], autoTextColor: true }];
  const original = { style: { text: { autoColor: false, color: "#abcdef" } } };
  applyThemeTypography(original, profiles, () => null);
  assert.equal(original.style.text.color, "#abcdef");
  assert.equal(original.style.text.cascade, true);
  const manualFont = {
    style: { text: { autoColor: false, family: "Malgun Gothic" } },
  };
  applyThemeTypography(manualFont, profiles, () => null);
  assert.equal(manualFont.style.text.family, "Malgun Gothic");
  assert.equal(manualFont.style.text.cascade, true);
  const inherited = { style: { text: null } };
  applyThemeTypography(inherited, profiles, () => null);
  assert.equal(inherited.style.text, null);
  const automatic = { style: { background: { color: "#171721" } } };
  applyThemeTypography(automatic, profiles, () => null);
  assert.equal(automatic.style.text.cascade, true);
  const theme = {
    autoTextColor: true,
    profiles: [
      {
        id: "default",
        name: "Default",
        rules: [
          {
            id: "text",
            target: "main.surface",
            states: {
              base: { style: { text: { autoColor: false, color: "#abcdef" } } },
            },
          },
        ],
      },
    ],
  };
  validateTheme(theme, []);
  validateTheme({ ...theme, fontFamily: "맑은 고딕" }, []);
  assert.throws(() =>
    validateTheme(
      { ...theme, fontFamily: "url(https://example.com/font)" },
      [],
    ),
  );
  assert.throws(() => validateTheme({ ...theme, autoTextColor: "true" }, []));
  theme.profiles[0].rules[0].states.base.style.text.autoColor = "false";
  assert.throws(() => validateTheme(theme, []));
});
