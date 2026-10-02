import assert from "node:assert/strict";
import test from "node:test";
import {
  CodexAdapter,
  visibleMainSurfaces,
  visibleComposerSurfaces,
} from "../src/renderer/adapter.js";

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
test("new main surface variants use the common marker and hidden cached pages are excluded", () => {
  const dot = { ...main(700, 800), closest: () => null };
  const future = { ...main(600, 800), closest: () => null };
  const hidden = { ...main(600, 800), closest: () => ({}) };
  const document = {
    querySelectorAll: (selector) => {
      assert.equal(selector.includes('="default"'), false);
      assert.ok(selector.includes('[role="main"]'));
      return [dot, future, hidden];
    },
  };
  assert.deepEqual(visibleMainSurfaces(document), [dot, future]);
});

function composer(width, height, root, hidden = false, editable = true) {
  return {
    getBoundingClientRect: () => ({ width, height }),
    querySelector: () => (editable ? {} : null),
    closest: (selector) =>
      selector.includes("aria-hidden") ? (hidden ? {} : null) : root,
  };
}
test("a hidden cached tab cannot remove the visible composer decoration", () => {
  const root = { closest: () => null };
  const visible = composer(680, 120, root);
  const surfaces = [composer(0, 0, {}), visible, composer(600, 120, {}, true)];
  const document = {
    querySelector: () => null,
    querySelectorAll: (selector) =>
      selector === "[data-composer-surface-variant][data-composer-layout]"
        ? surfaces
        : [],
  };
  assert.deepEqual(visibleComposerSurfaces(document), [root]);
  assert.deepEqual(
    new CodexAdapter(document).discover().map(({ target, el }) => [target, el]),
    [["composer.surface", root]],
  );
});
test("two visible markers sharing one composer root are not ambiguous", () => {
  const root = {};
  const document = {
    querySelectorAll: () => [
      composer(600, 120, root),
      composer(600, 90, root),
      composer(600, 90, {}, false, false),
    ],
  };
  assert.deepEqual(visibleComposerSurfaces(document), [root]);
});
