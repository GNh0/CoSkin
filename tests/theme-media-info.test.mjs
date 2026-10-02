import test from "node:test";
import assert from "node:assert/strict";
import {
  BackgroundInfoCache,
  backgroundMediaLabel,
  formatMediaDuration,
} from "../src/renderer/theme-media-info.js";

test("actual video duration is formatted independently of poster/profile labels", () => {
  globalThis.document = { documentElement: { lang: "ko" } };
  assert.equal(formatMediaDuration(223.5667), "3:44");
  assert.equal(formatMediaDuration(3723), "1:02:03");
  assert.equal(formatMediaDuration(NaN), null);
  assert.equal(
    backgroundMediaLabel({ kind: "video", durationSeconds: 237.5667 }),
    "동영상 · 3:58",
  );
  assert.equal(
    backgroundMediaLabel({ kind: "video", durationSeconds: null }),
    "동영상 · 길이 확인 불가",
  );
  assert.equal(backgroundMediaLabel({ kind: "animated" }), "움짤");
  assert.equal(backgroundMediaLabel({ kind: "image" }), "이미지");
});
test("visible badge reads share one bounded request and a cancelled owner does not cancel another", async () => {
  let count = 0,
    finish;
  const cache = new BackgroundInfoCache({
    request: async (op, data) => {
      assert.equal(op, "background-media-info");
      assert.equal(data.revision, 4);
      count++;
      return await new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  const a = new AbortController(),
    b = new AbortController();
  const first = cache.read("sera", 4, "default", a.signal);
  first.catch(() => {});
  const second = cache.read("sera", 4, "default", b.signal);
  await new Promise((resolve) => setImmediate(resolve));
  a.abort();
  const result = { kind: "video", durationSeconds: 223.5667 };
  finish(result);
  await assert.rejects(first, { name: "AbortError" });
  assert.deepEqual(await second, result);
  assert.deepEqual(
    await cache.read("sera", 4, "default", new AbortController().signal),
    result,
  );
  assert.equal(count, 1);
  cache.dispose();
});
test("metadata concurrency stays at two and abandoned queued badges never issue a host request", async () => {
  let active = 0,
    maximum = 0,
    calls = 0;
  const finish = [];
  const cache = new BackgroundInfoCache({
    request: async () => {
      calls++;
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => finish.push(resolve));
      active--;
      return { kind: "image" };
    },
  });
  const owners = Array.from({ length: 5 }, () => new AbortController());
  const jobs = owners.map((owner, index) =>
    cache.read(String(index), 1, null, owner.signal),
  );
  jobs.forEach((job) => job.catch(() => {}));
  await new Promise((resolve) => setImmediate(resolve));
  owners[2].abort();
  owners[3].abort();
  owners[4].abort();
  finish.forEach((resolve) => resolve());
  await Promise.allSettled(jobs);
  assert.equal(calls, 2);
  assert.equal(maximum, 2);
  cache.dispose();
});
