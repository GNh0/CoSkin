import { h } from "./components.js";
import { t } from "./messages.js";

export function motionPolicyUi(panel) {
  const controller = panel.c;
  const root = h("div", { class: "motion-policy" });
  const choice = h("select", { "aria-label": t("control.motionPolicy") });
  for (const policy of ["system", "allow", "off"])
    choice.append(
      h("option", { value: policy, text: t("control.policy" + policy) }),
    );
  choice.value = controller.summary.motionPolicy || "system";
  choice.onchange = panel.action(() =>
    controller.update("motion-policy", { policy: choice.value }),
  );
  root.append(h("label", { text: t("control.motionPolicy") }), choice);
  if (controller.motionBlocked) {
    root.append(
      h("small", {
        text: t(
          controller.nativeMotionPaused
            ? "control.motionHidden"
            : choice.value === "off"
              ? "control.motionOffReason"
              : "control.motionSystemReason",
        ),
      }),
    );
    if (!controller.nativeMotionPaused && choice.value === "system")
      root.append(
        panel.button(t("control.allowMotion"), () =>
          controller.update("motion-policy", { policy: "allow" }),
        ),
      );
  }
  return root;
}
