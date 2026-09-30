import { h } from "./components.js";
import { t } from "./messages.js";
import {
  navigateExplorer,
  traverseExplorer,
} from "../core/library-explorer.js";
import {
  organization,
  writeOrganizationBatch,
} from "./library-organization.js";

export const themeDragMime = "application/x-coskin-library-themes";
const blocked = (panel) =>
  !!(panel.busy || panel.externalApplying || panel.c.externalApplying);

export function explorerIcon(folder = false) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({
    viewBox: "0 0 48 40",
    "aria-hidden": "true",
    class: folder ? "explorer-folder-icon" : "explorer-file-icon",
  }))
    svg.setAttribute(key, value);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    folder
      ? "M3 8h15l5 5h22v22H3zM3 8V4h16l5 5h21v4"
      : "M12 2h18l9 9v27H12zM30 2v10h9M18 20h15M18 26h15",
  );
  path.setAttribute("fill", folder ? "currentColor" : "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  svg.append(path);
  return svg;
}

export function explorerToolbar(panel, model) {
  const bar = h("div", { class: "explorer-toolbar" });
  const button = (label, key, run, disabled = false) => {
    const result = h("button", {
      type: "button",
      text: label,
      "data-library-focus": key,
      onclick: () => {
        if (!blocked(panel)) run();
      },
    });
    result.disabled = blocked(panel) || disabled;
    return result;
  };
  const navigation = h(
    "nav",
    { class: "explorer-navigation", "aria-label": t("explorerNavigation") },
    [
      button(
        t("explorerBack"),
        "explorer-back",
        () => traverseExplorer(panel, "back"),
        !panel.explorerBack?.length,
      ),
      button(
        t("explorerForward"),
        "explorer-forward",
        () => traverseExplorer(panel, "forward"),
        !panel.explorerForward?.length,
      ),
      button(
        t("explorerUp"),
        "explorer-up",
        () =>
          navigateExplorer(panel, model.index.parents[model.location] || ""),
        !model.location,
      ),
    ],
  );
  const path = h("nav", {
    class: "explorer-breadcrumbs",
    "aria-label": t("explorerPath"),
  });
  const trail = [];
  for (
    let id = Object.hasOwn(organization(panel).groups, model.location)
      ? model.location
      : null;
    id;
    id = model.index.parents[id]
  )
    trail.unshift(id);
  const locations = [
    ["", t("explorerHome")],
    ...trail.map((id) => [id, organization(panel).groups[id]]),
  ];
  if (model.location === "all" || model.location === "ungrouped")
    locations.push([
      model.location,
      t(model.location === "all" ? "allGroups" : "ungrouped"),
    ]);
  for (const [id, name] of locations) {
    const current = id === model.location;
    const crumb = button(
      name,
      current ? "explorer-path" : "explorer-crumb-" + (id || "root"),
      () => navigateExplorer(panel, id),
    );
    if (current) crumb.setAttribute("aria-current", "page");
    path.append(crumb);
  }
  const views = h("div", {
    class: "explorer-views",
    role: "group",
    "aria-label": t("explorerView"),
  });
  for (const [value, label] of [
    ["folders", "explorerFolderView"],
    ["tree", "explorerTreeView"],
  ]) {
    const control = button(t(label), "explorer-view-" + value, () => {
      panel.libraryView = value;
      panel.libraryFocus = "explorer-view-" + value;
      panel.render();
    });
    control.setAttribute("aria-pressed", String(panel.libraryView === value));
    views.append(control);
  }
  const display = h("div", {
    class: "explorer-views",
    role: "group",
    "aria-label": t("explorerDisplay"),
  });
  for (const [value, label] of [
    ["preview", "explorerPreview"],
    ["list", "explorerList"],
  ]) {
    const control = button(t(label), "explorer-display-" + value, () => {
      panel.libraryDisplay = value;
      panel.libraryFocus = "explorer-display-" + value;
      panel.render();
    });
    control.setAttribute(
      "aria-pressed",
      String(panel.libraryDisplay === value),
    );
    display.append(control);
  }
  const sidebar = button(t("explorerSidebar"), "explorer-sidebar", () => {
    panel.explorerSidebarOpen = panel.explorerSidebarOpen === false;
    panel.libraryFocus = "explorer-sidebar";
    panel.render();
  });
  sidebar.setAttribute(
    "aria-expanded",
    String(panel.explorerSidebarOpen !== false),
  );
  const include = h("input", {
    type: "checkbox",
    "aria-label": t("includeSubfolders"),
  });
  include.checked = !!panel.folderIncludeChildren;
  include.disabled =
    blocked(panel) ||
    !Object.hasOwn(organization(panel).groups, model.location);
  include.onchange = () => {
    if (blocked(panel)) return;
    panel.folderIncludeChildren = include.checked;
    panel.page = 0;
    panel.libraryScrollTop = 0;
    panel.render();
  };
  const create = button(
    t("newGroup"),
    "explorer-create-folder",
    () => {
      panel.groupCreateParent = Object.hasOwn(
        organization(panel).groups,
        model.location,
      )
        ? model.location
        : "";
      panel.manageGroups = true;
      panel.render();
    },
    model.location === "all" || model.location === "ungrouped",
  );
  bar.append(
    navigation,
    path,
    h("div", { class: "explorer-view-controls" }, [
      views,
      display,
      sidebar,
      create,
      h("label", { class: "folder-include" }, [
        include,
        h("span", { text: t("includeSubfolders") }),
      ]),
    ]),
    h("p", { class: "explorer-hint muted", text: t("explorerHint") }),
  );
  navigation.addEventListener("keydown", (event) => {
    if (!event.altKey || blocked(panel)) return;
    if (event.key === "ArrowLeft") traverseExplorer(panel, "back");
    else if (event.key === "ArrowRight") traverseExplorer(panel, "forward");
    else if (event.key === "ArrowUp")
      navigateExplorer(panel, model.index.parents[model.location] || "");
    else return;
    event.preventDefault();
  });
  return bar;
}

