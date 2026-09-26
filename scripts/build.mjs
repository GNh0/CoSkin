import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const portable = process.argv.includes("--portable");
const sdkOption = process.argv.indexOf("--dotnet");
const dotnet = sdkOption >= 0 ? process.argv[sdkOption + 1] : "dotnet";
if (!dotnet) throw new Error("--dotnet 뒤에 SDK 실행 경로가 필요합니다.");
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(process.execPath, ["scripts/bundle.mjs"]);
run(
  dotnet,
  portable
    ? [
        "publish",
        "src/CoSkin.Loader/CoSkin.Loader.csproj",
        "-c",
        "Release",
        "-r",
        "win-x64",
        "--self-contained",
        "true",
        "-p:PublishSingleFile=true",
        "-o",
        "dist/windows",
      ]
    : ["build", "src/CoSkin.Loader/CoSkin.Loader.csproj", "-c", "Release"],
);
