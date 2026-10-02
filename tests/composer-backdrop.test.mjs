import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";
import { workspaceBundle } from "./workspace-bundle.mjs";

const compiled = await build({
  stdin: {
    contents:
      'export {Decoration} from "./src/renderer/layers.js"; export {discoverPaintSources} from "./src/renderer/adapter-paint.js";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  plugins: [workspaceBundle()],
});

const kebab = (value) =>
  value.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());
function style() {
  const values = new Map();
  return new Proxy(
    {
      getPropertyValue: (key) => values.get(key)?.value || "",
      getPropertyPriority: (key) => values.get(key)?.priority || "",
      setProperty(key, value, priority = "") {
        values.set(key, { value: String(value), priority });
      },
      removeProperty: (key) => values.delete(key),
      clear: () => values.clear(),
    },
    {
      get: (target, key) =>
        key in target ? target[key] : values.get(kebab(key))?.value || "",
      set(_target, key, value) {
        values.set(kebab(key), { value: String(value), priority: "" });
        return true;
      },
    },
  );
}

// A selector subset shared by the fixture's query/closest/matches operations.
// It models tags, attributes, classes and parent/descendant combinators rather
// than preselecting whatever the implementation asks for.
function simpleMatch(element, selector) {
  const parts = [
    ...selector.matchAll(
      /\[([\w-]+)(?:(=|\^=|~=)"([^"]*)")?\]|([.#])([\w-]+)|^([\w-]+)/g,
    ),
  ];
  if (!parts.length || parts.map((part) => part[0]).join("") !== selector)
    return false;
  return parts.every(([, attribute, operator, value, kind, name, tag]) => {
    if (tag) return element.tagName.toLowerCase() === tag;
    if (kind === ".") return element.className.split(/\s+/).includes(name);
    if (kind === "#") return element.getAttribute("id") === name;
    const actual = element.getAttribute(attribute);
    return (
      actual !== null &&
      (!operator ||
        (operator === "="
          ? actual === value
          : operator === "^="
            ? actual.startsWith(value)
            : actual.split(/\s+/).includes(value)))
    );
  });
}
function match(element, selector) {
  return selector.split(",").some((value) => {
    const tokens = value
      .trim()
      .replace(/\s*>\s*/g, " > ")
      .split(/\s+/);
    const at = (node, index) => {
      if (!node || !simpleMatch(node, tokens[index])) return false;
      if (!index) return true;
      if (tokens[index - 1] === ">") return at(node.parentElement, index - 2);
      for (
        let parent = node.parentElement;
        parent;
        parent = parent.parentElement
      )
        if (at(parent, index - 1)) return true;
      return false;
    };
    return at(element, tokens.length - 1);
  });
}
const all = (element) =>
  element.children.flatMap((child) => [child, ...all(child)]);

