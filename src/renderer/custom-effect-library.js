import { h } from "./components.js";
import { t } from "./messages.js";
import { uploadFile } from "./file-transfer.js";

export function customEffectLibrary(panel) {
  const root = h("div", { class: "custom-effect-library" });
  const file = h("input", {
    type: "file",
    accept: ".coskin-effect.json,application/json",
    class: "visually-hidden",
    "aria-label": t("control.importEffect"),
  });
  file.onchange = panel.action(async () => {
    const selected = file.files[0];
    if (!selected) return;
    if (selected.size > 65536) throw Error(t("control.effectFileLimit"));
    const result = await uploadFile(panel.c, selected, "effect-import");
    panel.effectConflict = result.conflict ? result : null;
    panel.c.summary = await panel.c.request("list");
  });
  root.append(
    panel.button(t("control.importEffect"), () => file.click()),
    file,
  );
  if (panel.effectConflict) {
    const name = h("input", {
      value: panel.effectConflict.definition.name,
      maxLength: 80,
      "aria-label": t("control.effectName"),
    });
    root.append(
      h("p", { text: t("control.effectCollision") }),
      name,
      panel.button(t("control.keepBoth"), async () => {
        const result = await panel.c.update("effect-register", {
          definition: panel.effectConflict.definition,
          rename: name.value,
        });
        panel.effectConflict = result.conflict ? result : null;
      }),
      panel.button(t("control.replaceEffect"), async () => {
        await panel.c.update("effect-register", {
          definition: panel.effectConflict.definition,
          replace: true,
        });
        panel.effectConflict = null;
      }),
      panel.button(t("panel.cancel"), () => {
        panel.effectConflict = null;
      }),
    );
  }
  if (panel.effectDelete) {
    root.append(
      h("p", { text: t("control.deleteEffectNote") }),
      panel.button(t("delete"), async () => {
        await panel.c.update("effect-delete", { effectId: panel.effectDelete });
        panel.effectDelete = null;
      }),
      panel.button(t("panel.cancel"), () => {
        panel.effectDelete = null;
      }),
    );
  }
  return root;
}
