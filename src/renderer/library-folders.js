import { h } from "./components.js";
import { t } from "./messages.js";
import { organization } from "./library-organization.js";
import {
  folderCounts,
  folderRows,
  folderIndex,
  folderOptions,
} from "../core/library-folders.js";
import { paginationState } from "../core/library-pagination.js";
import { libraryPagination, restoreLibraryFocus } from "./library-controls.js";

export function folderBrowser(panel, onChange) {
  const data = organization(panel);
  const groups = data.groups;
  const parents = data.groupParents || {};
  const counts = folderCounts(panel.c.summary.themes, data);
  const index = folderIndex(groups, parents);
  const options = new Map(folderOptions(groups, parents));
  panel.folderExpanded ??= new Set();
  // Opening a folder from a picker should also reveal its path in the tree.
  for (let id = index.parents[panel.groupFilter]; id; id = index.parents[id])
    panel.folderExpanded.add(id);
  const root = h("details", { class: "folder-browser" });
  root.open = panel.folderBrowserOpen !== false;
  root.addEventListener("toggle", () => {
    panel.folderBrowserOpen = root.open;
  });
  const current =
    panel.groupFilter === "ungrouped"
      ? t("ungrouped")
      : options.get(panel.groupFilter) || t("allGroups");
  root.append(
    h("summary", { text: t("folderBrowserTitle", { name: current }) }),
  );
  const body = h("div", { class: "folder-browser-body" });
  const search = h("input", {
    type: "search",
    value: panel.folderTreeQuery || "",
    "aria-label": t("searchFolders"),
    placeholder: t("searchFolders"),
  });
  const tree = h("nav", {
    class: "folder-tree",
    "aria-label": t("folderNavigation"),
  });
  const pages = h("div");
  const select = (id) => {
    onChange(id, "folder-" + (id || "all"));
  };
  const makeFolder = (id, name, count) => {
    const button = h(
      "button",
      {
        type: "button",
        class: "folder-button",
        text: name,
        "data-library-focus": "folder-" + (id || "all"),
        "data-folder-id": id,
        onclick: () => select(id),
      },
      [h("span", { class: "folder-count", text: String(count) })],
    );
    button.disabled = !!panel.busy;
    if ((panel.groupFilter || "") === id)
      button.setAttribute("aria-current", "true");
    return button;
  };
  const paint = () => {
    const rows = folderRows(
      groups,
      parents,
      panel.folderExpanded,
      panel.folderTreeQuery || "",
    );
    const page = paginationState(rows.length, panel.folderTreePage, 24);
    panel.folderTreePage = page.page;
    tree.replaceChildren(
      makeFolder("", t("allGroups"), counts.total),
      makeFolder("ungrouped", t("ungrouped"), counts.ungrouped),
    );
    for (const row of rows.slice(page.start, page.end)) {
      const item = h("div", { class: "folder-tree-row" });
      item.style.paddingLeft = Math.min(row.depth, 12) * 16 + "px";
      if (row.children) {
        const expand = h("button", {
          type: "button",
          class: "folder-expand",
          text: row.expanded ? "▾" : "▸",
          "aria-expanded": String(row.expanded),
          "aria-label": t(row.expanded ? "collapseFolder" : "expandFolder", {
            name: row.name,
          }),
          "data-library-focus": "folder-expand-" + row.id,
          onclick: () => {
            if (panel.folderExpanded.has(row.id))
              panel.folderExpanded.delete(row.id);
            else panel.folderExpanded.add(row.id);
            paint();
            restoreLibraryFocus(root, "folder-expand-" + row.id);
          },
        });
        expand.disabled = !!panel.busy || !!panel.folderTreeQuery;
        item.append(expand);
      } else
        item.append(
          h("span", { class: "folder-expand-spacer", "aria-hidden": "true" }),
        );
      const path = options.get(row.id);
      const suffix = " · " + row.id.slice(0, 8);
      const folder = makeFolder(
        row.id,
        row.name + (path.endsWith(suffix) ? suffix : ""),
        counts.subtree[row.id],
      );
      folder.title =
        path +
        " · " +
        t("folderCountDetail", {
          direct: counts.groups[row.id],
          total: counts.subtree[row.id],
        });
      item.append(folder);
      tree.append(item);
    }
    if (!rows.length)
      tree.append(h("p", { class: "muted", text: t("noFolders") }));
    pages.replaceChildren(
      libraryPagination(panel, {
        total: rows.length,
        page: page.page,
        pageSize: 24,
        key: "folder-tree",
        compact: true,
        label: t("folderPages"),
        onPage: (value, focus) => {
          panel.folderTreePage = value;
          paint();
          restoreLibraryFocus(root, focus);
        },
      }),
    );
  };
  search.addEventListener("input", () => {
    panel.folderTreeQuery = search.value;
    panel.folderTreePage = 0;
    paint();
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.preventDefault();
  });
  tree.addEventListener("keydown", (event) => {
    const id = event.target?.getAttribute("data-folder-id");
    if (id === null || id === undefined) return;
    const buttons = [...tree.querySelectorAll("[data-folder-id]")];
    const current = buttons.findIndex((button) => button === event.target);
    if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const target =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : Math.max(
                0,
                Math.min(
                  buttons.length - 1,
                  current + (event.key === "ArrowUp" ? -1 : 1),
                ),
              );
      buttons[target]?.focus();
    } else if (
      (event.key === "ArrowRight" || event.key === "ArrowLeft") &&
      Object.hasOwn(groups, id) &&
      !panel.folderTreeQuery
    ) {
      event.preventDefault();
      if (event.key === "ArrowRight") panel.folderExpanded.add(id);
      else if (panel.folderExpanded.has(id)) panel.folderExpanded.delete(id);
      else {
        restoreLibraryFocus(root, "folder-" + (index.parents[id] || "all"));
        return;
      }
      paint();
      restoreLibraryFocus(root, "folder-" + id);
    }
  });
  const include = h("input", {
    type: "checkbox",
    "aria-label": t("includeSubfolders"),
  });
  include.checked = !!panel.folderIncludeChildren;
  include.disabled = !Object.hasOwn(groups, panel.groupFilter) || !!panel.busy;
  include.onchange = () => {
    panel.folderIncludeChildren = include.checked;
    onChange(panel.groupFilter, "folder-" + panel.groupFilter);
  };
  body.append(
    h("div", { class: "folder-tree-tools" }, [
      search,
      h("label", { class: "folder-include" }, [
        include,
        h("span", { text: t("includeSubfolders") }),
      ]),
      panel.button(
        t("newSubfolder"),
        () => {
          panel.groupCreateParent = panel.groupFilter;
          panel.manageGroups = true;
        },
        !Object.hasOwn(groups, panel.groupFilter),
      ),
    ]),
    h("p", { class: "muted", text: t("folderCountHint") }),
    tree,
    pages,
  );
  root.append(body);
  paint();
  return root;
}
