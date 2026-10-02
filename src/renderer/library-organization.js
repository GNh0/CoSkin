import { h, icon } from "./components.js";
import { t } from "./messages.js";
import {
  searchablePicker,
  libraryPagination,
  restoreLibraryFocus,
} from "./library-controls.js";
import { paginationState } from "../core/library-pagination.js";
import {
  folderOptions,
  folderDescendants,
  folderIndex,
} from "../core/library-folders.js";
export const organization = (panel) =>
  panel.c.summary.organization || { groups: {}, themes: {} };
export function favoriteButton(panel, id, name) {
  const favorite = !!organization(panel).themes[id]?.favorite;
  const button = panel.button("", () =>
    panel.c.update("organization-write", {
      id,
      metadata: { favorite: !favorite },
    }),
  );
  button.className = "favorite-button";
  button.setAttribute("aria-pressed", String(favorite));
  button.setAttribute(
    "aria-label",
    t(favorite ? "unfavoriteTheme" : "favoriteTheme", { name }),
  );
  button.title = button.getAttribute("aria-label");
  button.append(icon("star"));
  return button;
}
export function organizationForm(panel) {
  const data = organization(panel);
  const current = data.themes[panel.selected] || {};
  const root = h("form", { class: "organization-form" });
  let groupId = current.groupId || "";
  const groups = searchablePicker(panel, {
    key: "detail-group",
    label: t("group"),
    emptyLabel: t("ungrouped"),
    options: folderOptions(data.groups, data.groupParents || {}),
    value: groupId,
    onChange: (value) => {
      groupId = value;
    },
  });
  const tags = h("textarea", {
    rows: 3,
    maxLength: 1200,
    "aria-label": t("tags"),
    placeholder: t("tagsPlaceholder"),
  });
  tags.value = (current.tags || []).join("\n");
  const save = h("button", {
    type: "submit",
    class: "secondary",
    text: t("saveOrganization"),
  });
  save.disabled = panel.busy;
  root.append(
    h("h3", { text: t("organizationTitle") }),
    h("label", { text: t("group") }, [groups]),
    h("label", { text: t("tags") }, [tags]),
    h("p", { class: "muted", text: t("organizationHint") }),
    h("div", { class: "detail-actions" }, [
      favoriteButton(panel, panel.selected, panel.doc.manifest.name),
      save,
    ]),
  );
  root.onsubmit = (event) => {
    event.preventDefault();
    panel.action(() =>
      panel.c.update("organization-write", {
        id: panel.selected,
        metadata: {
          groupId: groupId || null,
          tags: tags.value
            .split(/\r?\n/u)
            .map((value) => value.trim())
            .filter(Boolean),
        },
      }),
    )();
  };
  return root;
}
const libraryBlocked = (panel) =>
  !!(panel.busy || panel.externalApplying || panel.c.externalApplying);

export function openGroupManager(
  panel,
  {
    create = false,
    selected = null,
    parent = "",
    returnFocus = "library-options",
  } = {},
) {
  const data = organization(panel);
  panel.manageGroups = true;
  panel.batchOrganizationOpen = false;
  panel.libraryOptionsOpen = false;
  panel.groupManagerCreate = create;
  panel.groupManagerSelected = Object.hasOwn(data.groups, selected)
    ? selected
    : null;
  panel.groupCreateParent = Object.hasOwn(data.groups, parent) ? parent : "";
  panel.groupManagerQuery = "";
  const position = folderOptions(
    data.groups,
    data.groupParents || {},
  ).findIndex(([id]) => id === panel.groupManagerSelected);
  panel.groupManagerPage = Math.floor(Math.max(0, position) / 12);
  panel.groupDelete = null;
  panel.libraryDialogReturnFocus = returnFocus;
  panel.libraryFocus = create
    ? "new-folder-name"
    : panel.groupManagerSelected
      ? "folder-name-" + panel.groupManagerSelected
      : "group-manager-search";
}

