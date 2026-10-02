import { h, icon } from "./components.js";
import { t } from "./messages.js";
import { text } from "./strings.js";
import {
  clearDetailDraft,
  detailDraft,
  updateDetailDraft,
} from "./detail-navigation.js";

export function themeMetadata(panel, creating = false) {
  const manifest = creating
    ? { name: "", description: "", author: { name: t("panel.user") } }
    : panel.doc.manifest;
  const baseline = {
    name: manifest.name,
    description: manifest.description || "",
    author: manifest.author.name,
  };
  const draft = (!creating && detailDraft(panel, "metadata")) || baseline;
  const root = h("form", {
    class: "theme-metadata panel-form panel-metadata-form",
  });
  const name = h("input", {
    value: draft.name,
    required: true,
    maxLength: 256,
    "aria-label": t("control.themeName"),
    placeholder: t("control.themeName"),
  });
  const description = h("textarea", {
    value: draft.description,
    maxLength: 4096,
    rows: 3,
    "aria-label": t("control.themeDescription"),
  });
  const author = h("input", {
    value: draft.author,
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
    if (!creating) clearDetailDraft(panel, "metadata");
    panel.metadataMode = null;
    panel.render();
  });
  root.append(h("div", { class: "panel-form-footer" }, [cancel, save]));
  const values = () => ({
    name: name.value,
    description: description.value,
    author: author.value,
  });
  const saveMetadata = async (input) => {
    if (!root.reportValidity()) return false;
    const saved = Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, value.trim()]),
    );
    if (!saved.name || !saved.author) return false;
    if (creating) await panel.create(saved);
    else {
      panel.change(
        () => {
          panel.doc.manifest.name = saved.name;
          if (saved.description)
            panel.doc.manifest.description = saved.description;
          else delete panel.doc.manifest.description;
          panel.doc.manifest.author.name = saved.author;
        },
        { preview: false },
      );
      await panel.save();
      clearDetailDraft(panel, "metadata", input);
    }
    return true;
  };
  if (!creating) {
    const track = () =>
      updateDetailDraft(panel, "metadata", values(), baseline, saveMetadata);
    for (const input of [name, description, author])
      input.addEventListener("input", track);
    track();
  }
  root.onsubmit = async (event) => {
    event.preventDefault();
    if (!root.reportValidity()) return;
    await panel.action(async () => {
      if (!(await saveMetadata(values()))) return;
      panel.metadataMode = null;
      panel.render();
    })();
  };
  return root;
}
