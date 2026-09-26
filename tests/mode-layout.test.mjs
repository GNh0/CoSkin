import assert from "node:assert/strict";
import test from "node:test";
import { createModeLayout } from "../src/renderer/mode-layout.js";

function surface() {
  const values = new Map([
    ["padding-top", ["8px", ""]],
    ["box-sizing", ["content-box", "important"]],
  ]);
  return {
    values,
    style: {
      getPropertyValue: (key) => values.get(key)?.[0] || "",
      getPropertyPriority: (key) => values.get(key)?.[1] || "",
      setProperty: (key, value, priority) => values.set(key, [value, priority]),
      removeProperty: (key) => values.delete(key),
    },
  };
}
test("temporary mode space is reserved once and restores exact styles and priority", () => {
  const first = surface(),
    second = surface();
  let current = first;
  const layout = createModeLayout(
    { querySelector: () => current },
    (element) => ({
      paddingTop: element.style.getPropertyValue("padding-top"),
    }),
  );
  layout.update(true);
  layout.update(true);
  assert.deepEqual(first.values.get("padding-top"), ["72px", "important"]);
  current = second;
  layout.update(true);
  assert.deepEqual(first.values.get("padding-top"), ["8px", ""]);
  layout.dispose();
  assert.deepEqual(second.values.get("padding-top"), ["8px", ""]);
  assert.deepEqual(second.values.get("box-sizing"), [
    "content-box",
    "important",
  ]);
});