export function libraryDialog(
  panel,
  { key, title, content, initialFocus, close },
) {
  const dialog = h("dialog", {
    class: "library-dialog",
    "aria-label": title,
    "data-library-dialog": key,
  });
  const dismiss = () => {
    if (libraryBlocked(panel)) return;
    close();
    panel.libraryFocus = panel.libraryDialogReturnFocus || "library-options";
    panel.render();
  };
  const cancel = h(
    "button",
    {
      type: "button",
      class: "icon-button library-dialog-close",
      "aria-label": t("close"),
      onclick: dismiss,
    },
    [icon("close")],
  );
  cancel.disabled = libraryBlocked(panel);
  dialog.append(
    h("div", { class: "library-dialog-header" }, [
      h("h2", { text: title }),
      cancel,
    ]),
    content,
  );
  if (panel.message)
    dialog.append(
      h("output", {
        role: "status",
        class: "library-dialog-status",
        text: panel.message,
      }),
    );
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    dismiss();
  });
  dialog.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;
      // A picker's Escape must close the picker without also dismissing the dialog.
      const path = event.composedPath?.() || [];
      if (
        path.some((element) => element.tagName === "DETAILS" && element.open)
      ) {
        event.preventDefault();
        return;
      }
      if (event.defaultPrevented) return;
      event.preventDefault();
      dismiss();
    },
    true,
  );
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect?.();
    if (
      rect &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    )
      return;
    dismiss();
  });
  const pendingFocus = panel.libraryFocus;
  queueMicrotask(() => {
    if (!dialog.isConnected) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    const candidate = [...dialog.querySelectorAll("[data-library-focus]")].some(
      (element) => element.getAttribute("data-library-focus") === pendingFocus,
    );
    restoreLibraryFocus(dialog, candidate ? pendingFocus : initialFocus);
  });
  panel.pageResources.push(() => {
    if (dialog.open && typeof dialog.close === "function") dialog.close();
  });
  return dialog;
}

