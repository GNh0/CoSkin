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
const paneShellSelector =
  '[data-app-shell-focus-area="secondary"],[data-app-shell-focus-area="right-panel"],[data-app-shell-focus-area="bottom-panel"],[data-app-shell-right-panel]';
const shellAnchorSelector =
  '[data-app-shell-focus-area="main"],[data-app-shell-main-surface],main,[role="main"],' +
  paneShellSelector;
const contentBoundarySelector =
  protectedFooterSelector +
  ',[data-message-id],[data-message-author-role],article,pre,canvas,video,input,textarea,[contenteditable="true"],.monaco-editor,.cm-editor,[data-summary-panel-variant],[data-codex-cloud-computer],[data-dot-computer-preview]';

function coversShell(element, bounds) {
  const rect = element.getBoundingClientRect();
  return (
    rect.width >= bounds.width * 0.85 &&
    rect.height >= bounds.height * 0.85 &&
    Math.abs(rect.left - bounds.left) <= bounds.width * 0.08 &&
    Math.abs(rect.top - bounds.top) <= bounds.height * 0.08
  );
}

export function shellPaintMutationNeedsDiscovery(record) {
  if (
    record.type !== "childList" ||
    record.target.nodeType !== 1 ||
    record.target.closest(contentBoundarySelector)
  )
    return false;
  const anchor = record.target.closest(shellAnchorSelector);
  if (!anchor) return false;
  const bounds = record.target.getBoundingClientRect();
  if (bounds.width < 180 || bounds.height < 180) return false;
  return [...record.addedNodes].some(
    (element) =>
      element.nodeType === 1 &&
      element.isConnected &&
      !element.closest(contentBoundarySelector) &&
      element.matches('div,section,main,[role="main"]') &&
      coversShell(element, bounds),
  );
}

// New pages can add opaque structural wrappers without a page-specific route.
// Peel one full-area shell branch per pane. Message cards, editor content and
// embedded computer/browser surfaces keep their native paint.
export function structuralShellPaintSources(root) {
  const result = new Set();
  for (const anchor of [...root.querySelectorAll(shellAnchorSelector)].slice(
    0,
    64,
  )) {
    if (!anchor.isConnected || anchor.closest(contentBoundarySelector))
      continue;
    const bounds = anchor.getBoundingClientRect();
    if (bounds.width < 180 || bounds.height < 180) continue;
    result.add(anchor);
    let branch = anchor;
    for (let depth = 0; depth < 16; depth++) {
      const candidates = [...branch.children].filter((element) => {
        if (!element.isConnected || element.closest(contentBoundarySelector))
          return false;
        return coversShell(element, bounds);
      });
      if (candidates.length !== 1) break;
      branch = candidates[0];
      result.add(branch);
    }
  }
  return [...result];
}

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
      ) ||
      (!composer && element.closest(contentBoundarySelector))
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
      const main =
        element.closest("[data-app-shell-main-surface]") ||
        element.closest('[data-app-shell-focus-area="main"]');
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
      panelBackdrop:
        !!element.closest(paneShellSelector) &&
        element.matches("[data-app-shell-compact-page-gutter]"),
      fileTree: element.matches(
        'file-tree-container[data-file-tree-virtualized="true"]',
      ),
    });
  }
  if (!composer) {
    const seen = new Set(sources.map(({ element }) => element));
    for (const element of structuralShellPaintSources(root))
      if (!seen.has(element)) sources.push({ element, clearImage: false });
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
