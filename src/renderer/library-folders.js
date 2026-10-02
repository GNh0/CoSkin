import { h, icon } from "./components.js";
import { t } from "./messages.js";
import { organization, openGroupManager } from "./library-organization.js";
import {
  folderCounts,
  folderRows,
  folderIndex,
  folderOptions,
} from "../core/library-folders.js";
import { restoreLibraryFocus } from "./library-controls.js";
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
  const root = h("div", { class: "folder-browser" });
  root.append(
    h("h2", { class: "folder-browser-heading", text: t("folderNavigation") }),
  );
  const body = h("div", { class: "folder-browser-body" });
  const search = h("input", {
    type: "search",
    value: panel.folderTreeQuery || "",
    "aria-label": t("searchFolders"),
    placeholder: t("searchFolders"),
  });
  const tree = h("div", {
    class: "folder-tree",
    "aria-label": t("folderNavigation"),
  });
  const quick = h("nav", {
    class: "folder-quicklinks",
    "aria-label": t("folderNavigation"),
  });
  const viewport = h("div", {
    class: "folder-tree-viewport",
    role: "tree",
    "aria-label": t("folderNavigation"),
  });
  const rowHeight = 32;
  const overscan = 8;
  const location = panel.groupFilter || "";
  const revealLocation = panel.folderTreeLocation !== location;
  panel.folderTreeLocation = location;
  let rows = [];
  let range = "";
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
        icon(id === "" ? "home" : id === "all" ? "grid" : "folder"),
        h("span", { class: "folder-name", text: name }),
        h("span", { class: "folder-count", text: String(count) }),
      ],
    );
    button.disabled = blocked();
    if ((panel.groupFilter || "") === id) {
      button.setAttribute("aria-current", "true");
    }
    if (Object.hasOwn(groups, id)) attachFolderDrop(panel, button, id);
    return button;
  };
  const revealFolder = (id) => {
    const position = rows.findIndex((row) => row.id === id);
    if (position >= 0) {
      const top = position * rowHeight;
      const visible = tree.clientHeight || 480;
      if (top < tree.scrollTop) tree.scrollTop = top;
      else if (top + rowHeight > tree.scrollTop + visible)
        tree.scrollTop = top + rowHeight - visible;
      panel.folderTreeScrollTop = tree.scrollTop;
    }
  };
  const focusFolder = (id) => {
    revealFolder(id);
    panel.folderTreeFocused = id;
    renderRows(true);
    restoreLibraryFocus(root, "sidebar-folder-" + (id || "home"));
  };
  const renderRows = (force = false) => {
    const first = Math.max(
      0,
      Math.floor((tree.scrollTop || 0) / rowHeight) - overscan,
    );
    const end = Math.min(
      rows.length,
      first + Math.ceil((tree.clientHeight || 480) / rowHeight) + overscan * 2,
    );
    const nextRange = first + ":" + end;
    if (!force && nextRange === range) return;
    range = nextRange;
    const visibleRows = rows.slice(first, end);
    const candidate = panel.folderTreeFocused || panel.groupFilter;
    const focusId = visibleRows.some((row) => row.id === candidate)
      ? candidate
      : visibleRows[0]?.id;
    const active = panel.shadow.activeElement || document.activeElement;
    const focusedKey = viewport.contains?.(active)
      ? active?.getAttribute("data-library-focus")
      : null;
    viewport.style.height = rows.length * rowHeight + "px";
    viewport.replaceChildren();
    for (const [offset, row] of visibleRows.entries()) {
      const item = h("div", { class: "folder-tree-row" });
      item.style.paddingLeft = Math.min(row.depth, 12) * 16 + "px";
      item.style.top = (first + offset) * rowHeight + "px";
      if (row.children) {
        const expand = h(
          "button",
          {
            type: "button",
            class: "folder-expand",
            tabindex: "-1",
            "aria-expanded": String(row.expanded),
            "aria-label": t(row.expanded ? "collapseFolder" : "expandFolder", {
              name: row.name,
            }),
            "data-library-focus": "folder-expand-" + row.id,
            onclick: () => {
              if (blocked() || panel.folderTreeQuery) return;
              if (panel.folderExpanded.has(row.id))
                panel.folderExpanded.delete(row.id);
              else panel.folderExpanded.add(row.id);
              paint();
              focusFolder(row.id);
            },
          },
          [icon("chevron")],
        );
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
      const siblings = index.children.get(index.parents[row.id]);
      folder.setAttribute("role", "treeitem");
      folder.setAttribute("aria-level", String(row.depth + 1));
      folder.setAttribute("aria-setsize", String(siblings.length));
      folder.setAttribute(
        "aria-posinset",
        String(siblings.indexOf(row.id) + 1),
      );
      folder.setAttribute(
        "aria-selected",
        String(panel.groupFilter === row.id),
      );
      folder.setAttribute("tabindex", focusId === row.id ? "0" : "-1");
      if (row.children)
        folder.setAttribute("aria-expanded", String(row.expanded));
      folder.addEventListener("focus", () => {
        panel.folderTreeFocused = row.id;
      });
      folder.title =
        path +
        " · " +
        t("folderCountDetail", {
          direct: counts.groups[row.id],
          total: counts.subtree[row.id],
        });
      item.append(folder);
      viewport.append(item);
    }
    if (!rows.length)
      viewport.append(h("p", { class: "muted", text: t("noFolders") }));
    if (focusedKey) restoreLibraryFocus(viewport, focusedKey);
  };
  const paint = () => {
    rows = folderRows(
      groups,
      parents,
      panel.folderExpanded,
      panel.folderTreeQuery || "",
    );
    quick.replaceChildren(
      makeFolder("", t("explorerHome"), Object.keys(groups).length),
      makeFolder("all", t("allGroups"), counts.total),
      makeFolder("ungrouped", t("ungrouped"), counts.ungrouped),
    );
    tree.scrollTop = Math.min(
      panel.folderTreeScrollTop || 0,
      Math.max(0, rows.length * rowHeight - (tree.clientHeight || 480)),
    );
    if (revealLocation && !panel.folderTreeQuery) {
      revealFolder(location);
      if (Object.hasOwn(groups, location)) panel.folderTreeFocused = location;
    }
    renderRows(true);
  };
  search.addEventListener("input", () => {
    panel.folderTreeQuery = search.value;
    panel.folderTreeScrollTop = 0;
    paint();
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.preventDefault();
  });
  tree.addEventListener("keydown", (event) => {
    if (blocked()) return;
    const id = event.target?.getAttribute("data-folder-id");
    if (id === null || id === undefined) return;
    const current = rows.findIndex((row) => row.id === id);
    if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const target =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? rows.length - 1
            : Math.max(
                0,
                Math.min(
                  rows.length - 1,
                  current + (event.key === "ArrowUp" ? -1 : 1),
                ),
              );
      if (rows[target]) focusFolder(rows[target].id);
    } else if (
      (event.key === "ArrowRight" || event.key === "ArrowLeft") &&
      Object.hasOwn(groups, id) &&
      !panel.folderTreeQuery
    ) {
      event.preventDefault();
      if (event.key === "ArrowRight") {
        if (panel.folderExpanded.has(id)) {
          const child = index.children.get(id)?.[0];
          if (child) focusFolder(child);
          return;
        }
        panel.folderExpanded.add(id);
      } else if (panel.folderExpanded.has(id)) panel.folderExpanded.delete(id);
      else {
        focusFolder(index.parents[id] || "");
        return;
      }
      paint();
      focusFolder(id);
    }
  });
  tree.append(viewport);
  tree.addEventListener("scroll", () => {
    panel.folderTreeScrollTop = tree.scrollTop;
    renderRows();
  });
  body.append(
    h("div", { class: "folder-tree-tools" }, [
      search,
      panel.button(
        t("newSubfolder"),
        () => {
          openGroupManager(panel, {
            create: true,
            parent: panel.groupFilter,
            returnFocus: "sidebar-folder-" + panel.groupFilter,
          });
        },
        !Object.hasOwn(groups, panel.groupFilter),
      ),
    ]),
    quick,
    tree,
  );
  root.append(body);
  paint();
  queueMicrotask(() => {
    if (!tree.isConnected) return;
    // The detached tree has no clientHeight yet. Recheck after mounting so a
    // deep selected folder is visible at the actual, possibly narrow, height.
    if (revealLocation && !panel.folderTreeQuery) revealFolder(location);
    renderRows(true);
  });
  if (typeof globalThis.ResizeObserver === "function") {
    let initialResize = true;
    const observer = new ResizeObserver(() => {
      const active = panel.shadow.activeElement || document.activeElement;
      if (initialResize && revealLocation && !panel.folderTreeQuery)
        revealFolder(location);
      else if (viewport.contains?.(active))
        revealFolder(active.getAttribute("data-folder-id"));
      initialResize = false;
      renderRows();
    });
    observer.observe(tree);
    panel.pageResources.push(() => observer.disconnect());
  }
  return root;
}
