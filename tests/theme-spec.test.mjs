import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { validateManifest, validateTheme } from "../src/core/engine.ts";

test("published starter theme satisfies the current manifest and theme contracts", () => {
  const base = "docs/examples/basic/";
  const manifest = JSON.parse(fs.readFileSync(base + "manifest.json", "utf8"));
  const theme = JSON.parse(fs.readFileSync(base + "theme.json", "utf8"));
  assert.equal(validateManifest(manifest), manifest);
  assert.equal(validateTheme(theme, []), theme);
  assert.ok(
    theme.profiles.some((profile) => profile.id === manifest.defaultProfile),
  );
  const used = theme.profiles.flatMap((profile) =>
    profile.rules.map((rule) => "target:" + rule.target),
  );
  assert.deepEqual(
    [...new Set(used)].sort(),
    [
      ...manifest.requirements.required,
      ...manifest.requirements.optional,
    ].sort(),
  );
});
