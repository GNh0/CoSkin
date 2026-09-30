import { h } from "./components.js";
import { t } from "./messages.js";
import { pageNumbers, paginationState } from "../core/library-pagination.js";

export function restoreLibraryFocus(root, key) {
  if (!key) return;
  const target = [...root.querySelectorAll("[data-library-focus]")].find(
    (element) => element.getAttribute("data-library-focus") === key,
  );
  target?.focus({ preventScroll: true });
}

export function libraryPagination(
  panel,
  {
    total,
    page,
    pageSize,
    onPage,
    key = "library",
    label = t("pages"),
    compact = false,
  },
) {
  const state = paginationState(total, page, pageSize);
  const root = h("nav", {
    class: "pagination" + (compact ? " compact-pagination" : ""),
    "aria-label": label,
  });
  const go = (value, focus) => {
    if (panel.busy || panel.c.externalApplying || !state.total) return;
    onPage(paginationState(state.total, value, state.pageSize).page, focus);
  };
  const button = (label, value, suffix, disabled = false) => {
    const focus = key + "-" + suffix;
    const element = h("button", {
      type: "button",
      text: label,
      "data-library-focus": focus,
      onclick: () => go(value, focus),
    });
    element.disabled = !!(disabled || panel.busy || panel.c.externalApplying);
    return element;
  };
  root.append(
    button(t("firstPage"), 0, "first", state.page === 0),
    button(t("previous"), state.page - 1, "previous", state.page === 0),
  );
  if (!compact)
    for (const value of pageNumbers(state.pages, state.page)) {
      if (value === null) {
        root.append(h("span", { text: "…", "aria-hidden": "true" }));
        continue;
      }
      const number = button(String(value + 1), value, "page-" + value);
      number.setAttribute("aria-label", t("pageNumber", { page: value + 1 }));
      if (value === state.page) number.setAttribute("aria-current", "page");
      number.disabled ||= !state.total;
      root.append(number);
    }
  root.append(
    button(t("next"), state.page + 1, "next", state.page === state.pages - 1),
    button(
      t("lastPage"),
      state.pages - 1,
      "last",
      state.page === state.pages - 1,
    ),
    h("span", {
      class: "page-status muted",
      text: t("pageStatus", {
        page: state.page + 1,
        pages: state.pages,
        count: state.total,
      }),
    }),
  );
  if (!compact) {
    const jumpKey = key + "-jump";
    const jump = h("input", {
      type: "number",
      min: 1,
      max: state.pages,
      step: 1,
      value: state.page + 1,
      "aria-label": t("jumpToPage"),
      "data-library-focus": jumpKey,
    });
    jump.disabled = !!(panel.busy || !state.total);
    const submit = () => {
      if (jump.value.trim() && Number.isFinite(Number(jump.value)))
        go(Number(jump.value) - 1, jumpKey);
    };
    jump.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      submit();
    });
    const submitButton = h("button", {
      type: "button",
      text: t("goToPage"),
      onclick: submit,
    });
    submitButton.disabled = jump.disabled;
    root.append(h("div", { class: "page-jump" }, [jump, submitButton]));
  }
  root.addEventListener("keydown", (event) => {
    if (event.target?.tagName === "INPUT") return;
    const page = {
      ArrowLeft: state.page - 1,
      ArrowRight: state.page + 1,
      Home: 0,
      End: state.pages - 1,
    }[event.key];
    if (page === undefined) return;
    event.preventDefault();
    go(
      page,
      key + "-page-" + paginationState(state.total, page, state.pageSize).page,
    );
  });
  return root;
}

// Only a bounded slice is mounted, including when thousands of labels exist.
export function searchablePicker(
  panel,
  {
    key,
    label,
    options,
    value = "",
    emptyLabel = t("allTags"),
    state = {},
    onChange,
  },
) {
  let selected = value;
  const root = h("details", { class: "library-picker" });
  root.open = !!state.open;
  const summary = h("summary", { "data-library-focus": key + "-summary" });
  const search = h("input", {
    type: "search",
    value: state.query || "",
    placeholder: t("searchOptions", { label }),
    "aria-label": t("searchOptions", { label }),
  });
  search.disabled = !!panel.busy;
  const content = h("div", { class: "picker-content" });
  const results = h("div", { class: "picker-options", "aria-label": label });
  const footer = h("div");
  content.append(search, results, footer);
  root.append(summary, content);
  root.addEventListener("toggle", () => {
    state.open = root.open;
    if (!root.open) return;
    const rect = root.getBoundingClientRect?.();
    const boundary = root.closest?.("section")?.getBoundingClientRect?.();
    const width = content.getBoundingClientRect?.().width;
    const alignRight =
      rect && boundary && rect.left + width > boundary.right - 12;
    content.style.left = alignRight ? "auto" : "0";
    content.style.right = alignRight ? "0" : "auto";
  });
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    root.open = state.open = false;
    summary.focus();
    event.stopPropagation();
  });
  const choose = (id) => {
    if (panel.busy || panel.c.externalApplying) return;
    selected = id;
    root.open = state.open = false;
    paint();
    onChange(id, key + "-summary");
    summary.focus({ preventScroll: true });
  };
  const paint = () => {
    summary.textContent =
      label +
      ": " +
      (options.find(([id]) => id === selected)?.[1] || emptyLabel);
    const query = (state.query || "")
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase();
    const matches = options.filter(([, name]) =>
      name.normalize("NFKC").toLocaleLowerCase().includes(query),
    );
    const page = paginationState(matches.length, state.page, 12);
    state.page = page.page;
    results.replaceChildren();
    const option = (id, name) => {
      const button = h("button", {
        type: "button",
        text: name,
        "aria-pressed": String(id === selected),
        onclick: () => choose(id),
      });
      button.disabled = !!panel.busy;
      return button;
    };
    results.append(option("", emptyLabel));
    for (const [id, name] of matches.slice(page.start, page.end))
      results.append(option(id, name));
    if (!matches.length)
      results.append(h("span", { class: "muted", text: t("noOptions") }));
    footer.replaceChildren(
      libraryPagination(panel, {
        total: matches.length,
        page: page.page,
        pageSize: 12,
        key,
        compact: true,
        label: t("optionPages", { label }),
        onPage: (value, focus) => {
          state.page = value;
          paint();
          restoreLibraryFocus(root, focus);
        },
      }),
    );
  };
  search.addEventListener("input", () => {
    state.query = search.value;
    state.page = 0;
    paint();
  });
  search.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    results.querySelector("button:nth-child(2)")?.focus();
  });
  paint();
  return root;
}
