import { h, icon } from "./components.js";
import { t } from "./messages.js";
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
  const groups = h("select", { "aria-label": t("group") });
  groups.append(h("option", { value: "", text: t("ungrouped") }));
  for (const [id, name] of Object.entries(data.groups))
    groups.append(h("option", { value: id, text: name }));
  groups.value = current.groupId || "";
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
          groupId: groups.value || null,
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
  });
  const create = h("button", {
    type: "submit",
    class: "primary",
    text: t("newGroup"),
  });
  create.disabled = panel.busy;
  form.append(name, create);
  form.onsubmit = (event) => {
    event.preventDefault();
    if (form.reportValidity())
      panel.action(() => panel.c.update("group-write", { name: name.value }))();
  };
  root.append(header, form);
  for (const [id, label] of Object.entries(organization(panel).groups)) {
    const row = h("form", { class: "group-row" });
    const field = h("input", {
      value: label,
      required: "",
      maxLength: 64,
      "aria-label": t("groupName"),
    });
    const rename = h("button", { type: "submit", text: t("renameGroup") });
    rename.disabled = panel.busy;
    row.onsubmit = (event) => {
      event.preventDefault();
      if (row.reportValidity())
        panel.action(() =>
          panel.c.update("group-write", { groupId: id, name: field.value }),
        )();
    };
    row.append(
      field,
      rename,
      panel.button(t("delete"), () => {
        panel.groupDelete = id;
      }),
    );
    if (panel.groupDelete === id)
      row.append(
        h("div", { class: "group-delete-confirm" }, [
          h("span", { text: t("deleteGroupPrompt", { name: label }) }),
          panel.button(t("delete"), async () => {
            await panel.c.update("group-delete", { groupId: id });
            if (panel.groupFilter === id) panel.groupFilter = "";
            panel.groupDelete = null;
          }),
          panel.button(t("panel.cancel"), () => {
            panel.groupDelete = null;
          }),
        ]),
      );
    root.append(row);
  }
  return root;
}