export function groupManager(panel) {
  const current = organization(panel);
  if (
    panel.groupCreateParent &&
    !Object.hasOwn(current.groups, panel.groupCreateParent)
  )
    panel.groupCreateParent = "";
  if (
    panel.groupManagerSelected &&
    !Object.hasOwn(current.groups, panel.groupManagerSelected)
  )
    panel.groupManagerSelected = null;
  panel.groupNameDrafts ??= {};
  panel.groupParentDrafts ??= {};
  panel.groupParentPickers ??= {};
  const allFolders = folderOptions(current.groups, current.groupParents || {});
  const index = folderIndex(current.groups, current.groupParents || {});
  const root = h("div", { class: "group-manager" });
  const editor = h("div", { class: "group-editor" });
  const blocked = libraryBlocked(panel);

  const editFolder = () => {
    editor.replaceChildren();
    const id = panel.groupManagerSelected;
    if (!id || !Object.hasOwn(current.groups, id)) return;
    const path =
      allFolders.find(([candidate]) => candidate === id)?.[1] ||
      current.groups[id];
    const row = h("form", { class: "group-row", "data-group-edit": id });
    const field = h("input", {
      value: panel.groupNameDrafts[id] ?? current.groups[id],
      required: "",
      maxLength: 64,
      "aria-label": t("groupName"),
      "data-library-focus": "folder-name-" + id,
    });
    field.disabled = blocked;
    field.addEventListener("input", () => {
      panel.groupNameDrafts[id] = field.value;
    });
    panel.groupParentPickers[id] ??= {};
    const excluded = folderDescendants(
      current.groups,
      current.groupParents || {},
      id,
      index,
    );
    const parent = searchablePicker(panel, {
      key: "folder-parent-" + id,
      label: t("folderParent"),
      emptyLabel: t("rootFolder"),
      options: allFolders.filter(([candidate]) => !excluded.has(candidate)),
      value: Object.hasOwn(panel.groupParentDrafts, id)
        ? panel.groupParentDrafts[id] || ""
        : current.groupParents?.[id] || "",
      state: panel.groupParentPickers[id],
      onChange: (value) => {
        panel.groupParentDrafts[id] = value;
      },
    });
    const save = h("button", {
      type: "submit",
      class: "primary",
      text: t("renameGroup"),
    });
    save.disabled = blocked;
    const remove = panel.button(t("delete"), () => {
      panel.groupDelete = id;
    });
    remove.className = "folder-delete-action";
    row.append(
      h("div", { class: "group-editor-heading" }, [
        icon("folder"),
        h("strong", { text: current.groups[id] }),
      ]),
      h("span", { class: "group-path muted", text: path }),
      h("label", { text: t("groupName") }, [field]),
      h("label", { text: t("folderParent") }, [parent]),
      h("div", { class: "group-editor-actions" }, [remove, save]),
    );
    row.onsubmit = (event) => {
      event.preventDefault();
      if (libraryBlocked(panel) || !row.reportValidity()) return;
      panel.action(async () => {
        await panel.c.update("group-write", {
          groupId: id,
          name: field.value,
          parentId: Object.hasOwn(panel.groupParentDrafts, id)
            ? panel.groupParentDrafts[id] || null
            : current.groupParents?.[id] || null,
        });
        delete panel.groupNameDrafts[id];
        delete panel.groupParentDrafts[id];
        panel.libraryFocus = "folder-name-" + id;
      })();
    };
    if (panel.groupDelete === id)
      row.append(
        h("div", { class: "group-delete-confirm" }, [
          h("p", { text: t("deleteGroupPrompt", { name: path }) }),
          h("div", { class: "row" }, [
            panel.button(t("panel.cancel"), () => {
              panel.groupDelete = null;
            }),
            panel.button(t("delete"), async () => {
              await panel.c.update("group-delete", { groupId: id });
              if (panel.groupFilter === id) panel.groupFilter = "";
              delete panel.groupNameDrafts[id];
              delete panel.groupParentDrafts[id];
              panel.groupDelete = panel.groupManagerSelected = null;
              panel.libraryFocus = "group-manager-search";
            }),
          ]),
        ]),
      );
    editor.append(row);
  };

  if (panel.groupManagerCreate) {
    const form = h("form", { class: "group-create" });
    const name = h("input", {
      required: "",
      maxLength: 64,
      "aria-label": t("groupName"),
      placeholder: t("groupName"),
      "data-library-focus": "new-folder-name",
      value: panel.groupCreateDraft || "",
    });
    name.disabled = blocked;
    name.addEventListener("input", () => {
      panel.groupCreateDraft = name.value;
    });
    panel.groupCreatePicker ??= {};
    const parent = searchablePicker(panel, {
      key: "new-folder-parent",
      label: t("folderParent"),
      emptyLabel: t("rootFolder"),
      options: allFolders,
      value: panel.groupCreateParent || "",
      state: panel.groupCreatePicker,
      onChange: (value) => {
        panel.groupCreateParent = value;
      },
    });
    const create = h("button", {
      type: "submit",
      class: "primary",
      text: t("newGroup"),
    });
    create.disabled = blocked;
    form.append(
      h("label", { text: t("groupName") }, [name]),
      h("label", { text: t("folderParent") }, [parent]),
      h("div", { class: "group-editor-actions" }, [create]),
    );
    form.onsubmit = (event) => {
      event.preventDefault();
      if (libraryBlocked(panel) || !form.reportValidity()) return;
      panel.action(async () => {
        await panel.c.update("group-write", {
          name: name.value,
          parentId: panel.groupCreateParent || null,
        });
        panel.groupCreateDraft = "";
        panel.manageGroups = panel.groupManagerCreate = false;
        panel.libraryFocus =
          panel.libraryDialogReturnFocus || "explorer-create-folder";
      })();
    };
    root.append(form);
    return root;
  }

  const search = h("input", {
    type: "search",
    value: panel.groupManagerQuery || "",
    "aria-label": t("searchGroups"),
    placeholder: t("searchGroups"),
    "data-library-focus": "group-manager-search",
  });
  search.disabled = blocked;
  const create = panel.button(t("newGroup"), () => {
    panel.groupManagerCreate = true;
    panel.groupCreateParent = Object.hasOwn(
      current.groups,
      panel.groupManagerSelected,
    )
      ? panel.groupManagerSelected
      : "";
    panel.libraryFocus = "new-folder-name";
  });
  create.prepend(icon("plus"));
  const list = h("div", {
    class: "group-list",
    role: "listbox",
    "aria-label": t("manageGroups"),
  });
  const pages = h("div");
  const paint = () => {
    const query = (panel.groupManagerQuery || "")
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase();
    const groups = allFolders.filter(([, path]) =>
      path.normalize("NFKC").toLocaleLowerCase().includes(query),
    );
    const page = paginationState(groups.length, panel.groupManagerPage, 12);
    panel.groupManagerPage = page.page;
    list.replaceChildren();
    for (const [id, path] of groups.slice(page.start, page.end)) {
      const row = h(
        "button",
        {
          type: "button",
          class: "group-list-row",
          role: "option",
          "aria-selected": String(panel.groupManagerSelected === id),
          "data-library-focus": "folder-manager-" + id,
          onclick: () => {
            if (libraryBlocked(panel)) return;
            panel.groupManagerSelected = id;
            panel.groupDelete = null;
            paint();
            editFolder();
            restoreLibraryFocus(root, "folder-manager-" + id);
          },
        },
        [
          icon("folder"),
          h("span", { class: "group-list-label" }, [
            h("strong", { text: current.groups[id] }),
            h("span", { class: "muted", text: path }),
          ]),
          icon("chevron"),
        ],
      );
      row.disabled = blocked;
      list.append(row);
    }
    if (!groups.length)
      list.append(h("p", { class: "muted", text: t("noGroups") }));
    pages.replaceChildren(
      libraryPagination(panel, {
        total: groups.length,
        page: page.page,
        pageSize: 12,
        key: "group-manager",
        label: t("groupPages"),
        compact: true,
        onPage: (value, focus) => {
          panel.groupManagerPage = value;
          paint();
          restoreLibraryFocus(root, focus);
        },
      }),
    );
  };
  search.addEventListener("input", () => {
    panel.groupManagerQuery = search.value;
    panel.groupManagerPage = 0;
    paint();
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.preventDefault();
  });
  list.addEventListener("keydown", (event) => {
    if (
      libraryBlocked(panel) ||
      !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
    )
      return;
    const buttons = [...list.querySelectorAll("button")];
    const at = buttons.indexOf(event.target);
    if (at < 0) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : Math.max(
              0,
              Math.min(
                buttons.length - 1,
                at + (event.key === "ArrowDown" ? 1 : -1),
              ),
            );
    buttons[next].focus();
  });
  root.append(
    h("div", { class: "group-manager-tools" }, [search, create]),
    h("div", { class: "group-manager-layout" }, [
      h("div", { class: "group-manager-browser" }, [list, pages]),
      editor,
    ]),
  );
  paint();
  editFolder();
  return root;
}

