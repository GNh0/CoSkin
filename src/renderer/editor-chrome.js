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
        h("span", { class: "panel-eyebrow", text: "CoSkin · " + t("edit") }),
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
  const modes = [
    ["image", "control.imageTab", "image"],
    ["animation", "control.effectsTab", "sparkles"],
    ["opacity", "control.styleTab", "sliders"],
  ];
  const active =
    panel.activeSection === "icon" ? "image" : panel.activeSection || "image";
  const selectMode = (mode, focus = false) => {
    if (panel.busy || panel.c.externalApplying) return;
    if (panel.activeSection !== mode) {
      panel.activeSection = mode;
      if (mode === "animation") panel.state = "base";
      panel.render();
    }
    if (focus)
      panel.shadow?.querySelector("#coskin-inspector-tab-" + mode)?.focus();
  };
  modes.forEach(([mode, key, glyph], index) => {
    const button = h("button", {
      type: "button",
      id: "coskin-inspector-tab-" + mode,
      role: "tab",
      "aria-selected": String(active === mode),
      "aria-controls": "coskin-inspector-body",
      tabindex: active === mode ? "0" : "-1",
      onclick: () => selectMode(mode),
    });
    button.disabled = !!panel.busy;
    button.onkeydown = (event) => {
      const next =
        event.key === "ArrowRight"
          ? (index + 1) % modes.length
          : event.key === "ArrowLeft"
            ? (index + modes.length - 1) % modes.length
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? modes.length - 1
                : null;
      if (next === null) return;
      event.preventDefault();
      selectMode(modes[next][0], true);
    };
    button.append(icon(glyph), h("span", { text: t(key) }));
    tabs.append(button);
  });
  section.append(tabs);
  section.append(revisionStatusUi(panel));
}
export function inspectorPreview(panel, hash, options = {}) {
  const width = options.width || 256;
  const height = options.height || 160;
  const surface = h(
    "div",
    {
      class: "inspector-preview",
      "aria-label": t("previewAlt"),
      "aria-busy": "true",
    },
    [h("span", { class: "preview-placeholder", text: t("loadingPreview") })],
  );
  let disposed = false;
  panel.pageResources?.push(() => {
    disposed = true;
  });
  panel.c
    .loadMedia(hash)
    .then((media) => {
      if (disposed || !surface.isConnected) return;
      const canvas = h("canvas", {
        width,
        height,
        "aria-label": t("previewAlt"),
      });
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
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
      surface.setAttribute("aria-busy", "false");
    })
    .catch(() => {
      if (disposed || !surface.isConnected) return;
      surface.setAttribute("aria-busy", "false");
      surface.textContent = t("previewUnavailable");
    });
  return surface;
}
