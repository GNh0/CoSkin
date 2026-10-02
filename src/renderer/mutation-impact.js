import {
  greetingHeadingSelector,
  greetingMutationNeedsDiscovery,
  homeSuggestionSelector,
  nativeGreetingSelector,
} from "./background-view.js";

const ownedSelector =
  "[data-coskin-ui],[data-coskin-decoration],[data-coskin-transition]";
const discoverySelector = [
  "#root",
  "[data-app-navigation-rail]",
  "[data-sidebar-destination]",
  "[data-app-shell-main-surface]",
  'main,[role="main"]',
  "[data-start-screen-greeting]",
  "[data-home-empty-state]",
  "h1,h2",
  nativeGreetingSelector,
  homeSuggestionSelector,
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
  '[role="tooltip"][id]',
].join(",");

export function mutationNeedsDiscovery(records) {
  const owned = (node) => node.nodeType === 1 && !!node.closest(ownedSelector);
  const greetingInSubtree = (node) =>
    greetingMutationNeedsDiscovery({ target: node }) ||
    [...(node.querySelectorAll?.(greetingHeadingSelector) || [])].some(
      (element) => greetingMutationNeedsDiscovery({ target: element }),
    );
  const relevant = (node) =>
    node.nodeType === 1 &&
    !owned(node) &&
    (node.matches(discoverySelector) ||
      !!node.querySelector(discoverySelector) ||
      greetingInSubtree(node));
  return records.some(
    (record) =>
      !owned(record.target) &&
      (record.type === "characterData"
        ? greetingMutationNeedsDiscovery(record)
        : record.type === "attributes" ||
          greetingMutationNeedsDiscovery(record) ||
          (record.target.nodeType === 1 &&
            record.target.matches(
              '[data-thread-scroll-footer],[data-codex-composer-root],[data-composer-body],[data-app-shell-main-surface],[data-app-shell-focus-area="main"],main,[role="main"]',
            )) ||
          [...record.addedNodes, ...record.removedNodes].some(relevant)),
  );
}
