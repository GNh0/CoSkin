import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { workspaceBundle } from "./workspace-bundle.mjs";
import { libraryFixture } from "./library-fixture.mjs";

const compiled = await build({
  stdin: {
    contents:
      'export { Panel } from "./src/renderer/panel.js"; export { groupManager, organizationForm, writeOrganizationBatch } from "./src/renderer/library-organization.js"; export { searchablePicker } from "./src/renderer/library-controls.js"; export { themeDragMime } from "./src/renderer/library-explorer.js";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [workspaceBundle()],
});
const {
  Panel,
  groupManager,
  organizationForm,
  writeOrganizationBatch,
  searchablePicker,
  themeDragMime,
} = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this.value = "";
    this.scrollTop = 0;
    this.isConnected = true;
  }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key === "value") this.value = String(value);
  }
  getAttribute(key) {
    return this.attributes[key] ?? null;
  }
  get className() {
    return this.attributes.class || "";
  }
  set className(value) {
    this.attributes.class = value;
  }
  set textContent(value) {
    this.content = String(value);
    this.children = [];
  }
  get textContent() {
    return (
      (this.content || "") +
      this.children.map((child) => child.textContent).join("")
    );
  }
  addEventListener(key, listener) {
    (this.listeners[key] ??= []).push(listener);
  }
  append(...children) {
    for (const child of children) {
      child.parent = this;
      for (const element of all(child)) element.isConnected = this.isConnected;
      this.children.push(child);
    }
  }
  prepend(...children) {
    for (const child of children) child.parent = this;
    this.children.unshift(...children);
  }
  replaceChildren(...children) {
    for (const child of this.children) {
      for (const element of all(child)) element.isConnected = false;
      child.parent = null;
    }
    this.children = [];
    this.content = "";
    this.append(...children);
  }
  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter(
        (child) => child !== this,
      );
    this.parent = null;
    for (const element of all(this)) element.isConnected = false;
  }
  querySelectorAll(selector) {
    return all(this)
      .slice(1)
      .filter((element) => {
        if (selector === "button:nth-child(2)")
          return (
            element.tagName === "BUTTON" &&
            element.parent?.children[1] === element
          );
        const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/u);
        if (attribute)
          return (
            element.getAttribute(attribute[1]) !== null &&
            (attribute[2] === undefined ||
              element.getAttribute(attribute[1]) === attribute[2])
          );
        return element.tagName.toLowerCase() === selector;
      });
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  contains(element) {
    return all(this).includes(element);
  }
  focus() {
    document.activeElement = this;
  }
  reportValidity() {
    return true;
  }
  showModal() {
    this.open = this.modal = true;
  }
  close() {
    this.open = this.modal = false;
  }
  async emit(key, values = {}) {
    const event = {
      target: this,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.cancelBubble = true;
      },
      ...values,
    };
    if (this["on" + key]) await this["on" + key](event);
    for (const listener of this.listeners[key] || []) await listener(event);
    return event;
  }
}
const all = (root) => [root, ...root.children.flatMap(all)];
const byClass = (root, name) =>
  all(root).filter((element) => element.className.split(" ").includes(name));
const byText = (root, label, tag = "BUTTON") =>
  all(root).find(
    (element) => element.tagName === tag && element.textContent === label,
  );
const byLabel = (root, label) =>
  all(root).find((element) => element.getAttribute("aria-label") === label);
const byFocus = (root, key) =>
  all(root).find(
    (element) => element.getAttribute("data-library-focus") === key,
  );

function setup(location = "all") {
  const catalog = libraryFixture();
  globalThis.document = {
    createElement: (tag) => new Element(tag),
    createElementNS: (_namespace, tag) => new Element(tag),
    documentElement: { lang: "en", dataset: {} },
    querySelector: () => null,
  };
  let observers = 0;
  globalThis.IntersectionObserver = class {
    observe() {
      this.active = true;
      observers++;
    }
    disconnect() {
      if (this.active) {
        this.active = false;
        observers--;
      }
    }
  };
  const requests = [];
  const panel = Object.create(Panel.prototype);
  const controller = {
    summary: catalog,
    externalApplying: false,
    adapter: { context: () => ({}) },
    render() {},
    stopReplay() {},
    async request(op, data = {}) {
      requests.push({ op, ...data });
      if (op === "list") return catalog;
      if (op === "read")
        return {
          manifest: {
            id: data.id,
            name: catalog.themes[data.id].name,
            author: { name: "Test" },
            defaultProfile: "default",
          },
          theme: { profiles: [{ id: "default", name: "Default", rules: [] }] },
          assets: {},
        };
      if (op === "organization-write")
        Object.assign(catalog.organization.themes[data.id], data.metadata);
      if (op === "organization-batch") {
        for (const { id, metadata } of data.changes)
          Object.assign(catalog.organization.themes[id], metadata);
        return catalog;
      }
      if (op === "group-write") {
        const id = data.groupId || "new.folder";
        catalog.organization.groups[id] = data.name;
        catalog.organization.groupParents ??= {};
        if (data.parentId)
          catalog.organization.groupParents[id] = data.parentId;
        else delete catalog.organization.groupParents[id];
      }
      if (op === "group-delete") {
        const parents = catalog.organization.groupParents || {};
        const parent = parents[data.groupId];
        for (const [id, previous] of Object.entries(parents))
          if (previous === data.groupId) {
            if (parent) parents[id] = parent;
            else delete parents[id];
          }
        delete catalog.organization.groups[data.groupId];
        delete parents[data.groupId];
        for (const metadata of Object.values(catalog.organization.themes))
          if (metadata.groupId === data.groupId) delete metadata.groupId;
      }
      return {};
    },
    async update(op, data) {
      await this.request(op, data);
      this.summary = await this.request("list");
    },
  };
  Object.assign(panel, {
    c: controller,
    session: {
      editing: false,
      previewing: false,
      page: "library",
      show(page = "library") {
        this.page = page;
      },
    },
    shadow: new Element("shadow"),
    host: new Element("host"),
    modeLayout: { update() {} },
    editToolbar: { update() {} },
    previewToolbar: { update() {} },
    pageResources: [],
    selected: "theme.0999",
    groupFilter: location,
    draftWrite: Promise.resolve(),
    draftGeneration: 0,
  });
  panel.render();
  return { panel, catalog, requests, observers: () => observers };
}

