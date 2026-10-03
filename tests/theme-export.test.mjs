import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { workspaceBundle } from "./workspace-bundle.mjs";

const compiled = await build({
  stdin: { contents: 'export {Panel} from "./src/renderer/panel.js"', resolveDir: process.cwd() },
  bundle: true, write: false, platform: "node", format: "esm", plugins: [workspaceBundle()],
});
const { Panel } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));

test("the export button opens the native save path for the selected revision and cancellation starts no browser download", async () => {
  for (const response of [{ saved: true, path: "I:\\UserExports\\theme.coskin" }, { canceled: true }]) {
    const calls = [];
    const panel = Object.create(Panel.prototype);
    panel.selected = "example.native";
    panel.baseRevision = 4;
    panel.c = { summary: { themeExportAvailable: true }, request: async (op, data) => { calls.push({ op, data }); return response; } };
    await panel.export();
    assert.deepEqual(calls, [{ op: "theme-export-save", data: { id: "example.native", revision: 4 } }]);
  }
});
