import test from "node:test";
import assert from "node:assert/strict";
import { ResourceQueue } from "../src/renderer/resource-queue.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("eleven resource reads run at most two at once and start in FIFO order", async () => {
  const queue = new ResourceQueue(2);
  const gates = Array.from({ length: 11 }, deferred);
  const started = [];
  let active = 0;
  let peak = 0;
  const results = gates.map((gate, index) =>
    queue.run(async () => {
      started.push(index);
      active++;
      peak = Math.max(peak, active);
      try {
        return await gate.promise;
      } finally {
        active--;
      }
    }),
  );
  assert.deepEqual(started, [0, 1]);
  for (let index = 0; index < gates.length; index++) {
    gates[index].resolve(index);
    assert.equal(await results[index], index);
    assert.ok(active <= 2);
  }
  assert.deepEqual(started, Array.from({ length: 11 }, (_, index) => index));
  assert.equal(peak, 2);
  assert.equal(active, 0);
  queue.dispose();
});

test("synchronous and asynchronous failures release their slot and keep queued work moving", async () => {
  const queue = new ResourceQueue(1);
  const gate = deferred();
  const started = [];
  const first = queue.run(() => {
    started.push("first");
    return gate.promise;
  });
  const syncError = new Error("sync resource failure");
  const sync = queue.run(() => {
    started.push("sync");
    throw syncError;
  });
  const asyncError = new Error("async resource failure");
  const async = queue.run(async () => {
    started.push("async");
    throw asyncError;
  });
  const last = queue.run(() => {
    started.push("last");
    return "loaded";
  });
  const syncRejected = assert.rejects(sync, (error) => error === syncError);
  const asyncRejected = assert.rejects(async, (error) => error === asyncError);
  assert.deepEqual(started, ["first"]);
  gate.resolve("initial");
  assert.equal(await first, "initial");
  await Promise.all([syncRejected, asyncRejected]);
  assert.equal(await last, "loaded");
  assert.deepEqual(started, ["first", "sync", "async", "last"]);
  queue.dispose();
});

test("dispose cancels all waiting and new jobs with its reason while active jobs keep their outcomes", async () => {
  const queue = new ResourceQueue(2);
  const gates = [deferred(), deferred()];
  const started = [];
  const active = gates.map((gate, index) =>
    queue.run(async () => {
      started.push(index);
      return gate.promise;
    }),
  );
  const waiting = Array.from({ length: 4 }, (_, index) =>
    queue.run(() => started.push(index + 2)),
  );
  const reason = new Error("theme was replaced");
  const canceled = waiting.map((promise) =>
    assert.rejects(promise, (error) => error === reason),
  );
  queue.dispose(reason);
  queue.dispose(new Error("second disposal must not replace the reason"));
  await Promise.all(canceled);
  await assert.rejects(
    queue.run(() => started.push("new")),
    (error) => error === reason,
  );
  assert.deepEqual(started, [0, 1]);
  const runningError = new Error("active read failure");
  const failedActive = assert.rejects(active[1], (error) => error === runningError);
  gates[0].resolve("active read completed");
  gates[1].reject(runningError);
  assert.equal(await active[0], "active read completed");
  await failedActive;
  assert.deepEqual(started, [0, 1]);
});

test("disposal from inside a running job does not start waiting work", async () => {
  const queue = new ResourceQueue(1);
  const gate = deferred();
  const initial = queue.run(() => gate.promise);
  const reason = new Error("stop during resource read");
  const final = queue.run(() => {
    queue.dispose(reason);
    return "running job completed";
  });
  let waitingStarted = false;
  const waiting = queue.run(() => {
    waitingStarted = true;
  });
  const canceled = assert.rejects(waiting, (error) => error === reason);
  gate.resolve();
  await initial;
  assert.equal(await final, "running job completed");
  await canceled;
  assert.equal(waitingStarted, false);
});

test("invalid limits and tasks reject without consuming a working queue slot", async () => {
  for (const limit of [0, -1, 1.5, NaN, Infinity, "2"])
    assert.throws(() => new ResourceQueue(limit), RangeError);
  const queue = new ResourceQueue();
  await assert.rejects(queue.run(null), TypeError);
  assert.equal(await queue.run(() => "valid"), "valid");
  queue.dispose();
  await assert.rejects(queue.run(() => "never"), /disposed/);
});
