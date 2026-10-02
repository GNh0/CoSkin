import { sortLibrary } from "../core/library-filter.js";
import { applicationLocale } from "./locale.js";
import { h, icon } from "./components.js";
import { t } from "./messages.js";

const messages = {
  ko: {
    navigation: "테마 이동",
    previous: "이전 테마",
    next: "다음 테마",
    position: "테마 {current} / {total}",
    save: "저장 후 이동",
    discard: "변경 버리고 이동",
  },
  en: {
    navigation: "Theme navigation",
    previous: "Previous theme",
    next: "Next theme",
    position: "Theme {current} of {total}",
    save: "Save and continue",
    discard: "Discard and continue",
  },
  ja: {
    navigation: "テーマの移動",
    previous: "前のテーマ",
    next: "次のテーマ",
    position: "テーマ {current} / {total}",
    save: "保存して移動",
    discard: "変更を破棄して移動",
  },
  "zh-CN": {
    navigation: "主题导航",
    previous: "上一个主题",
    next: "下一个主题",
    position: "第 {current} 个主题，共 {total} 个",
    save: "保存并继续",
    discard: "放弃更改并继续",
  },
};
const label = (key, values = {}) =>
  messages[applicationLocale(document, navigator)][key].replace(
    /\{(\w+)\}/g,
    (_, name) => String(values[name] ?? ""),
  );

// Capture the explorer model before pagination. Folder rows also occupy page
// slots, so the return page cannot be calculated from the theme index alone.
export function rememberDetailList(panel, model, pageSize) {
  panel.detailNavigation = {
    ids: model.themes.map(([id]) => id),
    pages: new Map(
      model.items
        .map((item, index) => [item, index])
        .filter(([item]) => item.kind === "theme")
        .map(([item, index]) => [item.id, Math.floor(index / pageSize)]),
    ),
  };
}

export function detailNavigationState(panel) {
  const themes = panel.c.summary.themes;
  let ids = panel.detailNavigation?.ids.filter((id) =>
    Object.hasOwn(themes, id),
  );
  if (!ids?.includes(panel.selected))
    ids = sortLibrary(
      Object.entries(themes),
      panel.c.summary.organization,
      panel.librarySort,
    ).map(([id]) => id);
  const index = ids.indexOf(panel.selected);
  return {
    ids,
    index,
    current: index + 1,
    total: ids.length,
    previous: index > 0 ? ids[index - 1] : null,
    next: index >= 0 ? ids[index + 1] || null : null,
  };
}

// Detail forms keep their values across the confirmation rerender. Saving a
// draft remains the form's responsibility; navigation never applies a theme.
export function detailDraft(panel, key) {
  const draft = panel.detailDrafts?.get(key);
  return draft?.id === panel.selected ? draft.values : null;
}
export function updateDetailDraft(panel, key, values, baseline, save) {
  panel.detailDrafts ??= new Map();
  if (JSON.stringify(values) === JSON.stringify(baseline))
    panel.detailDrafts.delete(key);
  else
    panel.detailDrafts.set(key, {
      id: panel.selected,
      values: structuredClone(values),
      save,
    });
}
export function clearDetailDraft(panel, key, savedValues) {
  if (
    savedValues === undefined ||
    JSON.stringify(panel.detailDrafts?.get(key)?.values) ===
      JSON.stringify(savedValues)
  )
    panel.detailDrafts?.delete(key);
}
const draftsForTheme = (panel) =>
  [...(panel.detailDrafts?.entries() || [])].filter(
    ([, draft]) => draft.id === panel.selected,
  );
const busy = (panel) =>
  !!(
    panel.busy ||
    panel.externalApplying ||
    panel.c.externalApplying ||
    panel.editing ||
    panel.closePrompt ||
    panel.deleteConfirm
  );
// Preview and badge reads belong to their page resources and may finish after
// navigation. They must not make an enabled next/previous button silently inert.
// Unknown operations and writes remain protected, as do all busy editor states.
const readOperations = new Set([
  "list",
  "read",
  "background-media-info",
  "asset-read",
  "asset-open",
  "asset-poster-read",
  "transfer-read",
  "transfer-cancel",
  "asset-media-release",
]);
const blocked = (panel) =>
  busy(panel) ||
  [...(panel.c.pending?.values() || [])].some(
    (request) => !readOperations.has(request?.op),
  );

