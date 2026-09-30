import test from "node:test";
import assert from "node:assert/strict";
import {
  explorerContents,
  navigateExplorer,
  traverseExplorer,
} from "../src/core/library-explorer.js";
import { paginateLibrary } from "../src/core/library-pagination.js";
import { filterLibrary, sortLibrary } from "../src/core/library-filter.js";
import { libraryFixture } from "./library-fixture.mjs";

test("4096 folders and 1200 themes share a bounded page budget, with collapsed branches and complete expanded traversal", () => {
  const catalog = libraryFixture();
  const { themes, organization } = catalog;
  organization.groups = Object.fromEntries(
    Array.from({ length: 4096 }, (_, i) => ["folder." + i, "Folder " + i]),
  );
  organization.groupParents = Object.fromEntries(
    Array.from({ length: 4095 }, (_, i) => ["folder." + (i + 1), "folder.0"]),
  );
  Object.values(organization.themes).forEach((metadata, i) => {
    if (i % 4) metadata.groupId = "folder." + i;
  });
  const snapshot = JSON.stringify(catalog);
  const collapsed = explorerContents(themes, organization, { view: "tree" });
  assert.equal(collapsed.folders, 1);
  assert.equal(collapsed.themes.length, 300);
  assert.equal(collapsed.items[0].total, 900);
  assert.equal(collapsed.items[0].expanded, false);
  const rootsExpanded = explorerContents(themes, organization, {
    view: "tree",
    expanded: new Set(["folder.0"]),
  });
  assert.equal(rootsExpanded.folders, 4096);
  assert.equal(rootsExpanded.themes.length, 300);
  const expanded = explorerContents(themes, organization, {
    view: "tree",
    expanded: new Set(Object.keys(organization.groups)),
  });
  assert.equal(expanded.items.length, 5296);
  assert.equal(expanded.themes.length, 1200);
  assert.equal(expanded.folders, 4096);
  const all = [];
  for (let page = 0; page < Math.ceil(expanded.items.length / 24); page++) {
    const batch = paginateLibrary(expanded.items, page, 24);
    assert.ok(batch.entries.length <= 24);
    all.push(...batch.entries.map(({ kind, id }) => kind + ":" + id));
  }
  assert.equal(all.length, 5296);
  assert.equal(new Set(all).size, 5296);
  assert.equal(
    paginateLibrary(expanded.items, Number.MAX_SAFE_INTEGER, 24).entries.length,
    16,
  );
  assert.equal(paginateLibrary(expanded.items, -100, 24).page, 0);
  assert.equal(paginateLibrary(expanded.items, Infinity, 24).page, 0);
  assert.equal(JSON.stringify(catalog), snapshot);
});

function nested() {
  return {
    themes: {
      battle: { name: "Dorothy Battle", revision: 3 },
      scene: { name: "Dorothy scene", revision: 2 },
      direct: { name: "Overview", revision: 1 },
      loose: { name: "Loose theme", revision: 1 },
      invalid: { name: "Deleted folder theme", revision: 1 },
    },
    organization: {
      groups: {
        game: "NIKKE",
        unit: "Dorothy",
        skin: "Dreaming",
        battle: "Battle",
        scene: "Motion",
        empty: "Empty costume",
      },
      groupParents: {
        unit: "game",
        skin: "unit",
        battle: "skin",
        scene: "skin",
        empty: "unit",
      },
      themes: {
        battle: {
          groupId: "battle",
          tags: ["character: Dorothy", "type: Battle"],
        },
        scene: {
          groupId: "scene",
          tags: ["character: Dorothy", "type: Motion"],
        },
        direct: { groupId: "game" },
        invalid: { groupId: "missing" },
      },
    },
  };
}

test("folder home mixes root folders with ungrouped files and child folders with direct files", () => {
  const { themes, organization } = nested();
  const root = explorerContents(themes, organization);
  assert.deepEqual(
    root.items.map(({ id }) => id),
    ["game", "loose", "invalid"],
  );
  assert.equal(root.items[0].direct, 1);
  assert.equal(root.items[0].total, 3);
  const game = explorerContents(themes, organization, { location: "game" });
  assert.deepEqual(
    game.items.map(({ id }) => id),
    ["unit", "direct"],
  );
  const included = explorerContents(themes, organization, {
    location: "game",
    includeChildren: true,
  });
  assert.deepEqual(
    included.themes.map(([id]) => id),
    ["direct", "battle", "scene"],
  );
  assert.deepEqual(
    explorerContents(themes, organization, { location: "all" }).themes.map(
      ([id]) => id,
    ),
    Object.keys(themes),
  );
  assert.deepEqual(
    explorerContents(themes, organization, {
      location: "ungrouped",
    }).themes.map(([id]) => id),
    ["loose", "invalid"],
  );
  assert.equal(
    explorerContents(themes, organization, { location: "missing" }).location,
    "",
  );
});

