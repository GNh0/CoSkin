import { settingsPage } from "./runtime-settings.js";
import { createModeLayout } from "./mode-layout.js";
import { defaultTargetSelection } from "../core/target-scope.ts";
import { uploadFile, downloadBytes } from "./file-transfer.js";
import { createModeToolbar } from "./mode-toolbar.js";
import { adoptUiStyles } from "./ui-styles.js";
import { UiSession } from "../core/ui-session.ts";
import { t } from "./messages.js";
import { editorContext } from "./editor-context.js";
import { galleryPage } from "./gallery.js";
import { detailPage } from "./detail.js";
import { disposePreviews } from "./previews.js";
import { text } from "./strings.js";
import { validateTheme } from "../core/engine.ts";
import { h } from "./components.js";
export class Panel {
  constructor(controller) {
    this.c = controller;
    this.session = new UiSession();
    this.selected = null;
    this.history = [];
    this.redo = [];
    this.pageResources = [];
    this.modeLayout = createModeLayout();
    this.scopeUndo = new WeakMap();
    this.draftGeneration = 0;
    this.draftWrite = Promise.resolve();
    this.entry = h("button", {
      "aria-label": text.entry,
      title: text.entry,
      text: "✦",
      type: "button",
      onclick: () => this.toggle(),
    });
    this.entry.dataset.coskinUi = "";
    Object.assign(this.entry.style, {
      width: "36px",
      height: "36px",
      background: "transparent",
      color: "inherit",
      border: "0",
      borderRadius: "8px",
      cursor: "pointer",
      webkitAppRegion: "no-drag",
    });
    this.host = h("div", { "data-coskin-ui": "", hidden: "" });
    this.shadow = this.host.attachShadow({ mode: "open" });
    adoptUiStyles(this.shadow);
    this.editToolbar = createModeToolbar(this, "editing");
    this.editBar = this.editToolbar.host;
    this.previewToolbar = createModeToolbar(this, "preview");
    this.previewBar = this.previewToolbar.host;
    this.contextAbort = new AbortController();
    document.addEventListener(
      "click",
      (event) => {
        const target =
          event.target instanceof Element
            ? event.target.closest(
                'nav[data-app-navigation-rail="true"] button',
              )
            : null;
        if (!target || target === this.entry) return;
        if (this.editing && this.dirty) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.pendingNavigation = target;
          this.closePrompt = true;
          this.host.hidden = false;
          this.render();
          return;
        }
        this.c.stopReplay(false);
        this.closePage();
        this.session.hide();
        this.modeLayout.update(false);
        this.editBar.hidden = true;
        this.previewBar.hidden = true;
        this.c.preview = null;
        this.c.render();
      },
      { capture: true, signal: this.contextAbort.signal },
    );
    document.addEventListener(
      "contextmenu",
      (event) => this.contextMenu(event),
      { capture: true, signal: this.contextAbort.signal },
    );
    document.body.append(this.host);
  }
  ensureEntry() {
    if (!this.entry.isConnected) this.c.adapter.entry(this.entry);
  }
  get editing() {
    return this.session.editing;
  }
  get detail() {
    return this.session.page === "detail";
  }
  set detail(value) {
    this.session.show(value ? "detail" : "library");
  }
  toggle() {
    if (!this.host.hidden && this.dirty) {
      this.closePrompt = true;
      this.render();
      return;
    }
    if (!this.host.hidden && this.host.dataset.mode === "gallery") {
      this.closePage();
      return;
    }
    this.openPage();
    this.render();
  }
  openPage() {
    if (this.editing) {
      this.message = t("panel.finishFirst");
      this.host.hidden = false;
      this.render();
      return;
    }
    this.modeLayout.update(false);
    this.pageCleanup?.();
    this.session.show();
    this.entry.setAttribute("aria-current", "page");
    this.entry.style.background = "var(--color-token-surface-hover, #ffffff10)";
    this.host.dataset.mode = "gallery";
    this.pageCleanup = this.c.adapter.openPage(this.host);
    this.host.hidden = false;
    this.render();
  }
  closePage() {
    for (const dispose of this.pageResources) dispose();
    this.pageResources = [];
    this.entry.removeAttribute("aria-current");
    this.entry.style.background = "transparent";
    if (this.session.view.kind === "page") this.session.hide();
    this.pageCleanup?.();
    this.pageCleanup = null;
    this.host.hidden = true;
  }
  enterEdit() {
    this.message = "";
    this.closePage();
    this.session.edit();
    this.modeLayout.update(true);
    this.editBar.hidden = false;
    this.activeSection = "image";
    this.host.dataset.mode = "editor";
    this.preview();
  }
  startPreview() {
    this.closePage();
    this.session.preview();
    this.modeLayout.update(true);
    this.c.preview = { document: this.doc, profile: this.profile };
    this.c.render();
    this.previewBar.hidden = false;
  }
  endPreview() {
    this.c.stopReplay(false);
    this.session.finish();
    this.modeLayout.update(false);
    this.c.preview = null;
    this.c.render();
    this.previewBar.hidden = true;
    this.openPage();
  }
  async exitEdit() {
    if (this.dirty) {
      this.closePrompt = true;
      this.host.hidden = false;
      this.render();
      return;
    }
    this.c.stopReplay(false);
    this.session.finish();
    this.modeLayout.update(false);
    this.editBar.hidden = true;
    this.host.hidden = true;
    this.c.preview = null;
    this.c.render();
    if (this.pendingNavigation) {
      const target = this.pendingNavigation;
      this.pendingNavigation = null;
      this.session.hide();
      target.click();
    } else this.openPage();
  }
  contextMenu(event) {
    if (
      !this.editing ||
      event.composedPath().includes(this.host) ||
      event.composedPath().includes(this.editBar)
    )
      return;
    const node = event.target;
    if (!(node instanceof Node)) return;
    const candidates = this.c.targets.filter((target) =>
      target.el.contains(node),
    );
    const target =
      candidates.find(
        (candidate) =>
          !candidates.some(
            (other) => other !== candidate && candidate.el.contains(other.el),
          ),
      ) || null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (this.target !== target.target) this.selectedLayer = null;
    this.target = target.target;
    this.state = "base";
    Object.assign(this, defaultTargetSelection(target.target, target.item));
    this.targetTitle = target.item
      ? (
          target.el.getAttribute("aria-label") || target.el.textContent.trim()
        ).slice(0, 80)
      : "";
    this.message = "";
    this.activeSection = "image";
    this.host.dataset.mode = "editor";
    this.host.style.left = "auto";
    this.host.style.right = "16px";
    this.host.style.top = "112px";
    this.host.hidden = false;
    this.render();
  }
  notify(message) {
    clearTimeout(this.noticeTimer);
    this.message = message;
    this.render();
    this.noticeTimer = setTimeout(() => {
      this.message = "";
      if (!this.host.hidden) this.render();
    }, 5000);
  }
  action(fn) {
    return async () => {
      if (this.busy || this.c.externalApplying) return;
      this.busy = true;
      try {
        await fn();
      } catch (e) {
        this.message = e.message;
      }
      this.busy = false;
      this.render();
    };
  }
  button(label, fn, disabled = false) {
    const e = h("button", {
      type: "button",
      text: label,
      onclick: this.action(fn),
    });
    e.disabled = disabled || this.busy;
    return e;
  }
  scope() {
    const row = h("div", { class: "scope-control" });
    const select = h("select", { "aria-label": t("scope") });
    for (const [value, label] of [
      ["global", t("global")],
      ["project", t("project")],
      ["thread", t("thread")],
    ]) {
      const opt = h("option", { value, text: label });
      opt.disabled = value !== "global" && !this.c.adapter.context()[value];
      select.append(opt);
    }
    select.value = this.scopeKind || "global";
    select.onchange = () => {
      this.scopeKind = select.value;
      this.render();
    };
    row.append(
      h("label", {
        class: this.editing ? "" : "visually-hidden",
        text: t("scope"),
      }),
      select,
    );
    return row;
  }
  scopeData() {
    const scope = this.scopeKind || "global";
    return { scope, contextId: this.c.adapter.context()[scope] };
  }
  async stopDraft() {
    clearTimeout(this.draftTimer);
    this.draftGeneration++;
    await this.draftWrite;
  }
  async load(id) {
    await this.stopDraft();
    this.selected = id;
    this.doc = await this.c.request("read", { id });
    this.baseRevision = this.c.summary.themes[id].revision;
    this.dirty = false;
    this.history = [];
    this.redo = [];
    this.profile = this.doc.manifest.defaultProfile;
  }
  builtin() {
    const id = "local." + crypto.randomUUID();
    return {
      manifest: {
        format: "coskin.theme",
        formatVersion: 1,
        id,
        name: t("panel.newTheme"),
        version: "0.1.0",
        author: { name: t("panel.user") },
        engine: { minVersion: "0.1.0" },
        requirements: { required: [], optional: [] },
        entry: "theme.json",
        defaultProfile: "default",
        files: [],
      },
      theme: {
        profiles: [{ id: "default", name: t("panel.base"), rules: [] }],
      },
      assets: {},
    };
  }
  async create(metadata) {
    if (!metadata) {
      this.metadataMode = "create";
      this.render();
      return;
    }
    this.doc = this.builtin();
    this.doc.manifest.name = metadata.name;
    this.doc.manifest.author.name = metadata.author;
    if (metadata.description)
      this.doc.manifest.description = metadata.description;
    await this.c.update("create", { document: this.doc });
    await this.load(this.doc.manifest.id);
    this.session.finish();
    this.detail = true;
    this.modeLayout.update(false);
  }
  change(fn, options = {}) {
    const previous = structuredClone(this.doc);
    try {
      fn();
      const target = options.target ?? this.target;
      const item = Object.hasOwn(options, "item")
        ? options.item
        : this.targetItem;
      const profile = options.profile ?? this.profile;
      if (
        !item &&
        ["sidebar.project-row", "sidebar.thread-row"].includes(target) &&
        options.clearAllExceptions === true
      ) {
        for (const rule of this.doc.localOverrides?.[profile] || [])
          if (rule.target === target)
            delete rule.states[options.state || this.state || "base"];
      }
      this.declare();
      validateTheme(this.doc.theme, Object.keys(this.doc.assets));
      for (const [profile, rules] of Object.entries(
        this.doc.localOverrides || {},
      ))
        validateTheme(
          {
            profiles: [{ id: profile, name: t("panel.individual"), rules }],
            customEffects: this.doc.theme.customEffects,
          },
          Object.keys(this.doc.assets),
          true,
        );
    } catch (error) {
      this.doc = previous;
      throw error;
    }
    this.history.push(previous);
    if (this.history.length > 100) this.history.shift();
    this.redo = [];
    this.dirty = true;
    this.declare();
    if (options.preview !== false) this.preview();
    clearTimeout(this.draftTimer);
    const generation = ++this.draftGeneration;
    const snapshot = {
      id: this.selected,
      baseRevision: this.baseRevision,
      document: structuredClone(this.doc),
    };
    this.draftTimer = setTimeout(() => {
      this.draftWrite = this.draftWrite
        .then(() => {
          if (generation !== this.draftGeneration) return;
          return this.c.request("draft", snapshot);
        })
        .catch((error) => {
          if (generation === this.draftGeneration) this.notify(error.message);
        });
    }, 400);
  }
  declare() {
    const used = new Set();
    for (const p of this.doc.theme.profiles)
      for (const r of p.rules) {
        used.add("target:" + r.target);
        for (const s of Object.values(r.states))
          for (const effects of Object.values(s.motion?.events || {}))
            for (const e of effects) used.add("effect:" + e.effect + "@1");
      }
    this.doc.manifest.requirements = { required: [...used], optional: [] };
  }
  preview() {
    this.c.preview = { document: this.doc, profile: this.profile };
    this.c.render();
  }
  async save() {
    await this.stopDraft();
    const result = await this.c.update("save", {
      document: this.doc,
      baseRevision: this.baseRevision,
    });
    this.baseRevision = result.revision;
    this.dirty = false;
    await this.c.request("draft-clear");
    this.message = t("panel.saved");
  }
  async apply() {
    this.c.stopReplay(false);
    const wasPreviewing = this.session.previewing;
    if (this.dirty) await this.save();
    await this.c.update("apply", {
      id: this.selected,
      revision: this.baseRevision,
      profile: this.profile,
      ...this.scopeData(),
    });
    this.c.preview = null;
    this.previewBar.hidden = true;
    this.c.render();
    this.message = t("panel.applied");
    if (wasPreviewing) {
      this.session.finish();
      this.modeLayout.update(false);
      this.openPage();
    }
  }
  async cancel() {
    this.c.stopReplay(false);
    await this.stopDraft();
    this.c.preview = null;
    await this.load(this.selected);
    await this.c.request("draft-clear");
    this.c.render();
    this.message = t("panel.restored");
  }
  async importFile(file) {
    await uploadFile(this.c, file, "import");
    this.c.summary = await this.c.request("list");
    this.message = t("panel.imported");
  }
  async export() {
    const result = await this.c.request("export", {
      chunked: true,
      id: this.selected,
      revision: this.baseRevision,
    });
    const bytes = await downloadBytes(this.c, result);
    const url = URL.createObjectURL(
      new Blob([bytes], { type: "application/octet-stream" }),
    );
    const a = h("a", {
      download: this.doc.manifest.name + ".coskin",
      href: url,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  render() {
    this.modeLayout.update(this.editing || this.session.previewing);
    this.editToolbar.update();
    this.previewToolbar.update();
    this.host.dataset.theme = document.documentElement.dataset.theme || "dark";
    for (const dispose of this.pageResources) dispose();
    this.pageResources = [];
    this.shadow.querySelector("section")?.remove();
    const section = h("section", {
      "aria-label": this.editing ? t("panel.editorTitle") : text.title,
    });
    if (this.message)
      section.append(h("output", { role: "status", text: this.message }));
    if (this.closePrompt) {
      section.append(
        h("p", { text: t("panel.dirty") }),
        h("div", { class: "row" }, [
          this.button(t("panel.saveClose"), async () => {
            await this.save();
            this.closePrompt = false;
            await this.exitEdit();
          }),
          this.button(t("panel.discardClose"), async () => {
            await this.cancel();
            this.closePrompt = false;
            await this.exitEdit();
          }),
          this.button(t("panel.continueEditing"), () => {
            this.closePrompt = false;
            this.pendingNavigation = null;
          }),
        ]),
      );
      this.shadow.append(section);
      return;
    }
    if (this.deleteConfirm) {
      section.append(
        h("p", {
          text: t("panel.deletePrompt"),
        }),
        this.button(t("delete"), async () => {
          await this.c.update("delete", {
            id: this.deleteConfirm,
            releaseBindings: true,
          });
          if (this.selected === this.deleteConfirm) {
            this.selected = null;
            this.doc = null;
            this.detail = false;
          }
          this.deleteConfirm = null;
        }),
        this.button(t("panel.cancel"), () => (this.deleteConfirm = null)),
      );
    } else if (!this.editing) {
      if (this.settingsOpen) settingsPage(this, section);
      else if (this.detail && this.doc) detailPage(this, section);
      else this.library(section);
    } else this.editor(section);
    this.shadow.append(section);
  }
  library(section) {
    galleryPage(this, section);
  }
  rule() {
    const profile = this.doc.theme.profiles.find((p) => p.id === this.profile);
    let rules = profile.rules;
    if (this.targetItem) {
      this.doc.localOverrides ??= {};
      this.doc.localOverrides[this.profile] ??= [];
      rules = this.doc.localOverrides[this.profile];
    }
    let rule = rules.find(
      (r) =>
        r.target === (this.target || "main.surface") &&
        (!this.targetItem || r.item === this.targetItem),
    );
    if (!rule) {
      rule = {
        id: "rule-" + crypto.randomUUID(),
        target: this.target || "main.surface",
        states: {},
      };
      if (this.targetItem) rule.item = this.targetItem;
      rules.push(rule);
    }
    const state = this.state || "base";
    rule.states[state] ??= { style: {} };
    return rule.states[state];
  }
  editor(section) {
    editorContext(this, section);
  }
  dispose() {
    this.draftGeneration++;
    clearTimeout(this.draftTimer);
    clearTimeout(this.noticeTimer);
    this.contextAbort?.abort();
    this.modeLayout.dispose();
    this.pageCleanup?.();
    for (const dispose of this.pageResources) dispose();
    disposePreviews();
    this.editBar.remove();
    this.previewBar.remove();
    this.c.adapter.disposeEntry();
    this.entry.remove();
    this.host.remove();
  }
}
