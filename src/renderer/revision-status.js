import { revisionStatus } from "../core/revision-state.ts";
import { h } from "./components.js";
import { t } from "./messages.js";

export function revisionStatusUi(panel) {
  const { scope, contextId } = panel.scopeData();
  const key = scope === "global" ? "global" : scope + ":" + contextId;
  const binding = panel.c.summary.bindings[key];
  const status = revisionStatus(
    panel.selected,
    panel.baseRevision,
    panel.dirty,
    panel.c.summary.enabled,
    binding,
  );
  return h("small", {
    class: "revision-status",
    text: t("control." + status),
    role: "status",
  });
}
