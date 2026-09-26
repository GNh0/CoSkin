# CoSkin architecture and change procedure

## Languages and ownership

The C# host targets .NET 10 LTS. It owns Windows package/signature/process/window verification, restricted local connections, ZIP/file boundaries, hash assets, immutable revisions, application transactions and recovery. End users do not need Node.

The renderer runs ES modules in Chromium. Strict TypeScript in `src/core` owns the canonical theme/effect contract and state/scope composition. esbuild bundles the module graph. The host invokes the validator in the connected, verified Codex renderer instead of duplicating semantic rules in C#. Host byte/path checks are a separate trust boundary. Full strict typing of the JavaScript renderer is still incomplete.

`ThemeDocument` contains manifest/theme/hash assets and local item overrides. Packages carry original asset bytes at relative paths. Project/chat IDs stay in local overrides and are excluded from shared themes. UI locale is not theme data.

## Modules

`core` owns contracts, effects, UI state and GIF policy. `adapter` owns version-specific observed data attributes, context/target discovery, rail entry and full-page restoration. Gallery/detail/editor/components/styles own UI and a synthetic preview that never captures real chat content. Locale/message modules own application-language precedence and four dictionaries. Controller/layers/media/worker own invalidation, native input preservation, independent decoration and media lifetime. The host owns launch identity, visibility, library/package storage and classified errors; original diagnostics remain in logs.

## Save and apply

Saving creates a new revision; applying changes a separate scope-to-theme/revision/profile binding. Connected windows prepare and commit before atomic state replacement. Failure restores the previous summary. Import validates ZIP/bytes/semantics/collisions before storing assets; create/save/apply verify referenced hashes and MIME/path consistency. Multiple-window interruption and every failure path still need independent review.

Product file transfers use 24KiB chunks; whole-package Base64 transfers were removed. A legacy Base64 path remains in storage tests. ZIP processing/transfer consumption and browser downloads still allocate complete byte arrays, so maximum-package streaming and memory peaks remain work items.

## Resources and visibility

Static idle screens do not repeatedly enumerate the whole library/document/target set. Observers ignore owned mutations; pointer/focus invalidates relevant targets. Lightweight connection health checks remain. Same-hash decode requests and GIF frames are shared. One scheduler serves active playback; finite GIF loops follow source metadata. Decode cache limits are 128MiB/64 entries; unused LRU data is reduced to 8MiB. Decode peaks, source bytes and host memory require separate measurements.

Verified process HWND candidates are matched to renderer geometry only when unique. Minimized, hidden, cloaked and off-monitor windows pause motion. Uncertain window identity pauses motion while allowing static editing. Coincident windows, mixed DPI and complete occlusion are not claimed as fully supported.

## Builds and upgrades

Exact dependency versions and the lockfile target Node 24 LTS/.NET 10 LTS. Run `npm run typecheck`, `npm run lint`, `npm test`, `node scripts/bundle.mjs`, host build and storage tests. Do not relax PowerShell policy. Relative module IDs and C# PathMap avoid developer paths; Release does not ship PDBs. The packaged notice includes full MIT licenses for gifuct-js and js-binary-schema-parser.

A Codex upgrade requires observed stable attributes, adapter/version updates, contract tests, native input/accessibility/restoration/virtualization checks, CPU/memory measurements and support-table updates. Never alter the original ASAR/executable or disable integrity verification.

## Deployment boundary

Verified copy connection and idempotent `--prepare-launch` do not constitute installation acceptance. The running-original guard remains. Initial self-contained publication exists; the final current artifact has not passed deployment review. Installer CLI wiring, import into an existing connection, single-instance IPC, shortcuts, rollback and native install/uninstall remain incomplete. Uninstall must preserve the user's library/assets.

## Custom effects and evidence

`custom-effects.ts` is the canonical numeric keyframe validator/compiler; the host invokes it for registration/save/import. Library definitions and embedded theme copies are independent. See [custom effects](custom-effects.en.md). Native 7n input/playback/round-trip review is ongoing. [Implementation status](support-matrix.md) and independent `docs/review` evidence distinguish implementation, tests and visual acceptance.
