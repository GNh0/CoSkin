import test from "node:test";
import assert from "node:assert/strict";
import {
  rememberDetailList,
  detailNavigationState,
  navigateDetail,
  resolveDetailNavigation,
  updateDetailDraft,
  detailDraft,
} from "../src/renderer/detail-navigation.js";

function fixture() {
  const trace = [];
  const panel = {
    selected: "a",
    doc: { id: "a" },
    baseRevision: 2,
    dirty: false,
    page: 0,
    history: [],
    redo: [],
    profile: "default",
    session: {},
    c: {
      summary: {
        themes: { a: { name: "A" }, b: { name: "B" }, c: { name: "C" } },
      },
      pending: new Map(),
      stopReplay() {
        trace.push("stop");
      },
    },
    async load(id) {
      trace.push("load:" + id);
      this.selected = id;
      this.doc = { id };
    },
    async cancel() {
      trace.push("cancel");
      this.dirty = false;
      this.c.preview = null;
    },
    endPreview() {
      trace.push("end-preview");
      this.session.previewing = false;
    },
    async save() {
      trace.push("save");
      this.dirty = false;
    },
    render() {},
    action(fn) {
      return async () => {
        this.busy = true;
        try {
          await fn();
        } finally {
          this.busy = false;
        }
      };
    },
  };
  rememberDetailList(
    panel,
    {
      themes: [["a"], ["b"], ["c"]],
      items: [
        { kind: "folder" },
        { kind: "theme", id: "a" },
        { kind: "folder" },
        { kind: "theme", id: "b" },
        { kind: "theme", id: "c" },
      ],
    },
    2,
  );
  return { panel, trace };
}
test("detail follows the folder/search/sort snapshot across pages and never applies", async () => {
  const { panel, trace } = fixture();
  assert.equal(detailNavigationState(panel).previous, null);
  await navigateDetail(panel, "next");
  assert.equal(panel.selected, "b");
  assert.equal(panel.page, 1);
  await navigateDetail(panel, "next");
  assert.equal(panel.selected, "c");
  assert.equal(panel.page, 2);
  assert.equal(detailNavigationState(panel).next, null);
  delete panel.c.summary.themes.b;
  assert.equal(detailNavigationState(panel).previous, "a");
  assert.equal(detailNavigationState(panel).total, 2);
  assert.deepEqual(
    trace.filter((entry) => entry.startsWith("load")),
    ["load:b", "load:c"],
  );
});
test("metadata and folder drafts prompt before navigation, retain on continue, then save before the read", async () => {
  const { panel, trace } = fixture();
  updateDetailDraft(
    panel,
    "metadata",
    { name: "changed" },
    { name: "A" },
    async () => {
      trace.push("metadata-save");
      panel.dirty = true;
    },
  );
  updateDetailDraft(
    panel,
    "organization",
    { groupId: "new" },
    { groupId: "old" },
    async () => {
      trace.push("folder-save");
    },
  );
  await navigateDetail(panel, "next");
  assert.equal(panel.selected, "a");
  assert.equal(panel.detailNavigationPending.id, "b");
  await resolveDetailNavigation(panel, "continue");
  assert.equal(panel.selected, "a");
  assert.deepEqual(detailDraft(panel, "metadata"), { name: "changed" });
  await navigateDetail(panel, "next");
  await resolveDetailNavigation(panel, "save");
  assert.equal(panel.selected, "b");
  assert.deepEqual(trace, [
    "metadata-save",
    "folder-save",
    "save",
    "stop",
    "load:b",
  ]);
});
test("a newer draft typed during save is preserved and does not navigate", async () => {
  const { panel } = fixture();
  updateDetailDraft(panel, "metadata", { name: "first" }, {}, async () => {
    updateDetailDraft(panel, "metadata", { name: "newer" }, {}, async () => {});
  });
  await navigateDetail(panel, "next");
  await resolveDetailNavigation(panel, "save");
  assert.equal(panel.selected, "a");
  assert.equal(detailDraft(panel, "metadata").name, "newer");
});
test("preview cancellation is awaited and a failed read restores the old document identity", async () => {
  const { panel, trace } = fixture();
  panel.session.previewing = true;
  let resume;
  panel.cancel = async () => {
    trace.push("cancel-start");
    await new Promise((resolve) => {
      resume = resolve;
    });
    trace.push("cancel-done");
    panel.c.preview = null;
  };
  panel.load = async (id) => {
    panel.selected = id;
    throw Error("read failed");
  };
  const navigation = navigateDetail(panel, "next");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(trace, ["cancel-start"]);
  assert.equal(panel.selected, "a");
  resume();
  await assert.rejects(navigation, /read failed/);
  assert.equal(panel.selected, "a");
  assert.equal(panel.doc.id, "a");
  assert.deepEqual(trace, ["cancel-start", "cancel-done", "end-preview"]);
});
test("background metadata and preview reads do not block an enabled navigation button", async () => {
  const { panel } = fixture();
  for (const op of ["background-media-info", "read", "asset-read", "asset-poster-read", "transfer-read"])
    panel.c.pending.set(op, { op });
  await navigateDetail(panel, "next");
  assert.equal(panel.selected, "b");
  panel.c.pending.set("save", { op: "save" });
  await navigateDetail(panel, "next");
  assert.equal(panel.selected, "b");
});
test("pending requests and editing block detail navigation without losing drafts", async () => {
  const { panel, trace } = fixture();
  panel.c.pending.set("pending", {});
  await navigateDetail(panel, "next");
  assert.equal(panel.selected, "a");
  assert.deepEqual(trace, []);
  panel.c.pending.clear();
  panel.editing = true;
  await navigateDetail(panel, "next");
  assert.equal(panel.selected, "a");
});
