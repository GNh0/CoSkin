import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { workspaceBundle } from "./workspace-bundle.mjs";

const compiled = await build({
  stdin: {
    contents:
      'export { Panel } from "./src/renderer/panel.js"; export { editorContext } from "./src/renderer/editor-context.js"; export { editorChrome, inspectorPreview } from "./src/renderer/editor-chrome.js"; export { themeMetadata } from "./src/renderer/theme-metadata.js"; export { settingsPage } from "./src/renderer/runtime-settings.js";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [workspaceBundle()],
});
const {
  Panel,
  editorContext,
  editorChrome,
  inspectorPreview,
  themeMetadata,
  settingsPage,
} = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);

const all = (root) => [root, ...root.children.flatMap(all)];
class Element {
  constructor(tag) {
    Object.assign(this, {
      tag,
      children: [],
      attributes: {},
      style: {},
      listeners: {},
      isConnected: true,
    });
  }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key === "value") this.value = String(value);
    if (key === "class") this.className = String(value);
  }
  addEventListener(key, value) {
    this.listeners[key] = value;
  }
  append(...children) {
    this.children.push(...children);
  }
  prepend(...children) {
    this.children.unshift(...children);
  }
  replaceChildren(...children) {
    this.children = children;
  }
  querySelector(selector) {
    return all(this).find((element) =>
      selector.startsWith("#")
        ? element.attributes.id === selector.slice(1)
        : element.className?.split(" ").includes(selector.slice(1)),
    );
  }
  focus() {
    this.focused = true;
  }
  reportValidity() {
    return true;
  }
  getContext() {
    return this.context;
  }
}
function setup(values = {}) {
  globalThis.document = {
    documentElement: { lang: "ko" },
    createElement: (tag) => new Element(tag),
    createElementNS: (namespaceURI, tag) =>
      Object.assign(new Element(tag), { namespaceURI }),
    querySelector: () => null,
  };
  const original = {
    manifest: {
      name: "Original",
      description: "Keep",
      author: { name: "User" },
      defaultProfile: "default",
      engine: { minVersion: "0.1.0" },
    },
    theme: { profiles: [{ id: "default", name: "Default", rules: [] }] },
    assets: {},
  };
  const panel = Object.create(Panel.prototype);
  const calls = [];
  Object.assign(panel, {
    activeSection: "image",
    target: "main.surface",
    selected: "theme.test",
    baseRevision: 1,
    session: { editing: true, previewing: false },
    profile: "default",
    state: "hover",
    doc: structuredClone(original),
    busy: false,
    dirty: false,
    history: [],
    redo: [],
    scopeUndo: new WeakMap(),
    pageResources: [],
    draftGeneration: 0,
    draftWrite: Promise.resolve(),
    render() {},
    c: {
      externalApplying: false,
      targets: [],
      summary: {
        enabled: true,
        bindings: { global: { id: "applied.other", revision: 1 } },
        themes: { "theme.test": { revision: 1 } },
      },
      adapter: { context: () => ({}) },
      stopReplay() {
        calls.push("stopReplay");
      },
      render() {
        calls.push("render");
      },
      request: async (operation) => {
        calls.push(operation);
        return operation === "read" ? structuredClone(original) : {};
      },
      update: async (operation) => {
        calls.push(operation);
        return { revision: 2 };
      },
    },
    ...values,
  });
  return { panel, calls, original };
}
const button = (root, text) =>
  all(root).find(
    (element) => element.tag === "button" && element.textContent === text,
  );

