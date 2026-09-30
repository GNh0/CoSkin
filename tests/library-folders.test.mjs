import test from "node:test";
import assert from "node:assert/strict";
import {
  folderIndex,
  folderDescendants,
  folderPath,
  folderOptions,
  folderRows,
  folderCounts,
} from "../src/core/library-folders.js";
import { filterLibrary } from "../src/core/library-filter.js";

const groups = {
  nikke: "NIKKE",
  dorothy: "Dorothy",
  dreaming: "Dreaming",
  battle: "Battle",
  motion: "Motion",
  other: "Other",
  otherBattle: "Battle",
  empty: "Empty",
};
const groupParents = {
  dorothy: "nikke",
  dreaming: "dorothy",
  battle: "dreaming",
  motion: "dreaming",
  otherBattle: "other",
};
const themes = {
  a: { name: "Scene A" },
  b: { name: "Scene B" },
  c: { name: "Scene C" },
  d: { name: "Unsorted" },
};
const organization = {
  groups,
  groupParents,
  themes: {
    a: { groupId: "battle" },
    b: { groupId: "motion" },
    c: { groupId: "otherBattle" },
  },
};

test("nested folders preserve exact identities, paths, direct and descendant counts", () => {
  assert.deepEqual(folderPath(groups, groupParents, "battle"), [
    "NIKKE",
    "Dorothy",
    "Dreaming",
    "Battle",
  ]);
  assert.deepEqual(
    [...folderDescendants(groups, groupParents, "nikke")],
    ["nikke", "dorothy", "dreaming", "battle", "motion"],
  );
  const options = new Map(folderOptions(groups, groupParents));
  assert.equal(options.get("battle"), "NIKKE / Dorothy / Dreaming / Battle");
  assert.equal(options.get("otherBattle"), "Other / Battle");
  const counts = folderCounts(themes, organization);
  assert.equal(counts.total, 4);
  assert.equal(counts.ungrouped, 1);
  assert.equal(counts.groups.nikke, 0);
  assert.equal(counts.subtree.nikke, 2);
  assert.equal(counts.groups.battle, 1);
  assert.equal(counts.subtree.empty, 0);
  assert.deepEqual(
    filterLibrary(themes, organization, {
      group: "nikke",
      groupIds: folderDescendants(groups, groupParents, "nikke"),
    }).map(([id]) => id),
    ["a", "b"],
  );
  assert.deepEqual(filterLibrary(themes, organization, { group: "nikke" }), []);
  assert.deepEqual(
    filterLibrary(themes, organization, { query: "NIKKE Dreaming" }).map(
      ([id]) => id,
    ),
    ["a", "b"],
  );
  assert.deepEqual(filterLibrary(themes, organization, { group: "empty" }), []);
  assert.deepEqual(
    filterLibrary(themes, organization, { group: "ungrouped" }).map(
      ([id]) => id,
    ),
    ["d"],
  );
});

test("folder search includes ancestor paths and expansion reveals only chosen branches", () => {
  assert.deepEqual(
    folderRows(groups, groupParents).map(({ id }) => id),
    ["empty", "nikke", "other"],
  );
  assert.deepEqual(
    folderRows(groups, groupParents, new Set(["nikke"])).map(({ id }) => id),
    ["empty", "nikke", "dorothy", "other"],
  );
  const matches = folderRows(groups, groupParents, new Set(), "motion");
  assert.deepEqual(
    matches.map(({ id, depth }) => [id, depth]),
    [
      ["nikke", 0],
      ["dorothy", 1],
      ["dreaming", 2],
      ["motion", 3],
    ],
  );
  assert.deepEqual(folderRows(groups, groupParents, new Set(), "missing"), []);
  const excluded = folderDescendants(groups, groupParents, "dorothy");
  assert.deepEqual(
    folderOptions(groups, groupParents, excluded).map(([id]) => id),
    ["empty", "nikke", "other", "otherBattle"],
  );
});

test("4096 folders and 64 levels remain browsable, including legacy flat and malformed parents", () => {
  const many = Object.fromEntries(
    Array.from({ length: 4096 }, (_, i) => ["folder." + i, "Folder " + i]),
  );
  assert.equal(folderRows(many).length, 4096);
  assert.equal(folderOptions(many).length, 4096);
  const chain = Object.fromEntries(
    Array.from({ length: 64 }, (_, i) => ["depth." + i, "Level " + i]),
  );
  const parents = Object.fromEntries(
    Array.from({ length: 63 }, (_, i) => ["depth." + (i + 1), "depth." + i]),
  );
  assert.equal(folderPath(chain, parents, "depth.63").length, 64);
  assert.equal(folderRows(chain, parents, new Set(), "Level 63").length, 64);
  assert.equal(folderDescendants(chain, parents, "depth.0").size, 64);
  const broken = { a: "A", b: "B", c: "C", d: "D" };
  const invalid = { a: "b", b: "a", c: "missing", d: "d" };
  const rows = folderRows(broken, invalid, new Set(Object.keys(broken)));
  assert.equal(rows.length, 4);
  assert.equal(new Set(rows.map(({ id }) => id)).size, 4);
  assert.equal(folderIndex(broken, invalid).parents.c, null);
  assert.equal(folderIndex(broken, invalid).parents.d, null);
  assert.deepEqual(folderPath(broken, invalid, "missing"), []);
});

test("promotion collisions are visibly disambiguated without renaming or dropping folders", () => {
  const duplicates = { aaa11111x: "Battle", bbb22222x: "Battle" };
  assert.deepEqual(folderOptions(duplicates), [
    ["aaa11111x", "Battle · aaa11111"],
    ["bbb22222x", "Battle · bbb22222"],
  ]);
  assert.equal(folderRows(duplicates).length, 2);
  assert.deepEqual(duplicates, { aaa11111x: "Battle", bbb22222x: "Battle" });
});
