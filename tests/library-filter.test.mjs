import test from "node:test";
import assert from "node:assert/strict";
import {
  filterLibrary,
  libraryLabels,
  libraryFacets,
  sortLibrary,
} from "../src/core/library-filter.js";
import { libraryFixture } from "./library-fixture.mjs";
test("theme search combines names, groups, tags and favorites without altering entries", () => {
  const themes = {
    a: { name: "치카댄스" },
    b: { name: "메구미" },
    c: { name: "진시" },
  };
  const organization = {
    groups: { romance: "러브코미디" },
    themes: {
      a: { favorite: true, groupId: "romance", tags: ["MP4", "고화질"] },
      b: { groupId: "romance", tags: ["GIF"] },
    },
  };
  const ids = (filters) =>
    filterLibrary(themes, organization, filters).map(([id]) => id);
  assert.deepEqual(ids({ query: "러브코미디" }), ["a", "b"]);
  assert.deepEqual(
    ids({ query: "mp4", favorites: true, group: "romance", tag: "고화질" }),
    ["a"],
  );
  assert.deepEqual(ids({ favorites: true, tag: "GIF" }), []);
  assert.deepEqual(ids({ group: "ungrouped" }), ["c"]);
  assert.deepEqual(ids({ query: "  메구미  " }), ["b"]);
  assert.equal(themes.a.name, "치카댄스");
  assert.deepEqual(
    filterLibrary(themes).map(([id]) => id),
    ["a", "b", "c"],
  );
});

test("1200 themes combine character, skin, type, favorites, group and text without duplicates", () => {
  const catalog = libraryFixture();
  const ids = (filters) =>
    filterLibrary(catalog.themes, catalog.organization, filters).map(
      ([id]) => id,
    );
  assert.equal(ids({}).length, 1200);
  assert.equal(ids({ character: "Character 11" }).length, 20);
  assert.equal(ids({ skin: "Skin 0" }).length, 100);
  assert.equal(ids({ type: "Battle" }).length, 600);
  assert.equal(ids({ query: '"character 11"' }).length, 20);
  assert.equal(ids({ query: '"character 11" Battle' }).length, 0);
  assert.deepEqual(ids({ query: "　Ｔｈｅｍｅ　００１１　" }), ["theme.0011"]);
  assert.deepEqual(
    ids({
      character: "Character 0",
      skin: "Skin 0",
      type: "Battle",
      favorites: true,
      group: "ungrouped",
      tag: "type: Battle",
    }),
    ["theme.0000", "theme.0420", "theme.0840"],
  );
  assert.deepEqual(ids({ query: '"unique tag 1199"', group: "group.239" }), [
    "theme.1199",
  ]);
  assert.equal(new Set(ids({ query: "Theme" })).size, 1200);
  assert.equal(ids({ character: "Missing character" }).length, 0);
  const facets = libraryFacets(catalog.themes, catalog.organization);
  assert.equal(facets.character.length, 60);
  assert.equal(facets.skin.length, 12);
  assert.deepEqual(facets.type, ["Battle", "Character scene"]);
  assert.equal(facets.tags.length, 1274);
});

test("facet labels are explicit, optional and kept separate from names and unknown fields", () => {
  assert.deepEqual(
    libraryLabels({ name: "Dorothy Dreaming Battle", category: "battle" }),
    { tags: [], character: [], skin: [], type: [] },
  );
  assert.deepEqual(
    libraryLabels(
      {
        characterName: "Dorothy",
        skinName: "Dreaming",
        themeType: "Battle",
        metadata: { tags: ["MP4"] },
      },
      {
        tags: [
          "캐릭터: 도로시",
          "스킨： 드리밍",
          "유형: 캐릭터 장면",
          "Dorothy",
        ],
      },
    ),
    {
      tags: [
        "MP4",
        "캐릭터: 도로시",
        "스킨： 드리밍",
        "유형: 캐릭터 장면",
        "Dorothy",
      ],
      character: ["Dorothy", "도로시"],
      skin: ["Dreaming", "드리밍"],
      type: ["Battle", "캐릭터 장면"],
    },
  );
  const themes = { a: { name: "Same" }, b: { name: "Same" } };
  assert.deepEqual(
    filterLibrary(themes).map(([id]) => id),
    ["a", "b"],
  );
  assert.equal(
    libraryFacets(themes, { themes: { removed: { tags: ["orphan"] } } }).tags
      .length,
    0,
  );
  assert.deepEqual(libraryLabels({ tags: [null, 12, "valid"] }).tags, [
    "valid",
  ]);
});

test("sorting is stable, uses numeric names and preserves source and organization", () => {
  const catalog = libraryFixture();
  const original = Object.entries(catalog.themes);
  const snapshot = JSON.stringify(catalog);
  const ascending = sortLibrary(original, catalog.organization, "name-asc");
  const descending = sortLibrary(original, catalog.organization, "name-desc");
  assert.equal(ascending[0][0], "theme.0000");
  assert.equal(descending[0][0], "theme.1199");
  assert.equal(
    sortLibrary(original, catalog.organization, "favorites")[0][0],
    "theme.0000",
  );
  const favorites = sortLibrary(original, catalog.organization, "favorites");
  assert.ok(
    favorites
      .slice(0, 172)
      .every(([id]) => catalog.organization.themes[id].favorite),
  );
  assert.ok(
    favorites
      .slice(172)
      .every(([id]) => !catalog.organization.themes[id].favorite),
  );
  assert.equal(
    sortLibrary(original, catalog.organization, "group")[0][0],
    "theme.0000",
  );
  assert.deepEqual(
    sortLibrary(original, catalog.organization, "library"),
    original,
  );
  assert.equal(JSON.stringify(catalog), snapshot);
  assert.deepEqual(
    sortLibrary(
      [
        ["b", { name: "Theme 10" }],
        ["a", { name: "Theme 2" }],
      ],
      {},
      "name-asc",
    ).map(([id]) => id),
    ["a", "b"],
  );
});
