import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const workspace = process.cwd();
const sourceModules = {
  name: "workspace-modules",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      let resolved =
        args.path.startsWith(".") || args.path.startsWith("src/")
          ? path.resolve(
              args.importer
                ? path.dirname(path.resolve(workspace, args.importer))
                : workspace,
              args.path,
            )
          : require.resolve(args.path, {
              paths: [
                args.importer
                  ? path.dirname(path.resolve(workspace, args.importer))
                  : workspace,
              ],
            });
      if (!fs.existsSync(resolved)) {
        if (fs.existsSync(resolved + ".js")) resolved += ".js";
        else if (fs.existsSync(path.join(resolved, "index.js")))
          resolved = path.join(resolved, "index.js");
      }
      if (fs.statSync(resolved).isDirectory())
        resolved = require.resolve(resolved);
      if (!resolved.startsWith(workspace + path.sep))
        throw Error("모듈이 작업 폴더를 벗어났습니다.");
      return {
        path: path.relative(workspace, resolved).split(path.sep).join("/"),
        namespace: "workspace",
      };
    });
    build.onLoad({ filter: /.*/, namespace: "workspace" }, (args) => ({
      contents: fs.readFileSync(path.resolve(workspace, args.path), "utf8"),
      loader: args.path.endsWith(".css")
        ? "text"
        : args.path.endsWith(".json")
          ? "json"
          : args.path.endsWith(".ts")
            ? "ts"
            : "js",
    }));
  },
};
const common = {
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome140",
  minify: false,
  legalComments: "none",
  plugins: [sourceModules],
};
const worker = await build({
  ...common,
  entryPoints: ["src/renderer/gif-worker.js"],
  write: false,
});
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync(
  "dist/gif-worker.json",
  JSON.stringify(worker.outputFiles[0].text),
);
await build({
  entryPoints: ["src/renderer/entry.js"],
  outfile: "dist/renderer.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome140",
  minify: false,
  sourcemap: "external",
  legalComments: "none",
  plugins: [sourceModules],
});
