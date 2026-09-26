const movingRows = new Set([
  "sidebar.project-row",
  "sidebar.thread-row",
  "sidebar.thread-preview",
]);

// Fixed surfaces keep their GIF clock. Only moving sidebar rows are deferred.
// This decision needs no geometry or computed style reads.
export function pauseMediaForScroll(target, eventTarget) {
  if (!movingRows.has(target.target)) return false;
  const element = eventTarget?.closest
    ? eventTarget
    : eventTarget?.parentElement;
  const sidebar = element?.closest?.(
    '[data-app-shell-left-panel-appearance="default"]',
  );
  return !!sidebar?.contains(target.el);
}
