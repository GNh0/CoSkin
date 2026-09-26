import { resolve } from "../core/engine.ts";

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
