import { h } from "./components.js";
import { t } from "./messages.js";
import { text } from "./strings.js";
export function storageBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let unit = 0;
  while (bytes >= 1024 && unit < units.length - 1) {
    bytes /= 1024;
    unit++;
  }
  return `${new Intl.NumberFormat(document.documentElement.lang || "en", {
    maximumFractionDigits: 1,
  }).format(bytes)} ${units[unit]}`;
}
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
  back.className = "panel-back";
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
  const storage = panel.runtimeSettings?.assetStorage;
  const initialStoragePath =
    panel.runtimeSettings?.assetStoragePath ?? storage?.defaultPath;
  let storageInput;
  let installUpdate;
  const draftStatus = h("small", {
    class: "panel-settings-status",
    text: t("control.unsavedChanges"),
    role: "status",
  });
  draftStatus.hidden = !panel.runtimeSettingsDraft;
  const settingsValues = () => ({
    ...Object.fromEntries(
      Object.entries(fields).map(([name, field]) => [name, field.checked]),
    ),
    ...(storageInput
      ? { assetStoragePath: storageInput.value.trim() || null }
      : {}),
  });
  const updateDraft = () => {
    panel.runtimeSettingsDraft = settingsValues();
    draftStatus.hidden = false;
    if (installUpdate) installUpdate.disabled = true;
  };
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
      panel.busy ||
      (key === "startAtSignIn" &&
        panel.c.summary?.startupSettingsAvailable !== true);
    fields[key] = input;
    input.onchange = updateDraft;
    const row = h("label", { class: "panel-switch-row" }, [
      h("div", { class: "panel-setting-copy" }, [
        h("strong", { text: t(title) }),
        h("p", { text: t(description) }),
      ]),
      input,
    ]);
    options.append(row);
  }
  if (storage) {
    storageInput = h("input", {
      type: "text",
      "aria-label": t("control.runtimeStorageTitle"),
      placeholder: storage.defaultPath,
      maxlength: "2048",
      autocomplete: "off",
      spellcheck: "false",
    });
    storageInput.value = preferences.assetStoragePath ?? storage.defaultPath;
    storageInput.disabled = panel.busy;
    storageInput.oninput = updateDraft;
    root.append(
      h("div", { class: "panel-settings-options panel-storage-options" }, [
        h("h2", { text: t("control.runtimeStorageTitle") }),
        h("p", {
          class: "panel-section-help",
          text: t("control.runtimeStorageHelp"),
        }),
        h("div", { class: "panel-storage-meta" }, [
          h("p", {
            class: "panel-storage-current",
            text: t("control.runtimeStorageCurrent", {
              path: storage.currentPath,
            }),
            title: storage.currentPath,
          }),
          h("p", {
            class: "panel-storage-usage",
            text: t("control.runtimeStorageUsed", {
              size: storageBytes(storage.usedBytes),
            }),
          }),
        ]),
        ...(storage.available === false
          ? [
              h("p", {
                class: "panel-storage-warning",
                text: t("control.runtimeStorageUnavailable"),
                role: "status",
              }),
            ]
          : []),
        h("label", { class: "panel-field" }, [
          h("span", {
            class: "panel-field-label",
            text: t("control.runtimeStoragePath"),
          }),
          storageInput,
        ]),
        h("div", { class: "panel-actions" }, [
          ...(panel.c.summary?.assetStoragePickerAvailable === true
            ? [
                panel.button(t("control.runtimeStorageChoose"), async () => {
                  const selected = await panel.c.request("asset-storage-pick", {
                    initialPath: storageInput.value.trim() || null,
                  });
                  if (
                    !selected.cancelled &&
                    typeof selected.path === "string"
                  ) {
                    storageInput.value = selected.path;
                    updateDraft();
                  }
                }),
              ]
            : []),
          panel.button(t("control.runtimeStorageDefault"), () => {
            storageInput.value = "";
            updateDraft();
          }),
        ]),
      ]),
    );
  }
  const update = panel.updateStatus ?? { status: "idle" };
  const updateMessage = t("control.runtimeUpdate" + update.status, {
    version: update.version,
  });
  const updateAction = (operation) => async () => {
    if (operation === "runtime-update-apply" && panel.runtimeSettingsDraft)
      return;
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
  if (update.status === "ready" || update.status === "deferred")
    installUpdate = panel.button(
      t("control.runtimeInstallUpdate"),
      updateAction("runtime-update-apply"),
      !!panel.runtimeSettingsDraft,
    );
  root.append(
    h("aside", { class: "panel-update-card" }, [
      h("h2", { text: t("control.runtimeUpdateTitle") }),
      h("p", { text: updateMessage, role: "status" }),
      h("div", { class: "panel-actions" }, [
        panel.button(
          t("control.runtimeCheckUpdates"),
          updateAction("runtime-update-check"),
        ),
        ...(installUpdate ? [installUpdate] : []),
      ]),
    ]),
  );
  const save = h("button", {
    type: "submit",
    class: "primary",
    text: text.save,
  });
  save.disabled = panel.busy;
  const cancel = panel.button(t("panel.cancel"), () => {
    panel.runtimeSettingsDraft = null;
    panel.settingsOpen = false;
    panel.render();
  });
  root.append(
    h("div", { class: "panel-form-footer" }, [draftStatus, cancel, save]),
  );
  root.onsubmit = async (event) => {
    event.preventDefault();
    const settings = settingsValues();
    panel.runtimeSettingsDraft = settings;
    const requestSettings = { ...settings };
    if (
      storage &&
      (settings.assetStoragePath ?? storage.defaultPath) === initialStoragePath
    ) {
      // A lifecycle-only save must not revert a folder changed in another window.
      delete requestSettings.assetStoragePath;
    }
    await panel.action(async () => {
      panel.runtimeSettings = await panel.c.request("runtime-settings-write", {
        settings: requestSettings,
      });
      panel.runtimeSettingsDraft = null;
    })();
  };
  page.append(root);
  section.append(page);
}
