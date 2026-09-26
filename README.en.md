# CoSkin

[한국어](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

A Windows theme library for making Codex your own. Choose images, GIFs and effects, then preview, edit and apply them in the actual app.

[Download Windows x64](https://github.com/GNh0/CoSkin/releases/tag/v0.1.0) · [Supported and tested scope](docs/support-matrix.md)

## Install and launch

Extract the ZIP and run **CoSkin.Loader.exe**. Keep the executable, renderer.js and THIRD-PARTY-NOTICES.txt together. End users do not need Node or .NET installed separately.

The installer offers Windows sign-in startup, exit with Codex, a desktop shortcut, .coskin file association and automatic updates. Existing themes and Codex data are preserved.

**Either launch order works: CoSkin → Codex or Codex → CoSkin.** CoSkin waits in the tray when started first and connects to an already running supported Codex without restarting it. Desktop **CoSkin** starts independently; Start menu **Codex + CoSkin** starts both. CoSkin never forces Codex to quit.

Ordinary launch attachment is verified for Windows package **26.924.2738.0**, internal app **26.924.22138**. The connection module verifies the executable, OpenAI signature, ASAR and chrome.dll. Other builds require compatibility review. Both apps need the same Windows privilege level. [Resident architecture](docs/resident-architecture.md)

## Themes and effects

- Open **CoSkin** from the left icon rail. Create, import, delete, preview and apply themes directly from the card library.
- Open a card for a detail page with preview, editing, duplication, export and theme information.
- Right-click a target in actual-screen editing mode. Project and chat row edits default to **all rows of that kind**; individual overrides affect one selected row.
- Choose app-wide, project or chat scope. Saving and applying are separate; cancelling a preview preserves the former application.
- PNG, JPEG and GIF are supported. Adjust image opacity separately from text. Edit base, hover and selected states, plus enter, exit, click and repeating effects.
- [Custom effects](docs/custom-effects.md) use declarative JSON keyframes that can be registered and shared. The renderer uses JavaScript/TypeScript, CSS and the Web Animations API; effect packages do not execute arbitrary JavaScript.

The library is a dedicated page separated from chat. Common backgrounds cover Codex app surfaces, tabs and the app portions of file/browser tools. External website content and Windows dialogs are separate surfaces.

## Tray and updates

The tray provides library, settings, theme selection, decoration toggle, reconnect and exit. Themes are grouped in a submenu, and menus follow the Codex language. Sign-in startup and exit with Codex are independent options.

Automatic updates check **newer stable GitHub Releases**. Publisher signature, SHA-256 and package layout are verified; replacement waits while editing or previewing. A failed new host restores the previous installation. Codex and theme data are not update payloads. Disabling automatic updates stops background update checks; settings still offer a manual check. [Publishing updates](docs/updates.md)

## Actual screens

![0.1.0 theme library](docs/media/theme-library-0.1.0.png)

An independently generated, unofficial Wuthering Waves Shorekeeper fan-art example. It is not bundled in the runtime ZIP. [Media provenance](docs/media/wuthering-waves/ASSET-NOTES.md)

![Theme library](docs/media/wuthering-waves/shorekeeper-theme-library.png)
![Theme detail](docs/media/wuthering-waves/shorekeeper-theme-detail.png)
![Effect editor](docs/media/wuthering-waves/shorekeeper-effect-editor.png)
![Applied background](docs/media/wuthering-waves/shorekeeper-live-applied.png)
![Row hover](docs/media/wuthering-waves/shorekeeper-hover.gif)
![Actual GIF background](docs/media/wuthering-waves/shorekeeper-live-gif.gif)

Some demonstration captures were made with the first beta. They are not frame-rate guarantees or performance benchmarks.

## Performance and languages

UI follows Codex language with **Korean, English, Japanese and Simplified Chinese**, falling back to English for other languages.

Fixed GIF backgrounds continue during wheel scrolling. Effects and GIFs on moving sidebar rows pause briefly to prioritize list responsiveness. Motion stops when hidden, minimized or outside the screen. Windows reduced-motion preference can be followed, overridden with Allow, or replaced with Off. Large GIFs and multiple high-resolution backgrounds still have a cost.

**47 Node tests, 171 host checks**, ESLint and TypeScript checks passed. Actual installation replacement, attachment to existing Codex and data preservation were verified. [Validation scope](docs/support-matrix.md) distinguishes tested conditions from remaining environmental limits.

## Development

Requires Node 24, .NET 10 and Visual Studio 2022 C++ x64 tools for the native module.

```powershell
npm ci --ignore-scripts
npm test
npm run lint
npm run typecheck
./scripts/build.ps1 -Portable
dotnet run --project tests/CoSkin.HostTests
```

Original Codex files, ASAR and shortcuts are not modified. Private logs, user screens, stores and the publisher private key are excluded from releases.

[Design](docs/CoSkin-설계서.md) · [Architecture](docs/architecture.md) · [.coskin contract](docs/coskin-package-v1.md)

## License

CoSkin source does not yet have an assigned license. Dependencies have their own licenses; see [third-party notices](THIRD-PARTY-NOTICES.txt). Character-related rights belong to their respective holders.
