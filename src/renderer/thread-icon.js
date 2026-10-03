import { NativePaintScope } from "./native-paint.js";

export function nativeIconFor(target) {
  // A chat row's native glyph conveys running/unread/review state, not its theme identity.
  if (target.target === "sidebar.thread-row") return null;
  const icons = [...target.el.querySelectorAll("svg")].filter((svg) =>
    !svg.closest("[data-coskin-decoration],[data-coskin-ui]") &&
    svg.closest('button,[role="button"],[role="menuitem"]') === target.el,
  );
  return icons.length === 1 ? icons[0] : null;
}

/** Reserve a leading theme icon without moving or hiding native trailing state glyphs. */
export class ThreadIconLayout {
  constructor(element, computed = (node) => getComputedStyle(node)) {
    this.element = element;
    this.computed = computed;
    this.scope = new NativePaintScope();
  }
  position(style, row) {
    if (this.padding === undefined) {
      const native = this.computed(this.element);
      this.padding = Math.max(0, parseFloat(native.paddingInlineStart) || 0);
      this.direction = native.direction;
    }
    const size = style.sizePx || 16;
    const padding = style.paddingPx || 0;
    const box = size + 2 * padding;
    this.scope.set(this.element, "padding-inline-start", `${this.padding + box + 6}px`);
    return {
      inset: "auto",
      left: this.direction === "rtl" ? "auto" : `${this.padding}px`,
      right: this.direction === "rtl" ? `${this.padding}px` : "auto",
      top: `${(row.height - box) / 2}px`,
      width: `${size}px`, height: `${size}px`, padding: `${padding}px`,
      backgroundOrigin: "content-box", backgroundClip: "content-box",
    };
  }
  dispose() {
    this.scope.dispose();
    this.padding = undefined;
  }
}