test("theme editing starts on the existing whole background instead of a stale row or body selection", () => {
  const { panel } = setup({
    target: "main.surface", targetItem: "old-item", pickedItem: "old-item",
    selectedLayer: "icon", state: "hover", targetTitle: "Old row",
    host: { hidden: true, dataset: {}, style: {} },
    editBar: { hidden: true },
    closePage() {},
    modeLayout: { update() {} },
    session: { edit() {} },
  });
  panel.doc.theme.profiles[0].rules = [
    { id: "whole", target: "app.background", states: { base: { style: { background: { image: "assets/old.webm" } } } } },
    { id: "glass", target: "main.surface", states: { base: { style: { background: { color: "#222222", opacity: 0.25 } } } } },
  ];
  const before = structuredClone(panel.doc);
  panel.enterEdit();
  assert.equal(panel.target, "app.background");
  assert.equal(panel.state, "base");
  assert.equal(panel.selectedLayer, null);
  assert.equal(panel.targetItem, null);
  assert.equal(panel.pickedItem, null);
  assert.equal(panel.targetTitle, "");
  assert.equal(panel.host.hidden, false);
  assert.deepEqual(panel.doc, before);
  assert.strictEqual(panel.c.preview.document, panel.doc);
});

test("duplicate preserves all profiles, local exceptions, assets and organization but never mutates the source or applies itself", async () => {
  const { panel } = setup();
  panel.doc.manifest.id = panel.selected;
  panel.doc.theme.fontFamily = "Arial";
  panel.doc.theme.autoTextColor = true;
  panel.doc.theme.profiles.push({ id: "second", name: "Second", rules: [] });
  panel.doc.theme.profiles[0].rules = [{ id: "icons", target: "sidebar.thread-row", states: {
    base: { style: { icon: { image: "assets/icon.png", fit: "contain", opacity: 0.7 }, text: { color: "#abcdef" }, border: { color: "#123456" } } },
    hover: { motion: { mode: "effects", events: { enter: [{ id: "pulse", effect: "icon.pulse", effectVersion: 1, layer: "icon" }] } } },
  } }];
  panel.doc.assets = { "assets/icon.png": "a".repeat(64) };
  panel.doc.localOverrides = { default: [{ id: "one", target: "sidebar.thread-row", item: "thread-1", states: { base: { style: { text: { color: "#ffffff" } } } } }] };
  const organization = { groupId: "character", tags: ["WebM", "My tag"], favorite: true };
  panel.c.summary.organization = { themes: { [panel.selected]: organization } };
  const source = panel.doc;
  const before = structuredClone(source), metadataBefore = structuredClone(organization);
  const operations = [];
  panel.c.update = async (op, data) => { operations.push({ op, ...structuredClone(data) }); };
  panel.load = async (id) => { panel.selected = id; panel.doc = structuredClone(operations[0].document); };
  await panel.duplicate();
  assert.equal(operations.length, 1);
  assert.equal(operations[0].op, "create");
  assert.match(panel.selected, /^local\./);
  assert.notEqual(panel.selected, before.manifest.id);
  assert.deepEqual(operations[0].metadata, metadataBefore);
  assert.deepEqual(panel.doc.theme, before.theme);
  assert.deepEqual(panel.doc.assets, before.assets);
  assert.deepEqual(panel.doc.localOverrides, before.localOverrides);
  assert.deepEqual(source, before);
  assert.deepEqual(organization, metadataBefore);
  assert.equal(before.manifest.name, "Original");
  assert.equal(panel.c.summary.bindings.global.id, "applied.other");
  panel.doc.theme.profiles[0].rules[0].states.base.style.icon.image = "assets/new.png";
  assert.deepEqual(source, before);
  assert.equal(before.theme.profiles[0].rules[0].states.base.style.icon.image, "assets/icon.png");
});

test("the target picker clears stale row/state/layer selection without editing any theme data", () => {
  const { panel } = setup({ target: "sidebar.thread-row", targetItem: "thread-1", pickedItem: "thread-1", selectedLayer: "icon" });
  const before = structuredClone(panel.doc);
  const root = new Element("section");
  // This test does not exercise the separate row-scope form.
  panel.target = "main.surface";
  editorContext(panel, root);
  const target = all(root).find((e) => e.tag === "select" && e.children.some((option) => option.attributes.value === "app.background"));
  assert.ok(target);
  target.value = "app.background";
  target.onchange();
  assert.equal(panel.target, "app.background");
  assert.equal(panel.selectedLayer, null);
  assert.equal(panel.targetItem, null);
  assert.equal(panel.state, "base");
  assert.deepEqual(panel.doc, before);
  assert.equal(panel.dirty, false);
});

