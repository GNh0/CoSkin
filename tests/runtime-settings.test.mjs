import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { workspaceBundle } from "./workspace-bundle.mjs";
import { settingsPage } from "../src/renderer/runtime-settings.js";
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.listeners = {};
  }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
  }
  addEventListener(key, value) {
    this.listeners[key] = value;
  }
  append(...children) {
    this.children.push(...children);
  }
}
const compiled = await build({
  stdin: {
    contents:
      'export {Panel} from "./src/renderer/panel.js"; export {Controller} from "./src/renderer/controller.js";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [workspaceBundle()],
});
const { Panel, Controller } = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);
test("Settings update buttons send one request through the real panel action and release busy state", async () => {
  globalThis.document = {
    createElement: (tag) => new Element(tag),
    documentElement: { lang: "ko" },
    querySelector: () => null,
  };
  const panel = Object.create(Panel.prototype);
  Object.assign(panel, {
    busy: false,
    runtimeSettings: {
      launchWithCodex: true,
      exitWithCodex: false,
      automaticUpdates: false,
    },
    runtimeSettingsDraft: null,
    c: { externalApplying: false },
    render() {},
    notify(message) {
      this.message = message;
    },
  });
  const requests = [];
  panel.c.request = async (op) => {
    requests.push(op);
    assert.equal(panel.updateRequesting, true);
    assert.equal(panel.busy, true);
    return { status: "ready", version: "0.2.0" };
  };
  const all = (root) => [root, ...root.children.flatMap(all)];
  const section = new Element("section");
  settingsPage(panel, section);
  await all(section)
    .find((e) => e.textContent === "업데이트 확인")
    .listeners.click();
  assert.deepEqual(requests, ["runtime-update-check"]);
  assert.equal(panel.busy, false);
  assert.equal(panel.updateRequesting, false);
  assert.match(panel.message, /0.2.0/);
  const ready = new Element("section");
  settingsPage(panel, ready);
  const install = all(ready).find((e) => e.textContent === "업데이트 설치");
  assert.equal(install.disabled, false);
  await install.listeners.click();
  assert.deepEqual(requests, ["runtime-update-check", "runtime-update-apply"]);
  panel.runtimeSettingsDraft = { ...panel.runtimeSettings };
  const dirty = new Element("section");
  settingsPage(panel, dirty);
  assert.equal(
    all(dirty).find((e) => e.textContent === "업데이트 설치").disabled,
    true,
  );
});
test("Settings update request failure leaves controls usable", async () => {
  globalThis.document = {
    createElement: (tag) => new Element(tag),
    documentElement: { lang: "en" },
    querySelector: () => null,
  };
  const panel = Object.create(Panel.prototype);
  Object.assign(panel, {
    busy: false,
    runtimeSettings: {},
    c: {
      externalApplying: false,
      request: async () => {
        throw Error("network unavailable");
      },
    },
    render() {},
    notify() {},
  });
  const section = new Element("section");
  settingsPage(panel, section);
  const all = (root) => [root, ...root.children.flatMap(all)];
  await all(section)
    .find((e) => e.textContent === "Check for updates")
    .listeners.click();
  assert.equal(panel.busy, false);
  assert.equal(panel.updateRequesting, false);
  assert.equal(panel.message, "network unavailable");
});
test("reducing connected windows clamps playback and saves both limits without touching the storage path", async () => {
  globalThis.document = {
    createElement: (tag) => new Element(tag),
    documentElement: { lang: "ko" },
    querySelector: () => null,
  };
  const requests = [];
  const panel = Object.create(Panel.prototype);
  Object.assign(panel, {
    busy: false,
    runtimeSettings: {
      launchWithCodex: true,
      exitWithCodex: false,
      automaticUpdates: false,
      startAtSignIn: false,
      maxConnectedWindows: 5,
      maxPlayingWindows: 4,
    },
    runtimeSettingsDraft: null,
    c: {
      externalApplying: false,
      request: async (op, data) => {
        requests.push({ op, data });
        return data.settings;
      },
    },
    render() {},
    notify() {},
  });
  const all = (root) => [root, ...root.children.flatMap(all)];
  const section = new Element("section");
  settingsPage(panel, section);
  const connected = all(section).find(
    (e) => e.attributes["aria-label"] === "최대 연결 창 수",
  );
  const playing = all(section).find(
    (e) => e.attributes["aria-label"] === "동시에 영상을 재생할 창 수",
  );
  connected.value = "2";
  connected.onchange();
  assert.equal(playing.value, "2");
  assert.equal(panel.runtimeSettingsDraft.maxPlayingWindows, 2);
  assert.ok(
    playing.children
      .filter((o) => Number(o.value) > 2)
      .every((o) => o.disabled),
  );
  await all(section)
    .find((e) => e.tag === "form")
    .onsubmit({ preventDefault() {} });
  assert.equal(requests[0].data.settings.maxConnectedWindows, 2);
  assert.equal(requests[0].data.settings.maxPlayingWindows, 2);
  assert.equal(
    Object.hasOwn(requests[0].data.settings, "assetStoragePath"),
    false,
  );
  assert.equal(panel.runtimeSettingsDraft, null);
});
test("unchanged window limits are omitted so saving another setting cannot revert limits changed in another window", async () => {
  globalThis.document = {
    createElement: (tag) => new Element(tag),
    documentElement: { lang: "en" },
    querySelector: () => null,
  };
  let settings;
  const panel = Object.create(Panel.prototype);
  Object.assign(panel, {
    busy: false,
    runtimeSettings: { maxConnectedWindows: 5, maxPlayingWindows: 2 },
    c: {
      externalApplying: false,
      request: async (op, data) => {
        settings = data.settings;
        return {
          ...data.settings,
          maxConnectedWindows: 3,
          maxPlayingWindows: 1,
        };
      },
    },
    render() {},
    notify() {},
  });
  const all = (root) => [root, ...root.children.flatMap(all)];
  const section = new Element("section");
  settingsPage(panel, section);
  await all(section)
    .find((e) => e.tag === "form")
    .onsubmit({ preventDefault() {} });
  assert.equal(Object.hasOwn(settings, "maxConnectedWindows"), false);
  assert.equal(Object.hasOwn(settings, "maxPlayingWindows"), false);
  assert.equal(panel.runtimeSettings.maxConnectedWindows, 3);
});
test("connection release preserves drafts, edits, previews and pending requests until finished", () => {
  const controller = Object.create(Controller.prototype);
  Object.assign(controller, {
    pending: new Map(),
    panel: { session: {} },
    dispose() {
      this.released = true;
    },
  });
  for (const field of ["dirty", "editing", "busy", "runtimeSettingsDraft"]) {
    controller.panel[field] = true;
    assert.equal(controller.tryReleaseConnection(), false);
    assert.equal(controller.released, undefined);
    controller.panel[field] = false;
  }
  controller.panel.session.previewing = true;
  assert.equal(controller.tryReleaseConnection(), false);
  controller.panel.session.previewing = false;
  controller.pending.set("request", {});
  assert.equal(controller.tryReleaseConnection(), false);
  controller.pending.clear();
  assert.equal(controller.tryReleaseConnection(), true);
  assert.equal(controller.released, true);
});
test("refresh while suspended or scrolling preserves the existing decoration instead of exposing native fill", () => {
  const controller = Object.create(Controller.prototype);
  let disposed = 0;
  controller.decorations = new Map([
    [
      {},
      {
        dispose() {
          disposed++;
        },
      },
    ],
  ]);
  controller.pending = new Map();
  controller.panel = { session: {} };
  controller.suspended = true;
  assert.equal(controller.refreshDecorations(), false);
  controller.suspended = false;
  controller.scrolling = true;
  assert.equal(controller.refreshDecorations(), false);
  assert.equal(disposed, 0);
  assert.equal(controller.decorations.size, 1);
});