test("real gallery navigates 1200 themes by numbers, jump and keyboard, preserving filters and loaded selection", async () => {
  const { panel, requests, observers } = setup();
  assert.equal(byClass(panel.shadow, "skin-card").length, 24);
  assert.equal(observers(), 24);
  assert.match(
    byLabel(panel.shadow, "Library pages").textContent,
    /Page 1 \/ 50.*1200/,
  );
  await byFocus(panel.shadow, "library-top-last").emit("click");
  assert.equal(panel.page, 49);
  assert.equal(
    byClass(panel.shadow, "skin-card")[0].children.find(
      (child) => child.className === "card-body",
    ).children[1].children[0].textContent,
    "Theme 1176",
  );
  assert.equal(byFocus(panel.shadow, "library-top-next").disabled, true);
  assert.equal(observers(), 24);
  await byFocus(panel.shadow, "library-top-first").emit("click");
  await byFocus(panel.shadow, "library-top-page-3").emit("click");
  assert.equal(panel.page, 3);
  const jump = byFocus(panel.shadow, "library-top-jump");
  jump.value = "999999";
  await jump.emit("keydown", { key: "Enter" });
  assert.equal(panel.page, 49);
  const pager = byLabel(panel.shadow, "Library pages");
  await pager.emit("keydown", {
    key: "Home",
    target: byFocus(panel.shadow, "library-top-first"),
  });
  assert.equal(panel.page, 0);
  const search = byLabel(panel.shadow, "Search name, character, skin, or type");
  search.value = "Battle";
  await search.emit("keydown", { key: "Enter" });
  assert.equal(panel.filter, "Battle");
  assert.equal(panel.page, 0);
  await byFocus(panel.shadow, "library-top-last").emit("click");
  assert.equal(panel.page, 24);
  assert.equal(panel.filter, "Battle");
  assert.equal(panel.selected, "theme.0999");
  assert.equal(requests.length, 0);
  panel.shadow.querySelector("section").scrollTop = 275;
  const oldSection = panel.shadow.querySelector("section");
  panel.pageResources.push(() => {
    // Browsers clamp scrolling when disposed previews reduce the page height.
    oldSection.scrollTop = 0;
  });
  const card = byClass(panel.shadow, "card-body")[0];
  await card.emit("click");
  const selected = panel.selected;
  assert.equal(panel.detail, true);
  await byText(panel.shadow, "← Theme library").emit("click");
  assert.equal(panel.detail, false);
  assert.equal(panel.page, 24);
  assert.equal(panel.filter, "Battle");
  assert.equal(panel.selected, selected);
  assert.equal(panel.shadow.querySelector("section").scrollTop, 275);
  assert.equal(requests.filter((request) => request.op === "read").length, 1);
});

function nestedCatalog(panel, catalog) {
  catalog.organization.groups = {
    root: "NIKKE",
    unit: "Dorothy",
    skin: "Dreaming",
    battle: "Battle",
    motion: "Motion",
    other: "Other",
    empty: "Empty",
  };
  catalog.organization.groupParents = {
    unit: "root",
    skin: "unit",
    battle: "skin",
    motion: "skin",
  };
  catalog.organization.themes = {
    "theme.0000": { groupId: "battle", tags: ["type: Battle"] },
    "theme.0001": { groupId: "motion", tags: ["type: Character scene"] },
    "theme.0002": { groupId: "other" },
  };
  panel.render();
}

test("nested folders show direct contents by default and optionally include descendants, preserving query and selection", async () => {
  const { panel, catalog } = setup();
  nestedCatalog(panel, catalog);
  assert.equal(byClass(panel.shadow, "folder-tree-row").length, 3);
  assert.match(
    byFocus(panel.shadow, "sidebar-folder-root").textContent,
    /NIKKE2/,
  );
  assert.match(
    byFocus(panel.shadow, "sidebar-folder-root").title,
    /0 direct.*2 including/,
  );
  await byFocus(panel.shadow, "sidebar-folder-root").emit("click");
  assert.equal(panel.groupFilter, "root");
  assert.equal(panel.folderIncludeChildren, false);
  assert.equal(byClass(panel.shadow, "skin-card").length, 0);
  assert.equal(byClass(panel.shadow, "folder-card").length, 1);
  assert.equal(panel.selected, "theme.0999");
  const include = byLabel(panel.shadow, "Include themes in subfolders");
  include.checked = true;
  await include.emit("change");
  assert.equal(byClass(panel.shadow, "skin-card").length, 2);
  const includeAgain = byLabel(panel.shadow, "Include themes in subfolders");
  includeAgain.checked = false;
  await includeAgain.emit("change");
  assert.equal(byClass(panel.shadow, "skin-card").length, 0);
  const includeFiltered = byLabel(panel.shadow, "Include themes in subfolders");
  includeFiltered.checked = true;
  await includeFiltered.emit("change");
  const search = byLabel(panel.shadow, "Search name, character, skin, or type");
  search.value = "0000";
  await search.emit("change");
  assert.equal(byClass(panel.shadow, "skin-card").length, 1);
  await byFocus(panel.shadow, "sidebar-folder-empty").emit("click");
  assert.equal(panel.filter, "0000");
  assert.equal(panel.groupFilter, "empty");
  assert.equal(byClass(panel.shadow, "skin-card").length, 0);
  assert.equal(panel.page, 0);
  await byFocus(panel.shadow, "sidebar-folder-all").emit("click");
  assert.equal(panel.filter, "0000");
  assert.equal(byClass(panel.shadow, "skin-card").length, 1);
  await byText(panel.shadow, "Clear filters").emit("click");
  await byFocus(panel.shadow, "sidebar-folder-ungrouped").emit("click");
  assert.equal(panel.groupFilter, "ungrouped");
  assert.match(
    byLabel(panel.shadow, "Library pages").textContent,
    /1197 results/,
  );
});

test("folder tree reveals search ancestors and responds to keyboard navigation", async () => {
  const { panel, catalog } = setup();
  nestedCatalog(panel, catalog);
  const tree = byClass(panel.shadow, "folder-tree")[0];
  await tree.emit("keydown", {
    key: "ArrowRight",
    target: byFocus(panel.shadow, "sidebar-folder-root"),
  });
  assert.ok(byFocus(panel.shadow, "sidebar-folder-unit"));
  const rootButton = byFocus(panel.shadow, "sidebar-folder-root");
  await tree.emit("keydown", { key: "ArrowDown", target: rootButton });
  assert.equal(document.activeElement.getAttribute("data-folder-id"), "unit");
  const search = byLabel(panel.shadow, "Search folder tree");
  search.value = "Motion";
  await search.emit("input");
  assert.deepEqual(
    byClass(panel.shadow, "folder-tree-row").map((row) =>
      row.children.at(-1).getAttribute("data-folder-id"),
    ),
    ["root", "unit", "skin", "motion"],
  );
  assert.equal(panel.groupFilter, "all");
  assert.equal(panel.page, 0);
  await byFocus(panel.shadow, "sidebar-folder-motion").emit("click");
  assert.equal(panel.groupFilter, "motion");
  assert.equal(byClass(panel.shadow, "skin-card").length, 1);
});

test("folder creation sets the selected parent and reparenting excludes itself and all descendants", async () => {
  const { panel, catalog, requests } = setup();
  nestedCatalog(panel, catalog);
  await byFocus(panel.shadow, "sidebar-folder-root").emit("click");
  await byText(panel.shadow, "Create a subfolder here").emit("click");
  const manager = byClass(panel.shadow, "group-manager")[0];
  const create = byClass(manager, "group-create")[0];
  assert.match(
    byClass(create, "library-picker")[0].children[0].textContent,
    /Parent folder: NIKKE/,
  );
  const name = byLabel(create, "Folder name");
  name.value = "New child";
  await name.emit("input");
  await create.emit("submit");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(
    requests.find((request) => request.op === "group-write"),
    { op: "group-write", name: "New child", parentId: "root" },
  );
  panel.groupManagerQuery = "NIKKE";
  panel.groupManagerSelected = "root";
  const edit = groupManager(panel);
  const rootRow = edit.querySelector('[data-group-edit="root"]');
  const parentPicker = byClass(rootRow, "library-picker")[0];
  const labels = byClass(parentPicker, "picker-options")[0].children.map(
    (element) => element.textContent,
  );
  assert.deepEqual(labels, ["Root", "Empty", "Other"]);
  await byText(parentPicker, "Other").emit("click");
  await rootRow.emit("submit");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(
    requests.filter((request) => request.op === "group-write").at(-1),
    { op: "group-write", groupId: "root", name: "NIKKE", parentId: "other" },
  );
});

