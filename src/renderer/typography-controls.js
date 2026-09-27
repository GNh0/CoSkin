import { h } from "./components.js";
import { t } from "./messages.js";
export function typographyControls(panel) {
  const automatic = h("input", {
    type: "checkbox",
    "aria-label": t("autoTextColor"),
  });
  automatic.checked = !!panel.doc.theme.autoTextColor;
  automatic.onchange = panel.action(async () => {
    panel.change(
      () => {
        panel.doc.theme.autoTextColor = automatic.checked;
        panel.doc.manifest.engine.minVersion = "0.1.2";
      },
      { preview: panel.editing || panel.session.previewing },
    );
    if (!panel.editing) await panel.save();
    panel.render();
  });
  const family = h("input", {
    value: panel.doc.theme.fontFamily || "",
    maxLength: 80,
    list: "coskin-font-families",
    "aria-label": t("fontFamily"),
    placeholder: t("fontDefault"),
  });
  family.onchange = panel.action(async () => {
    panel.change(
      () => {
        if (family.value.trim())
          panel.doc.theme.fontFamily = family.value.trim();
        else delete panel.doc.theme.fontFamily;
        panel.doc.manifest.engine.minVersion = "0.1.2";
      },
      { preview: panel.editing || panel.session.previewing },
    );
    if (!panel.editing) await panel.save();
    panel.render();
  });
  const suggestions = h(
    "datalist",
    { id: "coskin-font-families" },
    [
      "Segoe UI",
      "Malgun Gothic",
      "Yu Gothic",
      "Microsoft YaHei",
      "Noto Sans KR",
    ].map((value) => h("option", { value })),
  );
  return h("div", { class: "typography-settings" }, [
    h("label", {}, [automatic, h("strong", { text: t("autoTextColor") })]),
    h("p", { class: "muted", text: t("autoTextHint") }),
    h("label", { class: "font-family-label", text: t("fontFamily") }),
    family,
    suggestions,
    h("p", { class: "muted", text: t("fontHint") }),
  ]);
}
