import { text } from "./strings.js";
import { h } from "./components.js";
import { t } from "./messages.js";
import { adoptUiStyles } from "./ui-styles.js";
export function createModeToolbar(panel, kind) {
  const host = h("div", {
    "data-coskin-ui": "",
    "data-mode": "toolbar",
    hidden: "",
    role: "region",
  });
  const shadow = host.attachShadow({ mode: "open" });
  adoptUiStyles(shadow);
  const status = h("div", { class: "mode-status" }, [
    h("span", { class: "mode-indicator", "aria-hidden": "true" }),
    h("span"),
  ]);
  const cancel = panel.button("", () =>
    kind === "editing" ? panel.exitEdit() : panel.endPreview(),
  );
  cancel.className = "secondary";
  const action = panel.button("", () =>
    kind === "editing" ? panel.save() : panel.apply(),
  );
  action.className = "primary";
  shadow.append(
    h("div", { class: "mode-toolbar" }, [
      status,
      h("div", { class: "mode-divider", "aria-hidden": "true" }),
      cancel,
      action,
    ]),
  );
  const update = () => {
    host.dataset.theme = document.documentElement.dataset.theme || "dark";
    const title = kind === "editing" ? t("panel.editorTitle") : t("preview");
    host.setAttribute("aria-label", "CoSkin " + title);
    status.lastElementChild.textContent = "CoSkin · " + title;
    cancel.textContent =
      kind === "editing" ? t("control.endEditing") : t("panel.cancelPreview");
    action.textContent = kind === "editing" ? text.save : t("apply");
    action.disabled = !!panel.busy || (kind === "editing" && !panel.dirty);
  };
  update();
  document.body.append(host);
  return { host, update };
}