test("moving a folder's last descendant themes preserves selection and shows the emptied folder", async () => {
  const { panel, catalog, requests } = setup();
  nestedCatalog(panel, catalog);
  await byFocus(panel.shadow, "sidebar-folder-root").emit("click");
  const include = byLabel(panel.shadow, "Include themes in subfolders");
  include.checked = true;
  await include.emit("change");
  await byText(panel.shadow, "Select to organize").emit("click");
  await byText(panel.shadow, "Select all 2 results").emit("click");
  panel.batchGroup = "other";
  panel.render();
  await byFocus(panel.shadow, "batch-organize").emit("click");
  await byText(panel.shadow, "Move to selected folder").emit("click");
  assert.equal(
    requests.filter((request) => request.op === "organization-batch").length,
    1,
  );
  assert.equal(panel.librarySelection.size, 2);
  assert.equal(panel.groupFilter, "root");
  assert.equal(panel.page, 0);
  assert.equal(byClass(panel.shadow, "skin-card").length, 0);
  assert.match(
    byFocus(panel.shadow, "sidebar-folder-root").textContent,
    /NIKKE0/,
  );
  assert.match(
    byClass(panel.shadow, "batch-organization")[0].textContent,
    /2 selected themes outside/,
  );
  assert.equal(panel.selected, "theme.0999");
});

test("4096-folder tree scrolls continuously with bounded rows and keyboard access to the last folder", async () => {
  const { panel, catalog } = setup();
  catalog.organization.groups = Object.fromEntries(
    Array.from({ length: 4096 }, (_, i) => ["folder." + i, "Folder " + i]),
  );
  panel.render();
  assert.ok(byClass(panel.shadow, "folder-tree-row").length <= 40);
  for (const options of byClass(panel.shadow, "picker-options"))
    assert.ok(options.children.length <= 13);
  const tree = byClass(panel.shadow, "folder-tree")[0];
  await tree.emit("keydown", {
    key: "End",
    target: byFocus(panel.shadow, "sidebar-folder-folder.0"),
  });
  assert.ok(panel.folderTreeScrollTop > 100000);
  assert.ok(byClass(panel.shadow, "folder-tree-row").length <= 40);
  assert.ok(byFocus(panel.shadow, "sidebar-folder-folder.4095"));
  assert.equal(
    document.activeElement.getAttribute("data-folder-id"),
    "folder.4095",
  );
  await tree.emit("keydown", {
    key: "ArrowUp",
    target: document.activeElement,
  });
  assert.equal(
    document.activeElement.getAttribute("data-folder-id"),
    "folder.4094",
  );
  await tree.emit("keydown", { key: "Home", target: document.activeElement });
  assert.equal(
    document.activeElement.getAttribute("data-folder-id"),
    "folder.0",
  );
  assert.equal(panel.folderTreeScrollTop, 0);
  const manager = groupManager(panel);
  assert.equal(byClass(manager, "group-list-row").length, 12);
  assert.equal(byClass(manager, "group-row").length, 0);
  for (const options of byClass(manager, "picker-options"))
    assert.ok(options.children.length <= 13);
  assert.ok(all(manager).length < 1200);
});

test("lost batch responses verify persisted state and an unreachable refresh reports uncertainty", async () => {
  const { panel, requests } = setup();
  const original = panel.c.request;
  panel.c.request = async (op, data) => {
    const result = await original.call(panel.c, op, data);
    if (op === "organization-batch") throw Error("response timed out");
    return result;
  };
  await writeOrganizationBatch(panel, ["theme.0000", "theme.0001"], {
    favorite: true,
  });
  assert.equal(
    requests.filter((request) => request.op === "organization-batch").length,
    1,
  );
  assert.equal(requests.filter((request) => request.op === "list").length, 1);
  assert.match(panel.message, /verified organization for 2/);
  panel.c.request = async () => {
    throw Error("disconnected");
  };
  await assert.rejects(
    writeOrganizationBatch(panel, ["theme.0000"], { favorite: false }),
    /save state could not be verified/,
  );
  assert.equal(panel.batchProgress, null);
});

test("batch UTF8 size checks include the complete request envelope and reject oversized Unicode without host calls", async () => {
  const { panel, catalog, requests } = setup();
  const existing = Array.from(
    { length: 23 },
    (_, i) => "가".repeat(47) + String.fromCharCode(0xac00 + i),
  );
  for (const metadata of Object.values(catalog.organization.themes))
    metadata.tags = existing;
  const ids = Object.keys(catalog.themes);
  const added = "가".repeat(47) + "힣";
  const changes = ids.map((id) => ({
    id,
    metadata: { tags: [...existing, added] },
  }));
  const compact = JSON.stringify({ changes });
  assert.ok(compact.length < 4 * 1024 * 1024);
  assert.ok(new TextEncoder().encode(compact).byteLength > 4 * 1024 * 1024);
  await assert.rejects(
    writeOrganizationBatch(panel, ids, { addTags: [added] }),
    /exceeds 4MiB/,
  );
  assert.equal(requests.length, 0);
  panel.c.sessionId = "가".repeat(1_398_080);
  await assert.rejects(
    writeOrganizationBatch(panel, ["theme.0000"], { favorite: true }),
    /exceeds 4MiB/,
  );
  assert.equal(requests.length, 0);
  assert.equal(panel.batchProgress, undefined);
});

test("gallery keeps bounded options and cards, page size position, empty results and scroll when selecting", async () => {
  const { panel, observers } = setup();
  for (const picker of byClass(panel.shadow, "picker-options"))
    assert.ok(picker.children.length <= 13);
  assert.equal(byClass(panel.shadow, "library-picker").length, 4);
  await byFocus(panel.shadow, "library-top-page-3").emit("click");
  const size = byLabel(panel.shadow, "Themes per page");
  size.value = "48";
  await size.emit("change");
  assert.equal(panel.page, 1);
  assert.equal(panel.libraryPageSize, 48);
  assert.equal(byClass(panel.shadow, "skin-card").length, 48);
  assert.equal(observers(), 48);
  await byText(panel.shadow, "Select to organize").emit("click");
  panel.shadow.querySelector("section").scrollTop = 420;
  const firstCheck = byClass(panel.shadow, "card-selection")[0].children[0];
  firstCheck.checked = true;
  await firstCheck.emit("change");
  assert.equal(panel.shadow.querySelector("section").scrollTop, 420);
  assert.equal(panel.selected, "theme.0999");
  await byFocus(panel.shadow, "library-top-next").emit("click");
  assert.equal(panel.librarySelection.size, 1);
  assert.equal(panel.shadow.querySelector("section").scrollTop, 0);
  const search = byLabel(panel.shadow, "Search name, character, skin, or type");
  search.value = "No matching package anywhere";
  await search.emit("change");
  assert.equal(panel.page, 0);
  assert.equal(byClass(panel.shadow, "skin-card").length, 0);
  assert.equal(observers(), 0);
  assert.equal(panel.librarySelection.size, 1);
  assert.match(
    byClass(panel.shadow, "batch-selection-bar")[0].textContent,
    /1 selected themes outside/,
  );
  assert.equal(byFocus(panel.shadow, "library-top-next").disabled, true);
  assert.equal(byFocus(panel.shadow, "library-top-jump").disabled, true);
  await byText(panel.shadow, "Clear filters").emit("click");
  assert.equal(panel.filter, "");
  assert.equal(byClass(panel.shadow, "skin-card").length, 48);
  assert.equal(panel.librarySelection.size, 1);
});

