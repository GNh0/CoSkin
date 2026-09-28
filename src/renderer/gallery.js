import { t } from "./messages.js";
import { h, busyImage, icon } from "./components.js";
import { mountPreview } from "./previews.js";
import { themeMetadata } from "./theme-metadata.js";
import { filterLibrary } from "../core/library-filter.js";
import {
  organization,
  favoriteButton,
  groupManager,
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
  const tags = [
    ...new Set(Object.values(data.themes).flatMap((theme) => theme.tags || [])),
  ].sort((a, b) => a.localeCompare(b));
  if (panel.tagFilter && !tags.includes(panel.tagFilter)) panel.tagFilter = "";
  if (
    panel.groupFilter &&
    panel.groupFilter !== "ungrouped" &&
    !data.groups[panel.groupFilter]
  )
    panel.groupFilter = "";
  const entries = filterLibrary(panel.c.summary.themes, data, {
    query: panel.filter,
    favorites: panel.favoriteFilter,
    group: panel.groupFilter,
    tag: panel.tagFilter,
  });
  const filter = (key, value) => {
    panel[key] = value;
    panel.page = 0;
    panel.render();
  };
  const search = h("input", {
    type: "search",
    class: "search",
    placeholder: t("search"),
    "aria-label": t("search"),
    value: panel.filter || "",
  });
  search.onchange = () => {
    panel.filter = search.value;
    panel.page = 0;
    panel.render();
  };
  section.append(
    h("div", { class: "library-toolbar" }, [
      search,
      panel.scope(),
      h("span", {
        class: "muted",
        text: t("count", { count: entries.length }),
      }),
    ]),
  );
  const group = h("select", { "aria-label": t("filterGroup") });
  group.append(
    h("option", { value: "", text: t("allGroups") }),
    h("option", { value: "ungrouped", text: t("ungrouped") }),
  );
  for (const [id, name] of Object.entries(data.groups))
    group.append(h("option", { value: id, text: name }));
  group.value = panel.groupFilter || "";
  group.onchange = () => filter("groupFilter", group.value);
  const tag = h("select", { "aria-label": t("filterTag") });
  tag.append(h("option", { value: "", text: t("allTags") }));
  for (const name of tags) tag.append(h("option", { value: name, text: name }));
  tag.value = panel.tagFilter || "";
  tag.onchange = () => filter("tagFilter", tag.value);
  const favorites = panel.button(t("favorites"), () =>
    filter("favoriteFilter", !panel.favoriteFilter),
  );
  favorites.setAttribute("aria-pressed", String(!!panel.favoriteFilter));
  favorites.prepend(icon("star"));
  section.append(
    h("div", { class: "library-filters" }, [
      favorites,
      group,
      tag,
      panel.button(t("manageGroups"), () => {
        panel.manageGroups = !panel.manageGroups;
      }),
      ...(panel.favoriteFilter ||
      panel.groupFilter ||
      panel.tagFilter ||
      panel.filter
        ? [
            panel.button(t("clearFilters"), () => {
              panel.favoriteFilter = false;
              panel.groupFilter = panel.tagFilter = panel.filter = "";
              panel.page = 0;
            }),
          ]
        : []),
    ]),
  );
  if (panel.manageGroups) section.append(groupManager(panel));
  const page = Math.min(
    panel.page || 0,
    Math.max(0, Math.ceil(entries.length / 24) - 1),
  );
  panel.page = page;
  const grid = h("div", { class: "grid" });
  for (const [id, entry] of entries.slice(page * 24, page * 24 + 24)) {
    const open = panel.action(async () => {
      await panel.load(id);
      panel.detail = true;
    });
    const scope = panel.scopeData();
    const scopeKey =
      scope.scope === "global" ? "global" : scope.scope + ":" + scope.contextId;
    const applied =
      panel.c.summary.enabled && panel.c.summary.bindings[scopeKey]?.id === id;
    const thumbnail = busyImage();
    const metadata = data.themes[id] || {};
    const body = h(
      "button",
      {
        type: "button",
        class: "card-body",
        onclick: open,
        "aria-label": t("detail", { name: entry.name }),
      },
      [
        thumbnail,
        h("div", { class: "card-info" }, [
          h("h3", { text: entry.name }),
          h("span", {
            class: "muted",
            text: applied ? t("applied") : t("skin"),
          }),
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
      { class: "skin-card", "aria-selected": String(panel.selected === id) },
      [
        favoriteButton(panel, id, entry.name),
        body,
        h("div", { class: "card-actions" }, [apply, preview, remove]),
      ],
    );
    grid.append(card);
    mountPreview(panel, thumbnail, id, entry.revision);
  }
  section.append(grid);
  if (!entries.length)
    section.append(
      h("div", { class: "empty-state" }, [
        h("div", { class: "empty-icon", text: "✦", "aria-hidden": "true" }),
        h("h2", {
          text: Object.keys(panel.c.summary.themes).length
            ? t("noResults")
            : t("empty"),
        }),
        h("p", { text: t("emptyDescription") }),
        panel.button(t("create"), () => panel.create()),
      ]),
    );
  if (entries.length > 24)
    section.append(
      h("nav", { class: "pagination", "aria-label": t("pages") }, [
        panel.button(
          t("previous"),
          () => (panel.page = Math.max(0, page - 1)),
          page === 0,
        ),
        h("span", { text: page + 1 + " / " + Math.ceil(entries.length / 24) }),
        panel.button(
          t("next"),
          () => (panel.page = page + 1),
          (page + 1) * 24 >= entries.length,
        ),
      ]),
    );
}
