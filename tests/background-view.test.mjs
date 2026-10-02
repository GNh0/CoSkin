import test from "node:test";
import assert from "node:assert/strict";
import {
  BackgroundView,
  GreetingVisibility,
} from "../src/renderer/background-view.js";
import { structuralShellPaintSources } from "../src/renderer/adapter-paint.js";
import { mutationNeedsDiscovery } from "../src/renderer/mutation-impact.js";

const descendants = (element) => [
  element,
  ...element.children.flatMap(descendants),
];
function matches(element, selector) {
  return selector.split(",").some((part) => {
    const tag = part.trim().match(/^[a-z][\w-]*/i)?.[0];
    if (tag && tag.toUpperCase() !== element.tagName) return false;
    const id = part.trim().match(/#([\w-]+)/)?.[1];
    if (id && element.getAttribute("id") !== id) return false;
    const classes = [...part.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
    if (
      !classes.every((name) =>
        (element.getAttribute("class") || "").split(" ").includes(name),
      )
    )
      return false;
    return [
      ...part.matchAll(/\[([\w-]+)(?:(=|\*=|~=)"([^"]*)"(?:\s+(i))?)?\]/g),
    ].every((m) => {
      const actual = element.getAttribute(m[1]);
      if (actual === null) return false;
      if (!m[2]) return true;
      const value = m[4] ? actual.toLowerCase() : actual;
      const expected = m[4] ? m[3].toLowerCase() : m[3];
      return m[2] === "*="
        ? value.includes(expected)
        : m[2] === "~="
          ? value.split(/\s+/).includes(expected)
          : value === expected;
    });
  });
}
class Element extends EventTarget {
  constructor(tag, owner) {
    super();
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.ownerDocument = owner;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.inert = false;
    this.scrollTop = 0;
    this.value = "";
    this.clientWidth = 1000;
    this.scrollWidth = 1000;
    const styles = new Map();
    this.style = {
      getPropertyValue: (key) => styles.get(key)?.value || "",
      getPropertyPriority: (key) => styles.get(key)?.priority || "",
      setProperty: (key, value, priority = "") =>
        styles.set(key, { value, priority }),
      removeProperty: (key) => styles.delete(key),
    };
    this.rect = { top: 0, bottom: 40, height: 40, width: 1000, right: 1000 };
  }
  setAttribute(key, value) {
    this.attributes.set(key, String(value));
  }
  getAttribute(key) {
    return this.attributes.get(key) ?? null;
  }
  get isConnected() {
    return this.ownerDocument?.body?.contains(this) ?? false;
  }
  get nextElementSibling() {
    return (
      this.parentElement?.children[
        this.parentElement.children.indexOf(this) + 1
      ] || null
    );
  }
  matches(selector) {
    return matches(this, selector);
  }
  closest(selector) {
    for (let el = this; el; el = el.parentElement)
      if (el.matches(selector)) return el;
    return null;
  }
  querySelectorAll(selector) {
    return descendants(this)
      .slice(1)
      .filter((el) => el.matches(selector));
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  contains(element) {
    return descendants(this).includes(element);
  }
  append(...elements) {
    for (const element of elements) {
      element.remove();
      element.parentElement = this;
      this.children.push(element);
    }
  }
  insertBefore(element, before) {
    element.remove();
    element.parentElement = this;
    const index = before ? this.children.indexOf(before) : this.children.length;
    assert.ok(index >= 0);
    this.children.splice(index, 0, element);
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children.splice(
        this.parentElement.children.indexOf(this),
        1,
      );
    this.parentElement = null;
  }
  getBoundingClientRect() {
    return this.tagName === "BUTTON"
      ? { ...this.rect, width: 110, right: 850 }
      : this.rect;
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
}
function fixture() {
  const doc = new EventTarget();
  doc.createElement = (tag) => new Element(tag, doc);
  doc.documentElement = { lang: "ko" };
  doc.body = doc.createElement("body");
  doc.activeElement = doc.body;
  doc.querySelectorAll = (selector) => doc.body.querySelectorAll(selector);
  globalThis.document = doc;
  globalThis.innerWidth = 1000;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {},
  });
  globalThis.getComputedStyle = (element) => ({
    display: element.display || "flex",
    flexDirection: "row",
    visibility: element.visibility || "visible",
    webkitAppRegion: element.region || "none",
  });
  const header = doc.createElement("header");
  header.setAttribute("class", "h-toolbar draggable");
  const controls = doc.createElement("div");
  controls.setAttribute("data-window-controls", "");
  header.append(controls);
  const shell = doc.createElement("div"),
    foreground = doc.createElement("main"),
    input = doc.createElement("textarea");
  input.value = "unsent draft";
  foreground.scrollTop = 123;
  foreground.append(input);
  shell.append(header, foreground);
  doc.body.append(shell);
  const root = doc.createElement("div");
  root.style.setProperty("top", "40px");
  doc.body.append(root);
  const backgroundLayer = doc.createElement("div");
  backgroundLayer.style.setProperty("clip-path", "inset(80px 0 0 0)");
  root.append(backgroundLayer);
  const video = {},
    player = {
      video,
      viewportTop: 40,
      resizeCount: 0,
      resize() {
        this.resizeCount++;
      },
      setViewportTop(value) {
        this.viewportTop = value;
      },
    };
  const decoration = {
    root,
    target: { target: "app.background" },
    style: { background: { image: "sha256:fixture", color: "#171b24" } },
    players: new Map([["background", player]]),
    layers: { background: backgroundLayer },
  };
  const c = {
    decorations: new Map([[root, decoration]]),
    disposed: false,
    renderCount: 0,
    render() {
      this.renderCount++;
      player.setViewportTop(40);
      view.refresh();
    },
  };
  const view = new BackgroundView(c);
  view.refresh();
  return {
    doc,
    shell,
    header,
    controls,
    foreground,
    input,
    root,
    backgroundLayer,
    player,
    decoration,
    c,
    view,
  };
}
test("background-only keeps native controls and reuses the player; Esc restores draft, scroll, focus and original paint", () => {
  const f = fixture();
  f.foreground.style.setProperty("visibility", "visible", "important");
  f.input.focus();
  f.view.button.dispatchEvent(new Event("pointerdown"));
  f.view.button.focus();
  const children = f.doc.body.children.length;
  assert.equal(f.view.toggle(true), true);
  assert.equal(f.root.style.getPropertyValue("top"), "40px");
  assert.equal(f.root.style.getPropertyValue("z-index"), "2147483000");
  assert.equal(f.foreground.style.getPropertyValue("visibility"), "hidden");
  assert.equal(f.foreground.inert, true);
  assert.equal(f.header.inert, false);
  assert.equal(f.header.style.getPropertyValue("visibility"), "");
  assert.equal(f.decoration.players.get("background"), f.player);
  assert.equal(f.doc.body.children.length, children);
  assert.equal(f.player.viewportTop, 0);
  const escape = new Event("keydown", { cancelable: true });
  Object.defineProperty(escape, "key", { value: "Escape" });
  f.doc.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true);
  assert.equal(f.view.active, false);
  assert.equal(f.foreground.style.getPropertyValue("visibility"), "visible");
  assert.equal(
    f.foreground.style.getPropertyPriority("visibility"),
    "important",
  );
  assert.equal(f.foreground.inert, false);
  assert.equal(f.input.value, "unsent draft");
  assert.equal(f.foreground.scrollTop, 123);
  assert.equal(f.doc.activeElement, f.input);
  assert.equal(f.c.renderCount, 1);
  assert.equal(f.player.viewportTop, 40);
  f.view.dispose();
});
test("the button stays in native flex flow with added controls and falls back when there is no room", () => {
  const f = fixture();
  const native = f.doc.createElement("button");
  f.header.insertBefore(native, f.view.button);
  f.view.refresh();
  assert.equal(f.view.button.nextElementSibling, f.controls);
  assert.equal(f.header.children[0], native);
  f.header.scrollWidth = 1200;
  f.view.refresh();
  assert.equal(f.view.button.parentElement, null);
  const event = new Event("keydown", { cancelable: true });
  Object.defineProperties(event, {
    altKey: { value: true },
    shiftKey: { value: true },
    code: { value: "KeyB" },
  });
  f.doc.dispatchEvent(event);
  assert.equal(f.view.active, true);
  f.header.scrollWidth = 1000;
  f.view.refresh();
  assert.ok(f.view.button.parentElement === f.header);
  assert.equal(f.view.toggle(false), true);
  f.view.dispose();
});

test("background-only excludes the native titlebar once and restores the original image clip on exit", () => {
  const f = fixture();
  const sourceClip = f.backgroundLayer.style.getPropertyValue("clip-path");
  f.view.toggle(true);
  assert.equal(f.root.style.getPropertyValue("top"), "40px");
  assert.equal(f.backgroundLayer.style.getPropertyValue("clip-path"), "none");
  assert.equal(f.player.viewportTop, 0);
  assert.equal(f.decoration.players.get("background"), f.player);
  f.view.toggle(false);
  assert.equal(
    f.backgroundLayer.style.getPropertyValue("clip-path"),
    sourceClip,
  );
  f.view.dispose();
});
test("a retained inert titlebar is ignored and a live div titlebar keeps its native controls", () => {
  const f = fixture();
  const retained = f.doc.createElement("div");
  retained.setAttribute("inert", "");
  const oldHeader = f.doc.createElement("header");
  oldHeader.setAttribute("class", "h-toolbar draggable");
  oldHeader.visibility = "hidden";
  retained.append(oldHeader);
  f.doc.body.insertBefore(retained, f.shell);
  f.header.tagName = "DIV";
  f.view.refresh();
  assert.ok(f.view.button.parentElement === f.header);
  f.view.toggle(true);
  assert.equal(f.header.inert, false);
  assert.equal(f.header.style.getPropertyValue("visibility"), "");
  assert.equal(f.foreground.inert, true);
  f.view.toggle(false);
  assert.equal(retained.getAttribute("inert"), "");
  f.view.dispose();
});
test("a semantic native menu finds its draggable titlebar without a header tag or toolbar class", () => {
  const f = fixture();
  f.header.tagName = "DIV";
  f.header.setAttribute("class", "");
  f.header.region = "drag";
  const menus = f.doc.createElement("nav");
  menus.setAttribute("role", "menubar");
  f.header.insertBefore(menus, f.controls);
  f.view.refresh();
  assert.ok(f.view.button.parentElement === f.header);
  f.view.toggle(true);
  assert.equal(f.header.inert, false);
  assert.equal(f.root.style.getPropertyValue("top"), "40px");
  f.view.dispose();
});
test("new foreground is covered and a relocated native titlebar is released without losing external paint", () => {
  const f = fixture();
  f.view.toggle(true);
  const extra = f.doc.createElement("aside");
  f.doc.body.append(extra);
  f.view.refresh();
  assert.equal(extra.inert, true);
  assert.equal(extra.style.getPropertyValue("visibility"), "hidden");
  f.foreground.append(f.header);
  f.view.refresh();
  assert.equal(f.foreground.inert, false);
  assert.equal(f.foreground.style.getPropertyValue("visibility"), "");
  assert.equal(f.input.inert, true);
  assert.equal(f.header.inert, false);
  extra.style.setProperty("visibility", "collapse");
  f.view.refresh();
  f.view.toggle(false);
  assert.equal(extra.style.getPropertyValue("visibility"), "collapse");
  assert.equal(extra.inert, false);
  f.view.dispose();
});
test("missing or removed background never leaves foreground inert or a stale pressed button", () => {
  const f = fixture();
  f.c.decorations.clear();
  f.view.refresh();
  assert.equal(f.view.toggle(true), false);
  assert.equal(f.foreground.inert, false);
  assert.equal(f.view.button.disabled, true);
  f.c.decorations.set(f.root, f.decoration);
  f.view.toggle(true);
  f.root.remove();
  f.view.refresh();
  assert.equal(f.view.active, false);
  assert.equal(f.foreground.inert, false);
  assert.equal(f.view.button.getAttribute("aria-pressed"), "false");
  f.view.dispose();
});
test("project greeting in a div hides with its decorative icon and leaves quoted prompts and controls visible", () => {
  const f = fixture();
  const prompt = f.doc.createElement("div"),
    icon = f.doc.createElement("svg"),
    heading = f.doc.createElement("div");
  heading.textContent = "CustomCodex에서 무엇을 만들어볼까요?";
  prompt.append(icon, heading);
  f.foreground.append(prompt);
  const message = f.doc.createElement("article"),
    quote = f.doc.createElement("h2"),
    quotedIcon = f.doc.createElement("svg");
  quote.textContent = heading.textContent;
  message.append(quote, quotedIcon);
  f.foreground.append(message);
  const visibility = new GreetingVisibility();
  visibility.refresh(true);
  assert.equal(heading.style.getPropertyValue("visibility"), "hidden");
  assert.equal(icon.style.getPropertyValue("visibility"), "hidden");
  assert.equal(quote.style.getPropertyValue("visibility"), "");
  assert.equal(quotedIcon.style.getPropertyValue("visibility"), "");
  assert.equal(f.input.style.getPropertyValue("visibility"), "");
  visibility.refresh(false);
  assert.equal(heading.style.getPropertyValue("visibility"), "");
  assert.equal(icon.style.getPropertyValue("visibility"), "");
  visibility.dispose();
  f.view.dispose();
});

test("greeting hiding excludes chat messages and controls and restores the latest app visibility", () => {
  const f = fixture();
  const heading = f.doc.createElement("h1"),
    icon = f.doc.createElement("svg");
  heading.textContent = "무엇을 만들까요?";
  f.foreground.append(heading, icon);
  const message = f.doc.createElement("article"),
    quote = f.doc.createElement("h1");
  quote.textContent = heading.textContent;
  message.append(quote);
  f.foreground.append(message);
  const visibility = new GreetingVisibility();
  visibility.refresh(true);
  assert.equal(heading.style.getPropertyValue("visibility"), "hidden");
  assert.equal(icon.style.getPropertyValue("visibility"), ""); // Input in the parent is protected.
  assert.equal(quote.style.getPropertyValue("visibility"), "");
  assert.equal(f.input.style.getPropertyValue("visibility"), "");
  heading.style.setProperty("visibility", "collapse");
  visibility.refresh(true);
  visibility.refresh(false);
  assert.equal(heading.style.getPropertyValue("visibility"), "collapse");
  const greeting = f.doc.createElement("div"),
    title = f.doc.createElement("h2"),
    glyph = f.doc.createElement("svg");
  title.textContent = "What would you like to build?";
  greeting.append(title, glyph);
  f.foreground.append(greeting);
  visibility.refresh(true);
  assert.equal(glyph.style.getPropertyValue("visibility"), "hidden");
  visibility.dispose();
  assert.equal(glyph.style.getPropertyValue("visibility"), "");
  f.view.dispose();
});
test("native project hero with an inline project selector hides its text, logo and home suggestions without hiding the composer", () => {
  const f = fixture();
  const hero = f.doc.createElement("div"),
    logoWrapper = f.doc.createElement("div"),
    logo = f.doc.createElement("svg"),
    heading = f.doc.createElement("div"),
    title = f.doc.createElement("span"),
    project = f.doc.createElement("button");
  heading.setAttribute("data-feature", "game-source");
  heading.setAttribute("class", "heading-xl text-center");
  heading.textContent = "CustomCodex에서 무엇을 만들어볼까요?";
  title.textContent = heading.textContent;
  project.setAttribute("type", "button");
  project.textContent = "CustomCodex";
  title.append(project);
  heading.append(title);
  logoWrapper.append(logo);
  hero.append(logoWrapper, heading);
  const suggestions = f.doc.createElement("div"),
    suggestion = f.doc.createElement("button"),
    elsewhere = f.doc.createElement("aside"),
    otherSuggestion = f.doc.createElement("button");
  suggestions.setAttribute("class", "group/home-suggestion-list-item relative");
  suggestion.setAttribute("data-home-suggestion-id", "local-project-task");
  suggestion.setAttribute("aria-describedby", "project-task-tooltip");
  suggestions.append(suggestion);
  f.foreground.append(hero, suggestions);
  otherSuggestion.setAttribute(
    "data-home-suggestion-id",
    "unrelated-page-task",
  );
  elsewhere.append(otherSuggestion);
  f.doc.body.append(elsewhere);
  const tooltip = f.doc.createElement("div"),
    otherTooltip = f.doc.createElement("div");
  tooltip.setAttribute("id", "project-task-tooltip");
  tooltip.setAttribute("role", "tooltip");
  otherTooltip.setAttribute("id", "other-tooltip");
  otherTooltip.setAttribute("role", "tooltip");
  f.doc.body.append(tooltip, otherTooltip);
  const visibility = new GreetingVisibility();
  visibility.refresh(true);
  assert.equal(heading.style.getPropertyValue("visibility"), "hidden");
  assert.equal(logo.style.getPropertyValue("visibility"), "hidden");
  assert.equal(suggestions.style.getPropertyValue("visibility"), "hidden");
  assert.equal(tooltip.style.getPropertyValue("visibility"), "hidden");
  assert.equal(otherSuggestion.style.getPropertyValue("visibility"), "");
  assert.equal(otherTooltip.style.getPropertyValue("visibility"), "");
  assert.equal(f.input.style.getPropertyValue("visibility"), "");
  visibility.refresh(false);
  for (const element of [heading, logo, suggestions, tooltip])
    assert.equal(element.style.getPropertyValue("visibility"), "");
  visibility.dispose();
  f.view.dispose();
});

test("Home task suggestions and a later linked tooltip hide before the hero mounts", () => {
  const f = fixture();
  f.foreground.setAttribute("data-new-tab-scroll-root", "");
  const row = f.doc.createElement("div"),
    trigger = f.doc.createElement("button"),
    tooltip = f.doc.createElement("div");
  row.setAttribute("class", "group/home-suggestion-list-item relative");
  trigger.setAttribute("data-home-suggestion-id", "local-project-task");
  row.append(trigger);
  f.foreground.append(row);
  const message = f.doc.createElement("article"),
    quotedRow = f.doc.createElement("div");
  quotedRow.setAttribute("class", "group/home-suggestion-list-item");
  message.append(quotedRow);
  f.foreground.append(message);
  const visibility = new GreetingVisibility();
  visibility.refresh(true);
  assert.equal(row.style.getPropertyValue("visibility"), "hidden");
  assert.equal(quotedRow.style.getPropertyValue("visibility"), "");
  trigger.setAttribute("aria-describedby", "late-home-tooltip");
  tooltip.setAttribute("id", "late-home-tooltip");
  tooltip.setAttribute("role", "tooltip");
  f.doc.body.append(tooltip);
  visibility.refresh(true);
  assert.equal(tooltip.style.getPropertyValue("visibility"), "hidden");
  assert.equal(f.input.style.getPropertyValue("visibility"), "");
  visibility.refresh(false);
  assert.equal(row.style.getPropertyValue("visibility"), "");
  assert.equal(tooltip.style.getPropertyValue("visibility"), "");
  visibility.dispose();
  f.view.dispose();
});

test("streamed paragraphs do not rediscover decorations while a newly mounted greeting does", () => {
  const f = fixture();
  const message = f.doc.createElement("article"),
    paragraph = f.doc.createElement("p"),
    greeting = f.doc.createElement("p");
  paragraph.textContent = "A new conversation paragraph";
  greeting.textContent = "무엇을 만들까요?";
  message.append(paragraph);
  f.foreground.append(message, greeting);
  const mutation = (target, added) => ({
    type: "childList",
    target,
    addedNodes: [added],
    removedNodes: [],
  });
  assert.equal(mutationNeedsDiscovery([mutation(message, paragraph)]), false);
  assert.equal(
    mutationNeedsDiscovery([mutation(f.foreground, greeting)]),
    true,
  );
  message.append(greeting);
  assert.equal(mutationNeedsDiscovery([mutation(message, greeting)]), false);
  f.view.dispose();
});

test("new page shell wrappers are detected by geometry while the computer panel and message cards keep native paint", () => {
  const f = fixture();
  const bounds = {
    left: 0,
    top: 40,
    width: 1000,
    height: 800,
    right: 1000,
    bottom: 840,
  };
  f.foreground.rect = bounds;
  const wrapper = f.doc.createElement("div");
  wrapper.rect = bounds;
  const computer = f.doc.createElement("aside");
  computer.rect = { ...bounds, left: 700, width: 300 };
  computer.style.setProperty("background-color", "navy");
  const message = f.doc.createElement("article");
  message.rect = { ...bounds, width: 1000 };
  const embed = f.doc.createElement("webview");
  embed.rect = bounds;
  computer.append(embed);
  wrapper.append(computer, message);
  f.foreground.append(wrapper);
  assert.deepEqual(structuralShellPaintSources(f.doc.body), [
    f.foreground,
    wrapper,
  ]);
  assert.equal(computer.style.getPropertyValue("background-color"), "navy");
  f.view.dispose();
});