test("explicit greeting visibility is saved only when changed and applied to the current window", async () => {
  globalThis.document = {
    createElement: (tag) => new Element(tag),
    documentElement: { lang: "ko" },
    querySelector: () => null,
  };
  const writes = [],
    received = [];
  const panel = Object.create(Panel.prototype);
  Object.assign(panel, {
    busy: false,
    runtimeSettings: { hideStartGreeting: false },
    c: {
      externalApplying: false,
      request: async (_op, data) => {
        writes.push(data.settings);
        return {
          ...data.settings,
          hideStartGreeting: data.settings.hideStartGreeting ?? false,
        };
      },
      receiveRuntimeSettings: (settings) => received.push(settings),
    },
    render() {},
    notify() {},
  });
  const all = (root) => [root, ...root.children.flatMap(all)];
  let section = new Element("section");
  settingsPage(panel, section);
  const option = all(section).find(
    (e) => e.attributes["aria-label"] === "시작 화면 안내 숨기기",
  );
  assert.ok(option);
  assert.equal(option.checked, false);
  await all(section)
    .find((e) => e.tag === "form")
    .onsubmit({ preventDefault() {} });
  assert.equal(Object.hasOwn(writes[0], "hideStartGreeting"), false);
  section = new Element("section");
  settingsPage(panel, section);
  const next = all(section).find(
    (e) => e.attributes["aria-label"] === "시작 화면 안내 숨기기",
  );
  next.checked = true;
  next.onchange();
  await all(section)
    .find((e) => e.tag === "form")
    .onsubmit({ preventDefault() {} });
  assert.equal(writes[1].hideStartGreeting, true);
  assert.equal(received.at(-1).hideStartGreeting, true);
});
