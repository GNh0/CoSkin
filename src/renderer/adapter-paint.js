// Codex 26.924.20706 paint boundaries. External webviews and editor content are excluded.
const composerSelector =
  '[data-composer-surface-variant][data-composer-layout],[data-composer-body],[data-composer-rail-item="present"],[data-composer-rail][data-composer-rail-placement="above"]';
const commonSelector =
  '[data-app-shell-main-surface],[data-app-shell-compact-page-gutter],[data-new-tab-scroll-root],[data-app-shell-focus-area="main"] > div,[data-app-shell-focus-area="main"] [class~="electron:bg-surface"],[role="tabpanel"][data-app-shell-tab-panel-controller][data-tab-id^="text-editor:"] nav.h-toolbar-pane.bg-surface,[role="tabpanel"][data-app-shell-tab-panel-controller] div.relative.h-12.w-full.bg-surface,file-tree-container[data-file-tree-virtualized="true"]';
const footerSelector =
  '[data-thread-scroll-footer="true"] > div,[data-app-action-timeline-scroll] .pointer-events-none.sticky > .pointer-events-none.absolute.bg-gradient-to-t';

export function discoverPaintSources(target, root, retained) {
  if (target === "summary.surface")
    return [...root.querySelectorAll("header")]
      .filter(
        (element) =>
          element.isConnected && !element.closest("[data-coskin-ui]"),
      )
      .map((element) => ({ element, clearImage: false, summaryHeader: true }));
  const composer = target === "composer.surface";
  if (!composer && target !== "app.background" && target !== "main.surface")
    return [];
  const sources = [];
  const selector = composer
    ? composerSelector
    : commonSelector + "," + footerSelector;
  for (const element of root.querySelectorAll(selector)) {
    if (
      !element.isConnected ||
      element.closest(
        "[data-coskin-ui],[data-coskin-decoration],[data-coskin-transition]",
      )
    )
      continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (composer) {
      sources.push({
        element,
        clearImage: false,
        fileTree: element.matches(
          'file-tree-container[data-file-tree-virtualized="true"]',
        ),
      });
      continue;
    }
    if (element.matches(footerSelector)) {
      const style = getComputedStyle(element);
      if (
        style.pointerEvents === "none" &&
        style.position === "absolute" &&
        (style.backgroundImage.startsWith("linear-gradient(") ||
          retained.has(element)) &&
        !element.querySelector('button,input,textarea,[contenteditable="true"]')
      )
        sources.push({ element, clearImage: true });
      continue;
    }
    if (
      (element.parentElement?.matches('[data-app-shell-focus-area="main"]') ||
        element.matches('[class~="electron:bg-surface"]')) &&
      !element.matches(
        "[data-app-shell-main-surface],[data-app-shell-compact-page-gutter],[data-new-tab-scroll-root]",
      )
    ) {
      const main = element.closest("[data-app-shell-main-surface]");
      const bounds = main?.getBoundingClientRect();
      if (
        !bounds ||
        rect.width * rect.height < bounds.width * bounds.height * 0.8
      )
        continue;
    }
    sources.push({
      element,
      clearImage: false,
      fileTree: element.matches(
        'file-tree-container[data-file-tree-virtualized="true"]',
      ),
    });
  }
  if (target === "app.background")
    for (const element of root.querySelectorAll(
      'header.h-toolbar.draggable,[data-app-shell-titlebar="true"]',
    )) {
      if (
        !element.isConnected ||
        element.closest("[data-coskin-ui],[data-coskin-decoration]")
      )
        continue;
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0)
        sources.push({ element, clearImage: false, chromeHeader: true });
    }
  return sources;
}
