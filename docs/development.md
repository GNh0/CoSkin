# Development and build

For contributors building CoSkin from source. Installation and usage are covered in the [README](../README.en.md).

## Requirements

- Windows x64.
- Node 24 and .NET 10 SDK.
- Visual Studio 2022 C++ x64 build tools for the native connection module.

## Build and check

Run from the repository root:

```powershell
npm ci --ignore-scripts
npm test
npm run lint
npm run typecheck
./scripts/build.ps1 -Portable
dotnet run --project tests/CoSkin.HostTests
```

The portable Windows output is in `dist/windows`. Keep CoSkin.Loader.exe, renderer.js and THIRD-PARTY-NOTICES.txt together.

## Project documentation

- [Architecture and change procedure](architecture.md)
- [Supported Codex builds and validation](support-matrix.md)
- [Custom effect development](custom-effects.md)
- [.coskin package format](coskin-package-v1.md)
- [GitHub release packaging and signing](updates.md)
