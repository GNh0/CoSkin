import { t } from "./messages.js";
import { h, busyImage, icon } from "./components.js";
import { mountPreview } from "./previews.js";
import { themeMetadata } from "./theme-metadata.js";
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
  const entries = Object.entries(panel.c.summary.themes).filter(
    ([, entry]) =>
      !panel.filter ||
      entry.name.toLocaleLowerCase().includes(panel.filter.toLocaleLowerCase()),
  );
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
  const page = panel.page || 0;
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
      [body, h("div", { class: "card-actions" }, [apply, preview, remove])],
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
          text: panel.filter ? t("noResults") : t("empty"),
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