function fixture() {
  class Element {
    constructor(tag = "div", attributes = {}, computed = {}, rect = {}) {
      this.tagName = tag.toUpperCase();
      this.attributes = { ...attributes };
      this.dataset = {};
      this.children = [];
      this.style = style();
      this.isConnected = true;
      this.ownerDocument = document;
      this.content = "";
      this.computed = {
        position: "static",
        pointerEvents: "auto",
        backgroundImage: "none",
        backgroundColor: "transparent",
        borderRadius: "0px",
        overflowX: "visible",
        overflowY: "visible",
        ...computed,
      };
      this.rect = { x: 365, y: 809, width: 678.125, height: 114, ...rect };
    }
    get className() {
      return this.attributes.class || "";
    }
    getAttribute(key) {
      const data =
        key.startsWith("data-") &&
        key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return (
        this.attributes[key] ??
        (data in this.dataset ? String(this.dataset[data]) : null)
      );
    }
    setAttribute(key, value) {
      this.attributes[key] = String(value);
    }
    removeAttribute(key) {
      if (key === "style") this.style.clear();
      else delete this.attributes[key];
    }
    append(...children) {
      for (const child of children) {
        child.parentElement = this;
        child.isConnected = this.isConnected;
        this.children.push(child);
      }
    }
    prepend(child) {
      this.append(child);
      this.children.unshift(this.children.pop());
    }
    remove() {
      if (this.parentElement)
        this.parentElement.children = this.parentElement.children.filter(
          (child) => child !== this,
        );
      this.parentElement = null;
      this.isConnected = false;
    }
    matches(selector) {
      return match(this, selector);
    }
    closest(selector) {
      for (let current = this; current; current = current.parentElement)
        if (current.matches(selector)) return current;
      return null;
    }
    querySelectorAll(selector) {
      return all(this).filter((element) => element.matches(selector));
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
    get textContent() {
      return (
        this.content + this.children.map((child) => child.textContent).join("")
      );
    }
    getBoundingClientRect() {
      const { x, y, width, height } = this.rect;
      return {
        ...this.rect,
        left: x,
        top: y,
        right: x + width,
        bottom: y + height,
      };
    }
  }
  const document = { createElement: (tag) => new Element(tag), hidden: false };
  const root = new Element(
    "div",
    { id: "root" },
    {},
    { x: 0, y: 0, width: 1522, height: 927 },
  );
  document.querySelector = (selector) => root.querySelector(selector);
  const main = new Element(
    "main",
    { "data-app-shell-main-surface": "default" },
    {},
    { y: 44, height: 879 },
  );
  const timeline = new Element("div", {
    "data-app-action-timeline-scroll": "",
    "data-pip-anchor-host": "codex-main-thread",
  });
  const footer = new Element(
    "div",
    { "data-thread-scroll-footer": "true" },
    { position: "absolute", pointerEvents: "none" },
    { y: 777, height: 146 },
  );
  const backdrop = new Element(
    "div",
    {},
    {
      position: "absolute",
      pointerEvents: "none",
      backgroundColor: "rgb(24, 24, 24)",
    },
  );
  const content = new Element("div", { "data-pip-obstacle": "thread-footer" });
  const composer = new Element("div");
  const input = new Element("div", {
    "data-composer-surface-variant": "default",
    "data-composer-layout": "compact",
  });
  const editor = new Element("div", { contenteditable: "true" });
  const send = new Element("button");
  const popover = new Element("div", { popover: "", role: "dialog" });
  const header = new Element(
    "header",
    { "data-app-shell-titlebar": "true" },
    {},
    { x: 0, y: 0, width: 1522, height: 44 },
  );
  root.append(header, main);
  main.append(timeline);
  timeline.append(footer);
  footer.append(backdrop, content);
  content.append(composer);
  composer.append(input, send, popover);
  input.append(editor);
  backdrop.style.setProperty(
    "background-color",
    "rgb(24, 24, 24)",
    "important",
  );
  footer.style.setProperty("background-color", "rgb(24, 24, 24)");
  input.style.setProperty("background-color", "rgb(32, 28, 43)");
  send.style.setProperty("background-color", "white");
  popover.style.setProperty("background-color", "gray");
  const computed = (element) =>
    new Proxy(element.computed, {
      get: (target, key) =>
        element.style.getPropertyValue(kebab(key)) || target[key] || "",
    });
  const context = vm.createContext({
    module: { exports: {} },
    document,
    getComputedStyle: computed,
    innerWidth: 1522,
    innerHeight: 927,
    setTimeout,
    clearTimeout,
    structuredClone,
  });
  vm.runInContext(compiled.outputFiles[0].text, context);
  const { Decoration, discoverPaintSources } = context.module.exports;
  const sources = (target = "app.background", retained = new Map()) =>
    discoverPaintSources(target, root, retained);
  const decorate = (target = "app.background", element = root) =>
    new Decoration(
      {
        target,
        el: element,
        paintSources: (retained) =>
          discoverPaintSources(target, element, retained),
      },
      () => null,
    );
  return {
    root,
    main,
    timeline,
    footer,
    backdrop,
    content,
    composer,
    input,
    editor,
    send,
    popover,
    header,
    Element,
    sources,
    decorate,
  };
}

test("the observed solid footer backdrop and its focus-mode parent are app paint sources without including composer controls", () => {
  const api = fixture();
  const sources = api.sources();
  assert.ok(sources.some((source) => source.element === api.backdrop));
  assert.ok(sources.some((source) => source.element === api.footer));
  for (const element of [
    api.content,
    api.composer,
    api.input,
    api.editor,
    api.send,
    api.popover,
  ])
    assert.ok(!sources.some((source) => source.element === element));
  assert.ok(
    sources.find((source) => source.element === api.header).chromeHeader,
  );
});

test("right pane background stays readable and restores exactly while the embedded computer paint is preserved", () => {
  const api = fixture();
  const pane = new api.Element("aside"),
    gutter = new api.Element("div"),
    computer = new api.Element("div");
  const bounds = {
    left: 1046,
    top: 40,
    width: 472,
    height: 800,
    right: 1518,
    bottom: 840,
  };
  pane.rect = gutter.rect = bounds;
  pane.setAttribute("data-app-shell-focus-area", "right-panel");
  gutter.setAttribute("data-app-shell-compact-page-gutter", "true");
  gutter.style.setProperty("background-color", "rgb(24, 24, 24)", "important");
  computer.rect = { ...bounds, height: 340, bottom: 380 };
  computer.setAttribute("data-codex-cloud-computer", "true");
  computer.style.setProperty("background-color", "navy");
  api.root.append(pane);
  pane.append(gutter);
  gutter.append(computer);
  const app = api.decorate();
  app.set({ background: { color: "#201c2b", opacity: 1 } });
  assert.equal(
    gutter.style.getPropertyValue("background-color"),
    "rgba(32,28,43,0.45)",
  );
  assert.equal(computer.style.getPropertyValue("background-color"), "navy");
  app.position();
  assert.equal(
    gutter.style.getPropertyValue("background-color"),
    "rgba(32,28,43,0.45)",
  );
  app.dispose();
  assert.equal(
    gutter.style.getPropertyValue("background-color"),
    "rgb(24, 24, 24)",
  );
  assert.equal(
    gutter.style.getPropertyPriority("background-color"),
    "important",
  );
  assert.equal(computer.style.getPropertyValue("background-color"), "navy");
});

test("solid footer clearing requires native timeline, direct composer sibling and an empty noninteractive mask", () => {
  for (const mutate of [
    (api) => api.timeline.removeAttribute("data-app-action-timeline-scroll"),
    (api) => api.content.removeAttribute("data-pip-obstacle"),
    (api) => api.input.removeAttribute("data-composer-layout"),
    (api) => api.backdrop.append(new api.Element("button")),
    (api) => api.backdrop.append(new api.Element("span")),
    (api) => {
      api.backdrop.content = "visible content";
    },
    (api) => api.backdrop.setAttribute("role", "tooltip"),
    (api) => api.backdrop.setAttribute("popover", ""),
    (api) => {
      api.backdrop.computed.pointerEvents = "auto";
    },
    (api) => {
      api.backdrop.computed.position = "relative";
    },
    (api) => {
      api.footer.computed.position = "relative";
    },
    (api) => {
      api.footer.computed.pointerEvents = "auto";
    },
    (api) => {
      api.backdrop.rect.width = 0;
    },
    (api) => {
      api.backdrop.isConnected = false;
    },
    (api) => api.footer.setAttribute("data-coskin-ui", ""),
    (api) => api.footer.setAttribute("role", "dialog"),
    (api) => {
      api.input.remove();
      api.popover.append(api.input);
    },
  ]) {
    const api = fixture();
    mutate(api);
    assert.ok(!api.sources().some((source) => source.element === api.backdrop));
  }
});

test("the native composer-body marker also qualifies without depending on surface utility classes", () => {
  const api = fixture();
  api.input.removeAttribute("data-composer-layout");
  api.input.removeAttribute("data-composer-surface-variant");
  api.input.setAttribute("data-composer-body", "");
  for (const element of [api.footer, api.backdrop])
    assert.ok(api.sources().some((source) => source.element === element));
});

test("composer-only and main-only theme paint never clear the new solid footer or its parent", () => {
  const api = fixture();
  for (const target of ["composer.surface", "main.surface", "sidebar.surface"])
    for (const element of [api.footer, api.backdrop])
      assert.ok(
        !api.sources(target).some((source) => source.element === element),
      );
  const composer = api.decorate("composer.surface", api.composer);
  composer.set({ background: { color: "#201c2b" } });
  assert.equal(
    api.backdrop.style.getPropertyValue("background-color"),
    "rgb(24, 24, 24)",
  );
  composer.dispose();
});

test("real Decoration clears only with an app background and restores original fills, priorities and top protection on disable/dispose", () => {
  const api = fixture();
  const app = api.decorate();
  assert.equal(
    api.backdrop.style.getPropertyValue("background-color"),
    "rgb(24, 24, 24)",
  );
  app.set({ background: { color: "#201c2b", opacity: 1 } });
  for (const element of [api.footer, api.backdrop]) {
    assert.equal(
      element.style.getPropertyValue("background-color"),
      "transparent",
    );
    assert.equal(
      element.style.getPropertyPriority("background-color"),
      "important",
    );
  }
  assert.match(
    api.header.style.getPropertyValue("background-color"),
    /0\.96\)$/,
  );
  for (const [element, color] of [
    [api.input, "rgb(32, 28, 43)"],
    [api.send, "white"],
    [api.popover, "gray"],
  ])
    assert.equal(element.style.getPropertyValue("background-color"), color);
  app.set({ background: null });
  assert.equal(
    api.backdrop.style.getPropertyValue("background-color"),
    "rgb(24, 24, 24)",
  );
  assert.equal(
    api.backdrop.style.getPropertyPriority("background-color"),
    "important",
  );
  assert.equal(
    api.footer.style.getPropertyValue("background-color"),
    "rgb(24, 24, 24)",
  );
  assert.equal(api.footer.style.getPropertyPriority("background-color"), "");
  app.set({ background: { color: "#241d31" } });
  assert.equal(
    api.backdrop.style.getPropertyValue("background-color"),
    "transparent",
  );
  app.dispose();
  assert.equal(
    api.backdrop.style.getPropertyValue("background-color"),
    "rgb(24, 24, 24)",
  );
  assert.equal(
    api.footer.style.getPropertyValue("background-color"),
    "rgb(24, 24, 24)",
  );
  assert.equal(api.header.style.getPropertyValue("background-color"), "");
});

