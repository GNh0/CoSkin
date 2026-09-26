import test from "node:test";
import assert from "node:assert/strict";
import { NativePaintScope } from "../src/renderer/native-paint.js";
const element = () => {
  const values = new Map();
  let writes = 0;
  return {
    get writes() {
      return writes;
    },
    style: {
      getPropertyValue: (key) => values.get(key)?.value || "",
      getPropertyPriority: (key) => values.get(key)?.priority || "",
      setProperty(key, value, priority = "") {
        values.set(key, { value, priority });
        writes++;
      },
      removeProperty(key) {
        values.delete(key);
        writes++;
      },
    },
  };
};
test("겹치는 앱·본문 paint 소유자는 종료 순서와 무관하게 원래 inline 우선순위를 복원한다", () => {
  for (const order of [
    [0, 1],
    [1, 0],
  ]) {
    const node = element();
    node.style.setProperty("background-color", "navy", "important");
    const scopes = [new NativePaintScope(), new NativePaintScope()];
    scopes[0].set(node, "background-color", "transparent");
    scopes[1].set(node, "background-color", "transparent");
    const writes = node.writes;
    scopes[1].set(node, "background-color", "transparent");
    assert.equal(node.writes, writes);
    scopes[order[0]].dispose();
    assert.equal(
      node.style.getPropertyValue("background-color"),
      "transparent",
    );
    scopes[order[1]].dispose();
    assert.equal(node.style.getPropertyValue("background-color"), "navy");
    assert.equal(
      node.style.getPropertyPriority("background-color"),
      "important",
    );
  }
});
test("React가 변경한 최신 inline paint 및 없던 속성은 마지막 소유권 해제 때 보존한다", () => {
  const node = element(),
    scope = new NativePaintScope();
  scope.set(node, "background-image", "none");
  scope.dispose();
  assert.equal(node.style.getPropertyValue("background-image"), "");
  scope.set(node, "background-color", "transparent");
  node.style.setProperty("background-color", "blue");
  scope.set(node, "background-color", "transparent");
  scope.dispose();
  assert.equal(node.style.getPropertyValue("background-color"), "blue");
  assert.equal(node.style.getPropertyPriority("background-color"), "");
});

test("CSSOM 색상 정규화는 자기 쓰기로 유지하며 반복 mutation 없이 원래 색과 우선순위를 복원한다", () => {
  const makeStyle = () => {
    const values = new Map();
    return {
      getPropertyValue: (key) => values.get(key)?.value || "",
      getPropertyPriority: (key) => values.get(key)?.priority || "",
      setProperty(key, value, priority = "") {
        values.set(key, { value: value.replace(/,\s*/g, ", "), priority });
      },
      removeProperty(key) {
        values.delete(key);
      },
    };
  };
  const style = makeStyle();
  let writes = 0;
  const set = style.setProperty;
  style.setProperty = (...args) => {
    writes++;
    set(...args);
  };
  const node = {
    style,
    ownerDocument: { createElement: () => ({ style: makeStyle() }) },
  };
  style.setProperty("background-color", "rgb(45,45,45)", "important");
  const scope = new NativePaintScope();
  scope.set(node, "background-color", "rgba(16,29,53,0.65)", "important");
  const initialWrites = writes;
  scope.set(node, "background-color", "rgba(16, 29, 53, 0.65)", "important");
  scope.set(node, "background-color", "rgba(16,29,53,0.65)", "important");
  assert.equal(writes, initialWrites);
  scope.set(node, "--coskin-summary-header-paint", "rgba(16,29,53,0.65)");
  scope.dispose();
  assert.equal(style.getPropertyValue("background-color"), "rgb(45, 45, 45)");
  assert.equal(style.getPropertyPriority("background-color"), "important");
  assert.equal(style.getPropertyValue("--coskin-summary-header-paint"), "");
});