for (const [target, layer] of [["app.background", "background"], ["navigation.home", "icon"], ["main.surface", "decoration"]]) {
  test(`replacing a cloned ${layer} on ${target} changes only that layer and preserves the other styles, states and source`, async () => {
    const { panel } = setup({ target, selectedLayer: layer, state: "base" });
    const old = "assets/old.png", hash = "a".repeat(64), replacementHash = "b".repeat(64);
    panel.doc.assets = { [old]: hash };
    panel.doc.theme.profiles[0].rules = [
      { id: "whole", target: "app.background", states: { base: { style: { background: { image: old, fit: "cover", opacity: 0.9 } } } } },
      { id: "main", target: "main.surface", states: { base: { style: { background: { color: "#222222", opacity: 0.25 }, decoration: { image: old, fit: "contain" }, text: { color: "#ffffff" } } } } },
      { id: "home", target: "navigation.home", states: { base: { style: { icon: { image: old, fit: "contain", sizePx: 24 }, border: { color: "#abcdef", widthPx: 1 } }, motion: { mode: "none" } }, hover: { style: { icon: { opacity: 0.5 } } } } },
    ];
    const source = panel.doc;
    panel.doc = structuredClone(source);
    const before = structuredClone(panel.doc);
    panel.c.loadMedia = async () => new Promise(() => {});
    panel.c.request = async (op) => op === "transfer-begin" ? { token: "fixture", chunkBytes: 24576 } : op === "asset-write" ? { hash: replacementHash, extension: ".png", mime: "image/png" } : {};
    const root = new Element("section");
    editorContext(panel, root);
    const input = all(root).find((e) => e.tag === "input" && e.attributes.type === "file");
    input.files = [new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })];
    await input.onchange();
    await panel.stopDraft();
    const expected = structuredClone(before);
    expected.assets[`assets/${replacementHash}.png`] = replacementHash;
    const style = expected.theme.profiles[0].rules.find((r) => r.target === target).states.base.style[layer];
    style.image = `assets/${replacementHash}.png`;
    style.fit = "contain";
    // Capability declarations may be filled for this minimal fixture.
    expected.manifest.requirements = panel.doc.manifest.requirements;
    assert.deepEqual(panel.doc, expected);
    assert.deepEqual(source, before);
    assert.equal(panel.c.summary.bindings.global.id, "applied.other");
  });
}

test("editor tabs support keyboard wrapping and keep document and scope while changing the active section", () => {
  const { panel } = setup();
  const original = panel.doc;
  let root;
  panel.render = () => {
    root = new Element("section");
    editorChrome(panel, root);
    panel.shadow = root;
  };
  panel.render();
  const tabs = all(root).filter((element) => element.attributes.role === "tab");
  assert.equal(
    tabs.filter((element) => element.attributes.tabindex === "0").length,
    1,
  );
  assert.equal(tabs[0].attributes["aria-controls"], "coskin-inspector-body");
  let prevented = 0;
  tabs[0].onkeydown({
    key: "ArrowRight",
    preventDefault() {
      prevented++;
    },
  });
  assert.equal(panel.activeSection, "animation");
  assert.equal(panel.state, "base");
  assert.equal(
    root.querySelector("#coskin-inspector-tab-animation").focused,
    true,
  );
  root.querySelector("#coskin-inspector-tab-animation").onkeydown({
    key: "End",
    preventDefault() {
      prevented++;
    },
  });
  assert.equal(panel.activeSection, "opacity");
  root.querySelector("#coskin-inspector-tab-opacity").onkeydown({
    key: "ArrowRight",
    preventDefault() {
      prevented++;
    },
  });
  assert.equal(panel.activeSection, "image");
  assert.strictEqual(panel.doc, original);
  assert.equal(panel.target, "main.surface");
  assert.equal(prevented, 3);
});

