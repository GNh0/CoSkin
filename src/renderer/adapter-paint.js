// Code-owned paint boundaries. External webviews and editor content are excluded.
const composerBodySelector =
  "[data-composer-surface-variant][data-composer-layout],[data-composer-body]";
const composerSelector =
  composerBodySelector +
  ',[data-composer-rail-item="present"],[data-composer-rail][data-composer-rail-placement="above"]';
const commonSelector =
  '[data-app-shell-main-surface],[data-app-shell-compact-page-gutter],[data-new-tab-scroll-root],[data-app-shell-focus-area="main"] > div,[data-app-shell-focus-area="main"] [class~="electron:bg-surface"],[role="tabpanel"][data-app-shell-tab-panel-controller][data-tab-id^="text-editor:"] nav.h-toolbar-pane.bg-surface,[role="tabpanel"][data-app-shell-tab-panel-controller] div.relative.h-12.w-full.bg-surface,file-tree-container[data-file-tree-virtualized="true"]';
const footerSelector =
  '[data-thread-scroll-footer="true"] > div,[data-app-action-timeline-scroll] .pointer-events-none.sticky > .pointer-events-none.absolute.bg-gradient-to-t';
const threadFooterSelector = '[data-thread-scroll-footer="true"]';
const protectedFooterSelector =
  '[data-coskin-ui],[data-coskin-decoration],[data-coskin-transition],iframe,webview,[role="dialog"],[role="menu"],[role="listbox"],[role="tooltip"],[popover]';

function nativeComposerFooter(footer) {
  if (
    !footer?.matches(threadFooterSelector) ||
    !footer.closest("[data-app-action-timeline-scroll]") ||
    footer.closest(protectedFooterSelector)
  )
    return false;
  const style = getComputedStyle(footer);
  return (
    style.position === "absolute" &&
    style.pointerEvents === "none" &&
    [...footer.children].some((child) => {
      if (!child.matches('[data-pip-obstacle="thread-footer"]')) return false;
      const body = child.querySelector(composerBodySelector);
      return body && !body.closest(protectedFooterSelector);
    })
  );
}

function solidComposerBackdrop(element) {
  return (
    nativeComposerFooter(element.parentElement) &&
    element.tagName === "DIV" &&
    !element.children.length &&
    !element.textContent.trim() &&
    !element.closest(protectedFooterSelector)
  );
}

export function discoverPaintSources(target, root, retained = new Map()) {
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
    : commonSelector +
      "," +
      footerSelector +
      (target === "app.background" ? "," + threadFooterSelector : "");
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
    if (target === "app.background" && element.matches(threadFooterSelector)) {
      // Focus mode can paint the footer itself. Its interactive sibling keeps
      // its own input/button paint; only this structural wrapper is cleared.
      if (nativeComposerFooter(element))
        sources.push({ element, clearImage: false });
      continue;
    }
    if (element.matches(footerSelector)) {
      const style = getComputedStyle(element);
      const gradient =
        style.backgroundImage.startsWith("linear-gradient(") ||
        retained.get(element)?.clearImage === true;
      if (
        style.pointerEvents === "none" &&
        style.position === "absolute" &&
        (gradient ||
          (target === "app.background" && solidComposerBackdrop(element))) &&
        !element.querySelector('button,input,textarea,[contenteditable="true"]')
      )
        sources.push({ element, clearImage: gradient });
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