export async function writeOrganizationBatch(panel, ids, change) {
  const data = organization(panel);
  const selected = [...new Set(ids)].filter((id) =>
    Object.hasOwn(panel.c.summary.themes, id),
  );
  if (!selected.length) return;
  if (selected.length > 2048) throw Error(t("batchSizeLimit"));
  if (
    Object.hasOwn(change, "groupId") &&
    change.groupId &&
    !Object.hasOwn(data.groups, change.groupId)
  )
    throw Error(t("batchMissingGroup"));
  const tags = (change.addTags || []).map((tag) => tag.trim()).filter(Boolean);
  if (tags.some((tag) => tag.length > 48 || /[\u0000-\u001f\u007f]/u.test(tag)))
    throw Error(t("batchTagLength"));
  // Validate every patch before the first write. Adding tags preserves each
  // theme's existing tags and respects the native store's 24-tag limit.
  const changes = selected.map((id) => {
    const metadata = {};
    for (const key of ["favorite", "groupId"])
      if (Object.hasOwn(change, key)) metadata[key] = change[key];
    if (tags.length) {
      const merged = new Map();
      for (const tag of [...(data.themes[id]?.tags || []), ...tags]) {
        const key = tag.toLocaleLowerCase();
        if (!merged.has(key)) merged.set(key, tag);
      }
      if (merged.size > 24)
        throw Error(
          t("batchTagLimit", { name: panel.c.summary.themes[id].name }),
        );
      metadata.tags = [...merged.values()];
    }
    return { id, metadata };
  });
  if (changes.every(({ metadata }) => !Object.keys(metadata).length)) return;
  const payload = JSON.stringify({
    contractVersion: 1,
    sessionId: panel.c.sessionId,
    requestId: String((panel.c.next || 0) + 1),
    op: "organization-batch",
    changes,
  });
  if (new TextEncoder().encode(payload).byteLength > 4 * 1024 * 1024)
    throw Error(t("batchPayloadLimit"));
  panel.batchProgress = { count: 0, total: changes.length };
  panel.render();
  let recovered = false;
  try {
    try {
      panel.c.summary = await panel.c.request("organization-batch", {
        changes,
      });
    } catch (error) {
      // A missing response can follow a successful atomic write. Refresh and
      // verify actual metadata instead of replaying or assuming a partial save.
      try {
        panel.c.summary = await panel.c.request("list");
      } catch {
        throw Error(t("batchUncertain", { error: error.message }));
      }
      const saved = changes.every(({ id, metadata }) => {
        const current = organization(panel).themes[id] || {};
        return Object.entries(metadata).every(([key, value]) => {
          if (key === "groupId")
            return (current.groupId || null) === (value || null);
          if (key === "tags")
            return JSON.stringify(current.tags || []) === JSON.stringify(value);
          return current[key] === value;
        });
      });
      if (!saved) {
        panel.c.render();
        throw Error(
          t("batchFailed", {
            count: 0,
            total: changes.length,
            error: error.message,
          }),
        );
      }
      recovered = true;
    }
    panel.c.render();
    panel.message = t(recovered ? "batchRecovered" : "batchSaved", {
      count: changes.length,
    });
  } finally {
    panel.batchProgress = null;
  }
}

