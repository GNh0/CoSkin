const ownedSelector =
  "[data-coskin-ui],[data-coskin-decoration],[data-coskin-transition]";
const discoverySelector = [
  "#root",
  "[data-app-navigation-rail]",
  "[data-sidebar-destination]",
  "[data-app-shell-main-surface]",
  "[data-app-shell-left-panel-appearance]",
  "[data-app-action-sidebar-thread-row]",
  "[data-app-action-sidebar-project-row]",
  "[data-app-action-sidebar-project-list-id]",
  "[data-codex-composer-root]",
  "[data-composer-body]",
  "[data-composer-rail]",
  "[data-thread-scroll-footer]",
  "[data-app-shell-compact-page-gutter]",
  "[data-new-tab-scroll-root]",
  "[data-app-shell-focus-area]",
  "[data-composer-rail-item]",
  "[data-summary-panel-variant]",
  "[data-app-shell-tab-panel-controller]",
  "[data-file-tree-virtualized]",
  "button[aria-label]",
  "button[title]",
  '[role="dialog"]',
  '[role="tooltip"][data-side="right"]',
].join(",");

export function mutationNeedsDiscovery(records) {
  const owned = (node) => node.nodeType === 1 && !!node.closest(ownedSelector);
  const relevant = (node) =>
    node.nodeType === 1 &&
    !owned(node) &&
    (node.matches(discoverySelector) ||
      !!node.querySelector(discoverySelector));
  return records.some(
    (record) =>
      !owned(record.target) &&
      (record.type === "attributes" ||
        (record.target.nodeType === 1 &&
          record.target.matches(
            "[data-thread-scroll-footer],[data-codex-composer-root],[data-composer-body]",
          )) ||
        [...record.addedNodes, ...record.removedNodes].some(relevant)),
  );
}