test("picker searches 1200 labels locally, pages 12 at a time and closes after choosing", async () => {
  const { panel } = setup();
  const changes = [];
  const state = {};
  const picker = searchablePicker(panel, {
    key: "test-tags",
    label: "Tag",
    emptyLabel: "All tags",
    options: Array.from({ length: 1200 }, (_, i) => [
      String(i),
      "Option " + String(i).padStart(4, "0"),
    ]),
    state,
    onChange: (value) => changes.push(value),
  });
  assert.equal(byClass(picker, "picker-options")[0].children.length, 13);
  await byFocus(picker, "test-tags-last").emit("click");
  assert.equal(state.page, 99);
  assert.equal(
    byClass(picker, "picker-options")[0].children[1].textContent,
    "Option 1188",
  );
  const search = byLabel(picker, "Search Tag");
  search.value = "Option 1199";
  await search.emit("input");
  assert.equal(state.page, 0);
  assert.equal(byClass(picker, "picker-options")[0].children.length, 2);
  await byText(picker, "Option 1199").emit("click");
  assert.deepEqual(changes, ["1199"]);
  assert.equal(picker.open, false);
  assert.equal(picker.children[0].textContent, "Tag: Option 1199");
  assert.equal(search.value, "Option 1199");
});

test("group manager bounds 240 groups, preserves drafts and leaves the gallery page unchanged", async () => {
  const { panel } = setup();
  panel.page = 7;
  const manager = groupManager(panel);
  assert.equal(byClass(manager, "group-list-row").length, 12);
  await byClass(manager, "group-list-row")[0].emit("click");
  assert.equal(byClass(manager, "group-row").length, 1);
  const field = byLabel(manager, "Folder name");
  field.value = "Pending new name";
  await field.emit("input");
  await byFocus(manager, "group-manager-next").emit("click");
  assert.equal(panel.groupManagerPage, 1);
  assert.equal(panel.page, 7);
  await byFocus(manager, "group-manager-first").emit("click");
  assert.equal(byLabel(manager, "Folder name").value, "Pending new name");
  const search = byLabel(manager, "Search folders to manage");
  search.value = "Group 239";
  await search.emit("input");
  assert.equal(byClass(manager, "group-list-row").length, 1);
  await byClass(manager, "group-list-row")[0].emit("click");
  assert.equal(panel.groupManagerPage, 0);
  assert.equal(panel.page, 7);
  assert.equal(byLabel(manager, "Folder name").value, "Group 239");
});

test("detail organization uses searchable groups and submits only the chosen group and tags", async () => {
  const { panel, requests } = setup();
  await panel.load("theme.0001");
  const form = organizationForm(panel);
  const groups = byClass(form, "library-picker")[0];
  const search = byLabel(groups, "Search Folder");
  search.value = "Group 239";
  await search.emit("input");
  await byText(groups, "Group 239").emit("click");
  await form.emit("submit");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(
    requests.find((request) => request.op === "organization-write"),
    {
      op: "organization-write",
      id: "theme.0001",
      metadata: {
        groupId: "group.239",
        tags: [
          "character: Character 1",
          "skin: Skin 1",
          "type: Character scene",
          "Unique tag 1",
        ],
      },
    },
  );
});

test("1200-theme organization batch sends one atomic request and preserves files, bindings and selection", async () => {
  const { panel, catalog, requests } = setup();
  const themes = JSON.stringify(catalog.themes);
  catalog.bindings.global = {
    id: "theme.0000",
    revision: 1,
    profile: "default",
  };
  const bindings = JSON.stringify(catalog.bindings);
  panel.librarySelection = new Set(Object.keys(catalog.themes));
  let renders = 0;
  panel.render = () => {
    renders++;
  };
  await writeOrganizationBatch(panel, panel.librarySelection, {
    favorite: true,
    groupId: "group.10",
    addTags: ["Reviewed", "reviewed"],
  });
  assert.equal(
    requests.filter((request) => request.op === "organization-batch").length,
    1,
  );
  assert.equal(requests.filter((request) => request.op === "list").length, 0);
  assert.equal(requests[0].changes.length, 1200);
  assert.equal(renders, 1);
  assert.equal(panel.librarySelection.size, 1200);
  assert.equal(panel.selected, "theme.0999");
  assert.equal(JSON.stringify(catalog.themes), themes);
  assert.equal(JSON.stringify(catalog.bindings), bindings);
  for (const value of Object.values(catalog.organization.themes)) {
    assert.equal(value.favorite, true);
    assert.equal(value.groupId, "group.10");
    assert.equal(value.tags.length, 5);
    assert.equal(value.tags.at(-1), "Reviewed");
  }
  assert.equal(panel.batchProgress, null);
});

test("batch validates all limits before writes and refreshes accurate state after atomic failure", async () => {
  const { panel, catalog, requests } = setup();
  catalog.organization.themes["theme.0001"].tags = Array.from(
    { length: 24 },
    (_, i) => "Tag " + i,
  );
  await assert.rejects(
    writeOrganizationBatch(panel, ["theme.0000", "theme.0001"], {
      addTags: ["extra"],
    }),
    /exceed 24 tags/,
  );
  assert.equal(requests.length, 0);
  await assert.rejects(
    writeOrganizationBatch(panel, ["theme.0000"], {
      addTags: ["x".repeat(49)],
    }),
    /48 characters/,
  );
  assert.equal(requests.length, 0);
  await assert.rejects(
    writeOrganizationBatch(panel, ["theme.0000"], { groupId: "missing" }),
    /unavailable/,
  );
  const original = panel.c.request;
  panel.c.request = async (op, data) => {
    if (op === "organization-batch") throw Error("store unavailable");
    return original.call(panel.c, op, data);
  };
  await assert.rejects(
    writeOrganizationBatch(panel, ["theme.0000", "theme.0001", "theme.0002"], {
      favorite: false,
    }),
    /saving 0 of 3.*store unavailable/,
  );
  assert.equal(catalog.organization.themes["theme.0000"].favorite, true);
  assert.equal(requests.filter((request) => request.op === "list").length, 1);
  assert.equal(panel.batchProgress, null);
});

const mainItems = (panel) => byClass(panel.shadow, "explorer-items")[0];
const mainFolder = (panel, id) =>
  mainItems(panel).querySelector('[data-explorer-folder="' + id + '"]');
const mainTheme = (panel, id) =>
  byFocus(mainItems(panel), "theme-" + id)?.parent;

