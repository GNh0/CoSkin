<img src="assets/coskin.svg" alt="CoSkin" width="64">

# CoSkin

**Make Codex your own.**

Style Codex with images, animated backgrounds and effects. Pick a theme, preview it in the actual app, and apply it with a click.

[한국어](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

[Download for Windows](https://github.com/GNh0/CoSkin/releases/latest) · [Theme file specification](docs/theme-package-spec.md) · [Custom effects](docs/custom-effects.md) · [Compatibility](docs/support-matrix.md)

![Codex styled with CoSkin](docs/media/wuthering-waves/shorekeeper-live-applied.png)

## Get started

1. Download the ZIP from the [latest release](https://github.com/GNh0/CoSkin/releases/latest) and extract it.
2. Run **CoSkin.Loader.exe** and choose your installation options.
3. Start Codex and CoSkin. **They connect automatically in either launch order.**

CoSkin waits in the tray if started first. Use the desktop **CoSkin** shortcut to start it independently, or **Codex + CoSkin** in the Start menu to launch both. No development tools are needed.

Run Codex and CoSkin on **Windows x64** at the same Windows privilege level. From CoSkin 0.1.6, connection checks the original signatures and runtime capabilities instead of a fixed Codex version list. Verified on Codex 26.928.2636.0. Future changes to the internal connection APIs may require a CoSkin update.

## What can you customize?

| Feature                 | What you can do                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Theme library           | Create, import and delete; preview and apply directly from cards                                        |
| Organization and search | Nested folder tree, favorites and tags; numbered pages, sorting and multi-select organization             |
| Details and editing     | Edit theme information, duplicate, edit in the actual app and export                                    |
| Images, GIFs and video  | Set backgrounds, decorations and icons; loop muted MP4 video; see resolution and aspect recommendations |
| Text styles             | Theme-tinted automatic text colors or your own color, installed font and weight                         |
| Animation effects       | Configure hover, click and selected states, plus enter, exit and repeating effects                      |
| Application scope       | Apply across the app, projects or chats; override individual items                                      |
| Languages               | Follow Codex in Korean, English, Japanese or Simplified Chinese                                         |

## Choose and edit a theme

Open **CoSkin** from the left icon rail. Use **Preview** on a card to try a theme and **Apply** to use it. Click the card for details, editing, duplication and export.

To ask an AI assistant to make a theme, share the [request template](docs/theme-request-template.md) and [package specification](docs/theme-package-spec.md). CoSkin 0.1.4 and later also offer an editable **Request a theme** action in the library.

|                    Theme library                     |                           Details and preview                            |
| :--------------------------------------------------: | :----------------------------------------------------------------------: |
| ![Theme library](docs/media/theme-library-0.1.2.png) | ![Theme detail](docs/media/wuthering-waves/shorekeeper-theme-detail.png) |

In editing mode, **right-click** the area you want to customize to adjust its images, effects and styles. Project and chat row edits apply to all rows of the same kind by default; choose an **individual override** to change just one item.

**Save** keeps your theme changes; **Apply** uses them in the selected scope. Cancel a preview to return to the previous theme. Add and share your own effects with the [custom effects guide](docs/custom-effects.md).

Use the **folder tree** to create, expand and collapse nested folders. **Include subfolders** shows themes across a parent folder, and selection mode moves multiple themes or updates favorites and tags. Numbered, first/last and direct page navigation with 24/48/96 items make large libraries easier to browse. Returning from details preserves the query and list position. [Library guide](docs/theme-library.md)

**Match text colors automatically** prioritizes contrast with a subtle theme tint. When needed, it strengthens the surface behind text to keep bright video readable. Select **Choose manually** in the text editor to choose a color, installed font and weight for that area.

## Animated backgrounds and effects

Combine a GIF background with row hover effects to create your own theme.

Use GIF for short scenes and **MP4** for longer character motion. MP4 loops muted; the **No effects** profile shows a still image. Playback resumes from its position after minimizing and restoring. Image controls show resolution and aspect recommendations for the selected area. Choose **Show entire image** to keep the full action visible.

![Animated GIF background](docs/media/wuthering-waves/shorekeeper-live-gif.gif)

<details>
<summary>View the effect editor and hover example</summary>

**Effect editor**

![Effect editor](docs/media/wuthering-waves/shorekeeper-effect-editor.png)

**Project row hover**

![Project row hover effect](docs/media/wuthering-waves/shorekeeper-hover.gif)

</details>

Screens show an unofficial Wuthering Waves Shorekeeper fan-art theme. [Image and GIF credits](docs/media/wuthering-waves/ASSET-NOTES.md)

## Startup and updates

Change themes or open **CoSkin settings** from the tray.
If the dark layer over the background disappears, choose **Refresh theme** from the tray to redraw the current theme.

- **Start at Windows sign-in**: keep CoSkin ready to connect when Codex starts.
- **Exit with Codex**: close CoSkin when the last connected Codex exits.
- **Automatic updates**: download and install new stable GitHub releases. Manual checks are also available in settings.

If a GIF does not animate, check the motion option in effect settings and the Windows **reduced motion** preference. Large GIFs can affect scrolling performance.

## Learn more

[Development and build](docs/development.md) · [Custom effects](docs/custom-effects.md) · [Supported environments](docs/support-matrix.md) · [Publishing updates](docs/updates.md)

CoSkin source does not yet have an assigned license. See [third-party notices](THIRD-PARTY-NOTICES.txt) for dependency licenses.