function selectFolder(panel, id) {
  panel.explorerSelectedFolder = id;
  // Keep the same DOM node for the second click so real browser dblclick fires.
  for (const card of panel.shadow.querySelectorAll("[data-explorer-folder]"))
    card.setAttribute(
      "aria-selected",
      String(card.getAttribute("data-explorer-folder") === id),
    );
}

export function explorerFolder(panel, item) {
  const tree = panel.libraryView === "tree";
  const row = panel.libraryDisplay === "list" || tree;
  const card = h("article", {
    class: "folder-card" + (row ? " explorer-row" : ""),
    "data-explorer-folder": item.id,
    "aria-selected": String(panel.explorerSelectedFolder === item.id),
    ...(tree
      ? {
          role: "treeitem",
          "aria-level": item.depth + 1,
          "aria-expanded": String(item.expanded),
        }
      : {}),
  });
  if (tree)
    card.style.paddingInlineStart = Math.min(item.depth, 12) * 14 + "px";
  const open = () => {
    if (!blocked(panel)) navigateExplorer(panel, item.id);
  };
  const body = h(
    "button",
    {
      type: "button",
      class: "folder-card-body",
      "data-explorer-item": item.id,
      "data-library-focus": "folder-" + item.id,
      "aria-label": t("explorerFolderLabel", { name: item.name }),
      title:
        item.path.join(" / ") +
        " · " +
        t("folderCountDetail", { direct: item.direct, total: item.total }),
      onclick: () => {
        if (!blocked(panel)) selectFolder(panel, item.id);
      },
      ondblclick: open,
    },
    [
      explorerIcon(true),
      h("div", { class: "folder-card-info" }, [
        h("h3", { text: item.name }),
        h("span", {
          class: "muted",
          text: t("explorerFolderContents", {
            folders: item.folders,
            themes: item.direct,
          }),
        }),
      ]),
      h("span", { class: "folder-count", text: String(item.total) }),
    ],
  );
  body.disabled = blocked(panel);
  body.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      open();
    } else if (tree && ["ArrowRight", "ArrowLeft"].includes(event.key)) {
      event.preventDefault();
      if (blocked(panel) || !item.hasContents || item.autoExpanded) return;
      if (event.key === "ArrowRight") panel.explorerExpanded.add(item.id);
      else panel.explorerExpanded.delete(item.id);
      panel.libraryFocus = "folder-" + item.id;
      panel.render();
    }
  });
  if (tree) {
    const expand = h("button", {
      type: "button",
      class: "folder-expand",
      text: item.expanded ? "▾" : "▸",
      "aria-label": t(item.expanded ? "collapseFolder" : "expandFolder", {
        name: item.name,
      }),
      "aria-expanded": String(item.expanded),
      "data-library-focus": "explorer-expand-" + item.id,
      onclick: () => {
        if (blocked(panel)) return;
        if (panel.explorerExpanded.has(item.id))
          panel.explorerExpanded.delete(item.id);
        else panel.explorerExpanded.add(item.id);
        panel.libraryFocus = "explorer-expand-" + item.id;
        panel.render();
      },
    });
    expand.disabled = blocked(panel) || !item.hasContents || item.autoExpanded;
    card.append(expand);
  }
  card.append(body);
  attachFolderDrop(panel, card, item.id);
  return card;
}

