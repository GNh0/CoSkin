import test from "node:test";
import assert from "node:assert/strict";
import { mutationNeedsDiscovery } from "../src/renderer/mutation-impact.js";
import { pauseMediaForScroll } from "../src/renderer/scroll-media-policy.js";
import {
  createTimeline,
  advanceTimeline,
  pauseTimeline,
  resumeTimeline,
} from "../src/core/media-timeline.ts";

const node = ({
  owned = false,
  relevant = false,
  descendant = false,
  type = 1,
} = {}) => ({
  nodeType: type,
  closest: () => (owned ? {} : null),
  matches: () => relevant,
  querySelector: () => (descendant ? {} : null),
});
test("대화 스크롤은 배경과 목록 GIF를 멈추지 않고 위치 측정을 하지 않는다", () => {
  const eventTarget = {
    closest: () => null,
    getBoundingClientRect() {
      throw Error("스크롤 정책의 위치 측정 금지");
    },
  };
  for (const target of [
    "app.background",
    "main.surface",
    "sidebar.surface",
    "sidebar.project-row",
    "sidebar.thread-row",
  ])
    assert.equal(pauseMediaForScroll({ target, el: {} }, eventTarget), false);
});
test("왼쪽 목록 스크롤은 그 목록의 움직이는 행만 정지하고 고정 배경은 유지한다", () => {
  const row = {};
  const unrelated = {};
  const eventTarget = {
    closest: () => ({ contains: (element) => element === row }),
  };
  assert.equal(
    pauseMediaForScroll({ target: "sidebar.thread-row", el: row }, eventTarget),
    true,
  );
  assert.equal(
    pauseMediaForScroll(
      { target: "sidebar.project-row", el: unrelated },
      eventTarget,
    ),
    false,
  );
  for (const target of [
    "app.background",
    "main.surface",
    "sidebar.surface",
    "navigation.home",
  ])
    assert.equal(pauseMediaForScroll({ target, el: row }, eventTarget), false);
});
test("본문 텍스트 및 자체 장식 변경은 전체 대상 재탐색을 일으키지 않는다", () => {
  const body = node();
  assert.equal(
    mutationNeedsDiscovery([
      {
        type: "childList",
        target: body,
        addedNodes: [node({ type: 3 }), node()],
        removedNodes: [],
      },
    ]),
    false,
  );
  assert.equal(
    mutationNeedsDiscovery([
      {
        type: "childList",
        target: body,
        addedNodes: [node({ owned: true, relevant: true })],
        removedNodes: [],
      },
    ]),
    false,
  );
  assert.equal(
    mutationNeedsDiscovery([
      { type: "attributes", target: node({ owned: true }) },
    ]),
    false,
  );
  assert.equal(
    mutationNeedsDiscovery([
      {
        type: "childList",
        target: body,
        addedNodes: [node({ descendant: true })],
        removedNodes: [],
      },
    ]),
    true,
  );
  assert.equal(
    mutationNeedsDiscovery([
      {
        type: "childList",
        target: body,
        addedNodes: [],
        removedNodes: [node({ relevant: true })],
      },
    ]),
    true,
  );
});
test("스크롤 중 GIF 시계는 현재 프레임과 반복 횟수를 보존하고 남은 지연부터 재개한다", () => {
  const timeline = createTimeline(0, 100);
  advanceTimeline(timeline, [100, 200, 300], 0, 100);
  assert.equal(timeline.index, 1);
  pauseTimeline(timeline, 140);
  pauseTimeline(timeline, 180);
  assert.equal(advanceTimeline(timeline, [100, 200, 300], 0, 2000), false);
  resumeTimeline(timeline, 1140);
  assert.equal(timeline.next, 1300);
  assert.equal(timeline.index, 1);
  assert.equal(timeline.completedLoops, 0);
  assert.equal(advanceTimeline(timeline, [100, 200, 300], 0, 1299), false);
  assert.equal(advanceTimeline(timeline, [100, 200, 300], 0, 1300), true);
  assert.equal(timeline.index, 2);
});
