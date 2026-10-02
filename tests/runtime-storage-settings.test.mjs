import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { workspaceBundle } from "./workspace-bundle.mjs";
import { settingsPage } from "../src/renderer/runtime-settings.js";

class Element {
  constructor(tag) {
    Object.assign(this, { tag, children: [], attributes: {}, style: {}, listeners: {} });
  }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(key, value) { this.listeners[key] = value; }
  append(...children) { this.children.push(...children); }
}
const compiled = await build({ stdin: { contents: 'export {Panel} from "./src/renderer/panel.js"', resolveDir: process.cwd() }, bundle: true, write: false, platform: "node", format: "esm", plugins: [workspaceBundle()] });
const { Panel } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const all = (root) => [root, ...root.children.flatMap(all)];
const initial = () => ({
  launchWithCodex: true, exitWithCodex: false, automaticUpdates: false, startAtSignIn: false, assetStoragePath: null,
  assetStorage: { currentPath: "C:\\CoSkin\\assets", defaultPath: "C:\\CoSkin\\assets", usedBytes: 3 * 1024 ** 3, assetCount: 12, available: true },
});
function setup(request, preferences = initial(), picker = true) {
  globalThis.document = { createElement: (tag) => new Element(tag), documentElement: { lang: "ko" }, querySelector: () => null };
  const panel = Object.create(Panel.prototype);
  Object.assign(panel, { busy: false, runtimeSettings: preferences, runtimeSettingsDraft: null, c: { externalApplying: false, request, summary: { startupSettingsAvailable: true, assetStoragePickerAvailable: picker } }, render() {}, notify() {} });
  const section = new Element("section");
  settingsPage(panel, section);
  return { panel, section, form: all(section).find((e) => e.tag === "form"), path: all(section).find((e) => e.attributes.type === "text") };
}
async function save(form) { await form.onsubmit({ preventDefault() {} }); }

test("one global storage path and usage are shown; saving retains lifecycle edits and excludes read-only status", async () => {
  const requests = [];
  const { panel, section, form, path } = setup(async (op, data) => {
    requests.push({ op, data });
    return { ...initial(), ...data.settings, assetStorage: { ...initial().assetStorage, currentPath: data.settings.assetStoragePath } };
  });
  assert.ok(all(section).some((e) => e.textContent === "테마 전체 보관 폴더"));
  assert.ok(all(section).some((e) => e.textContent === "테마 파일 사용량: 3 GiB"));
  path.value = "D:\\AllThemes";
  path.oninput();
  const exit = all(section).find((e) => e.attributes["aria-label"] === "Codex 종료 시 CoSkin 함께 종료");
  exit.checked = true;
  exit.onchange();
  assert.equal(panel.runtimeSettingsDraft.assetStoragePath, "D:\\AllThemes");
  assert.equal(requests.length, 0);
  await save(form);
  assert.deepEqual(requests, [{ op: "runtime-settings-write", data: { settings: { startAtSignIn: false, launchWithCodex: true, exitWithCodex: true, automaticUpdates: false, assetStoragePath: "D:\\AllThemes" } } }]);
  assert.equal(panel.runtimeSettings.assetStorage.currentPath, "D:\\AllThemes");
  assert.equal(panel.runtimeSettingsDraft, null);
  assert.equal(panel.busy, false);
});

test("folder selection changes only the draft; cancellation and unavailable picker preserve it", async () => {
  const requests = [];
  let cancel = false;
  const { panel, section, path } = setup(async (op, data) => { requests.push({ op, data }); return cancel ? { cancelled: true, path: null } : { cancelled: false, path: "D:\\Chosen" }; });
  const choose = all(section).find((e) => e.textContent === "폴더 선택");
  await choose.listeners.click();
  assert.equal(panel.runtimeSettingsDraft.assetStoragePath, "D:\\Chosen");
  assert.equal(panel.runtimeSettings.assetStoragePath, null);
  cancel = true;
  await choose.listeners.click();
  assert.equal(path.value, "D:\\Chosen");
  assert.deepEqual(requests.map((r) => r.op), ["asset-storage-pick", "asset-storage-pick"]);
  const unavailable = setup(async () => { throw Error("must not call"); }, initial(), false);
  assert.equal(all(unavailable.section).some((e) => e.textContent === "폴더 선택"), false);
  assert.ok(unavailable.path);
});

test("migration failure retains the prior current path and the unsaved requested path", async () => {
  const { panel, form, path } = setup(async () => { throw Error("SHA256 collision"); });
  path.value = "D:\\Conflicting";
  path.oninput();
  await save(form);
  assert.equal(panel.runtimeSettings.assetStorage.currentPath, "C:\\CoSkin\\assets");
  assert.equal(panel.runtimeSettingsDraft.assetStoragePath, "D:\\Conflicting");
  assert.equal(panel.message, "SHA256 collision");
  assert.equal(panel.busy, false);
});

test("reset to default is a draft and does not issue a request before save", async () => {
  const requests = [];
  const { panel, section, form } = setup(async (op, data) => { requests.push({ op, data }); return initial(); }, { ...initial(), assetStoragePath: "D:\\Current" });
  await all(section).find((e) => e.textContent === "기본 폴더 사용").listeners.click();
  assert.equal(panel.runtimeSettingsDraft.assetStoragePath, null);
  assert.equal(requests.length, 0);
  await save(form);
  assert.equal(requests[0].data.settings.assetStoragePath, null);
});

test("old runtime settings remain compatible and busy copies disable form inputs", async () => {
  const requests = [];
  const legacy = { launchWithCodex: true, exitWithCodex: false, automaticUpdates: false, startAtSignIn: false };
  const { panel, form, path } = setup(async (op, data) => { requests.push({ op, data }); return legacy; }, legacy);
  assert.equal(path, undefined);
  await save(form);
  assert.equal(Object.hasOwn(requests[0].data.settings, "assetStoragePath"), false);
  panel.runtimeSettings = initial(); panel.busy = true;
  const section = new Element("section"); settingsPage(panel, section);
  for (const input of all(section).filter((e) => e.tag === "input")) assert.equal(input.disabled, true);
});

test("an unchanged path is omitted so a lifecycle-only save cannot undo another window's folder change", async () => {
  const requests = [];
  const { form } = setup(async (op, data) => { requests.push({ op, data }); return initial(); }, { ...initial(), assetStoragePath: "D:\\Existing" });
  await save(form);
  assert.equal(Object.hasOwn(requests[0].data.settings, "assetStoragePath"), false);
});
