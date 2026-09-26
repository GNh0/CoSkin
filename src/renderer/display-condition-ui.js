import { resolve } from "../core/engine.ts";
import { editableState } from "../core/edit-state.ts";
import { inheritImageAppearance } from "../core/image-inheritance.ts";
import { h } from "./components.js";
import { t } from "./messages.js";

export function displayConditionUi(panel) {
  const profile = panel.doc.theme.profiles.find(
    (profile) => profile.id === panel.profile,
  );
  const overrides = panel.doc.localOverrides?.[panel.profile] || [];
  const profiles = [profile, { id: "local", name: "local", rules: overrides }];
  const item = panel.targetItem || panel.pickedItem || null;
  const layer =
    panel.selectedLayer ||
    (panel.target.startsWith("navigation.") ? "icon" : "background");
  const base = resolve(profiles, panel.target, item, {}).style?.[layer];
  const candidate = ["hover", "selected", "selectedHover"]
    .map(
      (state) =>
        resolve(
          profiles,
          panel.target,
          item,
          state === "selectedHover"
            ? { selected: true, hover: true }
            : { [state]: true },
        ).style?.[layer],
    )
    .find((style) => style?.image);
  if (base?.image) {
    const count = inheritImageAppearance(
      panel.doc,
      panel.profile,
      panel.target,
      panel.targetItem || null,
      layer,
      base,
    );
    const opacityCount = inheritImageAppearance(
      panel.doc,
      panel.profile,
      panel.target,
      panel.targetItem || null,
      layer,
      base,
      false,
      true,
    );
    if (!count && !opacityCount) return null;
    return h("div", { class: "display-condition-notice" }, [
      h("small", { text: t("control.imageAppearanceConflict") }),
      panel.button(t("control.inheritImageAppearance"), () => {
        panel.change(
          () =>
            inheritImageAppearance(
              panel.doc,
              panel.profile,
              panel.target,
              panel.targetItem || null,
              layer,
              base,
              true,
            ),
          { clearAllExceptions: false },
        );
        panel.render();
      }),
      panel.button(t("control.inheritImageOpacity"), () => {
        panel.change(
          () =>
            inheritImageAppearance(
              panel.doc,
              panel.profile,
              panel.target,
              panel.targetItem || null,
              layer,
              base,
              true,
              true,
            ),
          { clearAllExceptions: false },
        );
        panel.render();
      }),
    ]);
  }
  if (!candidate?.image) return null;
  return h("div", { class: "display-condition-notice" }, [
    h("small", { text: t("control.conditionalImage") }),
    panel.button(t("control.showImageAlways"), () => {
      panel.change(
        () => {
          const state = editableState(
            panel.doc,
            panel.profile,
            panel.target,
            panel.targetItem || null,
            "base",
          );
          state.style ??= {};
          state.style[layer] = structuredClone(candidate);
          if (!panel.targetItem)
            for (const rule of overrides.filter(
              (rule) => rule.target === panel.target,
            ))
              delete rule.states.base;
        },
        { state: "base" },
      );
      panel.state = "base";
      panel.c.render();
      panel.render();
    }),
  ]);
}
