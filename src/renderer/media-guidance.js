import { assetGuidance } from "../core/media-guidance.js";
import { h } from "./components.js";
import { t } from "./messages.js";
export function assetGuidanceUi(panel, layer) {
  const target = (panel.c.targets || []).find(
    (target) =>
      target.target === panel.target &&
      (!panel.targetItem || target.item === panel.targetItem),
  );
  const guidance = assetGuidance(
    panel.target || "main.surface",
    layer,
    target?.el.getBoundingClientRect(),
  );
  return h("aside", { class: "asset-guidance" }, [
    h("strong", {
      text: t("assetRecommended", {
        size: guidance.recommended,
        ratio: guidance.aspect,
      }),
    }),
    ...(guidance.measured
      ? [
          h("span", {
            text: t("assetCurrent", {
              width: guidance.width,
              height: guidance.height,
            }),
          }),
        ]
      : []),
    h("span", { text: t("assetAnimated", { size: guidance.gif }) }),
    h("span", { text: t("assetFitHint") }),
  ]);
}