test("editor tabs leave an in-flight host action alone", async () => {
  const { panel } = setup({ busy: true });
  const root = new Element("section");
  editorChrome(panel, root);
  const effects = root.querySelector("#coskin-inspector-tab-animation");
  assert.equal(effects.disabled, true);
  effects.listeners.click();
  effects.onkeydown({ key: "End", preventDefault() {} });
  assert.equal(panel.activeSection, "image");
  assert.equal(panel.state, "hover");
});

test("inspector preview reflects image fit and opacity without changing cached media ownership", async () => {
  const { panel } = setup();
  const drawn = [];
  const context = {
    drawImage(...args) {
      drawn.push(args);
    },
  };
  const frame = {};
  panel.c.loadMedia = async () => ({
    width: 100,
    height: 200,
    frames: [{ image: frame }],
  });
  document.createElement = (tag) =>
    Object.assign(new Element(tag), tag === "canvas" ? { context } : {});
  const surface = inspectorPreview(panel, "hash", {
    width: 256,
    height: 160,
    fit: "cover",
    opacity: 0.4,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(surface.attributes["aria-busy"], "false");
  assert.equal(context.globalAlpha, 0.4);
  assert.deepEqual(drawn, [[frame, 0, -176, 256, 512]]);
  assert.equal(surface.children[0].tag, "canvas");
});

test("a preview failure ends its busy status and is not mislabeled as loading", async () => {
  const { panel } = setup();
  panel.c.loadMedia = async () => {
    throw Error("unavailable source");
  };
  const surface = inspectorPreview(panel, "hash");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(surface.attributes["aria-busy"], "false");
  assert.equal(surface.textContent, "미리보기를 불러올 수 없습니다");
});

test("leaving the page prevents an old pending preview from painting the new page", async () => {
  const { panel } = setup();
  let ready;
  panel.c.loadMedia = () =>
    new Promise((resolve) => {
      ready = resolve;
    });
  const surface = inspectorPreview(panel, "hash");
  for (const dispose of panel.pageResources) dispose();
  ready({ width: 100, height: 200, frames: [{ image: {} }] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(surface.children[0].className, "preview-placeholder");
});

test("visible inspector preview cancel restores the saved draft while preserving the applied binding", async () => {
  const { panel, calls, original } = setup({ dirty: true });
  panel.doc.manifest.name = "Unsaved";
  const binding = structuredClone(panel.c.summary.bindings);
  const root = new Element("section");
  editorContext(panel, root);
  const cancel = button(
    root.querySelector(".inspector-commit"),
    "미리보기 취소",
  );
  assert.ok(cancel);
  assert.equal(
    root.querySelector("#coskin-inspector-body").attributes["aria-labelledby"],
    "coskin-inspector-tab-image",
  );
  await cancel.listeners.click();
  assert.deepEqual(panel.doc, original);
  assert.equal(panel.dirty, false);
  assert.equal(panel.c.preview, null);
  assert.deepEqual(panel.c.summary.bindings, binding);
  assert.deepEqual(
    calls.filter((operation) => !["stopReplay", "render"].includes(operation)),
    ["read", "draft-clear"],
  );
});

test("saving an unchanged inspector is disabled and a draft save retains separate apply behavior", async () => {
  const { panel, calls } = setup();
  const clean = new Element("section");
  editorContext(panel, clean);
  assert.equal(
    button(clean.querySelector(".inspector-commit"), "저장").disabled,
    true,
  );
  panel.dirty = true;
  const dirty = new Element("section");
  editorContext(panel, dirty);
  await button(
    dirty.querySelector(".inspector-commit"),
    "저장",
  ).listeners.click();
  assert.equal(panel.baseRevision, 2);
  assert.equal(panel.dirty, false);
  assert.deepEqual(calls, ["save", "draft-clear"]);
  assert.equal(panel.c.summary.bindings.global.id, "applied.other");
});

test("editing a theme retains its optional UI targets and effects when a Codex window lacks them", () => {
  const { panel } = setup();
  panel.doc.manifest.requirements = {
    required: ["target:app.background", "effect:icon.pulse@1"],
    optional: ["target:message.surface", "target:popover.surface", "effect:move.slide@1"],
  };
  panel.doc.theme.profiles[0].rules = [
    { target: "app.background", states: { base: {} } },
    { target: "message.surface", states: { base: {} } },
    { target: "popover.surface", states: { hover: { motion: { events: { hover: [{ effect: "move.slide" }, { effect: "icon.pulse" }] } } } } },
  ];
  panel.declare();
  assert.deepEqual(panel.doc.manifest.requirements, {
    required: ["target:app.background", "effect:icon.pulse@1"],
    optional: ["target:message.surface", "target:popover.surface", "effect:move.slide@1"],
  });
  // Repeated style edits must not progressively turn optional decorations into
  // requirements that reject a different Codex window.
  panel.declare();
  assert.equal(panel.doc.manifest.requirements.required.includes("target:popover.surface"), false);
});

test("declaration still requires new features and removes capabilities whose rules were deleted", () => {
  const { panel } = setup();
  panel.doc.manifest.requirements = {
    required: ["target:main.surface", "target:sidebar.surface"],
    optional: ["target:sidebar.surface", "target:popover.surface"],
  };
  panel.doc.theme.profiles[0].rules = [
    { target: "sidebar.surface", states: { base: {} } },
    { target: "app.background", states: { base: {} } },
  ];
  panel.declare();
  assert.deepEqual(panel.doc.manifest.requirements, {
    required: ["target:sidebar.surface", "target:app.background"],
    optional: [],
  });
});

test("metadata cancel discards only the form and never writes the underlying theme", async () => {
  const { panel, calls, original } = setup({ metadataMode: "edit" });
  const form = themeMetadata(panel);
  all(form).find(
    (element) => element.attributes["aria-label"] === "테마 이름",
  ).value = "Unsubmitted";
  await button(form, "취소").listeners.click();
  assert.equal(panel.metadataMode, null);
  assert.deepEqual(panel.doc, original);
  assert.deepEqual(calls, []);
});

function runtimeSetup() {
  const runtimeSettings = {
    startAtSignIn: false,
    launchWithCodex: true,
    exitWithCodex: false,
    automaticUpdates: false,
    assetStoragePath: null,
    assetStorage: {
      currentPath: "C:\\Themes",
      defaultPath: "C:\\Themes",
      usedBytes: 1024,
      available: true,
    },
  };
  const result = setup({
    runtimeSettings,
    runtimeSettingsDraft: null,
    settingsOpen: true,
    updateStatus: { status: "ready", version: "0.2.0" },
  });
  result.panel.c.summary.startupSettingsAvailable = true;
  const root = new Element("section");
  settingsPage(result.panel, root);
  return { ...result, root };
}
test("editing runtime options immediately blocks update installation without requiring a rerender", async () => {
  const { panel, root, calls } = runtimeSetup();
  const install = button(root, "업데이트 설치");
  assert.equal(install.disabled, false);
  const option = all(root).find(
    (element) =>
      element.attributes["aria-label"] === "Codex 종료 시 CoSkin 함께 종료",
  );
  option.checked = true;
  option.onchange();
  assert.equal(install.disabled, true);
  assert.equal(root.querySelector(".panel-settings-status").hidden, false);
  await install.listeners.click();
  assert.deepEqual(calls, []);
  assert.equal(panel.runtimeSettingsDraft.exitWithCodex, true);
  assert.equal(panel.busy, false);
});

test("runtime cancel clears the unsaved settings form and preserves global storage without issuing writes", async () => {
  const { panel, root, calls } = runtimeSetup();
  const before = structuredClone(panel.runtimeSettings);
  const path = all(root).find((element) => element.attributes.type === "text");
  path.value = "D:\\NewFolder";
  path.oninput();
  await button(root, "취소").listeners.click();
  assert.equal(panel.runtimeSettingsDraft, null);
  assert.equal(panel.settingsOpen, false);
  assert.deepEqual(panel.runtimeSettings, before);
  assert.deepEqual(calls, []);
});
