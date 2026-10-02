# CoSkin 0.1.10

Editing an imported theme now preserves the capabilities its author marked as optional. Previously, an ordinary style edit made every decoration mandatory; a Codex window without one of those message or popup surfaces could then reject a theme that had worked before the edit.

New capabilities remain required by default, removed capabilities are dropped, and an explicit required declaration takes precedence over a conflicting optional declaration. Existing revisions, media, and settings are preserved.

Validation: 244 renderer tests, lint, type checking, a packaged Windows build, and the actual edited theme preparation path in both connected Codex windows passed. The live check also rejected an unsupported capability when deliberately made required; all 643 protected revision, library, and preferences files remained identical.