async function switchTheme(panel, id) {
  if (!Object.hasOwn(panel.c.summary.themes, id)) return;
  // Restore the original background before leaving an active preview. In
  // particular, wait for draft cleanup before the next read can start.
  if (panel.session.previewing || panel.c.preview) {
    await panel.cancel();
    panel.endPreview();
  } else panel.c.stopReplay(false);
  const previous = Object.fromEntries(
    [
      "selected",
      "doc",
      "baseRevision",
      "dirty",
      "history",
      "redo",
      "profile",
    ].map((key) => [key, panel[key]]),
  );
  try {
    await panel.load(id);
  } catch (error) {
    // Panel.load assigns selected before the request finishes. A failed read
    // must not leave the old document labelled as the new theme.
    Object.assign(panel, previous);
    throw error;
  }
  const page = panel.detailNavigation?.pages.get(id);
  if (page !== undefined && page !== panel.page) {
    panel.page = page;
    panel.libraryScrollTop = 0;
  }
  panel.libraryFocus = "theme-" + id;
  panel.metadataMode = null;
  panel.detailNavigationPending = null;
  panel.detail = true;
}

export async function navigateDetail(panel, direction) {
  if (blocked(panel) || panel.detailNavigationPending) return;
  const id = detailNavigationState(panel)[direction];
  if (!id) return;
  await panel.action(async () => {
    if (panel.dirty || draftsForTheme(panel).length) {
      panel.detailNavigationPending = { from: panel.selected, id };
      return;
    }
    await switchTheme(panel, id);
  })();
}

export async function resolveDetailNavigation(panel, choice) {
  if (blocked(panel)) return;
  const pending = panel.detailNavigationPending;
  if (!pending || pending.from !== panel.selected) return;
  if (choice === "continue") {
    panel.detailNavigationPending = null;
    panel.render();
    return;
  }
  if (!Object.hasOwn(panel.c.summary.themes, pending.id)) {
    panel.detailNavigationPending = null;
    panel.render();
    return;
  }
  await panel.action(async () => {
    if (choice === "save") {
      for (const [key, draft] of draftsForTheme(panel)) {
        if ((await draft.save(structuredClone(draft.values))) === false) return;
        if (panel.detailDrafts.get(key) === draft)
          panel.detailDrafts.delete(key);
      }
      if (panel.dirty) await panel.save();
      // An input changed while a save was in flight. Preserve that newer draft
      // and keep the confirmation open rather than navigating away from it.
      if (draftsForTheme(panel).length) return;
    } else if (choice === "discard") {
      await panel.cancel();
      for (const [key] of draftsForTheme(panel)) panel.detailDrafts.delete(key);
      if (panel.session.previewing || panel.c.preview) panel.endPreview();
    } else return;
    await switchTheme(panel, pending.id);
  })();
}

export function detailNavigationBar(panel) {
  const state = detailNavigationState(panel);
  const button = (direction, iconName) => {
    const result = h(
      "button",
      {
        type: "button",
        class: "detail-theme-step",
        "aria-label": label(direction),
        title: state[direction]
          ? label(direction) +
            " · " +
            panel.c.summary.themes[state[direction]].name
          : label(direction),
        "data-detail-navigation": direction,
        onclick: () => navigateDetail(panel, direction),
      },
      [icon(iconName), h("span", { text: label(direction) })],
    );
    // Pending reads may finish without a panel rerender. Check them on click
    // instead of leaving a stale disabled attribute after a preview finishes.
    result.disabled =
      busy(panel) || !!panel.detailNavigationPending || !state[direction];
    return result;
  };
  return h(
    "nav",
    {
      class: "detail-theme-navigation",
      "aria-label": label("navigation"),
    },
    [
      button("previous", "back"),
      h("span", {
        class: "detail-theme-position",
        text: state.current + " / " + state.total,
        role: "status",
        "aria-live": "polite",
        "aria-label": label("position", state),
      }),
      button("next", "forward"),
    ],
  );
}

export function detailNavigationPrompt(panel) {
  const pending = panel.detailNavigationPending;
  if (!pending || pending.from !== panel.selected) return null;
  const button = (text, choice) => {
    const result = h("button", {
      type: "button",
      text,
      onclick: () => resolveDetailNavigation(panel, choice),
    });
    result.disabled = busy(panel);
    return result;
  };
  return h("div", { class: "detail-navigation-prompt", role: "alert" }, [
    h("p", { text: t("panel.dirty") }),
    h("div", { class: "detail-actions" }, [
      button(label("save"), "save"),
      button(label("discard"), "discard"),
      button(t("panel.continueEditing"), "continue"),
    ]),
  ]);
}
