import { t } from "./messages.js";
import { inspectorPreview } from "./editor-chrome.js";
import { editorState } from "./editor-model.js";
import { icon, h } from "./components.js";
import { EFFECTS } from "../core/engine.ts";
import {
  effectLabels,
  layerLabels,
  parameterLabels,
  valueLabels,
} from "./strings.js";
const element = (tag, properties = {}) =>
  Object.assign(document.createElement(tag), properties);
const field = (label, input) => {
  const wrapper = element("label", { textContent: label });
  wrapper.append(input);
  return wrapper;
};
const select = (values, current, change) => {
  const input = element("select");
  for (const [value, label] of values)
    input.append(element("option", { value, textContent: label }));
  input.value = current;
  input.onchange = () => change(input.value);
  return input;
};
const number = (value, min, max, change, step = 1) => {
  const input = element("input", {
    type: "number",
    value: String(value),
    min: String(min),
    max: String(max),
    step: String(step),
  });
  input.onchange = () => change(Number(input.value));
  return input;
};
export function effectEditor(panel, state) {
  const section = element("div", { className: "effects-editor" });
  const change = (fn) => {
    try {
      panel.change(fn);
    } catch (e) {
      panel.message = e.message;
    }
    panel.render();
  };
  const existing = state?.motion;
  section.append(
    field(
      t("control.animation"),
      select(
        [
          ["inherit", t("control.inherit")],
          ["none", t("control.noAnimation")],
          ["effects", t("control.useEffects")],
        ],
        existing?.mode || "inherit",
        (mode) =>
          change(() => {
            const current = panel.rule();
            if (mode === "inherit") delete current.motion;
            else
              current.motion =
                mode === "none" ? { mode } : { mode, events: { enter: [] } };
          }),
      ),
    ),
  );
  if (existing?.mode !== "effects") return section;
  const events = {
    enter: t("control.enter"),
    exit: t("control.exit"),
    click: t("control.click"),
    idle: t("control.idle"),
  };
  const eventTabs = element("div", { className: "effect-event-tabs" });
  eventTabs.setAttribute("role", "tablist");
  const activeEvent = panel.effectEvent || "enter";
  for (const [event, label] of Object.entries(events)) {
    const tab = panel.button(label, () => {
      panel.effectEvent = event;
      panel.render();
    });
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(activeEvent === event));
    eventTabs.append(tab);
  }
  section.append(eventTabs);
  for (const [event, label] of Object.entries(events)) {
    if (event !== activeEvent) continue;
    const heading = element("h3", { textContent: label });
    section.append(heading);
    const effects = existing.events?.[event] || [];
    effects.forEach((effect, index) => {
      const definition = panel.doc.theme.customEffects?.find(
        (definition) => definition.id === effect.effect,
      );
      const spec = EFFECTS[effect.effect] || { ...definition, parameters: {} };
      const card = element("fieldset", { className: "effect-card" });
      card.append(
        element("legend", {
          textContent: effectLabels[effect.effect] || definition?.name,
        }),
      );
      if (["background", "decoration", "icon"].includes(effect.layer)) {
        const image = editorState(panel).style?.[effect.layer]?.image;
        const hash = image && panel.doc.assets[image];
        const chooseImage = panel.button("", () => {
          panel.selectedLayer = effect.layer;
          panel.activeSection = "image";
          panel.render();
        });
        chooseImage.className = "effect-image-action";
        chooseImage.append(
          hash ? inspectorPreview(panel, hash) : icon("image"),
          h("span", {}, [
            h("strong", { text: t("panel.setImage") }),
            h("small", {
              text: hash ? layerLabels[effect.layer] : t("control.noImage"),
            }),
          ]),
        );
        card.append(chooseImage);
      }
      const update = (fn) =>
        change(() => fn(panel.rule().motion.events[event][index]));
      const resolvedStyle = editorState(panel).style || {};
      if (
        !resolvedStyle[effect.layer] &&
        resolvedStyle.background?.image &&
        (!spec.layers || spec.layers.includes("background"))
      ) {
        card.append(
          h("small", {
            class: "effect-warning",
            text: t("control.emptyEffectLayer"),
          }),
          panel.button(t("control.connectBackground"), () =>
            update((effect) => {
              effect.layer = "background";
            }),
          ),
        );
      }
      card.append(
        field(
          t("control.layer"),
          select(
            (spec.layers || Object.keys(layerLabels)).map((l) => [
              l,
              layerLabels[l],
            ]),
            effect.layer,
            (v) => update((e) => (e.layer = v)),
          ),
        ),
      );
      const advanced = element("details", { className: "effect-advanced" });
      advanced.append(
        element("summary", { textContent: t("control.advanced") }),
      );
      advanced.append(
        field(
          t("control.duration"),
          number(effect.durationMs, 0, 10000, (v) =>
            update((e) => (e.durationMs = v)),
          ),
        ),
        field(
          t("control.delay"),
          number(effect.delayMs, 0, 5000, (v) =>
            update((e) => (e.delayMs = v)),
          ),
        ),
      );
      advanced.append(
        field(
          t("control.easing"),
          select(
            [
              ["linear", t("control.linear")],
              ["ease-in", t("control.easeIn")],
              ["ease-out", t("control.easeOut")],
              ["ease-in-out", t("control.easeInOut")],
            ],
            effect.easing,
            (v) => update((e) => (e.easing = v)),
          ),
        ),
      );
      advanced.append(
        field(
          t("control.repeats"),
          number(
            effect.iterations === "infinite" ? 1 : effect.iterations,
            1,
            100,
            (v) => update((e) => (e.iterations = v)),
          ),
        ),
      );
      if (event === "idle")
        advanced.append(
          field(
            t("control.infinite"),
            select(
              [
                ["finite", t("control.finite")],
                ["infinite", t("control.forever")],
              ],
              effect.iterations === "infinite" ? "infinite" : "finite",
              (v) => update((e) => (e.iterations = v === "infinite" ? v : 1)),
            ),
          ),
        );
      advanced.append(
        field(
          t("control.direction"),
          select(
            [
              ["false", t("control.forward")],
              ["true", t("control.reverse")],
            ],
            String(effect.reverse),
            (v) => update((e) => (e.reverse = v === "true")),
          ),
        ),
      );
      for (const [key, limits] of Object.entries(spec.parameters)) {
        const value = effect.parameters[key];
        const input =
          typeof limits[0] === "number"
            ? number(
                value ?? limits[0],
                limits[0],
                limits[1],
                (v) => update((e) => (e.parameters[key] = v)),
                0.05,
              )
            : select(
                limits.map((v) => [v, valueLabels[v] || v]),
                value ?? limits[0],
                (v) => update((e) => (e.parameters[key] = v)),
              );
        advanced.append(field(parameterLabels[key], input));
      }
      card.append(advanced);
      card.append(
        panel.button(t("control.removeEffect"), () =>
          change(() => panel.rule().motion.events[event].splice(index, 1)),
        ),
      );
      if (index > 0)
        card.append(
          panel.button(t("control.moveUp"), () =>
            change(() => {
              const list = panel.rule().motion.events[event];
              [list[index - 1], list[index]] = [list[index], list[index - 1]];
            }),
          ),
        );
      section.append(card);
    });
    const choice = select(
      Object.keys(EFFECTS).map((e) => [e, effectLabels[e]]),
      "reveal.edge",
      () => {},
    );
    section.append(
      choice,
      panel.button(t("control.addEffect"), () =>
        change(() => {
          const s = panel.rule();
          s.motion.events ??= {};
          s.motion.events[event] ??= [];
          const spec = EFFECTS[choice.value];
          const defaults = {
            x: 0,
            y: 8,
            scale: 0.9,
            intensity: 0.2,
            from: 0,
            blurPx: 8,
            angle: 15,
            distance: 4,
            radius: 40,
          };
          const parameters = Object.fromEntries(
            Object.entries(spec.parameters).map(([key, values]) => [
              key,
              typeof values[0] === "number"
                ? Math.max(
                    values[0],
                    Math.min(values[1], defaults[key] ?? values[0]),
                  )
                : values[0],
            ]),
          );
          s.motion.events[event].push({
            id: "effect-" + crypto.randomUUID(),
            layer: (() => {
              const allowed = spec.layers || Object.keys(layerLabels);
              const style = editorState(panel).style || {};
              const selected = panel.selectedLayer;
              return allowed.includes(selected) && style[selected]?.image
                ? selected
                : allowed.find((layer) => style[layer]?.image) ||
                    (allowed.includes(selected) ? selected : allowed[0]);
            })(),
            effect: choice.value,
            effectVersion: 1,
            durationMs: 220,
            delayMs: 0,
            easing: "ease-out",
            iterations: 1,
            reverse: false,
            parameters,
          });
        }),
      ),
    );
  }
  return section;
}
