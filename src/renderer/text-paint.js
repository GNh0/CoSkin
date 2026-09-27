import { NativePaintScope } from "./native-paint.js";
const sheets = new WeakMap();
export class TextPaint {
  constructor(element) {
    this.element = element;
    this.scope = new NativePaintScope();
    this.weightScope = new NativePaintScope();
    this.fontScope = new NativePaintScope();
  }
  set(color, weight, cascade, family) {
    if (color) this.scope.set(this.element, "color", color);
    else this.scope.dispose();
    if (weight) {
      this.weightScope.set(this.element, "font-weight", String(weight));
      this.weightScope.set(
        this.element,
        "--coskin-font-weight",
        String(weight),
      );
      this.element.setAttribute("data-coskin-font-weight", "");
    } else this.weightScope.dispose();
    if (!weight) this.element.removeAttribute("data-coskin-font-weight");
    if (family) {
      this.fontScope.set(
        this.element,
        "font-family",
        '"' + family + '", system-ui, sans-serif',
      );
      this.fontScope.set(
        this.element,
        "--coskin-font-family",
        '"' + family + '", system-ui, sans-serif',
      );
    } else this.fontScope.dispose();
    this.cascade(!!cascade);
    if (cascade && color)
      this.scope.set(this.element, "--coskin-font-color", color);
    if (cascade && color) {
      const channels = color
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number) || [255, 255, 255];
      this.scope.set(
        this.element,
        "--coskin-font-shadow",
        channels.reduce((sum, value) => sum + value, 0) > 384
          ? "0 1px 3px #00000080"
          : "0 1px 3px #ffffff60",
      );
    }
  }
  cascade(enabled) {
    if (!enabled && !this.cascading) {
      this.cascading = false;
      return;
    }
    if (this.cascading === enabled) return;
    this.cascading = enabled;
    const document = this.element.ownerDocument;
    if (enabled) {
      this.previousAttribute = this.element.getAttribute(
        "data-coskin-font-tone",
      );
      this.element.setAttribute("data-coskin-font-tone", "");
      let sheet = sheets.get(document);
      if (!sheet) {
        const style = document.createElement("style");
        style.dataset.coskinUi = "";
        style.textContent = `:where([data-coskin-font-tone],[data-coskin-font-tone] :is(div,p,span,a,li,h1,h2,h3,h4,h5,label,button,input,textarea)):not(:where(pre,pre *,code,code *,[role="status"],[role="status"] *,[data-coskin-ui],[data-coskin-ui] *,[data-coskin-decoration],[data-coskin-decoration] *,[class*="text-token-success"],[class*="text-token-error"],[class*="text-token-warning"])) {color:var(--coskin-font-color)!important;text-shadow:var(--coskin-font-shadow,none);font-family:var(--coskin-font-family,inherit);}`;
        document.head.append(style);
        style.textContent += `:where([data-coskin-font-weight],[data-coskin-font-weight] :is(p,span,li,h1,h2,h3,h4,h5,label,button,input,textarea)):not(:where(pre,pre *,code,code *,[data-coskin-ui],[data-coskin-ui] *)) {font-weight:var(--coskin-font-weight)!important;}`;
        sheet = { style, count: 0 };
        sheets.set(document, sheet);
      }
      sheet.count++;
    } else {
      if (this.previousAttribute === null)
        this.element.removeAttribute("data-coskin-font-tone");
      else
        this.element.setAttribute(
          "data-coskin-font-tone",
          this.previousAttribute,
        );
      const sheet = sheets.get(document);
      if (sheet && --sheet.count === 0) {
        sheet.style.remove();
        sheets.delete(document);
      }
    }
  }
  dispose() {
    if (this.cascading) this.cascade(false);
    this.scope.dispose();
    this.weightScope.dispose();
    this.fontScope.dispose();
    this.element.removeAttribute("data-coskin-font-weight");
  }
}
