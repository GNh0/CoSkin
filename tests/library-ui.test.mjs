import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { workspaceBundle } from "./workspace-bundle.mjs";
import { libraryFixture } from "./library-fixture.mjs";

const compiled = await build({
  stdin: {
    contents:
      'export { Panel } from "./src/renderer/panel.js"; export { groupManager, organizationForm, writeOrganizationBatch } from "./src/renderer/library-organization.js"; export { searchablePicker } from "./src/renderer/library-controls.js";',
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
      this.children.push(child);
    }
  }
  prepend(...children) {
    for (const child of children) child.parent = this;
    this.children.unshift(...children);
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parent = null;
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
  focus() {
    document.activeElement = this;
  }
  reportValidity() {
    return true;
  }
  async emit(key, values = {}) {
    const event = {
      target: this,
      preventDefault() {},
      stopPropagation() {},
      ...values,
    };
    if (this["on" + key]) await this["on" + key](event);
    for (const listener of this.listeners[key] || []) await listener(event);
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

function setup() {
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

test("nested folder browsing includes descendants by default, counts them, preserves query and selection, and handles empty folders", async () => {
  const { panel, catalog } = setup();
  nestedCatalog(panel, catalog);
  assert.equal(byClass(panel.shadow, "folder-tree-row").length, 3);
  assert.match(byFocus(panel.shadow, "folder-root").textContent, /NIKKE2/);
  assert.match(
    byFocus(panel.shadow, "folder-root").title,
    /0 direct.*2 including/,
  );
  await byFocus(panel.shadow, "folder-root").emit("click");
  assert.equal(panel.groupFilter, "root");
  assert.equal(panel.folderIncludeChildren, true);
  assert.equal(byClass(panel.shadow, "skin-card").length, 2);
  assert.equal(panel.selected, "theme.0999");
  const include = byLabel(panel.shadow, "Include themes in subfolders");
  include.checked = false;
  await include.emit("change");
  assert.equal(byClass(panel.shadow, "skin-card").length, 0);
  const includeAgain = byLabel(panel.shadow, "Include themes in subfolders");
  includeAgain.checked = true;
  await includeAgain.emit("change");
  assert.equal(byClass(panel.shadow, "skin-card").length, 2);
  const search = byLabel(panel.shadow, "Search name, character, skin, or type");
  search.value = "0000";
  await search.emit("change");
  assert.equal(byClass(panel.shadow, "skin-card").length, 1);
  await byFocus(panel.shadow, "folder-empty").emit("click");
  assert.equal(panel.filter, "0000");
  assert.equal(panel.groupFilter, "empty");
  assert.equal(byClass(panel.shadow, "skin-card").length, 0);
  assert.equal(panel.page, 0);
  await byFocus(panel.shadow, "folder-all").emit("click");
  assert.equal(panel.filter, "0000");
  assert.equal(byClass(panel.shadow, "skin-card").length, 1);
  await byText(panel.shadow, "Clear filters").emit("click");
  await byFocus(panel.shadow, "folder-ungrouped").emit("click");
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
    target: byFocus(panel.shadow, "folder-root"),
  });
  assert.ok(byFocus(panel.shadow, "folder-unit"));
  const rootButton = byFocus(panel.shadow, "folder-root");
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
  assert.equal(panel.groupFilter, undefined);
  assert.equal(panel.page, 0);
  await byFocus(panel.shadow, "folder-motion").emit("click");
  assert.equal(panel.groupFilter, "motion");
  assert.equal(byClass(panel.shadow, "skin-card").length, 1);
});

test("folder creation sets the selected parent and reparenting excludes itself and all descendants", async () => {
  const { panel, catalog, requests } = setup();
  nestedCatalog(panel, catalog);
  await byFocus(panel.shadow, "folder-root").emit("click");
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
  const edit = groupManager(panel);
  const rootRow = byClass(edit, "group-row").find(
    (row) =>
      row.children.find((element) => element.tagName === "INPUT")?.value ===
      "NIKKE",
  );
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
  await byFocus(panel.shadow, "folder-root").emit("click");
  await byText(panel.shadow, "Select to organize").emit("click");
  await byText(panel.shadow, "Select all 2 results").emit("click");
  panel.batchGroup = "other";
  panel.render();
  await byText(panel.shadow, "Move to selected folder").emit("click");
  assert.equal(
    requests.filter((request) => request.op === "organization-batch").length,
    1,
  );
  assert.equal(panel.librarySelection.size, 2);
  assert.equal(panel.groupFilter, "root");
  assert.equal(panel.page, 0);
  assert.equal(byClass(panel.shadow, "skin-card").length, 0);
  assert.match(byFocus(panel.shadow, "folder-root").textContent, /NIKKE0/);
  assert.match(
    byClass(panel.shadow, "batch-organization")[0].textContent,
    /2 selected themes outside/,
  );
  assert.equal(panel.selected, "theme.0999");
});

test("4096-folder gallery and manager mount only bounded tree rows and picker options", async () => {
  const { panel, catalog } = setup();
  catalog.organization.groups = Object.fromEntries(
    Array.from({ length: 4096 }, (_, i) => ["folder." + i, "Folder " + i]),
  );
  panel.render();
  assert.equal(byClass(panel.shadow, "folder-tree-row").length, 24);
  for (const options of byClass(panel.shadow, "picker-options"))
    assert.ok(options.children.length <= 13);
  await byFocus(panel.shadow, "folder-tree-last").emit("click");
  assert.equal(panel.folderTreePage, 170);
  assert.equal(byClass(panel.shadow, "folder-tree-row").length, 16);
  assert.ok(byFocus(panel.shadow, "folder-folder.4095"));
  const manager = groupManager(panel);
  assert.equal(byClass(manager, "group-row").length, 12);
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
  assert.equal(byClass(panel.shadow, "library-picker").length, 5);
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
    byClass(panel.shadow, "batch-organization")[0].textContent,
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
  assert.equal(byClass(manager, "group-row").length, 12);
  const field = byClass(manager, "group-row")[0].children.find(
    (element) => element.tagName === "INPUT",
  );
  field.value = "Pending new name";
  await field.emit("input");
  await byFocus(manager, "group-manager-next").emit("click");
  assert.equal(panel.groupManagerPage, 1);
  assert.equal(panel.page, 7);
  await byFocus(manager, "group-manager-first").emit("click");
  assert.equal(
    byClass(manager, "group-row")[0].children.find(
      (element) => element.tagName === "INPUT",
    ).value,
    "Pending new name",
  );
  const search = byLabel(manager, "Search folders to manage");
  search.value = "Group 239";
  await search.emit("input");
  assert.equal(byClass(manager, "group-row").length, 1);
  assert.equal(panel.groupManagerPage, 0);
  assert.equal(panel.page, 7);
  assert.equal(
    byClass(manager, "group-row")[0].children.find(
      (element) => element.tagName === "INPUT",
    ).value,
    "Group 239",
  );
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
