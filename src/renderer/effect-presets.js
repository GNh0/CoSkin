import { h, icon } from "./components.js";
import { t } from "./messages.js";
import { effectLabels, valueLabels } from "./strings.js";
import { EFFECTS, keyframes } from "../core/engine.ts";
import { editorState } from "./editor-model.js";
import { inspectorPreview } from "./editor-chrome.js";
import { motionPolicyUi } from "./motion-policy-ui.js";
import { customEffectLibrary } from "./custom-effect-library.js";

const presets = [
  "reveal.edge",
  "reveal.center",
  "fade",
  "move.slide",
  "scale.appear",
  "blur.clear",
];

function definitionFor(panel, name) {
  return (
    (panel.c.summary.effects || []).find(
      (definition) => definition.id === name,
    ) ||
    panel.doc.theme.customEffects?.find((definition) => definition.id === name)
  );
}
function makeEffect(panel, name) {
  const style = editorState(panel).style || {};
  const spec = EFFECTS[name] || {
    ...definitionFor(panel, name),
    parameters: {},
  };
  const allowed = spec.layers || ["background", "decoration", "icon", "text"];
  const layer =
    allowed.find((layer) => style[layer]?.image) ||
    allowed.find((layer) => style[layer]?.color) ||
    (allowed.includes("icon") &&
    panel.c.targets?.some(
      (target) =>
        target.target === panel.target &&
        (!panel.pickedItem || target.item === panel.pickedItem) &&
        target.el.querySelectorAll("svg").length === 1,
    )
      ? "icon"
      : null) ||
    (allowed.includes(panel.selectedLayer) ? panel.selectedLayer : allowed[0]);
  const defaults = { x: 0, y: 16, scale: 0.85, from: 0, blurPx: 8 };
  return {
    id: "effect-" + crypto.randomUUID(),
    layer,
    effect: name,
    effectVersion: 1,
    durationMs: 420,
    delayMs: 0,
    easing: "ease-out",
    iterations: 1,
    reverse: false,
    parameters: Object.fromEntries(
      Object.entries(spec.parameters).map(([key, range]) => [
        key,
        typeof range[0] === "number" ? (defaults[key] ?? range[0]) : range[0],
      ]),
    ),
  };
}

