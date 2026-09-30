import { h } from "./components.js";
import { t } from "./messages.js";
import { text } from "./strings.js";
export function settingsPage(panel, section) {
  const preferences = panel.runtimeSettingsDraft ?? panel.runtimeSettings;
  const page = h("div", { class: "panel-page panel-settings-page" });
  const root = h("form", {
    class: "theme-metadata panel-form runtime-settings-form",
  });
  const back = panel.button(t("library"), () => {
    panel.settingsOpen = false;
    panel.render();
  });
  page.append(
    h("header", { class: "panel-page-header" }, [
      h("div", {}, [
        h("span", { class: "panel-eyebrow", text: "CoSkin" }),
        h("h1", { text: t("control.runtimeTitle") }),
      ]),
      back,
    ]),
  );
  const options = h("div", { class: "panel-settings-options" }, [
    h("h2", { text: t("control.runtimeSection") }),
  ]);
  root.append(options);
  const fields = {};
  for (const [key, title, description] of [
    ["startAtSignIn", "control.runtimeStartup", "control.runtimeStartupHelp"],
    ["launchWithCodex", "control.runtimeLaunch", "control.runtimeLaunchHelp"],
    ["exitWithCodex", "control.runtimeExit", "control.runtimeExitHelp"],
    [
      "automaticUpdates",
      "control.runtimeUpdates",
      "control.runtimeUpdatesHelp",
    ],
  ]) {
    const input = h("input", {
      type: "checkbox",
      class: "panel-switch",
      "aria-label": t(title),
    });
    input.checked = preferences[key];
    input.disabled =
      key === "startAtSignIn" &&
      panel.c.summary?.startupSettingsAvailable !== true;
    fields[key] = input;
    input.onchange = () => {
      panel.runtimeSettingsDraft = Object.fromEntries(
        Object.entries(fields).map(([name, field]) => [name, field.checked]),
      );
    };
    const row = h("label", { class: "panel-switch-row" }, [
      h("div", { class: "panel-setting-copy" }, [
        h("strong", { text: t(title) }),
        h("p", { text: t(description) }),
      ]),
      input,
    ]);
    options.append(row);
  }
  const update = panel.updateStatus ?? { status: "idle" };
  const updateMessage = t("control.runtimeUpdate" + update.status, {
    version: update.version,
  });
  const updateAction = (operation) => async () => {
    panel.updateRequesting = true;
    try {
      panel.updateStatus = await panel.c.request(operation);
      panel.notify(
        t("control.runtimeUpdate" + panel.updateStatus.status, {
          version: panel.updateStatus.version,
        }),
      );
    } finally {
      panel.updateRequesting = false;
    }
  };
  root.append(
    h("aside", { class: "panel-update-card" }, [
      h("h2", { text: t("control.runtimeUpdateTitle") }),
      h("p", { text: updateMessage, role: "status" }),
      h("div", { class: "panel-actions" }, [
        panel.button(
          t("control.runtimeCheckUpdates"),
          updateAction("runtime-update-check"),
        ),
        ...(update.status === "ready" || update.status === "deferred"
          ? [
              panel.button(
                t("control.runtimeInstallUpdate"),
                updateAction("runtime-update-apply"),
                !!panel.runtimeSettingsDraft,
              ),
            ]
          : []),
      ]),
    ]),
  );
  const save = h("button", {
    type: "submit",
    class: "primary",
    text: text.save,
  });
  save.disabled = panel.busy;
  root.append(h("div", { class: "panel-form-footer" }, [save]));
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
  page.append(root);
  section.append(page);
}
