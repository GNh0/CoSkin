import { t } from "./messages.js";
import { h, busyImage, icon } from "./components.js";
import { mountPreview } from "./previews.js";
import { themeMetadata } from "./theme-metadata.js";
import { folderBrowser } from "./library-folders.js";
import { folderOptions } from "../core/library-folders.js";
import {
  explorerContents,
  navigateExplorer,
} from "../core/library-explorer.js";
import {
  explorerToolbar,
  explorerFolder,
  explorerIcon,
  explorerKeyboard,
  attachThemeDrag,
} from "./library-explorer.js";
import {
  filterLibrary,
  libraryFacets,
  libraryLabels,
  sortLibrary,
} from "../core/library-filter.js";
import {
  libraryPageSizes,
  paginateLibrary,
} from "../core/library-pagination.js";
import {
  libraryPagination,
  searchablePicker,
  restoreLibraryFocus,
} from "./library-controls.js";
import {
  organization,
  favoriteButton,
  groupManager,
  batchOrganization,
} from "./library-organization.js";
export function galleryPage(panel, section) {
  if (panel.metadataMode === "create") {
    section.append(themeMetadata(panel, true));
    return;
  }
  const importer = h("input", {
    type: "file",
    accept: ".coskin",
    id: "coskin-import",
    class: "visually-hidden",
    "aria-label": ".coskin " + t("import"),
  });
  importer.onchange = panel.action(
    () => importer.files[0] && panel.importFile(importer.files[0]),
  );
  const create = panel.button(t("create"), () => panel.create());
  create.className = "primary";
  const request = panel.button(t("requestTheme"), () => {
    panel.requestPromptOpen = !panel.requestPromptOpen;
  });
  request.setAttribute("aria-expanded", String(!!panel.requestPromptOpen));
  const close = panel.button("", () => panel.closePage());
  close.className = "icon-button";
  close.setAttribute("aria-label", t("close"));
  close.append(icon("close"));
  section.append(
    h("header", { class: "page-header" }, [
      h("div", {}, [
        h("span", { class: "brand", text: "✦ CoSkin" }),
        h("h1", { text: t("library") }),
        h("p", { text: t("tagline") }),
      ]),
      h("div", { class: "row" }, [
        create,
        panel.button(t("import"), () => importer.click()),
        request,
        importer,
        ...(panel.c.summary.runtimeSettingsAvailable
          ? [
              panel.button(t("control.runtimeTitle"), () =>
                panel.c.openSettings(),
              ),
            ]
          : []),
        close,
      ]),
    ]),
  );
  if (panel.requestPromptOpen) {
    const prompt = h("textarea", {
      "aria-label": t("requestPromptLabel"),
      spellcheck: "false",
    });
    prompt.value = panel.requestPromptDraft ?? t("requestPromptTemplate");
    prompt.addEventListener("input", () => {
      panel.requestPromptDraft = prompt.value;
    });
    const status = h("span", { role: "status", class: "muted" });
    const copy = h("button", { type: "button", text: t("copyPrompt") });
    copy.addEventListener("click", async () => {
      try {
        if (!navigator.clipboard?.writeText)
          throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(prompt.value);
        status.textContent = t("copiedPrompt");
      } catch {
        prompt.focus();
        prompt.select();
        let copied = false;
        try {
          copied = document.execCommand?.("copy") === true;
        } catch {
          // Leave the text selected so the user can copy it manually.
        }
        status.textContent = copied ? t("copiedPrompt") : t("copyPromptFailed");
      }
    });
    const reset = h("button", { type: "button", text: t("resetPrompt") });
    reset.addEventListener("click", () => {
      prompt.value = t("requestPromptTemplate");
      panel.requestPromptDraft = prompt.value;
      status.textContent = "";
    });
    section.append(
      h("div", { class: "request-prompt" }, [
        h("h2", { text: t("requestTheme") }),
        h("p", { text: t("requestPromptHint") }),
        prompt,
        h("div", { class: "row" }, [copy, reset, status]),
      ]),
    );
  }
  const data = organization(panel);
  const themes = panel.c.summary.themes;
  panel.folderIncludeChildren ??= false;
  panel.libraryView ??= "folders";
  panel.libraryDisplay ??= "preview";
  panel.explorerExpanded ??= new Set();
  panel.explorerSidebarOpen ??=
    !globalThis.matchMedia?.("(max-width: 600px)").matches;
  const facets = libraryFacets(themes, data);
  panel.librarySelection ??= new Set();
  for (const id of panel.librarySelection)
    if (!Object.hasOwn(themes, id)) panel.librarySelection.delete(id);
  panel.libraryPickers ??= {};
  for (const [key, values] of Object.entries(facets)) {
    const property = key === "tags" ? "tagFilter" : key + "Filter";
    if (panel[property] && !values.includes(panel[property]))
      panel[property] = "";
  }
  if (
    panel.groupFilter &&
    panel.groupFilter !== "all" &&
    panel.groupFilter !== "ungrouped" &&
    !data.groups[panel.groupFilter]
  )
    panel.groupFilter = "";
  const matching = sortLibrary(
    filterLibrary(themes, data, {
      query: panel.filter,
      favorites: panel.favoriteFilter,
      tag: panel.tagFilter,
      character: panel.characterFilter,
      skin: panel.skinFilter,
      type: panel.typeFilter,
    }),
    data,
    panel.librarySort,
  );
  const faceted = !!(
    panel.favoriteFilter ||
    panel.tagFilter ||
    panel.characterFilter ||
    panel.skinFilter ||
    panel.typeFilter
  );
  const model = explorerContents(themes, data, {
    entries: matching,
    location: panel.groupFilter,
    view: panel.libraryView,
    includeChildren: panel.folderIncludeChildren,
    expanded: panel.explorerExpanded,
    query: panel.filter,
    faceted,
    filtered: faceted || !!panel.filter,
  });
  const entries = model.themes;
  const pageSize = libraryPageSizes.includes(panel.libraryPageSize)
    ? panel.libraryPageSize
    : 24;
  const page = paginateLibrary(model.items, panel.page, pageSize);
  panel.page = page.page;
  const filter = (key, value, focus = key) => {
    panel[key] = value;
    panel.page = 0;
    panel.libraryScrollTop = 0;
    panel.libraryFocus = focus;
    panel.render();
  };
  const search = h("input", {
    type: "search",
    class: "search",
    placeholder: t("librarySearch"),
    "aria-label": t("librarySearch"),
    "data-library-focus": "filter",
    value: panel.filter || "",
  });
  search.onchange = () => {
    if (panel.filter !== search.value) filter("filter", search.value);
  };
  search.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    search.onchange();
  });
  const sort = h("select", {
    "aria-label": t("sortThemes"),
    "data-library-focus": "librarySort",
  });
  for (const [value, key] of [
    ["library", "sortLibrary"],
    ["name-asc", "sortNameAsc"],
    ["name-desc", "sortNameDesc"],
    ["favorites", "sortFavorites"],
    ["group", "sortGroup"],
  ])
    sort.append(h("option", { value, text: t(key) }));
  sort.value = panel.librarySort || "library";
  sort.onchange = () => filter("librarySort", sort.value);
  const size = h("select", {
    "aria-label": t("pageSize"),
    "data-library-focus": "libraryPageSize",
  });
  for (const value of libraryPageSizes)
    size.append(
      h("option", { value, text: t("pageSizeOption", { count: value }) }),
    );
  size.value = String(pageSize);
  size.onchange = () => {
    panel.libraryPageSize = Number(size.value);
    panel.page = Math.floor(page.start / panel.libraryPageSize);
    panel.libraryFocus = "libraryPageSize";
    panel.libraryScrollTop = 0;
    panel.render();
  };
  section.append(
    h("div", { class: "library-toolbar" }, [
      search,
      sort,
      size,
      panel.scope(),
      h("span", {
        class: "muted",
        text: t("resultCount", {
          count: entries.length,
          total: Object.keys(themes).length,
        }),
      }),
    ]),
  );
  const picker = (key, label, options, emptyLabel) => {
    panel.libraryPickers[key] ??= {};
    return searchablePicker(panel, {
      key,
      label,
      options,
      emptyLabel,
      value: panel[key] || "",
      state: panel.libraryPickers[key],
      onChange: (value, focus) =>
        key === "groupFilter"
          ? navigateExplorer(panel, value, focus)
          : filter(key, value, focus),
    });
  };
  const group = picker(
    "groupFilter",
    t("group"),
    [
      ["all", t("allGroups")],
      ["ungrouped", t("ungrouped")],
      ...folderOptions(data.groups, data.groupParents || {}),
    ],
    t("explorerHome"),
  );
  const tag = picker(
    "tagFilter",
    t("tags"),
    facets.tags.map((name) => [name, name]),
    t("allTags"),
  );
  const favorites = panel.button(t("favorites"), () =>
    filter("favoriteFilter", !panel.favoriteFilter),
  );
  favorites.setAttribute("aria-pressed", String(!!panel.favoriteFilter));
  favorites.prepend(icon("star"));
  const selectionToggle = panel.button(t("selectThemes"), () => {
    panel.librarySelectionMode = !panel.librarySelectionMode;
  });
  selectionToggle.setAttribute(
    "aria-pressed",
    String(!!panel.librarySelectionMode),
  );
  section.append(
    h("div", { class: "library-filters" }, [
      favorites,
      group,
      tag,
      ...[
        ["character", "characterLabel"],
        ["skin", "skinLabel"],
        ["type", "themeTypeLabel"],
      ]
        .filter(([facet]) => facets[facet].length)
        .map(([facet, label]) =>
          picker(
            facet + "Filter",
            t(label),
            facets[facet].map((name) => [name, name]),
            t("allValues"),
          ),
        ),
      panel.button(t("manageGroups"), () => {
        panel.manageGroups = !panel.manageGroups;
      }),
      selectionToggle,
      ...(panel.favoriteFilter ||
      panel.tagFilter ||
      panel.characterFilter ||
      panel.skinFilter ||
      panel.typeFilter ||
      panel.filter
        ? [
            panel.button(t("clearFilters"), () => {
              panel.favoriteFilter = false;
              panel.tagFilter = panel.filter = "";
              panel.characterFilter = panel.skinFilter = panel.typeFilter = "";
              panel.page = 0;
              panel.libraryScrollTop = 0;
            }),
          ]
        : []),
    ]),
  );
  section.append(explorerToolbar(panel, model));
  if (panel.manageGroups) section.append(groupManager(panel));
  if (panel.librarySelectionMode)
    section.append(
      batchOrganization(
        panel,
        page.entries
          .filter((item) => item.kind === "theme")
          .map(({ id, entry }) => [id, entry]),
        entries,
      ),
    );
  const shell = h("div", {
    class: "library-explorer-shell",
    "data-sidebar": String(panel.explorerSidebarOpen !== false),
  });
  if (panel.explorerSidebarOpen !== false)
    shell.append(
      h(
        "aside",
        { class: "explorer-sidebar", "aria-label": t("folderNavigation") },
        [
          folderBrowser(panel, (value, focus) =>
            navigateExplorer(panel, value, focus),
          ),
        ],
      ),
    );
  const content = h("div", { class: "explorer-content" });
  shell.append(content);
  const pager = (position) =>
    libraryPagination(panel, {
      total: model.items.length,
      page: page.page,
      pageSize,
      key: "library-" + position,
      onPage: (value, focus) => {
        panel.page = value;
        panel.libraryScrollTop = 0;
        panel.libraryFocus = focus.replace("library-bottom", "library-top");
        panel.render();
      },
    });
  content.append(
    h("p", {
      class: "explorer-result muted",
      text: t("explorerResultCount", {
        folders: model.folders,
        themes: entries.length,
      }),
    }),
    pager("top"),
  );
  const grid = h("div", {
    class:
      "grid explorer-items" +
      (panel.libraryDisplay === "list" ? " explorer-list" : "") +
      (panel.libraryView === "tree" ? " explorer-tree" : ""),
    "aria-label": t("explorerContents"),
    ...(panel.libraryView === "tree" ? { role: "tree" } : {}),
  });
  explorerKeyboard(grid);
  for (const item of page.entries) {
    if (item.kind === "folder") {
      grid.append(explorerFolder(panel, item));
      continue;
    }
    const { id, entry } = item;
    const previewVisible = panel.libraryDisplay !== "list";
    const open = panel.action(async () => {
      await panel.load(id);
      panel.detail = true;
    });
    const scope = panel.scopeData();
    const scopeKey =
      scope.scope === "global" ? "global" : scope.scope + ":" + scope.contextId;
    const applied =
      panel.c.summary.enabled && panel.c.summary.bindings[scopeKey]?.id === id;
    const thumbnail = previewVisible ? busyImage() : null;
    const metadata = data.themes[id] || {};
    const labels = libraryLabels(entry, metadata);
    const body = h(
      "button",
      {
        type: "button",
        class: "card-body",
        onclick: open,
        "data-explorer-item": id,
        "data-library-focus": "theme-" + id,
        "aria-label": t("detail", { name: entry.name }),
      },
      [
        previewVisible ? thumbnail : explorerIcon(),
        h("div", { class: "card-info" }, [
          h("h3", { text: entry.name }),
          h("span", {
            class: "muted",
            text: applied
              ? t("applied")
              : previewVisible
                ? t("skin")
                : labels.type.join(" · ") || t("skin"),
          }),
          ...(previewVisible
            ? [
                h(
                  "div",
                  { class: "theme-labels" },
                  [
                    ["character", "characterLabel"],
                    ["skin", "skinLabel"],
                    ["type", "themeTypeLabel"],
                  ]
                    .filter(([key]) => labels[key].length)
                    .map(([key, message]) =>
                      h("span", {
                        text: t(message) + ": " + labels[key].join(" · "),
                      }),
                    ),
                ),
                h("div", { class: "theme-chips" }, [
                  ...(metadata.groupId && data.groups[metadata.groupId]
                    ? [
                        h("span", {
                          class: "group-chip",
                          text: data.groups[metadata.groupId],
                        }),
                      ]
                    : []),
                  ...(metadata.tags || [])
                    .slice(0, 3)
                    .map((name) => h("span", { text: name })),
                  ...((metadata.tags || []).length > 3
                    ? [h("span", { text: "+" + (metadata.tags.length - 3) })]
                    : []),
                ]),
              ]
            : []),
        ]),
      ],
    );
    const apply = panel.button(t("apply"), async () => {
      await panel.load(id);
      await panel.apply();
    });
    apply.className = applied ? "secondary" : "primary";
    const preview = panel.button(t("preview"), async () => {
      await panel.load(id);
      panel.startPreview();
    });
    preview.className = "secondary";
    const remove = panel.button("", () => (panel.deleteConfirm = id));
    remove.className = "icon-button";
    remove.append(icon("trash"));
    remove.setAttribute("aria-label", entry.name + " · " + t("delete"));
    const card = h(
      "article",
      {
        class:
          "skin-card" +
          (!previewVisible
            ? " explorer-row"
            : panel.libraryView === "tree"
              ? " explorer-tree-card"
              : ""),
        "aria-selected": String(panel.selected === id),
        "data-batch-selected": String(panel.librarySelection.has(id)),
        ...(panel.libraryView === "tree"
          ? { role: "treeitem", "aria-level": item.depth + 1 }
          : {}),
      },
      [
        favoriteButton(panel, id, entry.name),
        body,
        ...(previewVisible
          ? [h("div", { class: "card-actions" }, [apply, preview, remove])]
          : []),
      ],
    );
    if (panel.libraryView === "tree")
      card.style.paddingInlineStart = Math.min(item.depth, 12) * 14 + "px";
    attachThemeDrag(panel, card, id);
    if (panel.librarySelectionMode) {
      const check = h("input", {
        type: "checkbox",
        "aria-label": t("selectTheme", { name: entry.name }),
        "data-library-focus": "select-" + id,
      });
      check.checked = panel.librarySelection.has(id);
      check.disabled = !!panel.busy;
      check.onchange = () => {
        if (check.checked) panel.librarySelection.add(id);
        else panel.librarySelection.delete(id);
        panel.libraryFocus = "select-" + id;
        panel.render();
      };
      card.prepend(
        h(
          "label",
          {
            class: "card-selection",
            title: t("selectTheme", { name: entry.name }),
          },
          [check],
        ),
      );
    }
    grid.append(card);
    if (previewVisible) mountPreview(panel, thumbnail, id, entry.revision);
  }
  content.append(grid);
  if (!model.items.length)
    content.append(
      h("div", { class: "empty-state" }, [
        h("div", { class: "empty-icon", text: "✦", "aria-hidden": "true" }),
        h("h2", {
          text: Object.keys(panel.c.summary.themes).length
            ? panel.filter || faceted
              ? t("noResults")
              : t("explorerEmptyFolder")
            : t("empty"),
        }),
        h("p", {
          text: Object.keys(themes).length
            ? panel.filter || faceted
              ? t("noResultsHint")
              : t("explorerEmptyFolderHint")
            : t("emptyDescription"),
        }),
        ...(Object.keys(themes).length
          ? []
          : [panel.button(t("create"), () => panel.create())]),
      ]),
    );
  if (model.items.length > pageSize) content.append(pager("bottom"));
  section.append(shell);
  const focus = panel.libraryFocus;
  panel.libraryFocus = null;
  if (focus) queueMicrotask(() => restoreLibraryFocus(section, focus));
}
