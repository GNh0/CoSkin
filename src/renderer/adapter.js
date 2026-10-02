import { nativeControlNames } from "./adapter-labels.js";
import { discoverPaintSources } from "./adapter-paint.js";
export function visibleMainSurfaces(document) {
  return [
    ...document.querySelectorAll(
      'main[data-app-shell-main-surface],main[data-app-shell-focus-area="main"],[role="main"][data-app-shell-main-surface]',
    ),
  ].filter((element) => {
    const bounds = element.getBoundingClientRect();
    return (
      bounds.width > 0 &&
      bounds.height > 0 &&
      !element.closest?.(
        '[hidden],[aria-hidden="true"],[data-coskin-ui],iframe,webview',
      )
    );
  });
}
export function visibleComposerSurfaces(document) {
  const roots = new Set();
  for (const surface of document.querySelectorAll(
    "[data-composer-surface-variant][data-composer-layout]",
  )) {
    if (
      !surface.querySelector('[contenteditable="true"][data-codex-composer]') ||
      surface.closest('[hidden],[aria-hidden="true"]')
    )
      continue;
    const bounds = surface.getBoundingClientRect();
    if (bounds.width > 0 && bounds.height > 0)
      roots.add(surface.closest("[data-codex-composer-root]") || surface);
  }
  return [...roots];
}
// Discover supported DOM markers at runtime. Themes cannot supply selectors;
// the host still verifies the signed original application and page identity.
export class CodexAdapter {
  constructor(document, version = "unknown") {
    this.document = document;
    this.version = version;
    this.supportedTargets = [
      "app.background",
      "main.surface",
      "summary.surface",
      "sidebar.surface",
      "navigation.bar",
      "navigation.home",
      "navigation.automations",
      "navigation.library",
      "navigation.images",
      "navigation.plugins",
      "navigation.search",
      "navigation.new-thread",
      "sidebar.thread-row",
      "sidebar.project-row",
      "composer.surface",
      "composer.send",
      "composer.stop",
      "dialog.surface",
      "sidebar.thread-preview",
    ];
  }
  context() {
    const active = this.document.querySelector(
      '[data-app-action-sidebar-thread-active="true"]',
    );
    return {
      thread: active?.getAttribute("data-app-action-sidebar-thread-id") || null,
      project:
        active
          ?.closest("[data-app-action-sidebar-project-list-id]")
          ?.getAttribute("data-app-action-sidebar-project-list-id") ||
        this.document
          .querySelector(
            '[data-app-action-sidebar-project-row][aria-current="page"]',
          )
          ?.getAttribute("data-app-action-sidebar-project-id") ||
        null,
    };
  }
  discover() {
    const d = this.document;
    const result = [];
    const add = (target, el, item = null, context = {}) => {
      if (el && !el.closest("[data-coskin-ui]"))
        result.push({
          target,
          el,
          item,
          context,
          paintSources: [
            "app.background",
            "main.surface",
            "composer.surface",
            "summary.surface",
          ].includes(target)
            ? (retained) => discoverPaintSources(target, el, retained)
            : undefined,
        });
    };
    add("app.background", d.querySelector("#root"));
    for (const main of visibleMainSurfaces(d)) add("main.surface", main);
    const sidebar = d.querySelector(
      'aside[data-app-shell-left-panel-appearance="default"]',
    );
    add("sidebar.surface", sidebar);
    // Navigation matches a narrow vertical container with original icon-only buttons.
    const candidates = [
      ...d.querySelectorAll('nav[data-app-navigation-rail="true"]'),
    ].filter((n) => {
      const r = n.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.width < 100 &&
        r.height > 150 &&
        n.querySelectorAll("button").length >= 2
      );
    });
    this.navigation = candidates.length === 1 ? candidates[0] : null;
    add("navigation.bar", this.navigation);
    const homes = d.querySelectorAll(
      'button[data-sidebar-destination="builtin:home"]',
    );
    if (homes.length === 1) add("navigation.home", homes[0]);
    for (const [destination, target] of [
      ["automations", "navigation.automations"],
      ["library", "navigation.library"],
      ["images", "navigation.images"],
      ["customize", "navigation.plugins"],
    ]) {
      const buttons = d.querySelectorAll(
        `button[data-sidebar-destination="builtin:${destination}"]`,
      );
      if (buttons.length === 1) add(target, buttons[0]);
    }
    const named = (names) =>
      [...d.querySelectorAll("button")]
        .filter(
          (b) =>
            names.includes(b.getAttribute("aria-label")) ||
            names.includes(b.getAttribute("title")),
        )
        .filter(
          (b) => b.querySelector("svg") && b.getBoundingClientRect().width > 0,
        );
    for (const [target, names] of Object.entries(nativeControlNames)) {
      const found = named(names);
      if (found.length === 1) add(target, found[0]);
    }
    for (const el of d.querySelectorAll(
      "[data-app-action-sidebar-thread-row]",
    )) {
      const id = el.getAttribute("data-app-action-sidebar-thread-id");
      const project =
        el
          .closest("[data-app-action-sidebar-project-list-id]")
          ?.getAttribute("data-app-action-sidebar-project-list-id") || null;
      if (id) add("sidebar.thread-row", el, id, { thread: id, project });
    }
    for (const el of d.querySelectorAll(
      "[data-app-action-sidebar-project-row]",
    )) {
      const id = el.getAttribute("data-app-action-sidebar-project-id");
      if (id && id.length <= 512)
        add("sidebar.project-row", el, id, { project: id });
    }
    const composers = visibleComposerSurfaces(d);
    if (composers.length === 1) add("composer.surface", composers[0]);
    for (const summary of d.querySelectorAll(
      '[data-summary-panel-variant="summary"]',
    ))
      add("summary.surface", summary);
    const cards = [
      ...d.querySelectorAll('div[role="tooltip"][data-side="right"]'),
    ];
    if (cards.length === 1 && this.hoveredThread?.el.isConnected) {
      const row = this.hoveredThread.el.getBoundingClientRect(),
        card = cards[0].getBoundingClientRect();
      if (
        card.left >= row.right - 16 &&
        card.top < row.bottom &&
        card.bottom > row.top
      )
        add(
          "sidebar.thread-preview",
          cards[0],
          this.hoveredThread.item,
          this.hoveredThread.context,
        );
    }
    for (const el of d.querySelectorAll('[role="dialog"]'))
      add("dialog.surface", el);
    return result;
  }
  pointer(node) {
    const row =
      node instanceof Element
        ? node.closest("[data-app-action-sidebar-thread-row]")
        : null;
    if (row)
      this.hoveredThread = {
        el: row,
        item: row.getAttribute("data-app-action-sidebar-thread-id"),
        context: {
          thread: row.getAttribute("data-app-action-sidebar-thread-id"),
          project:
            row
              .closest("[data-app-action-sidebar-project-list-id]")
              ?.getAttribute("data-app-action-sidebar-project-list-id") || null,
        },
      };
    else if (
      !(
        node instanceof Element &&
        node.closest('div[role="tooltip"][data-side="right"]')
      )
    )
      this.hoveredThread = null;
  }
  state(el) {
    return {
      selected:
        el.getAttribute("data-app-action-sidebar-thread-selected") === "true" ||
        el.getAttribute("aria-selected") === "true" ||
        el.getAttribute("aria-current") === "page" ||
        el.getAttribute("data-state") === "active",
      hover: el.matches(":hover"),
      focusVisible: el.matches(":focus-visible"),
      pressed: el.matches(":active"),
      disabled:
        el.matches(":disabled") || el.getAttribute("aria-disabled") === "true",
    };
  }
  disposeEntry() {
    this.entryWrapper?.remove();
    this.entryWrapper = null;
  }
  entry(button) {
    this.discover();
    if (!this.navigation) return false;
    const home = this.navigation.querySelector(
      'button[data-sidebar-destination="builtin:home"]',
    );
    if (home?.parentElement) {
      this.entryWrapper?.remove();
      const wrapper = home.parentElement.cloneNode(false);
      wrapper.dataset.coskinUi = "";
      wrapper.removeAttribute("id");
      wrapper.append(button);
      home.parentElement.after(wrapper);
      this.entryWrapper = wrapper;
    } else return false;
    return true;
  }
  openPage(host) {
    const rail = this.document.querySelector(
      'nav[data-app-navigation-rail="true"]',
    );
    const workspace = rail?.closest('[data-app-shell-workspace-row="true"]');
    if (!rail || !workspace)
      throw Error("현재 화면에서 CoSkin 페이지를 열 수 없습니다.");
    const focus = this.document.activeElement;
    const saved = new Map();
    const hideElement = (element) => {
      if (
        element === host ||
        element.hasAttribute("data-coskin-ui") ||
        element.hasAttribute("data-coskin-decoration")
      )
        return;
      if (!saved.has(element))
        saved.set(element, {
          hidden: element.hidden,
          inert: element.inert,
          display: element.style.getPropertyValue("display"),
          priority: element.style.getPropertyPriority("display"),
          scrollTop: element.scrollTop,
          scrollLeft: element.scrollLeft,
        });
      element.hidden = true;
      element.inert = true;
      element.style.setProperty("display", "none", "important");
    };
    const isolate = () => {
      let branch = rail;
      while (branch.parentElement && branch !== workspace) {
        for (const sibling of branch.parentElement.children)
          if (sibling !== branch) hideElement(sibling);
        branch = branch.parentElement;
      }
    };
    const layout = () => {
      const bounds = workspace.getBoundingClientRect();
      const railBounds = rail.getBoundingClientRect();
      host.style.position = "fixed";
      host.style.inset = "auto";
      host.style.left = railBounds.right + "px";
      host.style.top = bounds.top + "px";
      host.style.width = Math.max(0, bounds.right - railBounds.right) + "px";
      host.style.height = bounds.height + "px";
      host.style.zIndex = "2147482999";
    };
    this.document.body.append(host);
    isolate();
    layout();
    const observer = new MutationObserver(isolate);
    observer.observe(workspace, { childList: true, subtree: true });
    const resize = new ResizeObserver(layout);
    resize.observe(workspace);
    resize.observe(rail);
    queueMicrotask(() => host.shadowRoot?.querySelector("button")?.focus());
    return () => {
      observer.disconnect();
      resize.disconnect();
      for (const [element, state] of saved) {
        element.hidden = state.hidden;
        element.inert = state.inert;
        if (state.display)
          element.style.setProperty("display", state.display, state.priority);
        else element.style.removeProperty("display");
        element.scrollTop = state.scrollTop;
        element.scrollLeft = state.scrollLeft;
      }
      for (const property of [
        "position",
        "inset",
        "left",
        "top",
        "width",
        "height",
        "z-index",
      ])
        host.style.removeProperty(property);
      if (focus?.isConnected) focus.focus({ preventScroll: true });
    };
  }
}
