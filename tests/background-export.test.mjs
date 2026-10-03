import test from "node:test";
import assert from "node:assert/strict";
import {
  backgroundExportFormats,
  backgroundExportRequest,
} from "../src/renderer/background-export-options.js";
import {
  backgroundExportForm,
  backgroundExportMessages,
} from "../src/renderer/background-export.js";
import { backgroundDownloadsPage } from "../src/renderer/background-downloads.js";

const identity = { id: "installed.example", revision: 3, profile: "default" };
const state = (values = {}) => ({
  format: "png",
  resolution: "custom",
  width: "1280",
  height: "720",
  keepAspect: true,
  quality: "high",
  timeSeconds: "1.5",
  info: { kind: "video", durationSeconds: 20 },
  ...values,
});

test("registered backgrounds keep format, resolution and selected frame independent", () => {
  for (const locale of ["en", "ja", "zh-CN"])
    assert.deepEqual(
      Object.keys(backgroundExportMessages[locale]).sort(),
      Object.keys(backgroundExportMessages.ko).sort(),
    );
  assert.deepEqual(backgroundExportFormats("image"), [
    "original",
    "jpg",
    "png",
  ]);
  assert.deepEqual(backgroundExportFormats("animated"), [
    "original",
    "jpg",
    "png",
    "mp4",
    "webm",
    "gif",
  ]);
  assert.deepEqual(backgroundExportRequest(identity, state()), {
    ...identity,
    format: "png",
    resolution: "custom",
    width: 1280,
    height: 720,
    keepAspect: true,
    quality: "high",
    timeSeconds: 1.5,
  });
  const original = backgroundExportRequest(
    identity,
    state({ format: "original" }),
  );
  assert.equal(original.resolution, "original");
  assert.equal(original.timeSeconds, 0);
  assert.equal(
    backgroundExportRequest(identity, state({ format: "mp4" })).timeSeconds,
    0,
  );
  for (const values of [
    { format: "exe" },
    { format: "jpg", quality: "arbitrary" },
    { width: 8193 },
    { height: "3.5" },
    { width: 8192, height: 8192 },
    { timeSeconds: NaN },
    { timeSeconds: 20 },
  ])
    assert.throws(
      () => backgroundExportRequest(identity, state(values)),
      RangeError,
    );
  assert.doesNotThrow(() =>
    backgroundExportRequest(
      identity,
      state({
        format: "original",
        width: "invalid",
        timeSeconds: NaN,
        quality: "invalid",
      }),
    ),
  );
  assert.doesNotThrow(() =>
    backgroundExportRequest(
      identity,
      state({
        format: "webm",
        resolution: "720",
        width: "invalid",
        timeSeconds: -1,
      }),
    ),
  );
});

class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.listeners = new Map();
    this.value = "";
  }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (["hidden", "disabled"].includes(key)) this[key] = true;
    if (key === "value") this.value = String(value);
  }
  removeAttribute(key) {
    delete this.attributes[key];
  }
  set textContent(value) {
    this.text = String(value);
    this.children = [];
  }
  get textContent() {
    return (
      (this.text || "") +
      this.children.map((child) => child.textContent).join("")
    );
  }
  append(...children) {
    for (const child of children) child.parent = this;
    this.children.push(...children);
  }
  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter(
        (child) => child !== this,
      );
  }
  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }
  querySelectorAll(tag) {
    return all(this)
      .slice(1)
      .filter((element) => element.tag === tag);
  }
  addEventListener(event, listener) {
    const values = this.listeners.get(event) || [];
    values.push(listener);
    this.listeners.set(event, values);
  }
  async emit(event) {
    for (const listener of this.listeners.get(event) || [])
      await listener({ target: this });
  }
}
const all = (element) => [element, ...element.children.flatMap(all)];
const button = (root, text) =>
  all(root).find(
    (element) => element.tag === "button" && element.textContent === text,
  );
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(request) {
  globalThis.document = {
    documentElement: { lang: "en" },
    createElement: (tag) => new Element(tag),
  };
  const panel = {
    selected: identity.id,
    baseRevision: identity.revision,
    profile: identity.profile,
    pageResources: [],
    c: { request },
    button(text, callback) {
      const result = new Element("button");
      result.textContent = text;
      result.addEventListener("click", callback);
      return result;
    },
  };
  return panel;
}
function dispose(panel) {
  for (const callback of panel.pageResources) callback();
  panel.pageResources = [];
}

