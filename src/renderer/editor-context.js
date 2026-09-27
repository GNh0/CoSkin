import { uploadFile } from "./file-transfer.js";
import { assetGuidanceUi } from "./media-guidance.js";
import { typographyControls } from "./typography-controls.js";
import { editorChrome, inspectorPreview } from "./editor-chrome.js";
import { t } from "./messages.js";
import { h, icon } from "./components.js";
import { text, layerLabels } from "./strings.js";
import { STATES } from "../core/engine.ts";
import { effectEditor } from "./effects-editor.js";
import { effectPresets } from "./effect-presets.js";
import { editorState } from "./editor-model.js";
import { motionPolicyUi } from "./motion-policy-ui.js";
import { targetScopeUi } from "./target-scope-ui.js";
import { displayConditionUi } from "./display-condition-ui.js";
import { editableState } from "../core/edit-state.ts";
export function editorContext(panel, inspectorRoot) {
  editorChrome(panel, inspectorRoot);
  const body = h("div", {
    class: "inspector-body",
    role: "tabpanel",
    id: "coskin-inspector-body",
  });
  inspectorRoot.append(body);
  const targetScope = targetScopeUi(panel);
  if (targetScope)
    inspectorRoot.querySelector(".inspector-header>div").append(targetScope);
  const conditionNotice = displayConditionUi(panel);
  const differences = conditionNotice
    ? h("details", { class: "inspector-differences" }, [
        h("summary", { text: t("control.imageDifferences") }),
        conditionNotice,
      ])
    : null;
  const selectors = h("div", { class: "inspector-selectors" });
  if (panel.activeSection !== "animation") body.append(selectors);
  const state = h("select", { "aria-label": t("control.displayCondition") });
  const labels = [
    t("control.alwaysShow"),
    t("control.selected"),
    t("control.onHover"),
    t("control.selectedHover"),
    t("control.focus"),
    t("control.pressed"),
    t("control.disabled"),
  ];
  STATES.forEach((s, i) =>
    state.append(h("option", { value: s, text: labels[i] })),
  );
  state.value = panel.state || "base";
  state.onchange = () => {
    panel.state = state.value;
    panel.render();
  };
  selectors.append(
    h("div", { class: "control-field" }, [
      h("label", { text: t("control.displayCondition") }),
      state,
    ]),
  );
  if (panel.activeSection !== "animation") {
    const layers = h("select", { "aria-label": t("control.layerChoose") });
    for (const [value, label] of Object.entries(layerLabels))
      if (panel.activeSection !== "icon" || value === "icon")
        layers.append(h("option", { value, text: label }));
    layers.value =
      panel.selectedLayer ||
      (panel.activeSection === "icon"
        ? "icon"
        : panel.target.startsWith("navigation.")
          ? "icon"
          : "background");
    layers.onchange = () => {
      panel.selectedLayer = layers.value;
      panel.render();
    };
    selectors.append(
      h("div", { class: "control-field" }, [
        h("label", { text: t("control.layer") }),
        layers,
      ]),
    );
  }
  const rules = panel.targetItem
    ? panel.doc.localOverrides?.[panel.profile] || []
    : panel.doc.theme.profiles.find((p) => p.id === panel.profile).rules;
  const data = rules.find(
    (r) =>
      r.target === (panel.target || "main.surface") &&
      (!panel.targetItem || r.item === panel.targetItem),
  )?.states[panel.state || "base"];
  for (const [layer, label] of Object.entries(layerLabels)) {
    if (panel.activeSection === "animation") continue;
    const chosen =
      panel.selectedLayer ||
      (panel.activeSection === "icon"
        ? "icon"
        : panel.target.startsWith("navigation.")
          ? "icon"
          : "background");
    if (layer !== chosen) continue;
    const current = editorState(panel).style?.[layer] || {};
    if (layer === "text") {
      const mode = h("select", { "aria-label": t("textColorMode") });
      for (const [value, label] of [
        ["theme", t("textColorTheme")],
        ["auto", t("autoTextColor")],
        ["manual", t("textColorManual")],
      ])
        mode.append(h("option", { value, text: label }));
      mode.value =
        current.autoColor === true
          ? "auto"
          : current.autoColor === false
            ? "manual"
            : "theme";
      mode.onchange = () => {
        panel.change(() => {
          const s = panel.rule();
          s.style ??= {};
          s.style.text ??= {};
          if (mode.value === "theme") delete s.style.text.autoColor;
          else s.style.text.autoColor = mode.value === "auto";
          panel.doc.manifest.engine.minVersion = "0.1.2";
        });
        panel.render();
      };
      const color = h("input", {
        type: "color",
        value: current.color || "#f0eef8",
        "aria-label": t("textColorManual"),
      });
      color.disabled =
        mode.value === "auto" ||
        (mode.value === "theme" && panel.doc.theme.autoTextColor);
      color.onchange = () => {
        panel.change(() => {
          const s = panel.rule();
          s.style ??= {};
          s.style.text ??= {};
          s.style.text.color = color.value;
          s.style.text.autoColor = false;
          panel.doc.manifest.engine.minVersion = "0.1.2";
        });
        panel.render();
      };
      body.append(h("label", { text: t("textColorMode") }), mode, color);
      const family = h("input", {
        value: current.family || "",
        maxLength: 80,
        "aria-label": t("fontFamily"),
        placeholder: t("textColorTheme"),
      });
      const weight = h("input", {
        type: "number",
        value: current.weight ?? "",
        min: 100,
        max: 900,
        step: 100,
        "aria-label": t("fontWeight"),
        placeholder: "400",
      });
      family.onchange = () => {
        panel.change(() => {
          const s = panel.rule();
          s.style ??= {};
          s.style.text ??= {};
          if (family.value.trim()) s.style.text.family = family.value.trim();
          else delete s.style.text.family;
          panel.doc.manifest.engine.minVersion = "0.1.2";
        });
        panel.render();
      };
      weight.onchange = () => {
        panel.change(() => {
          const s = panel.rule();
          s.style ??= {};
          s.style.text ??= {};
          if (weight.value) s.style.text.weight = Number(weight.value);
          else delete s.style.text.weight;
        });
        panel.render();
      };
      body.append(
        h("label", { text: t("fontFamily") }),
        family,
        h("label", { text: t("fontWeight") }),
        weight,
      );
    }
    if (
      panel.activeSection === "opacity" &&
      layer !== "text" &&
      layer !== "decoration" &&
      layer !== "icon"
    ) {
      const color = h("input", {
        type: "color",
        value: current.color || "#6d9eff",
        "aria-label": label + t("control.colorSuffix"),
      });
      color.onchange = () => {
        panel.change(() => {
          const s = panel.rule();
          s.style ??= {};
          s.style[layer] ??= {};
          s.style[layer].color = color.value;
        });
        panel.render();
      };
      body.append(
        h("div", { class: "color-field" }, [
          h("label", { text: label + t("control.colorSuffix") }),
          color,
          h("output", { text: color.value.toUpperCase() }),
        ]),
      );
    }
    const opacity = h("input", {
      type: "range",
      min: "0",
      max: "100",
      step: "5",
      value: Math.round((current.opacity ?? 1) * 100),
      "aria-label": label + t("control.opacitySuffix"),
    });
    opacity.onchange = () => {
      panel.change(() => {
        const s = panel.rule();
        s.style ??= {};
        s.style[layer] ??= {};
        s.style[layer].opacity = Number(opacity.value) / 100;
      });
      panel.render();
    };
    const opacityValue = h("output", { text: opacity.value + "%" });
    opacity.oninput = () => (opacityValue.textContent = opacity.value + "%");
    body.append(
      h("div", { class: "slider-heading" }, [
        h("label", { text: t("panel.opacity") }),
        opacityValue,
      ]),
      opacity,
    );
    if (
      panel.activeSection !== "opacity" &&
      ["background", "decoration", "icon"].includes(layer)
    ) {
      const file = h("input", {
        type: "file",
        class: "visually-hidden",
        accept: "image/png,image/jpeg,image/gif,video/mp4",
        "aria-label": label + t("control.imageSuffix"),
      });
      file.onchange = panel.action(async () => {
        const image = file.files[0];
        if (!image) return;
        const destination = {
          document: panel.doc,
          profile: panel.profile,
          target: panel.target,
          item: panel.targetItem || null,
          state: panel.state || "base",
        };
        const stored = await uploadFile(panel.c, image, "asset-write");
        if (panel.doc !== destination.document) return;
        const path = "assets/" + stored.hash + stored.extension;
        panel.change(() => {
          panel.doc.assets[path] = stored.hash;
          const s = editableState(
            panel.doc,
            destination.profile,
            destination.target,
            destination.item,
            destination.state,
          );
          s.style ??= {};
          s.style[layer] ??= {};
          s.style[layer].image = path;
          s.style[layer].fit = "contain";
        }, destination);
      });
      if (current.image && panel.doc.assets[current.image])
        body.append(inspectorPreview(panel, panel.doc.assets[current.image]));
      const choose = panel.button(t("panel.setImage"), () => file.click());
      choose.className = "image-picker";
      choose.prepend(icon("image"));
      body.append(choose, file, assetGuidanceUi(panel, layer));
      const fit = h("select", { "aria-label": t("control.fit") });
      for (const [value, label] of [
        ["contain", t("control.contain")],
        ["cover", t("control.cover")],
        ["stretch", t("control.stretch")],
      ])
        fit.append(h("option", { value, text: label }));
      fit.value = current.fit || "contain";
      fit.onchange = () => {
        panel.change(() => {
          const state = panel.rule();
          state.style ??= {};
          state.style[layer] ??= {};
          state.style[layer].fit = fit.value;
        });
        panel.render();
      };
      body.append(h("label", { text: t("control.fit") }), fit);
      const playback = h("select", {
        "aria-label": t("control.animatedImage"),
      });
      playback.append(
        h("option", { value: "play", text: t("control.play") }),
        h("option", { value: "poster", text: t("control.poster") }),
      );
      playback.value = current.imagePlayback || "play";
      playback.onchange = () => {
        panel.change(() => {
          const state = panel.rule();
          state.style ??= {};
          state.style[layer] ??= {};
          state.style[layer].imagePlayback = playback.value;
        });
        panel.render();
      };
      body.append(h("label", { text: t("control.animatedImage") }), playback);
      if (layer === "icon")
        for (const [key, label, maximum, defaultValue] of [
          ["sizePx", t("control.iconSize"), 256, 20],
          ["paddingPx", t("control.iconPadding"), 64, 0],
        ]) {
          const input = h("input", {
            type: "number",
            min: "0",
            max: String(maximum),
            value: current[key] ?? defaultValue,
            "aria-label": label,
          });
          input.onchange = () => {
            panel.change(() => {
              const state = panel.rule();
              state.style ??= {};
              state.style.icon ??= {};
              state.style.icon[key] = Number(input.value);
            });
            panel.render();
          };
          body.append(h("label", { text: label }), input);
        }
    }
    body.append(
      h("div", { class: "row" }, [
        panel.button(t("control.inherit"), () => {
          panel.change(() => delete panel.rule().style?.[layer]);
        }),
        panel.button(t("control.restoreOriginal"), () => {
          panel.change(() => {
            const s = panel.rule();
            s.style ??= {};
            s.style[layer] = null;
          });
        }),
      ]),
    );
  }
  if (panel.activeSection === "animation") {
    body.append(effectPresets(panel));
    const advancedEffects = h("details", { class: "effect-advanced" }, [
      h("summary", { text: t("control.advanced") }),
    ]);
    advancedEffects.append(effectEditor(panel, data));
    body.append(advancedEffects);
  }
  if (differences) body.append(differences);
  const settings = h("details", { class: "inspector-settings" }, [
    h("summary", { text: t("scope") }),
    panel.scope(),
    typographyControls(panel),
    motionPolicyUi(panel),
    panel.button(text.cancel, () => panel.cancel()),
  ]);
  body.append(settings);
  inspectorRoot.append(
    h("div", { class: "inspector-footer" }, [
      panel.button(
        t("control.undo"),
        () => {
          panel.redo.push(panel.doc);
          panel.doc = panel.history.pop();
          const scope = panel.scopeUndo.get(panel.doc);
          if (scope) Object.assign(panel, scope);
          panel.dirty = true;
          panel.preview();
        },
        !panel.history.length,
      ),
      panel.button(
        t("control.redo"),
        () => {
          panel.history.push(panel.doc);
          panel.doc = panel.redo.pop();
          const scope = panel.scopeUndo.get(panel.doc);
          if (scope) Object.assign(panel, scope);
          panel.dirty = true;
          panel.preview();
        },
        !panel.redo.length,
      ),
      panel.button(text.save, () => panel.save()),
      Object.assign(
        panel.button(text.apply, () => panel.apply()),
        { className: "primary" },
      ),
    ]),
  );
}
