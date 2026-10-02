# CoSkin 0.1.11

Contained app backgrounds now fit below Codex's native menu and page title bars. Previously, a portrait video could fit the full window while its head disappeared behind those bars. Videos and their paused previews keep the original aspect ratio and fit within the remaining area, including after resizing the window. The existing top-bar mask and menu and control styling remain in place for readability. Cover backgrounds and sidebar decorations retain their existing layout.

This corrects application overlap. Any cropping or masking already embedded inside a source video still needs a separate media revision. Existing themes, media, and preferences are preserved.

Validation: 247 renderer tests, lint, type checking, and independent source review passed. Four affected backgrounds played for at least 20 seconds each in the actual Codex Home window, with heads visible in the representative captures and no playback errors. Nine management and editor screens also passed at an actual 760×680 viewport without horizontal overflow; the native window placement, original theme binding, and all 717 protected files were restored.
