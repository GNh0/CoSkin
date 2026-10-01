import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";
import { workspaceBundle } from "./workspace-bundle.mjs";

const compiled = await build({
  stdin: {
    contents: 'export * from "./src/renderer/previews.js";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  plugins: [
    {
      name: "controlled-preview-drawing",
      setup(builder) {
        builder.onResolve({ filter: /preview-scene\.js$/ }, () => ({
          path: "scene",
          namespace: "probe",
        }));
        builder.onLoad({ filter: /.*/, namespace: "probe" }, () => ({
          contents:
            "export async function drawPreviewScene(context, controller, document, signal) { await controller.draw(document, signal); }",
          loader: "js",
        }));
      },
    },
    workspaceBundle(),
  ],
});

const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function runtime() {
  const reads = [],
    urls = [],
    revoked = [],
    observers = [],
    encodings = [];
  let draw = async () => {};
  let encode = (callback) => callback(new Blob(["synthetic"]));
  let onUrl = () => {};
  const controller = {
    async request(op, data) {
      assert.equal(op, "read");
      reads.push(data.id);
      return data;
    },
    draw: (...args) => draw(...args),
  };
  const context = vm.createContext({
    module: { exports: {} },
    AbortController,
    DOMException,
    Blob,
    TextEncoder,
    queueMicrotask,
    navigator: { language: "en" },
    document: {
      documentElement: { lang: "en" },
      createElement: (tag) =>
        tag === "canvas"
          ? {
              getContext: () => ({ scale() {} }),
              toBlob(callback) {
                encodings.push(callback);
                encode(callback);
              },
            }
          : { style: {} },
    },
    URL: {
      createObjectURL() {
        const url = "blob:synthetic-" + urls.length;
        urls.push(url);
        onUrl();
        return url;
      },
      revokeObjectURL(url) {
        revoked.push(url);
      },
    },
    IntersectionObserver: class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe(target) {
        this.target = target;
      }
      disconnect() {
        this.disconnected = true;
      }
      intersect() {
        this.callback([{ isIntersecting: true }]);
      }
    },
  });
  vm.runInContext(compiled.outputFiles[0].text, context);
  return {
    ...context.module.exports,
    controller,
    reads,
    urls,
    revoked,
    observers,
    encodings,
    draw: (callback) => {
      draw = callback;
    },
    encode: (callback) => {
      encode = callback;
    },
    onUrl: (callback) => {
      onUrl = callback;
    },
  };
}

test("page disposal cancels queued previews and discards a running result without starting hidden theme reads", async () => {
  const api = runtime();
  const running = deferred();
  api.draw(() => running.promise);
  const panel = { c: api.controller, pageResources: [] };
  const first = {
    isConnected: true,
    replaceChildren() {
      throw Error("stale result mounted");
    },
  };
  const second = { ...first };
  api.mountPreview(panel, first, "first", 1);
  api.mountPreview(panel, second, "hidden-next", 1);
  api.observers[0].intersect();
  await tick();
  api.observers[1].intersect();
  assert.deepEqual(api.reads, ["first"]);
  for (const dispose of panel.pageResources) dispose();
  running.resolve();
  await tick();
  assert.deepEqual(api.reads, ["first"]);
  assert.equal(api.urls.length, 0);
  assert.ok(api.observers.every((observer) => observer.disconnected));
  const restored = await api.previewUrl(api.controller, "hidden-next", 1);
  assert.equal(typeof restored, "string");
  assert.deepEqual(api.reads, ["first", "hidden-next"]);
  api.disposePreviews();
});

test("pending eviction keeps work bounded and never reads the evicted identities", async () => {
  const api = runtime();
  const running = deferred();
  let concurrent = 0,
    peak = 0;
  api.draw(async (doc) => {
    concurrent++;
    peak = Math.max(peak, concurrent);
    if (doc.id === "running") await running.promise;
    concurrent--;
  });
  const first = api.previewUrl(api.controller, "running", 1);
  await tick();
  const pending = Array.from({ length: 120 }, (_, i) =>
    api.previewUrl(api.controller, "queued." + i, 1),
  );
  running.resolve();
  const results = await Promise.allSettled([first, ...pending]);
  const evicted = results.flatMap((result, i) =>
    result.status === "rejected"
      ? [i === 0 ? "running" : "queued." + (i - 1)]
      : [],
  );
  assert.ok(evicted.length > 0);
  assert.ok(evicted.every((id) => !api.reads.includes(id)));
  assert.equal(api.reads.length, api.previewLimits.pending);
  assert.equal(peak, 1);
  assert.equal(api.urls.length - api.revoked.length, api.previewLimits.cache);
  api.disposePreviews();
  assert.equal(api.revoked.length, api.urls.length);
  assert.equal(new Set(api.revoked).size, api.revoked.length);
});

