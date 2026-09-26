import test from "node:test";
import assert from "node:assert/strict";
import { CodexAdapter } from "../src/renderer/adapter.js";

test("호스트가 확인한 새 Codex 버전을 어댑터 상태에 전달한다", () => {
  const adapter = new CodexAdapter({}, "26.924.22138");
  assert.equal(adapter.version, "26.924.22138");
  assert.ok(adapter.supportedTargets.includes("sidebar.project-row"));
  assert.ok(adapter.supportedTargets.includes("composer.surface"));
});
test("기존 호스트의 어댑터 계약은 유지한다", () => {
  assert.equal(new CodexAdapter({}).version, "26.924.20706");
});
test("알 수 없는 호스트 버전을 지원 어댑터로 취급하지 않는다", () => {
  assert.throws(() => new CodexAdapter({}, "26.924.22139"), /Unsupported/);
});
