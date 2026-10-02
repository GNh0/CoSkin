import { NativePaintScope } from "./native-paint.js";
import { appearanceText } from "./appearance-messages.js";

export const titlebarSelector =
  '.h-toolbar.draggable,[data-app-shell-titlebar="true"]';
const greetings = new Set([
  "무엇을 만들까요?",
  "What shall we build?",
  "What would you like to build?",
  "何を作りましょうか？",
  "要创建什么？",
]);
const protectedGreeting =
  '[data-coskin-ui],[data-coskin-decoration],[data-message-id],[data-message-author-role],[data-app-action-timeline-scroll],article,pre,iframe,webview,[role="dialog"],[role="menu"],.monaco-editor,.cm-editor,[contenteditable="true"]';
const greetingHeadingSelector = 'h1,h2,[role="heading"],p';
function isGreeting(element) {
  const text = (element.textContent || "").trim().replace(/\s+/g, " ");
  return (
    greetings.has(text) ||
    /^(?:.{1,200}에서\s+)?무엇을\s+(?:만들까요|만들어\s*볼까요)\?$/.test(text)
  );
}
export function greetingElements(root) {
  const result = new Set();
  const candidates = new Set(
    root.querySelectorAll(
      "[data-start-screen-greeting],[data-home-empty-state]," +
        greetingHeadingSelector,
    ),
  );
  // Some project prompts use div/span next to a decorative icon instead of a heading.
  // Inspect nearby siblings, rather than traversing every conversation text node.
  for (const icon of root.querySelectorAll("svg,[data-start-screen-icon]")) {
    if (icon.closest(protectedGreeting + ',button,[role="button"]')) continue;
    let parent = icon.parentElement;
    for (
      let depth = 0;
      parent && depth < 3;
      depth++, parent = parent.parentElement
    ) {
      if (parent.closest(protectedGreeting)) break;
      for (const child of parent.children)
        if (!child.matches("svg") && isGreeting(child)) candidates.add(child);
    }
  }
  for (const element of candidates) {
    if (element.closest(protectedGreeting)) continue;
    if (element.querySelector('input,textarea,button,[contenteditable="true"]'))
      continue;
    if (
      element.matches("[data-start-screen-greeting],[data-home-empty-state]") &&
      !element.querySelector('input,textarea,button,[contenteditable="true"]')
    ) {
      result.add(element);
    } else if (isGreeting(element)) {
      result.add(element);
      const parent = element.parentElement;
      if (
        parent &&
        !parent.querySelector('input,textarea,button,[contenteditable="true"]')
      )
        for (const icon of parent.querySelectorAll(
          "svg,[data-start-screen-icon]",
        ))
          result.add(icon);
    }
  }
  return result;
}
export class GreetingVisibility {
  constructor() {
    this.scope = new NativePaintScope();
    this.elements = new Set();
  }
  refresh(hidden, root = document) {
    const next = hidden ? greetingElements(root) : new Set();
    for (const element of this.elements)
      if (!next.has(element)) this.scope.release(element);
    for (const element of next) this.scope.set(element, "visibility", "hidden");
    this.elements = next;
  }
  dispose() {
    this.scope.dispose();
    this.elements.clear();
  }
}