test("global disposal prevents unstarted jobs even when a running encoder finishes later", async () => {
  const api = runtime();
  api.encode(() => {});
  const first = api.previewUrl(api.controller, "encoding", 1);
  await tick();
  const next = api.previewUrl(api.controller, "next", 1);
  api.disposePreviews();
  api.encodings[0](new Blob(["late"]));
  const results = await Promise.allSettled([first, next]);
  await tick();
  assert.ok(
    results.every(
      (result) =>
        result.status === "rejected" && result.reason.name === "AbortError",
    ),
  );
  assert.deepEqual(api.reads, ["encoding"]);
  assert.equal(api.urls.length, 0);
});

test("a URL made during cancellation is revoked and cannot populate the cache", async () => {
  const api = runtime();
  const owner = new AbortController();
  api.onUrl(() => owner.abort());
  await assert.rejects(
    api.previewUrl(api.controller, "late-url", 1, 640, {
      signal: owner.signal,
    }),
    { name: "AbortError" },
  );
  await tick();
  assert.deepEqual(api.revoked, api.urls);
  assert.equal(api.urls.length, 1);
  api.onUrl(() => {});
  await api.previewUrl(api.controller, "late-url", 1);
  assert.equal(api.reads.length, 2);
  api.disposePreviews();
  assert.equal(api.revoked.length, 2);
});

test("shared consumers keep one preview alive when only one container disappears", async () => {
  const api = runtime();
  const running = deferred();
  api.draw(() => running.promise);
  const firstOwner = new AbortController(),
    secondOwner = new AbortController();
  const first = api.previewUrl(api.controller, "shared", 1, 640, {
    signal: firstOwner.signal,
  });
  const second = api.previewUrl(api.controller, "shared", 1, 640, {
    signal: secondOwner.signal,
  });
  firstOwner.abort();
  const firstResult = assert.rejects(first, { name: "AbortError" });
  running.resolve();
  const url = await second;
  await firstResult;
  assert.deepEqual(api.reads, ["shared"]);
  assert.equal(api.urls.length, 1);
  assert.equal(url, api.urls[0]);
  assert.equal(await api.previewUrl(api.controller, "shared", 1), url);
  assert.equal(api.reads.length, 1);
  api.disposePreviews();
});

test("a replacement of the same cancelled identity survives the old job's late completion", async () => {
  const api = runtime();
  const running = deferred();
  let started = 0;
  api.draw(async () => {
    if (++started === 1) await running.promise;
  });
  const owner = new AbortController();
  const abandoned = api.previewUrl(api.controller, "same", 1, 640, {
    signal: owner.signal,
  });
  await tick();
  owner.abort();
  const abandonedResult = assert.rejects(abandoned, { name: "AbortError" });
  const replacement = api.previewUrl(api.controller, "same", 1);
  running.resolve();
  const url = await replacement;
  await abandonedResult;
  assert.deepEqual(api.reads, ["same", "same"]);
  assert.equal(api.urls.length, 1);
  assert.equal(await api.previewUrl(api.controller, "same", 1), url);
  assert.equal(api.reads.length, 2);
  api.disposePreviews();
  assert.deepEqual(api.revoked, api.urls);
});

test("a failed PNG encoding returns a localized failure and can be retried without a stale cache entry", async () => {
  const api = runtime();
  api.encode((callback) => callback(null));
  await assert.rejects(
    api.previewUrl(api.controller, "encode-failure", 1),
    /theme preview could not be prepared/,
  );
  assert.equal(api.urls.length, 0);
  api.encode((callback) => callback(new Blob(["retry"])));
  await api.previewUrl(api.controller, "encode-failure", 1);
  assert.deepEqual(api.reads, ["encode-failure", "encode-failure"]);
  api.disposePreviews();
  assert.deepEqual(api.revoked, api.urls);
});

test("completed cache is bounded, refreshes recently used entries and does not retain failures", async () => {
  const api = runtime();
  await api.previewUrl(api.controller, "keep", 1);
  for (let i = 0; i < 47; i++)
    await api.previewUrl(api.controller, "item." + i, 1);
  await api.previewUrl(api.controller, "keep", 1);
  await api.previewUrl(api.controller, "new", 1);
  const reads = api.reads.length;
  await api.previewUrl(api.controller, "keep", 1);
  assert.equal(api.reads.length, reads);
  await api.previewUrl(api.controller, "item.0", 1);
  assert.equal(api.reads.length, reads + 1);
  assert.equal(api.urls.length - api.revoked.length, 48);
  let fail = true;
  api.draw(() => {
    if (fail) {
      fail = false;
      throw Error("temporary decode failure");
    }
  });
  await assert.rejects(
    api.previewUrl(api.controller, "retry", 1),
    /temporary decode/,
  );
  assert.equal(
    typeof (await api.previewUrl(api.controller, "retry", 1)),
    "string",
  );
  api.disposePreviews();
  assert.equal(api.revoked.length, api.urls.length);
});