test("the live export resumes polling after detail is recreated during the native save dialog", async () => {
  let resolvePicker;
  const requests = [];
  const panel = fixture(async (op, values) => {
    requests.push({ op, values });
    if (op === "background-export-info")
      return {
        kind: "video",
        originalFormat: "webm",
        converterAvailable: true,
        durationSeconds: 20,
      };
    if (op === "background-export-start")
      return new Promise((resolve) => {
        resolvePicker = resolve;
      });
    if (op === "background-export-status")
      return {
        jobId: "job-1",
        state: "completed",
        progress: 1,
        path: "D:\\Exports\\background.webm",
      };
    throw new Error("Unexpected operation: " + op);
  });
  try {
    const first = backgroundExportForm(panel);
    await tick();
    const selects = first.querySelectorAll("select");
    selects[0].value = "webm";
    await selects[0].emit("change");
    selects[1].value = "720";
    await selects[1].emit("change");
    const choosing = button(first, "Choose location and extract").emit("click");
    assert.equal(selects[0].disabled, true);
    assert.equal(button(first, "Choose location and extract").disabled, true);
    dispose(panel);
    const second = backgroundExportForm(panel);
    await tick();
    resolvePicker({ jobId: "job-1" });
    await choosing;
    await tick();
    assert.equal(
      requests.filter((request) => request.op === "background-export-start")
        .length,
      1,
    );
    const requested = requests.find(
      (request) => request.op === "background-export-start",
    ).values;
    assert.equal(requested.id, identity.id);
    assert.equal(requested.revision, 3);
    assert.equal(requested.format, "webm");
    assert.equal(requested.resolution, "720");
    assert.equal("path" in requested, false);
    assert.equal(button(second, "Choose location and extract").disabled, false);
    assert.match(
      second.textContent,
      /Background saved.*D:\\Exports\\background.webm/,
    );
  } finally {
    dispose(panel);
  }
});

test("without a converter original export still works and declining the picker leaves the form usable", async () => {
  let started = 0;
  const panel = fixture(async (op) => {
    if (op === "background-export-info")
      return {
        kind: "image",
        originalFormat: "png",
        converterAvailable: false,
      };
    if (op === "background-export-start") {
      started++;
      return { canceled: true };
    }
    throw new Error(op);
  });
  try {
    const form = backgroundExportForm(panel);
    await tick();
    const save = button(form, "Choose location and extract");
    assert.equal(save.disabled, false);
    const format = form.querySelectorAll("select")[0];
    assert.deepEqual(
      format.children.map((child) => child.value),
      ["original", "jpg", "png"],
    );
    format.value = "jpg";
    await format.emit("change");
    assert.equal(save.disabled, true);
    format.value = "original";
    await format.emit("change");
    assert.equal(save.disabled, false);
    await save.emit("click");
    assert.equal(started, 1);
    assert.equal(save.disabled, false);
    assert.match(form.textContent, /Export canceled/);
  } finally {
    dispose(panel);
  }
});

