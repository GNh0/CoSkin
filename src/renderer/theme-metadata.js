import { h, icon } from "./components.js";
import { t } from "./messages.js";
import { text } from "./strings.js";

export function themeMetadata(panel, creating = false) {
  const manifest = creating
    ? { name: "", description: "", author: { name: t("panel.user") } }
    : panel.doc.manifest;
  const root = h("form", {
    class: "theme-metadata panel-form panel-metadata-form",
  });
  const name = h("input", {
    value: manifest.name,
    required: true,
    maxLength: 256,
    "aria-label": t("control.themeName"),
    placeholder: t("control.themeName"),
  });
  const description = h("textarea", {
    value: manifest.description || "",
    maxLength: 4096,
    rows: 3,
    "aria-label": t("control.themeDescription"),
  });
  const author = h("input", {
    value: manifest.author.name,
    required: true,
    maxLength: 256,
    "aria-label": t("control.themeAuthor"),
  });
  root.append(
    h("header", { class: "panel-form-header" }, [
      h("span", { class: "panel-heading-mark", "aria-hidden": "true" }, [
        icon(creating ? "plus" : "sliders"),
      ]),
      h("div", {}, [
        h("span", { class: "panel-eyebrow", text: "CoSkin" }),
        h("h2", { text: t(creating ? "create" : "control.themeInformation") }),
      ]),
    ]),
    h("div", { class: "panel-form-fields" }, [
      h("label", { class: "panel-field" }, [
        h("span", { class: "panel-field-label", text: t("control.themeName") }),
        name,
      ]),
      h("label", { class: "panel-field" }, [
        h("span", {
          class: "panel-field-label",
          text: t("control.themeDescription"),
        }),
        description,
      ]),
      h("label", { class: "panel-field" }, [
        h("span", {
          class: "panel-field-label",
          text: t("control.themeAuthor"),
        }),
        author,
      ]),
    ]),
  );
  const save = h("button", {
    type: "submit",
    class: "primary",
    text: creating ? t("create") : text.save,
  });
  for (const input of [name, description, author])
    input.disabled = !!panel.busy;
  save.disabled = panel.busy;
  const cancel = panel.button(t("panel.cancel"), () => {
    panel.metadataMode = null;
    panel.render();
  });
  root.append(h("div", { class: "panel-form-footer" }, [cancel, save]));
  root.onsubmit = async (event) => {
    event.preventDefault();
    if (!root.reportValidity()) return;
    await panel.action(async () => {
      const values = {
        name: name.value.trim(),
        description: description.value.trim(),
        author: author.value.trim(),
      };
      if (!values.name || !values.author) return;
      if (creating) await panel.create(values);
      else {
        panel.change(
          () => {
            panel.doc.manifest.name = values.name;
            if (values.description)
              panel.doc.manifest.description = values.description;
            else delete panel.doc.manifest.description;
            panel.doc.manifest.author.name = values.author;
          },
          { preview: false },
        );
        await panel.save();
      }
      panel.metadataMode = null;
      panel.render();
    })();
  };
  return root;
}
