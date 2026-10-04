import { resolve } from "../core/engine.ts";

export function initialEditorTarget(document, profileId) {
  const rules = document.theme.profiles.find((p) => p.id === profileId)?.rules || [];
  if (rules.some((r) => r.target === "app.background")) return "app.background";
  if (rules.some((r) => r.target === "main.surface" && r.states.base?.style?.background?.image))
    return "main.surface";
  return "app.background";
}

export function defaultEditorLayer(target) {
  return (target.startsWith("navigation.") && target !== "navigation.bar") ||
    ["composer.send", "composer.stop"].includes(target)
    ? "icon" : "background";
}

export function editorState(panel) {
  const profile = panel.doc.theme.profiles.find(
    (profile) => profile.id === panel.profile,
  );
  const overrides = panel.doc.localOverrides?.[panel.profile];
  const profiles = [profile];
  if (overrides)
    profiles.push({ id: "local", name: "local", rules: overrides });
  const state = panel.state || "base";
  const flags =
    state === "selectedHover"
      ? { selected: true, hover: true }
      : state === "base"
        ? {}
        : { [state]: true };
  return resolve(
    profiles,
    panel.target || "main.surface",
    panel.targetItem || null,
    flags,
  );
}
