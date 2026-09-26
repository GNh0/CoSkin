# CoSkin

[한국어](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

A Windows extension that opens a managed theme library from **CoSkin** in the Codex icon rail, with previews, editing and explicit application.

**0.1.0-beta.1 is a test prerelease.** This unofficial extension remains under review; it is not a claim of completed production support.

[Download for Windows x64](https://github.com/GNh0/CoSkin/releases/tag/v0.1.0-beta.1) · [Release notes (Korean)](docs/release-0.1.0-beta.1.md)

## Install and start

Extract the Windows x64 ZIP and double-click `CoSkin.Loader.exe` to open per-user setup. Keep all three files together. No separate Node or .NET installation is required. Start with **Codex + CoSkin** from the Start menu. If original Codex is running, save your work and close it normally first; CoSkin does not force it to quit.

This beta uses the verified dedicated shortcut. Automatic attachment to Codex started normally and automatic CoSkin startup at Windows sign-in are not supported yet.

Launch and exit coupling are independent options. The system tray offers theme application, decoration on/off, library/settings and exit. Uninstall through Windows Apps; themes and assets are retained. Cleanup of a running installation's remaining binaries is still being reviewed.

## Known limitations

- **Chat scrolling with a large GIF background can pause or stutter the GIF.** Improvement is deferred until after this test release. Built-in themes use static backgrounds.
- The reviewed Codex Windows package is **26.924.1866.0**, internal app **26.924.20706**. Other versions may stop connecting.
- Automatic-update settings exist, but a production signing key/release and actual host replacement are not ready. Install newer packages manually for now.
- Multiple-window lifecycle, fresh-user installation, every effect combination and maximum-package memory remain under review.

## Actual application examples

A separately generated, unofficial Wuthering Waves Shorekeeper fan-art example, not a bundled default theme. No private chats or user uploads are included. See [media attribution and generation notes](docs/media/wuthering-waves/ASSET-NOTES.md).

![Theme library](docs/media/wuthering-waves/shorekeeper-theme-library.png)
![Applied Shorekeeper theme](docs/media/wuthering-waves/shorekeeper-live-applied.png)
![Theme detail](docs/media/wuthering-waves/shorekeeper-theme-detail.png)
![Effect editor](docs/media/wuthering-waves/shorekeeper-effect-editor.png)
![Row hover effect](docs/media/wuthering-waves/shorekeeper-hover.gif)
![GIF background in the actual app](docs/media/wuthering-waves/shorekeeper-live-gif.gif)

The animated-background example is sampled from the actual app. It does not establish smooth playback; see the GIF scrolling limitation above.

## Workflow

Preview, apply or delete directly from a card, or click its body to open a separate detail page. Editing returns to the real Codex screen. Only editing mode replaces the target's context menu with CoSkin settings; leaving restores the original menu. Saving and applying are separate. Cancelling a preview preserves the previous application.

PNG, JPEG and animated GIF images are supported. Image opacity remains independent of original text and input behavior. Reduced motion, hidden, minimized and off-monitor states stop animation. `.coskin` is an import/export format; imported themes and assets live in the internal library and remain usable after the external source is removed.

## Implementation and verification

A review copy verified the full page to the right of the rail, responsive cards/detail, library actions, native editing/menu restoration, PNG/JPEG/GIF decoding and independent opacity, source GIF loop counts, minimize/off-monitor pause/resume, chunked transfers, custom-effect registration/playback/package round trips, theme metadata editing, and continuous hover transitions. Recent checks also verified summary/file-tree paint restoration and pointer-over-list wheel scrolling. Final visual approval, multiple-window lifecycle, all effect semantics, maximum-package memory, normal launch, installation and file association remain incomplete. See the [implementation status](docs/support-matrix.md).

The UI prioritizes Codex's application language. Korean, English, Japanese and Simplified Chinese UI/accessibility/error dictionaries are implemented. Chinese regions fall back to Simplified Chinese; other unsupported languages use English. Gallery/detail/editor switching and overflow were checked by temporarily changing document lang. Every target and error path under actual account language settings has not been verified.

## Development

Use Node 24 LTS and the .NET 10 LTS SDK. The end-user host is designed to run without Node. Dependencies use exact versions and a lockfile.

```powershell
npm ci --ignore-scripts
npm test
node scripts/bundle.mjs
dotnet build src/CoSkin.Loader/CoSkin.Loader.csproj
dotnet run --project tests/CoSkin.HostTests/CoSkin.HostTests.csproj
```

Do not weaken execution policy. Use these direct commands where scripts are restricted. Original Codex executables, ASAR files and integrity settings remain intact.

[Product design](docs/CoSkin-설계서.md) · [Package contract](docs/coskin-package-v1.md) · [Architecture and changes](docs/architecture.md)

Private raw experiment logs and screenshots are excluded from public distribution. Online galleries and advanced keyframes are deferred.


[Custom effect development](docs/custom-effects.en.md). Registration, playback and package round trips passed native review; this does not establish every possible effect combination.

## Licensing

CoSkin's own source license is unspecified; the scope of granted rights has not been decided. Third-party components retain their separate licenses. [Third-party notices](THIRD-PARTY-NOTICES.txt) include gifuct-js, its parser and the bundled .NET runtime license/notices. Example fan art is separately generated media, not a redistribution of official character artwork.