function nativeTitlebar() {
  const candidates = new Set(document.querySelectorAll(titlebarSelector));
  // New layouts can use an unmarked div for the native menu/titlebar.
  // A semantic menubar plus a bounded draggable ancestor identifies that row without a fixed coordinate.
  for (const menu of document.querySelectorAll('[role="menubar"]')) {
    let ancestor = menu.parentElement;
    for (
      let depth = 0;
      ancestor && depth < 4;
      depth++, ancestor = ancestor.parentElement
    ) {
      const style = getComputedStyle(ancestor);
      if (
        (style.webkitAppRegion ||
          style.getPropertyValue?.("-webkit-app-region")) === "drag"
      )
        candidates.add(ancestor);
    }
  }
  return (
    [...candidates].find((element) => {
      if (
        element.closest(
          '[hidden],[inert],[aria-hidden="true"],[data-coskin-ui],[data-coskin-decoration]',
        )
      )
        return false;
      const r = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        style.display !== "none" &&
        !["hidden", "collapse"].includes(style.visibility) &&
        Number(style.opacity) !== 0 &&
        r.width > innerWidth * 0.6 &&
        r.top < 8 &&
        r.bottom > 0 &&
        r.height >= 16 &&
        r.height <= 72
      );
    }) || null
  );
}
export class BackgroundView {
  constructor(controller) {
    this.c = controller;
    this.active = false;
    this.scope = new NativePaintScope();
    this.foregroundScope = new NativePaintScope();
    this.inert = new Map();
    this.abort = new AbortController();
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.dataset.coskinUi = "";
    this.button.dataset.coskinBackgroundView = "";
    Object.assign(this.button.style, {
      flex: "0 0 auto",
      marginInlineStart: "auto",
      marginInlineEnd: "8px",
      height: "28px",
      padding: "0 10px",
      border: "1px solid #ffffff24",
      borderRadius: "6px",
      color: "inherit",
      background: "#88888818",
      fontSize: "12px",
      cursor: "pointer",
      whiteSpace: "nowrap",
      webkitAppRegion: "no-drag",
    });
    this.button.addEventListener(
      "pointerdown",
      () => {
        if (!this.active) this.focus = document.activeElement;
      },
      { signal: this.abort.signal },
    );
    this.button.addEventListener("click", () => this.toggle(), {
      signal: this.abort.signal,
    });
    document.addEventListener(
      "keydown",
      (event) => {
        if (this.active && event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.toggle(false);
        } else if (event.altKey && event.shiftKey && event.code === "KeyB") {
          event.preventDefault();
          this.toggle();
        }
      },
      { capture: true, signal: this.abort.signal },
    );
    navigator.windowControlsOverlay?.addEventListener(
      "geometrychange",
      () => this.refresh(),
      { signal: this.abort.signal },
    );
  }
  get background() {
    const choices = [...this.c.decorations.values()].filter(
      (dec) => dec.root.isConnected && dec.style?.background?.image,
    );
    return (
      choices.find((dec) => dec.target.target === "app.background") ||
      choices.find((dec) => dec.target.target === "main.surface") ||
      null
    );
  }
  get available() {
    return !!this.background && !this.c.disposed;
  }
  toggle(value = !this.active) {
    if (value && !this.available) return false;
    if (value === this.active) return true;
    if (value) this.focus ??= document.activeElement;
    this.active = value;
    this.refresh();
    if (!value) {
      this.c.render();
      if (
        this.focus?.isConnected &&
        (document.activeElement === this.button ||
          document.activeElement === document.body)
      )
        this.focus.focus({ preventScroll: true });
      this.focus = null;
    }
    return true;
  }
  restoreForeground() {
    this.scope.dispose();
    this.foregroundScope.dispose();
    for (const [element, previous] of this.inert)
      if (element.inert === true) element.inert = previous;
    this.inert.clear();
    this.lifted = null;
  }
  refreshButton(header) {
    this.button.textContent = appearanceText(
      this.active ? "restore" : "backgroundOnly",
    );
    this.button.title =
      appearanceText(this.active ? "restoreHelp" : "backgroundOnly") +
      " · Alt+Shift+B";
    this.button.setAttribute("aria-pressed", String(this.active));
    this.button.disabled = !this.available;
    const style = header && getComputedStyle(header);
    if (
      !header ||
      !["flex", "inline-flex"].includes(style.display) ||
      !["row", "row-reverse"].includes(style.flexDirection)
    ) {
      this.button.remove();
      return;
    }
    // Participate in the existing horizontal flow. Never reserve a fixed X coordinate.
    const controls = header.querySelector(
      '[data-window-controls],[data-app-window-controls],button[aria-label*="Minimize" i],button[title*="Minimize" i],button[aria-label*="최소화"],button[title*="최소화"],button[aria-label*="最小化"],button[title*="最小化"]',
    );
    let before = controls;
    while (before && before.parentElement !== header)
      before = before.parentElement;
    if (
      this.button.parentElement !== header ||
      this.button.nextElementSibling !== before
    )
      header.insertBefore(this.button, before);
    const rect = this.button.getBoundingClientRect();
    const area = navigator.windowControlsOverlay?.visible
      ? navigator.windowControlsOverlay.getTitlebarAreaRect()
      : null;
    const right = area ? area.x + area.width : innerWidth;
    if (
      header.scrollWidth > header.clientWidth ||
      rect.right > right ||
      rect.width < 24
    )
      this.button.remove();
  }
  refresh() {
    const header = nativeTitlebar();
    this.titlebar = header;
    const dec = this.background;
    if (this.active && !dec) this.active = false;
    this.refreshButton(header);
    if (!this.active) {
      if (this.lifted) this.restoreForeground();
      return;
    }
    if (this.lifted && this.lifted !== dec.root) this.restoreForeground();
    this.lifted = dec.root;
    const area = navigator.windowControlsOverlay?.visible
      ? navigator.windowControlsOverlay.getTitlebarAreaRect()
      : null;
    const top = Math.max(
      0,
      header?.getBoundingClientRect().bottom ||
        (area ? area.y + area.height : 0),
    );
    for (const [key, value] of Object.entries({
      position: "fixed",
      left: "0",
      right: "0",
      bottom: "0",
      top: `${top}px`,
      "z-index": "2147483000",
      "border-radius": "0",
      "pointer-events": "auto",
      "background-color": dec.style.background.color || "#171b24",
    }))
      this.scope.set(dec.root, key, value);
    const preserve = [dec.root, header, this.button].filter(Boolean);
    const covered = new Set();
    const release = (element) => {
      this.foregroundScope.release(element);
      if (this.inert.has(element)) {
        if (element.inert === true) element.inert = this.inert.get(element);
        this.inert.delete(element);
      }
    };
    const cover = (element) => {
      if (
        preserve.includes(element) ||
        ["SCRIPT", "STYLE", "LINK"].includes(element.tagName)
      ) {
        release(element);
        return;
      }
      if (preserve.some((node) => element.contains(node))) {
        release(element);
        for (const child of element.children) cover(child);
        return;
      }
      covered.add(element);
      this.foregroundScope.set(element, "visibility", "hidden");
      if (!this.inert.has(element)) this.inert.set(element, element.inert);
      element.inert = true;
    };
    for (const child of document.body.children) cover(child);
    for (const element of this.inert.keys())
      if (!covered.has(element)) release(element);
    // The original decoder/canvas remains in place; fit it within the area below native controls.
    dec.players.get("background")?.setViewportTop(0);
    for (const player of dec.players.values()) player.resize();
    for (const other of this.c.decorations.values())
      if (other !== dec) {
        other.cancel();
        for (const player of other.players.values()) player.setPlaying(false);
      }
  }
  dispose() {
    this.active = false;
    this.restoreForeground();
    this.abort.abort();
    this.button.remove();
  }
}