function explorerCatalog(panel, catalog) {
  nestedCatalog(panel, catalog);
  for (const id of Object.keys(catalog.themes))
    if (Number(id.slice(-4)) >= 6) delete catalog.themes[id];
  catalog.organization.groupParents.empty = "unit";
  catalog.organization.themes = {
    "theme.0000": {
      groupId: "battle",
      favorite: true,
      tags: ["character: Dorothy", "type: Battle", "Existing tag"],
    },
    "theme.0001": {
      groupId: "motion",
      favorite: false,
      tags: ["character: Dorothy", "type: Motion"],
    },
    "theme.0002": { groupId: "other", favorite: true, tags: ["Original"] },
    "theme.0003": {
      groupId: "root",
      favorite: false,
      tags: ["type: Overview"],
    },
    "theme.0004": {
      groupId: "unit",
      favorite: true,
      tags: ["Existing unit tag"],
    },
    "theme.0005": { favorite: true, tags: ["Unsorted"] },
  };
  catalog.bindings.global = {
    id: "theme.0000",
    revision: 1,
    profile: "default",
  };
  panel.groupFilter = "";
  panel.selected = "theme.0000";
  panel.render();
}

test("main contents mix folders and themes; single-click selects and double-click or Enter opens a folder", async () => {
  const { panel, catalog, requests } = setup("");
  explorerCatalog(panel, catalog);
  assert.deepEqual(
    byClass(mainItems(panel), "folder-card").map((card) =>
      card.getAttribute("data-explorer-folder"),
    ),
    ["root", "other"],
  );
  assert.ok(mainTheme(panel, "theme.0005"));
  assert.equal(byClass(mainItems(panel), "skin-card").length, 1);
  const folder = mainFolder(panel, "root");
  const body = byClass(folder, "folder-card-body")[0];
  panel.librarySelection.add("theme.0005");
  await body.emit("click");
  assert.equal(panel.groupFilter, "");
  assert.equal(panel.explorerSelectedFolder, "root");
  assert.equal(folder.getAttribute("aria-selected"), "true");
  assert.equal(
    mainFolder(panel, "root"),
    folder,
    "selection retains the node so the browser can dispatch dblclick",
  );
  assert.equal(requests.length, 0);
  await body.emit("dblclick");
  assert.equal(panel.groupFilter, "root");
  assert.ok(mainFolder(panel, "unit"));
  assert.ok(mainTheme(panel, "theme.0003"));
  assert.equal(byClass(mainItems(panel), "skin-card").length, 1);
  assert.equal(panel.librarySelection.has("theme.0005"), true);
  const unit = byFocus(mainItems(panel), "folder-unit");
  await unit.emit("keydown", { key: "Enter" });
  assert.equal(panel.groupFilter, "unit");
  assert.deepEqual(
    byClass(mainItems(panel), "folder-card").map((card) =>
      card.getAttribute("data-explorer-folder"),
    ),
    ["skin", "empty"],
  );
  assert.ok(mainTheme(panel, "theme.0004"));
  assert.equal(
    byClass(panel.shadow, "explorer-breadcrumbs")[0].textContent,
    "Folder homeNIKKEDorothy",
  );
  await byFocus(mainItems(panel), "theme-theme.0004").emit("click");
  assert.equal(panel.detail, true);
  assert.equal(panel.selected, "theme.0004");
  assert.equal(requests.filter(({ op }) => op === "read").length, 1);
});

test("back, forward, parent and breadcrumb navigation preserve filters, pages, scroll and theme selection", async () => {
  const { panel } = setup();
  panel.page = 12;
  panel.filter = "Battle";
  panel.librarySelection.add("theme.0004");
  panel.render();
  panel.shadow.querySelector("section").scrollTop = 360;
  await byFocus(panel.shadow, "sidebar-folder-group.2").emit("click");
  assert.equal(panel.filter, "Battle");
  assert.equal(panel.groupFilter, "group.2");
  assert.equal(panel.page, 0);
  await byFocus(panel.shadow, "explorer-back").emit("click");
  assert.equal(panel.groupFilter, "all");
  assert.equal(panel.page, 12);
  assert.equal(panel.shadow.querySelector("section").scrollTop, 360);
  await byFocus(panel.shadow, "explorer-forward").emit("click");
  assert.equal(panel.groupFilter, "group.2");
  await byFocus(panel.shadow, "explorer-up").emit("click");
  assert.equal(panel.groupFilter, "");
  await byFocus(panel.shadow, "sidebar-folder-group.2").emit("click");
  await byFocus(panel.shadow, "explorer-crumb-root").emit("click");
  assert.equal(panel.groupFilter, "");
  assert.equal(panel.filter, "Battle");
  assert.deepEqual([...panel.librarySelection], ["theme.0004"]);
  assert.equal(panel.selected, "theme.0999");
});

test("opening a folder again after Back restores its remembered page and scroll", async () => {
  const { panel, catalog } = setup("");
  catalog.organization.groups = { a: "Folder A", b: "Folder B" };
  for (const metadata of Object.values(catalog.organization.themes))
    metadata.groupId = "a";
  panel.filter = "Battle";
  panel.librarySelection = new Set(["theme.0004"]);
  panel.render();
  await byFocus(mainItems(panel), "folder-a").emit("dblclick");
  panel.page = 5;
  panel.render();
  panel.shadow.querySelector("section").scrollTop = 240;
  await byFocus(panel.shadow, "explorer-back").emit("click");
  assert.equal(panel.groupFilter, "");
  assert.equal(panel.page, 0);
  const folder = byFocus(mainItems(panel), "folder-a");
  await folder.emit("click");
  await folder.emit("dblclick");
  assert.equal(panel.groupFilter, "a");
  assert.equal(panel.page, 5);
  assert.equal(panel.shadow.querySelector("section").scrollTop, 240);
  assert.equal(panel.filter, "Battle");
  assert.deepEqual([...panel.librarySelection], ["theme.0004"]);
  assert.equal(panel.explorerForward.length, 0);
});

test("main tree expands folder nodes into child folders and theme leaves, with keyboard navigation and empty folder search paths", async () => {
  const { panel, catalog } = setup("");
  explorerCatalog(panel, catalog);
  await byFocus(panel.shadow, "explorer-view-tree").emit("click");
  assert.equal(mainItems(panel).getAttribute("role"), "tree");
  assert.equal(
    mainFolder(panel, "root").getAttribute("aria-expanded"),
    "false",
  );
  await byFocus(mainItems(panel), "explorer-expand-root").emit("click");
  assert.ok(mainFolder(panel, "unit"));
  assert.ok(mainTheme(panel, "theme.0003"));
  assert.equal(mainFolder(panel, "unit").getAttribute("aria-level"), "2");
  assert.equal(mainTheme(panel, "theme.0003").getAttribute("aria-level"), "2");
  const unit = byFocus(mainItems(panel), "folder-unit");
  await unit.emit("keydown", { key: "ArrowRight" });
  assert.ok(mainFolder(panel, "skin"));
  assert.ok(mainTheme(panel, "theme.0004"));
  const items = mainItems(panel).querySelectorAll("[data-explorer-item]");
  await mainItems(panel).emit("keydown", {
    key: "ArrowDown",
    target: items[0],
  });
  assert.equal(document.activeElement, items[1]);
  await mainItems(panel).emit("keydown", { key: "End", target: items[1] });
  assert.equal(document.activeElement, items.at(-1));
  await mainItems(panel).emit("keydown", { key: "Home", target: items.at(-1) });
  assert.equal(document.activeElement, items[0]);
  const search = byLabel(panel.shadow, "Search name, character, skin, or type");
  search.value = "Empty";
  await search.emit("change");
  assert.deepEqual(
    byClass(mainItems(panel), "folder-card").map((card) =>
      card.getAttribute("data-explorer-folder"),
    ),
    ["root", "unit", "empty"],
  );
  assert.equal(byClass(mainItems(panel), "skin-card").length, 0);
  assert.equal(
    byFocus(mainItems(panel), "explorer-expand-root").disabled,
    true,
  );
  await byFocus(mainItems(panel), "folder-empty").emit("keydown", {
    key: "Enter",
  });
  await byText(panel.shadow, "Clear filters").emit("click");
  assert.match(
    byClass(panel.shadow, "empty-state")[0].textContent,
    /This folder is empty/,
  );
});