export function batchSelection(panel, pageEntries, matchingEntries) {
  const selection = panel.librarySelection;
  const root = h("div", {
    class: "batch-selection-bar",
    "aria-label": t("selectThemes"),
  });
  const allPageSelected =
    pageEntries.length > 0 && pageEntries.every(([id]) => selection.has(id));
  const matchingIds = new Set(matchingEntries.map(([id]) => id));
  const hidden = [...selection].filter((id) => !matchingIds.has(id)).length;
  const selected = h("span", {
    text: t("selectedCount", { count: selection.size }),
    role: "status",
  });
  const selectPage = panel.button(
    t(allPageSelected ? "deselectPage" : "selectPage"),
    () => {
      for (const [id] of pageEntries) {
        if (allPageSelected) selection.delete(id);
        else selection.add(id);
      }
    },
    !pageEntries.length,
  );
  const choices = h("details", { class: "library-selection-menu" });
  choices.append(
    h("summary", { "aria-label": t("selectThemes") }, [icon("chevron")]),
    h("div", { class: "library-selection-panel" }, [
      panel.button(
        t("selectResults", { count: matchingEntries.length }),
        () => {
          for (const [id] of matchingEntries) selection.add(id);
        },
        !matchingEntries.length ||
          matchingEntries.every(([id]) => selection.has(id)),
      ),
      panel.button(
        t("clearSelection"),
        () => selection.clear(),
        !selection.size,
      ),
    ]),
  );
  const organize = panel.button(
    t("batchOrganization"),
    () => {
      panel.batchOrganizationOpen = true;
      panel.libraryDialogReturnFocus = "batch-organize";
      panel.libraryFocus = "batch-group-summary";
    },
    !selection.size,
  );
  organize.className = "primary";
  organize.setAttribute("data-library-focus", "batch-organize");
  const close = panel.button("", () => {
    panel.librarySelectionMode = panel.batchOrganizationOpen = false;
    panel.libraryFocus = "library-options";
  });
  close.className = "icon-button";
  close.setAttribute("aria-label", t("close"));
  close.append(icon("close"));
  root.append(selected, selectPage, choices, organize, close);
  if (hidden)
    root.append(
      h("span", {
        class: "selection-outside muted",
        text: t("hiddenSelection", { count: hidden }),
      }),
    );
  return root;
}

