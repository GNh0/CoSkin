# Custom effects

CoSkin uses a TypeScript contract and the Web Animations API. Developers author declarative `*.coskin-effect.json` files, not JavaScript or CSS strings. Selectors, URLs, network access and code execution are rejected.

See [the example](examples/soft-rise.coskin-effect.json). Import it through **Effects → My effects → Import effect**. Resolve a name or ID collision by explicitly renaming the import or replacing the library entry. Selection copies the definition into the theme. Deleting or replacing a library entry leaves theme copies intact. `.coskin` exports include `theme.json.customEffects`.

Version 1 allows `opacity` (0–1, multiplied by static layer opacity), `translateXPx/translateYPx` (−1000–1000), `scale` (0.1–3), `rotateDeg` (−360–360), `blurPx` (0–20, appended to static filters), and `insetTop/Right/Bottom/Left` (0–100%). Use 2–16 frames with strictly increasing offsets, starting at 0 and ending at 1, and the same property set in every frame. Reversal transforms offsets to `1-offset`.

Limits: 8KiB per definition, 32 definitions/64KiB per theme or library, 64KiB per import file, 5 seconds and 1–3 finite repetitions per custom effect. IDs start with `custom.` and use lowercase letters, numbers, dots and hyphens. Name: 80 characters; description: 512. Unknown properties, nonfinite values and unsupported versions fail validation. Syntax diagnostics identify the line and UTF-8 byte position.

`src/core/custom-effects.ts` is the canonical validator/compiler. The host checks JSON size and duplicate keys, then invokes the same renderer contract before registration, theme saving and package import. Run typecheck, lint, Node tests and the host storage tests. Native visual verification is a separate gate.
