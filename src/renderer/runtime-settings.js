import { h } from "./components.js";
import { t } from "./messages.js";
import { text } from "./strings.js";
export function settingsPage(panel, section) {
  const preferences = panel.runtimeSettingsDraft ?? panel.runtimeSettings;
  const root = h("form", { class: "theme-metadata" });
  root.style.maxWidth = "760px";
  root.style.margin = "32px auto";
  const back = panel.button(t("library"), () => {
    panel.settingsOpen = false;
    panel.render();
  });
  section.append(
    h("header", { class: "page-header" }, [
      h("div", {}, [
        h("span", { class: "brand", text: "CoSkin" }),
        h("h1", { text: t("control.runtimeTitle") }),
      ]),
      back,
    ]),
  );
  root.append(h("h2", { text: t("control.runtimeSection") }));
  const fields = {};
  for (const [key, title, description] of [
    ["launchWithCodex", "control.runtimeLaunch", "control.runtimeLaunchHelp"],
    ["exitWithCodex", "control.runtimeExit", "control.runtimeExitHelp"],
    [
      "automaticUpdates",
      "control.runtimeUpdates",
      "control.runtimeUpdatesHelp",
    ],
  ]) {
    const input = h("input", { type: "checkbox", "aria-label": t(title) });
    input.checked = preferences[key];
    input.style.width = "20px";
    input.style.height = "20px";
    input.style.flexShrink = "0";
    fields[key] = input;
    input.onchange = () => {
      panel.runtimeSettingsDraft = Object.fromEntries(
        Object.entries(fields).map(([name, field]) => [name, field.checked]),
      );
    };
    const row = h("label", {}, [
      h("div", {}, [
        h("strong", { text: t(title) }),
        h("p", { text: t(description) }),
      ]),
      input,
    ]);
    Object.assign(row.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "24px",
      padding: "20px 0",
      borderBottom: "1px solid var(--line)",
    });
    root.append(row);
  }
  root.append(
    h("aside", {}, [
      h("strong", { text: t("control.runtimeUpdateUnavailable") }),
      h("p", { text: t("control.runtimeUpdateUnavailableHelp") }),
      panel.button(
        t("control.runtimeCheckUpdates"),
        panel.action(async () => {
          const result = await panel.c.request("runtime-update-check");
          if (result.status === "unavailable")
            panel.notify(t("control.runtimeUpdateUnavailableHelp"));
        }),
      ),
    ]),
  );
  const save = h("button", {
    type: "submit",
    class: "primary",
    text: text.save,
  });
  save.disabled = panel.busy;
  root.append(h("div", { class: "detail-actions" }, [save]));
  root.onsubmit = async (event) => {
    event.preventDefault();
    await panel.action(async () => {
      panel.runtimeSettings = await panel.c.request("runtime-settings-write", {
        settings: Object.fromEntries(
          Object.entries(fields).map(([key, input]) => [key, input.checked]),
        ),
      });
      panel.runtimeSettingsDraft = null;
    })();
  };
  section.append(root);
}
