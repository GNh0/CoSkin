export const libraryPageSizes = [24, 48, 96];

export function paginationState(total, page = 0, pageSize = 24) {
  const count = Number.isFinite(total) ? Math.max(0, Math.trunc(total)) : 0;
  const size = Number.isFinite(pageSize)
    ? Math.max(1, Math.min(96, Math.trunc(pageSize)))
    : 24;
  const pages = Math.max(1, Math.ceil(count / size));
  const current = Number.isFinite(page)
    ? Math.max(0, Math.min(pages - 1, Math.trunc(page)))
    : 0;
  const start = current * size;
  return {
    page: current,
    pageSize: size,
    pages,
    total: count,
    start,
    end: Math.min(count, start + size),
  };
}

export function pageNumbers(pages, page) {
  const state = paginationState(pages, page, 1);
  const numbers = new Set([0, state.pages - 1]);
  const start = Math.max(0, Math.min(state.page - 2, state.pages - 5));
  for (let value = start; value < Math.min(state.pages, start + 5); value++)
    numbers.add(value);
  const result = [];
  let previous = -1;
  for (const value of [...numbers].sort((a, b) => a - b)) {
    if (value - previous > 1) result.push(null);
    result.push(value);
    previous = value;
  }
  return result;
}

export function paginateLibrary(entries, page, pageSize) {
  const state = paginationState(entries.length, page, pageSize);
  return { ...state, entries: entries.slice(state.start, state.end) };
}
