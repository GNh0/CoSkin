import { moveTargetState } from "../core/target-scope.ts";
import { h } from "./components.js";
import { t } from "./messages.js";

export function targetScopeUi(panel) {
  if (!["sidebar.project-row", "sidebar.thread-row"].includes(panel.target))
    return null;
  const item = panel.pickedItem || panel.targetItem;
  if (!item) return null;
  const project = panel.target === "sidebar.project-row";
  const select = h("select", { "aria-label": t("control.targetScope") });
  for (const [value, key] of [
    ["one", project ? "thisProject" : "thisChat"],
    ["all", project ? "allProjects" : "allChats"],
  ])
    select.append(h("option", { value, text: t("control." + key) }));
  select.value = panel.targetItem ? "one" : "all";
  const switchScope = (all) => {
    const before = {
      target: panel.target,
      targetItem: panel.targetItem,
      pickedItem: panel.pickedItem,
      targetTitle: panel.targetTitle,
    };
    panel.change(
      () =>
        moveTargetState(
          panel.doc,
          panel.profile,
          panel.target,
          item,
          panel.state || "base",
          all,
        ),
      { clearAllExceptions: false },
    );
    panel.scopeUndo.set(panel.history.at(-1), before);
    panel.targetItem = all ? null : item;
    panel.scopeUndo.set(panel.doc, { ...before, targetItem: panel.targetItem });
    panel.c.render();
    panel.render();
  };
  select.onchange = () => switchScope(select.value === "all");
  const root = h("div", { class: "target-scope" }, [select]);
  const existing = panel.doc.localOverrides?.[panel.profile]?.find(
    (rule) => rule.target === panel.target && rule.item === item,
  )?.states[panel.state || "base"];
  if (!panel.targetItem && existing) {
    const detail = h("details", { class: "individual-differences" }, [
      h("summary", { text: t("control.individualDifference") }),
    ]);
    detail.append(
      h("small", { text: t("control.existingIndividual") }),
      panel.button(t("control.promoteExisting"), () => switchScope(true)),
    );
    root.append(detail);
  }
  return root;
}
