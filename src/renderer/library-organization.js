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
export function groupManager(panel) {
  if (
    panel.groupCreateParent &&
    !Object.hasOwn(organization(panel).groups, panel.groupCreateParent)
  )
    panel.groupCreateParent = "";
  const root = h("div", { class: "group-manager" });
  const header = h("div", { class: "group-manager-header" }, [
    h("h3", { text: t("manageGroups") }),
    panel.button(t("panel.cancel"), () => {
      panel.manageGroups = false;
      panel.groupDelete = null;
    }),
  ]);
  const form = h("form", { class: "group-create" });
  const name = h("input", {
    required: "",
    maxLength: 64,
    "aria-label": t("groupName"),
    placeholder: t("groupName"),
    value: panel.groupCreateDraft || "",
  });
  name.addEventListener("input", () => {
    panel.groupCreateDraft = name.value;
  });
  const create = h("button", {
    type: "submit",
    class: "primary",
    text: t("newGroup"),
  });
  create.disabled = panel.busy;
  panel.groupCreatePicker ??= {};
  const parent = searchablePicker(panel, {
    key: "new-folder-parent",
    label: t("folderParent"),
    emptyLabel: t("rootFolder"),
    options: folderOptions(
      organization(panel).groups,
      organization(panel).groupParents || {},
    ),
    value: panel.groupCreateParent || "",
    state: panel.groupCreatePicker,
    onChange: (value) => {
      panel.groupCreateParent = value;
    },
  });
  form.append(name, parent, create);
  form.onsubmit = (event) => {
    event.preventDefault();
    if (form.reportValidity())
      panel.action(async () => {
        await panel.c.update("group-write", {
          name: name.value,
          parentId: panel.groupCreateParent || null,
        });
        panel.groupCreateDraft = "";
      })();
  };
  const search = h("input", {
    type: "search",
    value: panel.groupManagerQuery || "",
    "aria-label": t("searchGroups"),
    placeholder: t("searchGroups"),
  });
  const list = h("div", { class: "group-list" });
  const pages = h("div");
  panel.groupNameDrafts ??= {};
  panel.groupParentDrafts ??= {};
  panel.groupParentPickers ??= {};
  const paint = () => {
    const query = (panel.groupManagerQuery || "")
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase();
    const current = organization(panel);
    const allFolders = folderOptions(
      current.groups,
      current.groupParents || {},
    );
    const index = folderIndex(current.groups, current.groupParents || {});
    const groups = allFolders
      .filter(([, name]) =>
        name.normalize("NFKC").toLocaleLowerCase().includes(query),
      )
      .sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }));
    const page = paginationState(groups.length, panel.groupManagerPage, 12);
    panel.groupManagerPage = page.page;
    list.replaceChildren();
    for (const [id, path] of groups.slice(page.start, page.end)) {
      const label = current.groups[id];
      const row = h("form", { class: "group-row" });
      const field = h("input", {
        value: panel.groupNameDrafts[id] ?? label,
        required: "",
        maxLength: 64,
        "aria-label": t("groupName"),
      });
      field.addEventListener("input", () => {
        panel.groupNameDrafts[id] = field.value;
      });
      const rename = h("button", { type: "submit", text: t("renameGroup") });
      rename.disabled = panel.busy;
      row.onsubmit = (event) => {
        event.preventDefault();
        if (row.reportValidity())
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
          })();
      };
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
      row.append(h("span", { class: "group-path muted", text: path }));
      row.append(
        field,
        parent,
        rename,
        panel.button(t("delete"), () => {
          panel.groupDelete = id;
        }),
      );
      if (panel.groupDelete === id)
        row.append(
          h("div", { class: "group-delete-confirm" }, [
            h("span", { text: t("deleteGroupPrompt", { name: path }) }),
            panel.button(t("delete"), async () => {
              await panel.c.update("group-delete", { groupId: id });
              if (panel.groupFilter === id) panel.groupFilter = "";
              delete panel.groupNameDrafts[id];
              delete panel.groupParentDrafts[id];
              panel.groupDelete = null;
            }),
            panel.button(t("panel.cancel"), () => {
              panel.groupDelete = null;
            }),
          ]),
        );
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
  root.append(header, form, search, list, pages);
  paint();
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

export function batchOrganization(panel, pageEntries, matchingEntries) {
  const selection = panel.librarySelection;
  const root = h("div", {
    class: "batch-organization",
    "aria-label": t("batchOrganization"),
  });
  const allPageSelected =
    pageEntries.length > 0 && pageEntries.every(([id]) => selection.has(id));
  const matchingIds = new Set(matchingEntries.map(([id]) => id));
  const hidden = [...selection].filter((id) => !matchingIds.has(id)).length;
  const selected = h("span", {
    text: t("selectedCount", { count: selection.size }),
    role: "status",
  });
  root.append(
    h("div", { class: "batch-selection row" }, [
      selected,
      panel.button(
        t(allPageSelected ? "deselectPage" : "selectPage"),
        () => {
          for (const [id] of pageEntries) {
            if (allPageSelected) selection.delete(id);
            else selection.add(id);
          }
        },
        !pageEntries.length,
      ),
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
  root.append(
    h("div", { class: "row" }, [favorite, unfavorite]),
    h("div", { class: "batch-group row" }, [group, move]),
    h("div", { class: "batch-tags row" }, [tags, add]),
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
