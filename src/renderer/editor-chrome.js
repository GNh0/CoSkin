import { h, icon } from "./components.js";
import { t } from "./messages.js";
import { targetLabels } from "./strings.js";
import { revisionStatusUi } from "./revision-status.js";
export function editorChrome(panel, section) {
  const close = panel.button("", () => (panel.host.hidden = true));
  close.className = "icon-button";
  close.setAttribute("aria-label", t("panel.closeSettings"));
  close.append(icon("close"));
  section.append(
    h("header", { class: "inspector-header" }, [
      h("div", {}, [
        h("span", { class: "muted", text: "CoSkin / " + t("edit") }),
        h("h2", { text: targetLabels[panel.target] || t("control.target") }),
        ...(["sidebar.project-row", "sidebar.thread-row"].includes(panel.target)
          ? []
          : [
              h("small", {
                class: "muted",
                text:
                  !panel.targetItem && panel.target === "sidebar.project-row"
                    ? t("control.allProjects")
                    : !panel.targetItem && panel.target === "sidebar.thread-row"
                      ? t("control.allChats")
                      : panel.targetTitle || "",
              }),
            ]),
      ]),
      close,
    ]),
  );
  const tabs = h("div", {
    class: "inspector-tabs",
    role: "tablist",
    "aria-label": t("panel.editorTitle"),
  });
  for (const [mode, key, glyph] of [
    ["image", "control.imageTab", "image"],
    ["animation", "control.effectsTab", "sparkles"],
    ["opacity", "control.styleTab", "sliders"],
  ]) {
    const button = panel.button("", () => {
      panel.activeSection = mode;
      if (mode === "animation") panel.state = "base";
      panel.render();
    });
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(panel.activeSection === mode));
    button.append(icon(glyph), h("span", { text: t(key) }));
    tabs.append(button);
  }
  section.append(tabs);
  section.append(revisionStatusUi(panel));
}
export function inspectorPreview(panel, hash, options = {}) {
  const width = options.width || 256;
  const height = options.height || 160;
  const surface = h("div", {
    class: "inspector-preview",
    "aria-label": t("previewAlt"),
  });
  panel.c
    .loadMedia(hash)
    .then((media) => {
      if (!surface.isConnected) return;
      const canvas = h("canvas", {
        width,
        height,
        "aria-label": t("previewAlt"),
      });
      const context = canvas.getContext("2d");
      context.globalAlpha = options.opacity ?? 1;
      const scale =
        options.fit === "cover"
          ? Math.max(width / media.width, height / media.height)
          : Math.min(width / media.width, height / media.height);
      context.drawImage(
        media.frames[0].image,
        (width - media.width * scale) / 2,
        (height - media.height * scale) / 2,
        media.width * scale,
        media.height * scale,
      );
      surface.replaceChildren(canvas);
    })
    .catch(() => {
      surface.textContent = t("loadingPreview");
    });
  return surface;
}