test("both folder and tree lists mount no preview observers or media requests and retain path, filters, page and selection", async () => {
  const { panel, requests, observers } = setup();
  panel.page = 7;
  panel.filter = "Battle";
  panel.librarySelection.add("theme.0004");
  panel.render();
  assert.equal(observers(), 24);
  for (const view of ["folders", "tree"]) {
    await byFocus(panel.shadow, "explorer-view-" + view).emit("click");
    await byFocus(panel.shadow, "explorer-display-list").emit("click");
    assert.equal(observers(), 0);
    assert.equal(byClass(mainItems(panel), "thumb").length, 0);
    assert.equal(mainItems(panel).querySelectorAll("canvas").length, 0);
    assert.equal(requests.length, 0);
    assert.equal(panel.page, 7);
    assert.equal(panel.filter, "Battle");
    assert.equal(panel.groupFilter, "all");
    assert.equal(panel.librarySelection.has("theme.0004"), true);
    assert.ok(
      byClass(mainItems(panel), "skin-card").every((card) =>
        card.className.includes("explorer-row"),
      ),
    );
    const first = mainItems(panel).querySelectorAll("[data-explorer-item]")[0];
    await mainItems(panel).emit("keydown", { key: "ArrowDown", target: first });
    assert.equal(
      document.activeElement,
      mainItems(panel).querySelectorAll("[data-explorer-item]")[1],
    );
    await byFocus(panel.shadow, "explorer-display-preview").emit("click");
    assert.equal(observers(), 24);
    assert.equal(byClass(mainItems(panel), "thumb").length, 24);
    assert.equal(panel.page, 7);
    assert.equal(requests.length, 0);
  }
  await byFocus(panel.shadow, "explorer-display-list").emit("click");
  await byClass(mainItems(panel), "card-body")[0].emit("click");
  assert.equal(panel.detail, true);
  assert.equal(requests.filter(({ op }) => op === "read").length, 1);
});

test("all four explorer view combinations support keyboard folder opening and ordinary theme management", async () => {
  for (const view of ["folders", "tree"])
    for (const display of ["preview", "list"]) {
      const { panel, catalog, requests, observers } = setup("");
      explorerCatalog(panel, catalog);
      panel.libraryView = view;
      panel.libraryDisplay = display;
      panel.render();
      const root = byFocus(mainItems(panel), "folder-root");
      await root.emit("click");
      assert.equal(panel.groupFilter, "");
      await root.emit("keydown", { key: "Enter" });
      assert.equal(panel.groupFilter, "root");
      assert.ok(mainFolder(panel, "unit"));
      assert.ok(mainTheme(panel, "theme.0003"));
      assert.equal(observers(), display === "list" ? 0 : 1);
      assert.equal(requests.length, 0);
      await byFocus(mainItems(panel), "theme-theme.0003").emit("click");
      assert.equal(panel.detail, true);
      assert.equal(panel.selected, "theme.0003");
      assert.equal(requests.filter(({ op }) => op === "read").length, 1);
    }
});

test("a narrow screen begins with a collapsed sidebar and lets the user reopen it", async () => {
  const match = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  try {
    const { panel } = setup("");
    assert.equal(byClass(panel.shadow, "explorer-sidebar").length, 0);
    assert.equal(
      byFocus(panel.shadow, "explorer-sidebar").getAttribute("aria-expanded"),
      "false",
    );
    await byFocus(panel.shadow, "explorer-sidebar").emit("click");
    assert.equal(byClass(panel.shadow, "explorer-sidebar").length, 1);
    assert.equal(
      byFocus(panel.shadow, "explorer-sidebar").getAttribute("aria-expanded"),
      "true",
    );
  } finally {
    if (match) globalThis.matchMedia = match;
    else delete globalThis.matchMedia;
  }
});

class ThemeTransfer {
  data = new Map();
  files = [];
  get types() {
    return [...this.data.keys()];
  }
  setData(type, value) {
    this.data.set(type, value);
  }
  getData(type) {
    return this.data.get(type) || "";
  }
}

test("theme drag moves selected themes in one atomic batch to main folders, preserving favorites, tags, packages, revisions and bindings", async () => {
  const { panel, catalog, requests } = setup("");
  explorerCatalog(panel, catalog);
  panel.groupFilter = "root";
  panel.librarySelection = new Set(["theme.0003", "theme.0005"]);
  panel.render();
  const contents = JSON.stringify(catalog.themes);
  const bindings = JSON.stringify(catalog.bindings);
  const before = structuredClone(catalog.organization.themes);
  const drag = new ThemeTransfer();
  const source = mainTheme(panel, "theme.0003");
  assert.equal(source.getAttribute("draggable"), "true");
  await source.emit("dragstart", { dataTransfer: drag });
  assert.equal(drag.effectAllowed, "move");
  const target = mainFolder(panel, "unit");
  let accepts = 0;
  await target.emit("dragover", {
    dataTransfer: drag,
    preventDefault: () => accepts++,
  });
  assert.equal(accepts, 1);
  assert.equal(target.getAttribute("data-drop-hover"), "true");
  await target.emit("drop", { dataTransfer: drag });
  const batches = requests.filter(({ op }) => op === "organization-batch");
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].changes, [
    { id: "theme.0003", metadata: { groupId: "unit" } },
    { id: "theme.0005", metadata: { groupId: "unit" } },
  ]);
  for (const id of ["theme.0003", "theme.0005"])
    assert.deepEqual(catalog.organization.themes[id], {
      ...before[id],
      groupId: "unit",
    });
  assert.equal(JSON.stringify(catalog.themes), contents);
  assert.equal(JSON.stringify(catalog.bindings), bindings);
  assert.equal(panel.librarySelection.size, 2);
  assert.equal(panel.groupFilter, "root");
  assert.equal(panel.selected, "theme.0000");
  assert.equal(byClass(mainItems(panel), "skin-card").length, 0);
  assert.deepEqual(
    requests.map(({ op }) => op),
    ["organization-batch"],
  );
});

test("dragging a 1200-theme selection writes once and renders twice rather than per theme", async () => {
  const { panel, catalog, requests } = setup();
  const before = JSON.stringify(catalog.themes);
  panel.librarySelection = new Set(Object.keys(catalog.themes));
  panel.render();
  const render = panel.render;
  let renders = 0;
  panel.render = function () {
    renders++;
    render.call(this);
  };
  const transfer = new ThemeTransfer();
  await mainTheme(panel, "theme.0000").emit("dragstart", {
    dataTransfer: transfer,
  });
  await byFocus(panel.shadow, "sidebar-folder-group.10").emit("drop", {
    dataTransfer: transfer,
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].op, "organization-batch");
  assert.equal(requests[0].changes.length, 1200);
  assert.equal(renders, 2, "only the busy state and final summary render");
  assert.equal(JSON.stringify(catalog.themes), before);
  assert.equal(panel.librarySelection.size, 1200);
  assert.ok(
    Object.values(catalog.organization.themes).every(
      (metadata) => metadata.groupId === "group.10",
    ),
  );
});

