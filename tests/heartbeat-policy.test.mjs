import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  HEARTBEAT_TIMEOUT_MS,
  heartbeatExpired,
} from "../src/renderer/heartbeat-policy.js";

test("secondary window initialization does not dispose the active renderer", () => {
  const attachedAt = 100_000;
  assert.equal(heartbeatExpired(attachedAt + 17_000, attachedAt), false);
  assert.equal(heartbeatExpired(attachedAt + 36_000, attachedAt), false);
  assert.equal(heartbeatExpired(attachedAt + HEARTBEAT_TIMEOUT_MS, attachedAt), false);
  assert.equal(heartbeatExpired(attachedAt + HEARTBEAT_TIMEOUT_MS + 1, attachedAt), true);
  assert.equal(heartbeatExpired(attachedAt + 55_000, attachedAt + 30_000), false);
});