export function batchOrganization(panel, _pageEntries, matchingEntries) {
  const selection = panel.librarySelection;
  const root = h("div", {
    class: "batch-organization",
    "aria-label": t("batchOrganization"),
  });
  const matchingIds = new Set(matchingEntries.map(([id]) => id));
  const hidden = [...selection].filter((id) => !matchingIds.has(id)).length;
  root.append(
    h("strong", { text: t("selectedCount", { count: selection.size }) }),
  );
  if (hidden)
    root.append(
      h("p", { class: "muted", text: t("hiddenSelection", { count: hidden }) }),
    );
  const run = (change) => writeOrganizationBatch(panel, [...selection], change);
  const favorite = panel.button(
    t("batchFavorite"),
    () => run({ favorite: true }),
    !selection.size,
  );
  const unfavorite = panel.button(
    t("batchUnfavorite"),
    () => run({ favorite: false }),
    !selection.size,
  );
  panel.batchGroupPicker ??= {};
  const group = searchablePicker(panel, {
    key: "batch-group",
    label: t("group"),
    options: folderOptions(
      organization(panel).groups,
      organization(panel).groupParents || {},
    ),
    value: panel.batchGroup || "",
    emptyLabel: t("ungrouped"),
    state: panel.batchGroupPicker,
    onChange: (value) => {
      panel.batchGroup = value;
    },
  });
  const move = panel.button(
    t("batchMove"),
    () => run({ groupId: panel.batchGroup || null }),
    !selection.size,
  );
  const tags = h("textarea", {
    rows: 2,
    maxLength: 1200,
    "aria-label": t("batchAddTags"),
    placeholder: t("batchTagsPlaceholder"),
  });
  tags.value = panel.batchTagsDraft || "";
  tags.addEventListener("input", () => {
    panel.batchTagsDraft = tags.value;
  });
  const add = panel.button(
    t("batchAddTags"),
    () => {
      const labels = tags.value
        .split(/\r?\n/u)
        .map((tag) => tag.trim())
        .filter(Boolean);
      if (!labels.length) throw Error(t("batchNoTags"));
      return run({ addTags: labels });
    },
    !selection.size,
  );
  tags.disabled = !!panel.busy;
  const advanced = h("details", { class: "batch-more-actions" });
  advanced.append(
    h("summary", { text: t("libraryOptions") }),
    h("div", { class: "batch-advanced" }, [
      h("div", { class: "row" }, [favorite, unfavorite]),
      h("div", { class: "batch-tags row" }, [tags, add]),
    ]),
  );
  root.append(
    h("div", { class: "batch-group" }, [group, move]),
    advanced,
    h("p", { class: "muted", text: t("batchHint") }),
  );
  if (panel.batchProgress)
    root.append(
      h("output", {
        role: "status",
        "data-batch-progress": "",
        text: t("batchProgress", {
          count: panel.batchProgress.count,
          total: panel.batchProgress.total,
        }),
      }),
    );
  return root;
}
