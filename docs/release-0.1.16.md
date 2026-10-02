# CoSkin 0.1.16

The Dot computer tab's full-size outer container no longer covers the theme with an opaque background. The container immediately outside the native computer surface was missed when the panel had multiple full-area shell branches. Discovery now follows the known computer surface's ancestors inside its native pane, bounded by depth and pane geometry. It preserves the computer preview, video, controls, message content and unrelated overlapping siblings. A newly mounted computer surface also triggers discovery without waiting for a manual refresh.

Regression tests cover this branched layout, late mounting, unchanged computer/video paint, and exact restoration of the original container paint and priority when the theme is disabled. This changes the host panel's background only; it does not extend the measured multi-window playback capacity or claim support for every future UI structure.

In the actual open Dot tab, the outer container changed from opaque `rgb(24, 24, 24)` to transparent paint while the computer surface remained outside CoSkin's paint ownership. The native pane gutter kept its readable backdrop. The integration check preserved settings, library revisions and the original Codex process without changing pages or input focus. Renderer 286 tests, host 494 tests, lint, typecheck and the Windows portable build passed.
