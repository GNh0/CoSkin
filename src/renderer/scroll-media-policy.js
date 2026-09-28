const movingRows = new Set([
  "sidebar.project-row",
  "sidebar.thread-row",
  "sidebar.thread-preview",
]);

// Fixed surfaces keep their GIF clock. Only moving sidebar rows are deferred.
// This decision needs no geometry or computed style reads.
export function sidebarForScroll(eventTarget) {
  const element = eventTarget?.closest
    ? eventTarget
    : eventTarget?.parentElement;
  return element?.closest?.('[data-app-shell-left-panel-appearance="default"]');
}

export function pauseMediaForSidebarScroll(target, sidebar) {
  return movingRows.has(target.target) && !!sidebar?.contains(target.el);
}

export function pauseMediaForScroll(target, eventTarget) {
  return (
    movingRows.has(target.target) &&
    pauseMediaForSidebarScroll(target, sidebarForScroll(eventTarget))
  );
}