export function explorerKeyboard(content) {
  content.addEventListener("keydown", (event) => {
    if (
      !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) ||
      event.altKey
    )
      return;
    const items = [...content.querySelectorAll("[data-explorer-item]")].filter(
      (button) => !button.disabled,
    );
    if (!items.length) return;
    const at = items.indexOf(event.target);
    if (at < 0) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : Math.max(
              0,
              Math.min(
                items.length - 1,
                at + (event.key === "ArrowDown" ? 1 : -1),
              ),
            );
    items[next].focus();
  });
}

function dragIds(panel, dataTransfer, read = false) {
  const active = panel.libraryDrag;
  if (
    blocked(panel) ||
    !active ||
    !dataTransfer ||
    dataTransfer.files?.length ||
    !Array.from(dataTransfer.types || []).includes(themeDragMime)
  )
    throw Error(t("explorerInvalidDrop"));
  let payload = active;
  if (read) {
    if (typeof dataTransfer.getData !== "function")
      throw Error(t("explorerInvalidDrop"));
    const text = dataTransfer.getData(themeDragMime);
    if (!text || text.length > 1024 * 1024)
      throw Error(t("explorerInvalidDrop"));
    try {
      payload = JSON.parse(text);
    } catch {
      throw Error(t("explorerInvalidDrop"));
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw Error(t("explorerInvalidDrop"));
  const ids = payload.ids;
  if (
    payload.version !== 1 ||
    payload.kind !== "themes" ||
    payload.token !== active.token ||
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 2048 ||
    ids.some(
      (id) =>
        typeof id !== "string" || !Object.hasOwn(panel.c.summary.themes, id),
    ) ||
    new Set(ids).size !== ids.length ||
    JSON.stringify(ids) !== JSON.stringify(active.ids)
  )
    throw Error(t("explorerInvalidDrop"));
  return ids;
}

export function attachThemeDrag(panel, card, id) {
  card.setAttribute("draggable", String(!blocked(panel)));
  card.addEventListener("dragstart", (event) => {
    if (
      blocked(panel) ||
      !event.dataTransfer ||
      !Object.hasOwn(panel.c.summary.themes, id)
    ) {
      event.preventDefault();
      return;
    }
    const ids = panel.librarySelection.has(id)
      ? [...panel.librarySelection]
      : [id];
    if (
      !ids.length ||
      ids.length > 2048 ||
      ids.some((key) => !Object.hasOwn(panel.c.summary.themes, key))
    ) {
      event.preventDefault();
      panel.message = t("batchSizeLimit");
      panel.render();
      return;
    }
    panel.libraryDrag = {
      version: 1,
      kind: "themes",
      token: crypto.randomUUID(),
      ids,
    };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      themeDragMime,
      JSON.stringify(panel.libraryDrag),
    );
    card.setAttribute("data-dragging", "true");
  });
  card.addEventListener("dragend", () => {
    panel.libraryDrag = null;
    card.setAttribute("data-dragging", "false");
    for (const target of panel.shadow.querySelectorAll("[data-drop-hover]"))
      target.setAttribute("data-drop-hover", "false");
  });
}

export function attachFolderDrop(panel, card, groupId) {
  card.setAttribute("data-drop-folder", groupId);
  const validate = (transfer, read) => {
    if (!Object.hasOwn(organization(panel).groups, groupId))
      throw Error(t("batchMissingGroup"));
    const ids = dragIds(panel, transfer, read);
    if (ids.every((id) => organization(panel).themes[id]?.groupId === groupId))
      throw Error(t("explorerSameFolder"));
    return ids;
  };
  card.addEventListener("dragover", (event) => {
    try {
      validate(event.dataTransfer, false);
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      card.setAttribute("data-drop-hover", "true");
    } catch {
      card.setAttribute("data-drop-hover", "false");
    }
  });
  card.addEventListener("dragleave", (event) => {
    if (!card.contains?.(event.relatedTarget))
      card.setAttribute("data-drop-hover", "false");
  });
  card.addEventListener("drop", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    card.setAttribute("data-drop-hover", "false");
    let ids;
    try {
      ids = validate(event.dataTransfer, true);
    } catch (error) {
      panel.libraryDrag = null;
      panel.message = error.message;
      panel.render();
      return;
    }
    panel.libraryDrag = null;
    await panel.action(() => writeOrganizationBatch(panel, ids, { groupId }))();
  });
}
