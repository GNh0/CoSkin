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
import { attachFolderDrop } from "./library-explorer.js";

export function folderBrowser(panel, onChange) {
  const blocked = () =>
    !!(panel.busy || panel.externalApplying || panel.c.externalApplying);
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
  root.append(h("summary", { text: t("folderNavigation") }));
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
    if (!blocked()) onChange(id, "sidebar-folder-" + (id || "home"));
  };
  const makeFolder = (id, name, count) => {
    const button = h(
      "button",
      {
        type: "button",
        class: "folder-button",
        "data-library-focus": "sidebar-folder-" + (id || "home"),
        "data-folder-id": id,
        onclick: () => select(id),
      },
      [
        h("span", { class: "folder-name", text: name }),
        h("span", { class: "folder-count", text: String(count) }),
      ],
    );
    button.disabled = blocked();
    if ((panel.groupFilter || "") === id)
      button.setAttribute("aria-current", "true");
    if (Object.hasOwn(groups, id)) attachFolderDrop(panel, button, id);
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
      makeFolder("", t("explorerHome"), Object.keys(groups).length),
      makeFolder("all", t("allGroups"), counts.total),
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
            if (blocked()) return;
            if (panel.folderExpanded.has(row.id))
              panel.folderExpanded.delete(row.id);
            else panel.folderExpanded.add(row.id);
            paint();
            restoreLibraryFocus(root, "folder-expand-" + row.id);
          },
        });
        expand.disabled = blocked() || !!panel.folderTreeQuery;
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
    if (blocked()) return;
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
        restoreLibraryFocus(
          root,
          "sidebar-folder-" + (index.parents[id] || "home"),
        );
        return;
      }
      paint();
      restoreLibraryFocus(root, "sidebar-folder-" + id);
    }
  });
  body.append(
    h("div", { class: "folder-tree-tools" }, [
      search,
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
