import test from "node:test";
import assert from "node:assert/strict";
import { mutationNeedsDiscovery } from "../src/renderer/mutation-impact.js";
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
