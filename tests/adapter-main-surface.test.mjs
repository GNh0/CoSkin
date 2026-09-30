import assert from "node:assert/strict";
import test from "node:test";
import { visibleMainSurfaces } from "../src/renderer/adapter.js";

function main(width, height) {
  return { getBoundingClientRect: () => ({ width, height }) };
}

test("hidden tab mains do not receive the visible chat surface decoration", () => {
  const hidden = main(0, 0);
  const visible = main(1154, 879);
  const document = {
    querySelectorAll: () => [hidden, main(0, 0), visible, main(0, 0)],
  };
  assert.deepEqual(visibleMainSurfaces(document), [visible]);
});

test("every visible main surface is discovered during split layout", () => {
  const left = main(600, 879);
  const right = main(554, 879);
  const document = {
    querySelectorAll: () => [main(0, 0), left, right],
  };
  assert.deepEqual(visibleMainSurfaces(document), [left, right]);
});
