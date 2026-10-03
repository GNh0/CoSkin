import test from "node:test";
import assert from "node:assert/strict";
import { nativeIconFor, ThreadIconLayout } from "../src/renderer/thread-icon.js";
import { CodexAdapter } from "../src/renderer/adapter.js";
import { navigationDestinations } from "../src/core/navigation-targets.js";

function inlineStyle(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, { value, priority: "" }]));
  return {
    getPropertyValue(key) { return values.get(key)?.value || ""; },
    getPropertyPriority(key) { return values.get(key)?.priority || ""; },
    setProperty(key, value, priority = "") { values.set(key, { value, priority }); },
    removeProperty(key) { values.delete(key); },
  };
}

test("chat running and review glyphs are never selected as theme icons", () => {
  const nativeStatus = { style: { visibility: "visible" } };
  const row = { querySelectorAll() { throw Error("Never inspect chat state SVGs for replacement"); } };
  assert.equal(nativeIconFor({ target: "sidebar.thread-row", el: row }), null);
  assert.equal(nativeStatus.style.visibility, "visible");
});

test("leading chat theme icon reserves space and restores layout including later native changes", () => {
  const element = { style: inlineStyle({ "padding-inline-start": "8px" }) };
  const layout = new ThreadIconLayout(element, () => ({ paddingInlineStart: "8px", direction: "ltr" }));
  const box = layout.position({ sizePx: 20, paddingPx: 2 }, { height: 32 });
  assert.equal(box.left, "8px");
  assert.equal(box.right, "auto");
  assert.equal(box.top, "4px");
  assert.equal(element.style.getPropertyValue("padding-inline-start"), "38px");
  layout.position({ sizePx: 18 }, { height: 32 });
  assert.equal(element.style.getPropertyValue("padding-inline-start"), "32px");
  layout.dispose();
  assert.equal(element.style.getPropertyValue("padding-inline-start"), "8px");
  assert.equal(element.style.getPropertyPriority("padding-inline-start"), "");
  layout.position({ sizePx: 16 }, { height: 32 });
  element.style.setProperty("padding-inline-start", "12px");
  layout.dispose();
  assert.equal(element.style.getPropertyValue("padding-inline-start"), "12px");
});

test("default chat icon style reader preserves the native Window receiver", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle");
  let reads = 0;
  Object.defineProperty(globalThis, "getComputedStyle", {
    configurable: true,
    value: function (element) {
      // Window methods reject a layout object as their receiver in Chromium.
      if (this !== undefined && this !== globalThis)
        throw new TypeError("Illegal invocation");
      reads++;
      return { paddingInlineStart: element.style.getPropertyValue("padding-inline-start"), direction: "ltr" };
    },
  });
  try {
    const element = { style: inlineStyle({ "padding-inline-start": "8px" }) };
    const layout = new ThreadIconLayout(element);
    for (let cycle = 0; cycle < 10; cycle++) {
      assert.equal(layout.position({ sizePx: 20 }, { height: 32 }).left, "8px");
      layout.dispose();
      assert.equal(element.style.getPropertyValue("padding-inline-start"), "8px");
    }
    assert.equal(reads, 10);
  } finally {
    if (original) Object.defineProperty(globalThis, "getComputedStyle", original);
    else delete globalThis.getComputedStyle;
  }
});

test("RTL theme icon occupies the leading edge without using the trailing status box", () => {
  const element = { style: inlineStyle() };
  const layout = new ThreadIconLayout(element, () => ({ paddingInlineStart: "6px", direction: "rtl" }));
  const box = layout.position({}, { height: 30 });
  assert.equal(box.left, "auto");
  assert.equal(box.right, "6px");
  assert.equal(box.width, "16px");
  layout.dispose();
  assert.equal(element.style.getPropertyValue("padding-inline-start"), "");
});

test("navigation glyph replacement excludes owned decoration and nested action buttons", () => {
  const button = {};
  const glyph = { closest(selector) { return selector.includes("data-coskin") ? null : button; } };
  const nested = { closest(selector) { return selector.includes("data-coskin") ? null : {}; } };
  const owned = { closest() { return {}; } };
  button.querySelectorAll = () => [glyph, nested, owned];
  assert.equal(nativeIconFor({ target: "navigation.projects", el: button }), glyph);
});

test("More menu destinations use observed IDs and ignore mounted hidden duplicates", () => {
  const visible = new Map(navigationDestinations.map(([id]) => [id, {
    id, closest: () => null, getBoundingClientRect: () => ({ width: 180, height: 32 }),
  }]));
  const hidden = { closest: () => null, getBoundingClientRect: () => ({ width: 0, height: 0 }) };
  const document = {
    querySelector: () => null,
    querySelectorAll(selector) {
      const id = /data-sidebar-destination="builtin:([a-z-]+)"/.exec(selector)?.[1];
      return visible.has(id) ? [hidden, visible.get(id)] : [];
    },
  };
  const adapter = new CodexAdapter(document);
  const targets = adapter.discover();
  for (const [id, target] of navigationDestinations) {
    assert.ok(adapter.supportedTargets.includes(target));
    assert.equal(targets.find((item) => item.target === target)?.el, visible.get(id));
  }
  assert.equal(targets.length, navigationDestinations.length);
  assert.equal(targets.find((item) => item.target === "navigation.code-review").el.id, "pull-requests");
});