test("the original-quality button ignores stale conversion fields and shows an existing duplicate", async () => {
  let requested;
  const panel = fixture(async (op, values) => {
    if (op === "background-export-info")
      return {
        kind: "video",
        originalFormat: "webm",
        converterAvailable: true,
        durationSeconds: 20,
      };
    if (op === "background-export-start") {
      requested = values;
      return { jobId: "existing", duplicate: true };
    }
    if (op === "background-export-status")
      return { state: "completed", progress: 1, path: "D:\\original.webm" };
    throw new Error(op);
  });
  try {
    const form = backgroundExportForm(panel);
    await tick();
    const values = panel.backgroundExports.values().next().value;
    Object.assign(values, {
      format: "png",
      resolution: "custom",
      width: "invalid",
      height: 9000,
      timeSeconds: 30,
    });
    await button(form, "Download original quality").emit("click");
    await tick();
    assert.equal(requested.format, "original");
    assert.equal(requested.resolution, "original");
    assert.equal(requested.timeSeconds, 0);
    assert.match(form.textContent, /already in the list/);
  } finally {
    dispose(panel);
  }
});

test("a running download leaves format controls available to queue another different export", async () => {
  const starts = [];
  const panel = fixture(async (op, values) => {
    if (op === "background-export-info")
      return {
        kind: "video",
        originalFormat: "webm",
        converterAvailable: true,
      };
    if (op === "background-export-start") {
      starts.push(values);
      return { jobId: "job-" + starts.length };
    }
    if (op === "background-export-status")
      return { state: "running", progress: 0.1 };
    throw new Error(op);
  });
  try {
    const form = backgroundExportForm(panel);
    await tick();
    await button(form, "Download original quality").emit("click");
    await tick();
    const selects = form.querySelectorAll("select");
    assert.equal(selects[0].disabled, false);
    assert.equal(button(form, "Choose location and extract").disabled, false);
    selects[0].value = "mp4";
    await selects[0].emit("change");
    selects[1].value = "720";
    await selects[1].emit("change");
    await button(form, "Choose location and extract").emit("click");
    assert.deepEqual(
      starts.map((value) => value.format),
      ["original", "mp4"],
    );
    assert.equal(starts[1].resolution, "720");
  } finally {
    dispose(panel);
  }
});

test("the download manager supports a concurrency limit, queued cancellation, retry and record-only clearing", async () => {
  const calls = [];
  let maximum = 2;
  let jobs = [
    {
      jobId: "a",
      name: "a.webm",
      format: "original",
      state: "queued",
      destination: "D:\\a.webm",
    },
    {
      jobId: "b",
      name: "b.mp4",
      format: "mp4",
      resolution: "720",
      quality: "high",
      state: "failed",
      destination: "D:\\b.mp4",
      error: "test failure",
    },
  ];
  const panel = fixture(async (op, values) => {
    calls.push({ op, values });
    if (op === "background-export-list")
      return {
        jobs,
        total: jobs.length,
        running: 0,
        queued: jobs.filter((job) => job.state === "queued").length,
        maxConcurrent: maximum,
      };
    if (op === "background-export-limit") maximum = values.limit;
    else if (op === "background-export-queue-cancel")
      jobs.find((job) => job.jobId === values.jobId).state = "canceled";
    else if (op === "background-export-retry")
      jobs.find((job) => job.jobId === values.jobId).state = "queued";
    else if (op === "background-export-clear")
      jobs = jobs.filter((job) => ["queued", "running"].includes(job.state));
    else throw new Error(op);
    return { ok: true };
  });
  try {
    const section = new Element("section");
    backgroundDownloadsPage(panel, section);
    await tick();
    assert.match(section.textContent, /0 running.*1 queued.*2 total/);
    const limit = section.querySelectorAll("select")[0];
    limit.value = "4";
    await limit.emit("change");
    await tick();
    assert.equal(maximum, 4);
    await button(section, "Cancel export").emit("click");
    await tick();
    assert.equal(jobs[0].state, "canceled");
    await button(section, "Retry").emit("click");
    await tick();
    assert.equal(jobs[0].state, "queued");
    await button(section, "Clear finished records").emit("click");
    await tick();
    assert.equal(jobs.length, 1);
    assert.match(section.textContent, /Saved files are kept/);
    await button(section, "Close").emit("click");
    assert.equal(panel.downloadsOpen, false);
    assert.equal(
      calls.some((call) => "path" in call.values),
      false,
    );
  } finally {
    dispose(panel);
  }
});
