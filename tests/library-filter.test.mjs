import test from "node:test";
import assert from "node:assert/strict";
import { filterLibrary } from "../src/core/library-filter.js";
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