test("Goal fixed-content and reserved-followup variants keep the mask clear and leave progress/status surfaces intact", () => {
  const api = fixture();
  const app = api.decorate();
  app.set({ background: { color: "#201c2b" } });
  const goal = new api.Element("div", { "data-in-progress-fixed-content": "" });
  goal.style.setProperty("background-color", "rgb(38, 38, 38)");
  goal.append(new api.Element("button"));
  api.content.prepend(goal);
  api.backdrop.rect.y = 777;
  api.backdrop.rect.height = 146;
  app.position();
  assert.equal(
    api.backdrop.style.getPropertyValue("background-color"),
    "transparent",
  );
  assert.equal(
    goal.style.getPropertyValue("background-color"),
    "rgb(38, 38, 38)",
  );
  const reserved = new api.Element("div", {
    "data-conversation-followup-reserved-hidden": "true",
  });
  api.content.prepend(reserved);
  api.backdrop.rect.y = 833;
  api.backdrop.rect.height = 90;
  app.position();
  assert.equal(
    api.backdrop.style.getPropertyValue("background-color"),
    "transparent",
  );
  goal.remove();
  reserved.remove();
  app.position();
  assert.equal(
    api.backdrop.style.getPropertyValue("background-color"),
    "transparent",
  );
  app.dispose();
  assert.equal(
    api.backdrop.style.getPropertyValue("background-color"),
    "rgb(24, 24, 24)",
  );
  assert.equal(
    goal.style.getPropertyValue("background-color"),
    "rgb(38, 38, 38)",
  );
});