test("unselected themes drag alone in all four view combinations and sidebar folders accept the same validated move", async () => {
  for (const view of ["folders", "tree"])
    for (const display of ["preview", "list"]) {
      const { panel, catalog, requests } = setup("");
      explorerCatalog(panel, catalog);
      panel.libraryView = view;
      panel.libraryDisplay = display;
      panel.librarySelection = new Set(["theme.0000", "theme.0001"]);
      panel.render();
      const transfer = new ThemeTransfer();
      await mainTheme(panel, "theme.0005").emit("dragstart", {
        dataTransfer: transfer,
      });
      const target =
        view === "tree"
          ? byFocus(panel.shadow, "sidebar-folder-other")
          : mainFolder(panel, "other");
      await target.emit("drop", { dataTransfer: transfer });
      assert.deepEqual(
        requests.filter(({ op }) => op === "organization-batch")[0].changes,
        [{ id: "theme.0005", metadata: { groupId: "other" } }],
      );
      assert.equal(catalog.organization.themes["theme.0000"].groupId, "battle");
      assert.equal(catalog.organization.themes["theme.0001"].groupId, "motion");
      assert.equal(panel.librarySelection.size, 2);
      assert.equal(panel.libraryView, view);
      assert.equal(panel.libraryDisplay, display);
    }
});

test("a failed folder drop retains the previous contents and metadata and reports the atomic failure", async () => {
  const { panel, catalog, requests } = setup("");
  explorerCatalog(panel, catalog);
  const before = JSON.stringify(catalog);
  const original = panel.c.request;
  panel.c.request = async (op, data) => {
    if (op === "organization-batch") {
      requests.push({ op, ...data });
      throw Error("store unavailable");
    }
    return original.call(panel.c, op, data);
  };
  const transfer = new ThemeTransfer();
  await mainTheme(panel, "theme.0005").emit("dragstart", {
    dataTransfer: transfer,
  });
  await mainFolder(panel, "other").emit("drop", { dataTransfer: transfer });
  assert.equal(JSON.stringify(catalog), before);
  assert.ok(mainTheme(panel, "theme.0005"));
  assert.equal(panel.groupFilter, "");
  assert.equal(panel.busy, false);
  assert.match(panel.message, /saving 0 of 1.*store unavailable/);
  assert.deepEqual(
    requests.map(({ op }) => op),
    ["organization-batch", "list"],
  );
});

test("drop rejects external files and unknown, empty, duplicate, excessive or altered internal identities without host calls", async () => {
  const cases = [
    (transfer) => {
      transfer.files = [{}];
    },
    (transfer) => {
      transfer.data.clear();
      transfer.setData("text/plain", "theme.0005");
    },
    (transfer) => {
      transfer.setData(themeDragMime, "malformed JSON");
    },
    (transfer) => {
      transfer.setData(themeDragMime, "null");
    },
    (transfer) => {
      transfer.setData(themeDragMime, "[]");
    },
    (_transfer, payload) => {
      payload.ids = [];
    },
    (_transfer, payload) => {
      payload.ids = ["unknown.theme"];
    },
    (_transfer, payload) => {
      payload.ids = ["theme.0005", "theme.0005"];
    },
    (_transfer, payload) => {
      payload.ids = Array(2049).fill("theme.0005");
    },
    (_transfer, payload) => {
      payload.token = "external-token";
    },
    (_transfer, payload) => {
      payload.kind = "folder";
    },
    (_transfer, payload) => {
      payload.version = 2;
    },
    (_transfer, _payload, panel) => {
      panel.libraryDrag = null;
    },
    (_transfer, _payload, panel) => {
      panel.busy = true;
    },
    (_transfer, _payload, panel) => {
      panel.c.externalApplying = true;
    },
    (_transfer, _payload, panel) => {
      panel.externalApplying = true;
    },
  ];
  for (const corrupt of cases) {
    const { panel, catalog, requests } = setup("");
    explorerCatalog(panel, catalog);
    const before = JSON.stringify(catalog);
    const transfer = new ThemeTransfer();
    await mainTheme(panel, "theme.0005").emit("dragstart", {
      dataTransfer: transfer,
    });
    const payload = JSON.parse(transfer.getData(themeDragMime));
    const previous = JSON.stringify(payload);
    corrupt(transfer, payload, panel);
    if (JSON.stringify(payload) !== previous)
      transfer.setData(themeDragMime, JSON.stringify(payload));
    await mainFolder(panel, "other").emit("drop", { dataTransfer: transfer });
    assert.equal(requests.length, 0);
    assert.equal(JSON.stringify(catalog), before);
    assert.match(panel.message, /Only themes from this library can be moved/);
  }
  const { panel, catalog, requests } = setup("");
  explorerCatalog(panel, catalog);
  panel.groupFilter = "root";
  panel.librarySelection = new Set(["theme.0000"]);
  panel.render();
  const transfer = new ThemeTransfer();
  await mainTheme(panel, "theme.0003").emit("dragstart", {
    dataTransfer: transfer,
  });
  await byFocus(panel.shadow, "sidebar-folder-root").emit("drop", {
    dataTransfer: transfer,
  });
  assert.match(panel.message, /already in this folder/);
  assert.equal(requests.length, 0);
});

test("the initial browser keeps advanced controls closed and management forms out of the contents", () => {
  const { panel } = setup("");
  const toolbar = byClass(panel.shadow, "library-toolbar")[0];
  assert.equal(toolbar.children.length, 2);
  assert.equal(toolbar.querySelectorAll("select").length, 0);
  assert.equal(byClass(panel.shadow, "library-filter-menu")[0].open, false);
  assert.equal(byClass(panel.shadow, "library-options-menu")[0].open, false);
  assert.equal(byClass(panel.shadow, "explorer-view-menu")[0].open, false);
  assert.equal(byClass(panel.shadow, "group-manager").length, 0);
  assert.equal(byClass(panel.shadow, "batch-organization").length, 0);
  assert.equal(byClass(panel.shadow, "library-dialog").length, 0);
});

test("folder creation uses a modal, closes a nested picker before the modal, and keeps drafts and navigation on cancellation", async () => {
  const { panel, catalog, requests } = setup("");
  panel.page = 4;
  panel.filter = "Group";
  panel.render();
  const contents = JSON.stringify(catalog);
  await byFocus(panel.shadow, "explorer-create-folder").emit("click");
  const dialog = panel.shadow.querySelector('[data-library-dialog="folders"]');
  assert.equal(dialog.open, true);
  assert.equal(dialog.modal, true);
  assert.equal(
    byClass(panel.shadow, "explorer-content")[0].contains(dialog),
    false,
  );
  const name = byLabel(dialog, "Folder name");
  assert.equal(document.activeElement, name);
  name.value = "Unsaved folder";
  await name.emit("input");
  const picker = byClass(dialog, "library-picker")[0];
  picker.open = true;
  const escape = await dialog.emit("keydown", {
    key: "Escape",
    target: picker.children[1].children[0],
    composedPath: () => [picker.children[1].children[0], picker, dialog],
  });
  assert.equal(escape.defaultPrevented, true);
  await picker.emit("keydown", escape);
  assert.equal(picker.open, false);
  assert.equal(panel.manageGroups, true);
  await dialog.emit("keydown", { key: "Escape" });
  assert.equal(panel.manageGroups, false);
  assert.equal(dialog.open, false);
  assert.equal(byClass(panel.shadow, "library-dialog").length, 0);
  assert.equal(
    document.activeElement,
    byFocus(panel.shadow, "explorer-create-folder"),
  );
  assert.equal(panel.groupCreateDraft, "Unsaved folder");
  assert.equal(panel.page, 4);
  assert.equal(panel.filter, "Group");
  assert.equal(panel.selected, "theme.0999");
  assert.equal(requests.length, 0);
  assert.equal(JSON.stringify(catalog), contents);
  await byFocus(panel.shadow, "explorer-create-folder").emit("click");
  assert.equal(
    byLabel(panel.shadow.querySelector("dialog"), "Folder name").value,
    "Unsaved folder",
  );
  await panel.shadow.querySelector("dialog").emit("cancel");
});

