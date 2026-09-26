import { t } from "./messages.js";
import { h, busyImage } from "./components.js";
import { mountPreview } from "./previews.js";
import { themeMetadata } from "./theme-metadata.js";
import { revisionStatusUi } from "./revision-status.js";
export function detailPage(panel, section) {
  const manifest = panel.doc.manifest;
  section.append(panel.button(t("back"), () => (panel.detail = false)));
  const preview = busyImage();
  preview.className = "detail-preview";
  mountPreview(panel, preview, panel.selected, panel.baseRevision, 1280);
  const apply = panel.button(t("apply"), () => panel.apply());
  apply.className = "primary";
  const info = h("div", { class: "detail-info" }, [
    h("span", { class: "brand", text: "CoSkin" }),
    h("h1", { text: manifest.name }),
    h("p", { text: manifest.description || t("description") }),
    revisionStatusUi(panel),
    h("div", { class: "detail-actions" }, [
      apply,
      panel.button(t("preview"), () => panel.startPreview()),
      panel.button(t("edit"), () => panel.enterEdit()),
      panel.button(t("control.themeInformation"), () => {
        panel.metadataMode = "edit";
        panel.render();
      }),
    ]),
    h("div", { class: "detail-meta" }, [
      h("p", { text: t("author", { name: manifest.author.name }) }),
      h("p", { text: panel.doc.theme.profiles.map((p) => p.name).join(" · ") }),
      h("p", {
        text: t("images", { count: Object.keys(panel.doc.assets).length }),
      }),
      h("div", { class: "detail-actions" }, [
        panel.button(t("export"), () => panel.export()),
        panel.button(t("duplicate"), async () => {
          const doc = structuredClone(panel.doc);
          doc.manifest.id = "local." + crypto.randomUUID();
          doc.manifest.name += " " + t("duplicate");
          await panel.c.update("create", { document: doc });
          await panel.load(doc.manifest.id);
        }),
        panel.button(t("delete"), () => (panel.deleteConfirm = panel.selected)),
      ]),
    ]),
  ]);
  section.append(h("div", { class: "detail-layout" }, [preview, info]));
  if (panel.metadataMode === "edit") section.append(themeMetadata(panel));
}
