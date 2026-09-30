import { t } from "./messages.js";
import { h, busyImage } from "./components.js";
import { mountPreview } from "./previews.js";
import { themeMetadata } from "./theme-metadata.js";
import { revisionStatusUi } from "./revision-status.js";
import { organizationForm } from "./library-organization.js";
import { typographyControls } from "./typography-controls.js";
export function detailPage(panel, section) {
  const manifest = panel.doc.manifest;
  const page = h("div", { class: "panel-page panel-detail-page" });
  const back = panel.button(t("back"), () => (panel.detail = false));
  back.className = "panel-back";
  page.append(
    h("header", { class: "panel-topbar" }, [
      back,
      h("span", { class: "panel-eyebrow", text: "CoSkin" }),
    ]),
  );
  const preview = busyImage();
  preview.className = "detail-preview";
  mountPreview(panel, preview, panel.selected, panel.baseRevision, 1280);
  const apply = panel.button(t("apply"), () => panel.apply());
  apply.className = "primary";
  const info = h("div", { class: "detail-info" }, [
    h("div", { class: "panel-card detail-summary" }, [
      h("span", {
        class: "panel-eyebrow",
        text: t("control.themeInformation"),
      }),
      h("h1", { text: manifest.name }),
      h("p", {
        class: "detail-description",
        text: manifest.description || t("description"),
      }),
      revisionStatusUi(panel),
      h("div", { class: "detail-actions detail-primary-actions" }, [
        apply,
        panel.button(t("preview"), () => panel.startPreview()),
        panel.button(t("edit"), () => panel.enterEdit()),
        panel.button(t("control.themeInformation"), () => {
          panel.metadataMode = "edit";
          panel.render();
        }),
      ]),
      h("div", { class: "detail-meta" }, [
        h("ul", { class: "detail-facts" }, [
          h("li", { text: t("author", { name: manifest.author.name }) }),
          h("li", {
            text: panel.doc.theme.profiles.map((p) => p.name).join(" · "),
          }),
          h("li", {
            text: t("images", { count: Object.keys(panel.doc.assets).length }),
          }),
        ]),
        h("div", { class: "detail-actions detail-management-actions" }, [
          panel.button(t("export"), () => panel.export()),
          panel.button(t("duplicate"), async () => {
            const doc = structuredClone(panel.doc);
            doc.manifest.id = "local." + crypto.randomUUID();
            doc.manifest.name += " " + t("duplicate");
            await panel.c.update("create", { document: doc });
            await panel.load(doc.manifest.id);
          }),
          Object.assign(
            panel.button(
              t("delete"),
              () => (panel.deleteConfirm = panel.selected),
            ),
            { className: "panel-danger-action" },
          ),
        ]),
      ]),
    ]),
  ]);
  const media = h("div", { class: "panel-card detail-media-card" }, [
    h("div", { class: "panel-card-heading" }, [
      h("h2", { text: t("preview") }),
    ]),
    preview,
  ]);
  page.append(h("div", { class: "detail-layout" }, [media, info]));
  info.append(organizationForm(panel));
  info.append(typographyControls(panel));
  if (panel.metadataMode === "edit") page.append(themeMetadata(panel));
  section.append(page);
}