test("folder management edits one selected folder and deletion confirms before the existing metadata-only API", async () => {
  const { panel, catalog, requests } = setup("");
  explorerCatalog(panel, catalog);
  const themes = JSON.stringify(catalog.themes);
  const bindings = JSON.stringify(catalog.bindings);
  const original = JSON.stringify(catalog.organization);
  await byFocus(panel.shadow, "folder-actions-root").emit("click");
  let dialog = panel.shadow.querySelector("dialog");
  assert.equal(dialog.open, true);
  assert.equal(byClass(dialog, "group-row").length, 1);
  assert.equal(byClass(dialog, "group-list-row").length, 7);
  assert.equal(dialog.querySelector('[data-group-edit="root"]') !== null, true);
  await byText(dialog, "Delete").emit("click");
  dialog = panel.shadow.querySelector("dialog");
  assert.equal(byClass(dialog, "group-delete-confirm").length, 1);
  assert.equal(requests.length, 0);
  await byText(byClass(dialog, "group-delete-confirm")[0], "Cancel").emit(
    "click",
  );
  assert.equal(JSON.stringify(catalog.organization), original);
  await byText(panel.shadow.querySelector("dialog"), "Delete").emit("click");
  await byText(
    byClass(panel.shadow.querySelector("dialog"), "group-delete-confirm")[0],
    "Delete",
  ).emit("click");
  assert.equal(requests.filter(({ op }) => op === "group-delete").length, 1);
  assert.equal(catalog.organization.groups.root, undefined);
  assert.equal(catalog.organization.groupParents.unit, undefined);
  assert.equal(catalog.organization.themes["theme.0003"].groupId, undefined);
  assert.equal(catalog.organization.themes["theme.0000"].groupId, "battle");
  assert.equal(JSON.stringify(catalog.themes), themes);
  assert.equal(JSON.stringify(catalog.bindings), bindings);
});

test("selection opens a separate move dialog and applies one batch while preserving hidden selections, media and bindings", async () => {
  const { panel, catalog, requests } = setup();
  const themes = JSON.stringify(catalog.themes);
  const bindings = JSON.stringify(catalog.bindings);
  await byText(panel.shadow, "Select to organize").emit("click");
  assert.equal(byClass(panel.shadow, "batch-organization").length, 0);
  assert.equal(byFocus(panel.shadow, "batch-organize").disabled, true);
  for (const id of ["theme.0000", "theme.0001"]) {
    const checkbox = byFocus(panel.shadow, "select-" + id);
    checkbox.checked = true;
    await checkbox.emit("change");
  }
  const metadata = structuredClone(catalog.organization.themes);
  const search = byLabel(panel.shadow, "Search name, character, skin, or type");
  search.value = "0000";
  await search.emit("change");
  await byFocus(panel.shadow, "batch-organize").emit("click");
  const dialog = panel.shadow.querySelector(
    '[data-library-dialog="organization"]',
  );
  assert.equal(dialog.open, true);
  assert.equal(
    byClass(panel.shadow, "explorer-content")[0].contains(dialog),
    false,
  );
  assert.match(dialog.textContent, /1 selected themes outside/);
  const picker = byClass(dialog, "library-picker")[0];
  await byText(picker, "Group 11").emit("click");
  await byText(dialog, "Move to selected folder").emit("click");
  const batch = requests.filter(({ op }) => op === "organization-batch");
  assert.equal(batch.length, 1);
  assert.deepEqual(batch[0].changes, [
    { id: "theme.0000", metadata: { groupId: "group.11" } },
    { id: "theme.0001", metadata: { groupId: "group.11" } },
  ]);
  for (const id of ["theme.0000", "theme.0001"])
    assert.deepEqual(catalog.organization.themes[id], {
      ...metadata[id],
      groupId: "group.11",
    });
  assert.equal(JSON.stringify(catalog.themes), themes);
  assert.equal(JSON.stringify(catalog.bindings), bindings);
  await panel.shadow.querySelector("dialog").emit("cancel");
  assert.equal(panel.batchOrganizationOpen, false);
  assert.equal(panel.librarySelectionMode, true);
  assert.deepEqual([...panel.librarySelection], ["theme.0000", "theme.0001"]);
  assert.equal(document.activeElement, byFocus(panel.shadow, "batch-organize"));
});

test("a deep selection is revealed in a 4096-folder virtual tree while later manual scroll survives rerenders", async () => {
  const { panel, catalog } = setup();
  catalog.organization.groups = Object.fromEntries(
    Array.from({ length: 4072 }, (_, i) => ["folder." + i, "Folder " + i]),
  );
  catalog.organization.groupParents = {};
  for (let i = 0; i < 24; i++) {
    const id = "deep." + i;
    catalog.organization.groups[id] = "Deep " + i;
    catalog.organization.groupParents[id] = i
      ? "deep." + (i - 1)
      : "folder.4071";
  }
  panel.groupFilter = "deep.23";
  panel.folderTreeScrollTop = 0;
  panel.render();
  await Promise.resolve();
  assert.ok(panel.folderTreeScrollTop > 100000);
  assert.equal(panel.folderExpanded.size, 24);
  const selected = byFocus(panel.shadow, "sidebar-folder-deep.23");
  assert.equal(selected.getAttribute("aria-selected"), "true");
  assert.equal(selected.getAttribute("aria-level"), "25");
  assert.equal(selected.getAttribute("tabindex"), "0");
  assert.ok(byClass(panel.shadow, "folder-tree-row").length <= 40);
  let tree = byClass(panel.shadow, "folder-tree")[0];
  tree.scrollTop = 640;
  await tree.emit("scroll");
  panel.render();
  await Promise.resolve();
  assert.equal(panel.folderTreeScrollTop, 640);
  assert.equal(byFocus(panel.shadow, "sidebar-folder-deep.23"), undefined);
  assert.ok(byClass(panel.shadow, "folder-tree-row").length <= 40);
  tree = byClass(panel.shadow, "folder-tree")[0];
  const first = byClass(panel.shadow, "folder-tree-row")[0].children.at(-1);
  await tree.emit("keydown", { key: "End", target: first });
  assert.equal(
    document.activeElement.getAttribute("data-folder-id"),
    "deep.23",
  );
  await tree.emit("keydown", { key: "Home", target: document.activeElement });
  assert.equal(
    document.activeElement.getAttribute("data-folder-id"),
    "folder.0",
  );
  assert.equal(panel.folderTreeScrollTop, 0);
});
