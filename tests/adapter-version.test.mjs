import test from "node:test";
import assert from "node:assert/strict";
import { CodexAdapter } from "../src/renderer/adapter.js";

test("호스트가 확인한 새 Codex 버전을 어댑터 상태에 전달한다", () => {
  const adapter = new CodexAdapter({}, "26.924.22138");
  assert.equal(adapter.version, "26.924.22138");
  assert.ok(adapter.supportedTargets.includes("sidebar.project-row"));
  assert.ok(adapter.supportedTargets.includes("composer.surface"));
});
test("버전 정보 없는 기존 호스트도 대상 마커를 탐색할 수 있다", () => {
  assert.equal(new CodexAdapter({}).version, "unknown");
});
test("버전 목록이 아닌 실제 DOM 마커로 지원 영역을 탐색한다", () => {
  const document = { querySelector: () => null, querySelectorAll: () => [] };
  const adapter = new CodexAdapter(document, "27.101.99999");
  assert.equal(adapter.version, "27.101.99999");
  assert.deepEqual(adapter.discover(), []);
});
