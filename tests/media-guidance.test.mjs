import test from "node:test";
import assert from "node:assert/strict";
import { assetGuidance } from "../src/core/media-guidance.js";
test("image recommendations follow measured regions and distinguish wide rows, background and square icons", () => {
  const row = assetGuidance("sidebar.project-row", "background", {
    width: 300,
    height: 30,
  });
  assert.equal(row.aspect, "10:1");
  assert.equal(row.recommended, "1200 × 120");
  assert.equal(row.measured, true);
  assert.equal(row.gif, "768 × 80");
  const background = assetGuidance("app.background", "background", {
    width: 1600,
    height: 900,
  });
  assert.equal(background.aspect, "16:9");
  assert.equal(background.recommended, "1920 × 1080");
  const icon = assetGuidance("navigation.home", "icon", {
    width: 800,
    height: 600,
  });
  assert.equal(icon.aspect, "1:1");
  assert.equal(icon.recommended, "256 × 256");
  assert.equal(icon.gif, "128 × 128");
  const unavailable = assetGuidance("main.surface", "decoration");
  assert.equal(unavailable.aspect, "16:10");
  assert.equal(unavailable.measured, false);
});