test("tree search exposes a matching empty folder's ancestors and only explicit matching theme classifications", () => {
  const { themes, organization } = nested();
  const empty = explorerContents(themes, organization, {
    view: "tree",
    entries: [],
    query: '"Empty costume"',
    filtered: true,
  });
  assert.deepEqual(
    empty.items.map(({ id }) => id),
    ["game", "unit", "empty"],
  );
  const entries = sortLibrary(
    filterLibrary(themes, organization, {
      character: "Dorothy",
      type: "Battle",
    }),
    organization,
    "name-desc",
  );
  const model = explorerContents(themes, organization, {
    view: "tree",
    entries,
    filtered: true,
    faceted: true,
  });
  assert.deepEqual(
    model.items.map(({ kind, id }) => [kind, id]),
    [
      ["folder", "game"],
      ["folder", "unit"],
      ["folder", "skin"],
      ["folder", "battle"],
      ["theme", "battle"],
    ],
  );
  assert.equal(model.items[0].total, 3);
  const zero = explorerContents(themes, organization, {
    view: "tree",
    entries: [],
    query: "No such folder",
    filtered: true,
  });
  assert.deepEqual(paginateLibrary(zero.items, 999999, 96), {
    page: 0,
    pageSize: 96,
    pages: 1,
    total: 0,
    start: 0,
    end: 0,
    entries: [],
  });
  const emptyFolder = explorerContents(themes, organization, {
    location: "empty",
  });
  assert.equal(emptyFolder.items.length, 0);
});

test("folder navigation remembers page, filters and scroll while leaving theme selection and display choices intact", () => {
  let scrollTop = 420;
  let renders = 0;
  const selected = new Set(["theme.0001", "theme.0002"]);
  const panel = {
    groupFilter: "all",
    page: 7,
    filter: "Battle",
    libraryPageSize: 48,
    folderIncludeChildren: false,
    librarySelection: selected,
    selected: "theme.0001",
    libraryView: "tree",
    libraryDisplay: "list",
    shadow: { querySelector: () => ({ scrollTop }) },
    render: () => {
      renders++;
    },
  };
  navigateExplorer(panel, "folder.1");
  assert.equal(panel.page, 0);
  assert.equal(panel.filter, "Battle");
  scrollTop = 130;
  panel.page = 2;
  traverseExplorer(panel, "back");
  assert.equal(panel.groupFilter, "all");
  assert.equal(panel.page, 7);
  assert.equal(panel.libraryScrollTop, 420);
  scrollTop = 420;
  traverseExplorer(panel, "forward");
  assert.equal(panel.groupFilter, "folder.1");
  assert.equal(panel.page, 2);
  assert.equal(panel.libraryScrollTop, 130);
  navigateExplorer(panel, "all");
  assert.equal(panel.page, 7);
  assert.equal(panel.libraryScrollTop, 420);
  assert.equal(panel.explorerForward.length, 0);
  assert.equal(panel.librarySelection, selected);
  assert.equal(panel.selected, "theme.0001");
  assert.equal(panel.libraryView, "tree");
  assert.equal(panel.libraryDisplay, "list");
  assert.equal(renders, 4);
});

test("promoted folders with duplicate paths remain distinguishable by their identities", () => {
  const themes = { a: { name: "A" }, b: { name: "B" } };
  const organization = {
    groups: { abcdef12: "Battle", 98765432: "Battle" },
    themes: { a: { groupId: "abcdef12" }, b: { groupId: "98765432" } },
  };
  const model = explorerContents(themes, organization);
  assert.deepEqual(model.items.map(({ name }) => name).sort(), [
    "Battle · 98765432",
    "Battle · abcdef12",
  ]);
  assert.deepEqual(
    model.items.map(({ path }) => path),
    [["Battle"], ["Battle"]],
  );
  assert.equal(
    explorerContents(themes, organization, { location: "abcdef12" })
      .themes[0][0],
    "a",
  );
});
