import test from "node:test";
import assert from "node:assert/strict";
import { requireEngineVersion } from "../src/core/engine-version.ts";
import { build } from "esbuild";
import { workspaceBundle } from "./workspace-bundle.mjs";

test("editing text preserves the minimum engine required by a WebM background", () => {
  const manifest = { engine: { minVersion: "0.1.2" } };
  requireEngineVersion(manifest, "0.1.9");
  requireEngineVersion(manifest, "0.1.2");
  assert.equal(manifest.engine.minVersion, "0.1.9");
});

test("a newer Codex package cannot satisfy a theme's newer CoSkin engine requirement", async t => {
  const compiled = await build({stdin: {contents: 'export {validateDocument} from "./src/renderer/controller.js"; export {defaultThemes} from "./src/core/default-themes.ts";', resolveDir: process.cwd()}, bundle: true, write: false, platform: "node", format: "esm", plugins: [workspaceBundle()]});
  const {validateDocument, defaultThemes} = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
  const previous = globalThis.window;
  t.after(() => {if (previous === undefined) delete globalThis.window; else globalThis.window = previous;});
  globalThis.window = {__coskinHostVersion: "26.928.31416", __coskinEngineVersion: "0.1.9"};
  const doc = structuredClone(defaultThemes[0]); doc.manifest.engine.minVersion = "0.2.0";
  await assert.rejects(validateDocument(doc), /엔진 버전/);
  globalThis.window.__coskinEngineVersion = "0.2.0";
  assert.equal(await validateDocument(doc), true);
});

test("numeric version ordering preserves newer engines and upgrades earlier ones", () => {
  for (const [current, required, expected] of [
    ["0.1.10", "0.1.9", "0.1.10"],
    ["0.2.0", "0.1.9", "0.2.0"],
    ["0.1.0", "0.1.2", "0.1.2"],
    ["0.0.9", "0.1.2", "0.1.2"],
    ["0.1.9", "1.0.0", "1.0.0"],
  ]) {
    const manifest = { engine: { minVersion: current } };
    requireEngineVersion(manifest, required);
    assert.equal(manifest.engine.minVersion, expected);
  }
});