test("focus-mode stylesheet paint appearing after activation stays clear and restores without creating an original inline style", () => {
  const api = fixture();
  api.footer.style.removeProperty("background-color");
  api.footer.computed.backgroundColor = "transparent";
  const app = api.decorate();
  app.set({ background: { color: "#201c2b" } });
  api.footer.computed.backgroundColor = "rgb(24, 24, 24)";
  app.position();
  assert.equal(
    api.footer.style.getPropertyValue("background-color"),
    "transparent",
  );
  app.set({ background: null });
  assert.equal(api.footer.style.getPropertyValue("background-color"), "");
  assert.equal(api.footer.style.getPropertyPriority("background-color"), "");
  app.dispose();
});

test("replaced or no longer qualified solid nodes release ownership and refresh discovers the new footer mask", () => {
  const api = fixture();
  const app = api.decorate();
  app.set({ background: { color: "#201c2b" } });
  const old = api.backdrop;
  old.remove();
  const replacement = new api.Element(
    "div",
    {},
    {
      position: "absolute",
      pointerEvents: "none",
      backgroundColor: "rgb(28, 28, 28)",
    },
  );
  replacement.style.setProperty("background-color", "rgb(28, 28, 28)");
  api.footer.prepend(replacement);
  app.position();
  assert.equal(
    old.style.getPropertyValue("background-color"),
    "rgb(24, 24, 24)",
  );
  assert.equal(
    replacement.style.getPropertyValue("background-color"),
    "transparent",
  );
  api.input.removeAttribute("data-composer-layout");
  app.position();
  assert.equal(
    replacement.style.getPropertyValue("background-color"),
    "rgb(28, 28, 28)",
  );
  assert.equal(
    api.footer.style.getPropertyValue("background-color"),
    "rgb(24, 24, 24)",
  );
  app.dispose();
});

test("the pre-existing footer gradient remains cleared and retained for both app and main paint", () => {
  const api = fixture();
  api.backdrop.computed.backgroundImage =
    "linear-gradient(rgb(24, 24, 24), transparent)";
  for (const target of ["app.background", "main.surface"]) {
    const source = api
      .sources(target)
      .find((item) => item.element === api.backdrop);
    assert.equal(source.clearImage, true);
    const retained = new Map([[api.backdrop, source]]);
    api.backdrop.style.setProperty("background-image", "none", "important");
    assert.ok(
      api
        .sources(target, retained)
        .some((item) => item.element === api.backdrop),
    );
    api.backdrop.style.removeProperty("background-image");
  }
});
