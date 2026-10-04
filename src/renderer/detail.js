import { t } from "./messages.js";
import { h, busyImage } from "./components.js";
import { mountPreview } from "./previews.js";
import { themeMetadata } from "./theme-metadata.js";
import { revisionStatusUi } from "./revision-status.js";
import { organizationForm } from "./library-organization.js";
import { typographyControls } from "./typography-controls.js";
import { mediaBadge } from "./theme-media-info.js";
import { appearanceText } from "./appearance-messages.js";
import {
  backgroundExportForm,
  backgroundExportText,
} from "./background-export.js";
import {
  detailNavigationBar,
  detailNavigationPrompt,
} from "./detail-navigation.js";
export function detailPage(panel, section) {
  const manifest = panel.doc.manifest;
  const page = h("div", { class: "panel-page panel-detail-page" });
  const back = panel.button(t("back"), () => (panel.detail = false));
  back.className = "panel-back";
  page.append(
    h("header", { class: "panel-topbar" }, [
      back,
      h("span", { class: "panel-eyebrow", text: "CoSkin" }),
      detailNavigationBar(panel),
      ...(panel.c.summary.backgroundExportAvailable
        ? [
            panel.button(backgroundExportText("downloads"), () => {
              panel.downloadsOpen = true;
            }),
          ]
        : []),
    ]),
  );
  const navigationPrompt = detailNavigationPrompt(panel);
  if (navigationPrompt) page.append(navigationPrompt);
  const preview = busyImage();
  preview.className = "detail-preview";
  const factBadge = mediaBadge(
    panel,
    panel.selected,
    panel.baseRevision,
    panel.profile,
  );
  const previewBadge = mediaBadge(
    panel,
    panel.selected,
    panel.baseRevision,
    panel.profile,
  );
  mountPreview(panel, preview, panel.selected, panel.baseRevision, 1280, {
    onVisible: () => {
      factBadge.load();
      previewBadge.load();
    },
  });
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
          h("li", {}, [factBadge.element]),
          h("li", {
            text: appearanceText("assets", {
              count: Object.keys(panel.doc.assets).length,
            }),
          }),
        ]),
        h("div", { class: "detail-actions detail-management-actions" }, [
          panel.button(t("export"), () => panel.export()),
          ...(panel.c.summary.backgroundExportAvailable
            ? [
                panel.button(backgroundExportText("title"), () => {
                  panel.backgroundExportOpen = !panel.backgroundExportOpen;
                }),
              ]
            : []),
          panel.button(t("duplicate"), () => panel.duplicate()),
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
      previewBadge.element,
    ]),
    preview,
  ]);
  page.append(h("div", { class: "detail-layout" }, [media, info]));
  info.append(organizationForm(panel));
  info.append(typographyControls(panel));
  if (panel.backgroundExportOpen && panel.c.summary.backgroundExportAvailable)
    info.append(backgroundExportForm(panel));
  if (panel.metadataMode === "edit") page.append(themeMetadata(panel));
  section.append(page);
}
