import test from "node:test";
import assert from "node:assert/strict";
import {
  paginationState,
  paginateLibrary,
  pageNumbers,
  libraryPageSizes,
} from "../src/core/library-pagination.js";
import { libraryFixture } from "./library-fixture.mjs";

test("1200-theme catalog pages cover every ID once for each supported size", () => {
  const entries = Object.entries(libraryFixture().themes);
  for (const size of libraryPageSizes) {
    const found = [];
    const pages = Math.ceil(entries.length / size);
    for (let page = 0; page < pages; page++) {
      const result = paginateLibrary(entries, page, size);
      assert.equal(result.page, page);
      assert.equal(result.pages, pages);
      assert.ok(result.entries.length > 0 && result.entries.length <= size);
      found.push(...result.entries.map(([id]) => id));
      const numbers = pageNumbers(pages, page);
      assert.ok(numbers.length <= 9);
      assert.ok(numbers.includes(page));
      assert.equal(numbers[0], 0);
      assert.equal(numbers.at(-1), pages - 1);
      assert.equal(
        new Set(numbers.filter((value) => value !== null)).size,
        numbers.filter((value) => value !== null).length,
      );
    }
    assert.deepEqual(
      found,
      entries.map(([id]) => id),
    );
  }
});

test("empty, negative, fractional, extreme, and stale pages stay within results", () => {
  for (const page of [
    -999,
    0,
    999,
    Number.MAX_SAFE_INTEGER,
    NaN,
    Infinity,
    -Infinity,
  ]) {
    assert.deepEqual(paginateLibrary([], page, 24), {
      page: 0,
      pageSize: 24,
      pages: 1,
      total: 0,
      start: 0,
      end: 0,
      entries: [],
    });
  }
  const entries = Array.from({ length: 1001 }, (_, i) => [
    String(i),
    { name: String(i) },
  ]);
  assert.equal(paginateLibrary(entries, -20, 24).entries[0][0], "0");
  const last = paginateLibrary(entries, 999999, 24);
  assert.equal(last.page, 41);
  assert.equal(last.entries.length, 17);
  assert.equal(last.entries.at(-1)[0], "1000");
  assert.equal(paginateLibrary(entries, 1.8, 24).page, 1);
  assert.equal(paginateLibrary(entries, NaN, 24).page, 0);
  assert.equal(paginateLibrary(entries.slice(0, 2), 41, 24).page, 0);
  assert.equal(paginationState(3, 0, 0).pageSize, 1);
  assert.equal(paginationState(3, 0, Infinity).pageSize, 24);
  assert.equal(paginationState(3, 0, 10000).pageSize, 96);
  assert.deepEqual(pageNumbers(1, 999), [0]);
  assert.deepEqual(pageNumbers(0, -1), [0]);
});