export function effectPresets(panel) {
  const root = h("div", { class: "effect-presets" });
  const motion = editorState(panel).motion;
  const selected =
    motion?.mode === "effects" ? motion.events?.enter?.[0] : null;
  const resolved = editorState(panel).style || {};
  const imageLayer =
    selected?.layer ||
    Object.keys(resolved).find((layer) => resolved[layer]?.image);
  const image = resolved[imageLayer]?.image;
  const preview = h("div", { class: "effect-target-preview" });
  preview.append(
    image && panel.doc.assets[image]
      ? inspectorPreview(panel, panel.doc.assets[image], {
          width: 320,
          height: 64,
          fit: resolved[imageLayer].fit || "cover",
          opacity: resolved[imageLayer].opacity ?? 1,
        })
      : icon("image"),
  );
  const replaying =
    panel.c.replay?.element ===
    panel.c.targets?.find(
      (target) =>
        target.target === panel.target &&
        (!panel.pickedItem || target.item === panel.pickedItem),
    )?.el;
  const replay = panel.button("", () =>
    replaying
      ? panel.c.stopReplay()
      : panel.c.replayTarget(
          panel.target,
          panel.pickedItem || panel.targetItem,
          panel.state || "base",
        ),
  );
  replay.disabled = !selected || panel.c.motionBlocked;
  replay.setAttribute(
    "aria-label",
    t(replaying ? "control.stopReplay" : "control.replayTarget"),
  );
  replay.title = t(replaying ? "control.stopReplay" : "control.replayTarget");
  replay.append(icon(replaying ? "stop" : "play"));
  preview.append(replay);
  root.append(preview);
  const tabs = h("div", { class: "effect-event-tabs", role: "tablist" });
  for (const [value, key] of [
    ["recommended", "recommendedEffects"],
    ["all", "allEffects"],
    ["mine", "myEffects"],
  ]) {
    const tab = panel.button(t("control." + key), () => {
      panel.effectCategory = value;
      panel.render();
    });
    tab.setAttribute("role", "tab");
    tab.setAttribute(
      "aria-selected",
      String((panel.effectCategory || "recommended") === value),
    );
    tabs.append(tab);
  }
  root.append(tabs);
  if (panel.effectCategory === "mine") root.append(customEffectLibrary(panel));
  const definitions = [...(panel.c.summary.effects || [])];
  for (const definition of panel.doc.theme.customEffects || [])
    if (!definitions.some((item) => item.id === definition.id))
      definitions.push(definition);
  const names =
    panel.effectCategory === "mine"
      ? definitions.map((definition) => definition.id)
      : panel.effectCategory === "all"
        ? Object.keys(EFFECTS).filter(
            (name) =>
              !["light.sweep", "border.flow", "click.ripple"].includes(name),
          )
        : presets.slice(0, 5);
  const grid = h("div", {
    class: "preset-grid",
    role: "group",
    "aria-label": t("control.chooseEffect"),
  });
  for (const name of ["none", ...names]) {
    const button = panel.button("", () => {
      panel.change(() => {
        const state = panel.rule();
        if (name === "none") state.motion = { mode: "none" };
        else {
          const enter = makeEffect(panel, name);
          const definition = definitionFor(panel, name);
          if (definition) {
            panel.doc.theme.customEffects ??= [];
            const existing = panel.doc.theme.customEffects.find(
              (item) => item.id === name,
            );
            if (
              existing &&
              JSON.stringify(existing) !== JSON.stringify(definition)
            ) {
              const copy = {
                ...structuredClone(definition),
                id: "custom.theme-" + crypto.randomUUID(),
              };
              panel.doc.theme.customEffects.push(copy);
              enter.effect = copy.id;
            } else if (!existing)
              panel.doc.theme.customEffects.push(structuredClone(definition));
          }
          state.motion = {
            mode: "effects",
            trigger: motion?.trigger || "hover",
            events: {
              enter: [enter],
              exit: [
                {
                  ...structuredClone(enter),
                  id: "effect-" + crypto.randomUUID(),
                  reverse: true,
                },
              ],
            },
          };
        }
      });
      panel.render();
      panel.c.replayTarget(
        panel.target,
        panel.pickedItem || panel.targetItem,
        panel.state || "base",
      );
    });
    button.className = "preset-card";
    if (name !== "none") {
      const spec = EFFECTS[name] || definitionFor(panel, name);
      const allowed = spec.layers || [
        "background",
        "decoration",
        "border",
        "icon",
        "text",
      ];
      const target = panel.c.targets?.find(
        (target) =>
          target.target === panel.target &&
          (!panel.pickedItem || target.item === panel.pickedItem),
      );
      const nativeIcon = target?.el.querySelectorAll("svg").length === 1;
      const content = allowed.some(
        (layer) =>
          resolved[layer]?.image ||
          resolved[layer]?.color ||
          (layer === "icon" && nativeIcon) ||
          (layer === "text" && panel.selectedLayer === "text"),
      );
      if (!content) {
        button.disabled = true;
        button.title = t("control.effectNeedsContent");
      }
    }
    button.setAttribute(
      "aria-pressed",
      String(name === (selected?.effect || "none")),
    );
    const sampleContent =
      image && panel.doc.assets[image]
        ? inspectorPreview(panel, panel.doc.assets[image], {
            width: 192,
            height: 44,
            fit: resolved[imageLayer].fit || "cover",
          })
        : h("span", { class: "preset-sample-row" });
    const sample = h("span", { class: "preset-sample" }, [sampleContent]);
    sampleContent.style.opacity = String(resolved[imageLayer]?.opacity ?? 1);
    button.append(
      sample,
      h("span", {
        text:
          name === "none"
            ? t("control.noAnimation")
            : effectLabels[name] || definitionFor(panel, name)?.name,
      }),
    );
    button.onpointerenter = () => {
      if (name === "none" || panel.c.motionBlocked || button.disabled) return;
      const effect = makeEffect(panel, name);
      const animation = sample.firstChild.animate(
        keyframes(
          { ...effect, customDefinition: definitionFor(panel, name) },
          { opacity: resolved[imageLayer]?.opacity ?? 1 },
        ),
        {
          duration: 420,
          easing: "ease-out",
        },
      );
      button.onpointerleave = () => animation.cancel();
    };
    const card = h("article", { class: "preset-item" }, [button]);
    grid.append(card);
    if (panel.effectCategory === "mine" && name !== "none") {
      const remove = panel.button("", () => {
        panel.effectDelete = name;
        panel.render();
      });
      remove.className = "icon-button";
      remove.setAttribute(
        "aria-label",
        t("delete") + " " + definitionFor(panel, name)?.name,
      );
      remove.append(icon("trash"));
      card.append(remove);
    }
  }
  root.append(grid);
  if (panel.effectCategory === "mine" && !definitions.length)
    root.append(h("p", { class: "muted", text: t("control.noCustomEffects") }));
  if (panel.c.motionBlocked) {
    const blocked = h("details", { class: "motion-blocked" }, [
      h("summary", { text: t("control.motionPaused") }),
      motionPolicyUi(panel),
    ]);
    root.append(blocked);
  }
  if (selected) {
    const updateSelected = (update) => {
      panel.change(() => {
        const state = panel.rule();
        state.motion ??= structuredClone(motion);
        const enter = state.motion.events.enter[0];
        update(enter);
        for (const exit of state.motion.events.exit || [])
          if (
            exit.effect === enter.effect &&
            exit.layer === enter.layer &&
            exit.reverse !== enter.reverse
          ) {
            exit.durationMs = enter.durationMs;
            exit.parameters = structuredClone(enter.parameters);
          }
      });
      panel.render();
    };
    const trigger = h("select", { "aria-label": t("control.effectTrigger") });
    for (const [value, key] of [
      ["hover", "onHover"],
      ["selected", "selected"],
      ["click", "click"],
      ["always", "alwaysShow"],
    ])
      trigger.append(h("option", { value, text: t("control." + key) }));
    trigger.value = motion.trigger || "hover";
    trigger.onchange = () => {
      panel.change(() => {
        const state = panel.rule();
        state.motion ??= structuredClone(motion);
        state.motion.trigger = trigger.value;
      });
      panel.render();
    };
    root.append(
      h(
        "label",
        { class: "preset-control", text: t("control.effectTrigger") },
        [trigger],
      ),
    );
    const speed = h("input", {
      type: "range",
      min: "120",
      max: "1600",
      step: "20",
      value: String(selected.durationMs),
      "aria-label": t("control.speed"),
    });
    speed.onchange = () => {
      updateSelected((effect) => (effect.durationMs = Number(speed.value)));
    };
    root.append(
      h("label", { class: "preset-control", text: t("control.speed") }, [
        speed,
        h("output", { text: (selected.durationMs / 1000).toFixed(2) + " s" }),
      ]),
    );
    if (EFFECTS[selected.effect]?.parameters.direction) {
      const direction = h("select", { "aria-label": t("control.direction") });
      for (const value of EFFECTS[selected.effect].parameters.direction)
        direction.append(h("option", { value, text: valueLabels[value] }));
      direction.value = selected.parameters.direction;
      direction.onchange = () => {
        updateSelected(
          (effect) => (effect.parameters.direction = direction.value),
        );
      };
      root.append(
        h("label", { class: "preset-control", text: t("control.direction") }, [
          direction,
        ]),
      );
    }
  }
  return root;
}
