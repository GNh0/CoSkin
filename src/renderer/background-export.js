import { h } from "./components.js";
import { applicationLocale } from "./locale.js";
import {
  backgroundExportFormats,
  backgroundExportRequest,
} from "./background-export-options.js";

export const backgroundExportMessages = {
  ko: {
    title: "배경 추출",
    format: "저장 형식",
    original: "원본 파일 그대로",
    rawSave: "원본 화질 그대로 받기",
    originalHint: "원본 파일을 해상도 변경·재압축 없이 그대로 저장합니다.",
    duplicate: "이미 목록에 있는 다운로드입니다.",
    downloads: "다운로드 목록",
    downloadsHint: "창을 닫아도 CoSkin이 실행 중이면 다운로드가 계속됩니다.",
    limit: "동시 다운로드",
    listSummary: "진행 {running}개 · 대기 {queued}개 · 전체 {total}개",
    retry: "다시 받기",
    clear: "종료된 기록 지우기",
    clearHint: "목록의 기록만 지우며 저장한 파일은 유지합니다.",
    empty: "다운로드 목록이 비어 있습니다.",
    previous: "이전",
    next: "다음",
    page: "{start}–{end} / {total}",
    resolution: "해상도",
    native: "원본 해상도",
    custom: "직접 입력",
    width: "가로(px)",
    height: "세로(px)",
    aspect: "화면 비율 유지",
    quality: "압축 화질",
    high: "고화질",
    standard: "표준",
    compact: "작은 용량",
    time: "추출 시점(초)",
    hint: "JPG·MP4는 투명 영역을 검정색으로 저장합니다. 비율 유지 시 지정한 크기 안에 맞춥니다.",
    converter: "변환기 선택",
    converterHint:
      "형식·해상도를 변환하려면 FFmpeg 변환기를 선택하세요. 원본 저장은 바로 사용할 수 있습니다.",
    save: "저장 위치 선택하고 추출",
    cancel: "추출 취소",
    loading: "배경 정보 확인 중…",
    picking: "저장 위치 선택 중…",
    queued: "추출 대기 중…",
    running: "배경 추출 중…",
    completed: "배경을 저장했습니다.",
    canceled: "추출을 취소했습니다.",
    invalid: "해상도와 추출 시점을 확인해 주세요.",
    failed: "배경 추출을 완료하지 못했습니다.",
    close: "닫기",
  },
  en: {
    title: "Extract background",
    format: "File format",
    original: "Original file unchanged",
    rawSave: "Download original quality",
    originalHint: "Save the original file without resizing or recompression.",
    duplicate: "This download is already in the list.",
    downloads: "Downloads",
    downloadsHint:
      "Downloads continue when this panel closes while CoSkin is running.",
    limit: "Concurrent downloads",
    listSummary: "{running} running · {queued} queued · {total} total",
    retry: "Retry",
    clear: "Clear finished records",
    clearHint: "Only list records are cleared. Saved files are kept.",
    empty: "No downloads in the list.",
    previous: "Previous",
    next: "Next",
    page: "{start}–{end} / {total}",
    resolution: "Resolution",
    native: "Original resolution",
    custom: "Custom",
    width: "Width (px)",
    height: "Height (px)",
    aspect: "Keep aspect ratio",
    quality: "Compression quality",
    high: "High",
    standard: "Standard",
    compact: "Smaller file",
    time: "Frame time (seconds)",
    hint: "JPG and MP4 flatten transparent areas over black. Keep aspect ratio fits within the specified size.",
    converter: "Select converter",
    converterHint:
      "Select FFmpeg to convert the format or resolution. Original files can be saved directly.",
    save: "Choose location and extract",
    cancel: "Cancel export",
    loading: "Reading background…",
    picking: "Choose a save location…",
    queued: "Export queued…",
    running: "Exporting background…",
    completed: "Background saved.",
    canceled: "Export canceled.",
    invalid: "Check the dimensions and frame time.",
    failed: "Background export failed.",
    close: "Close",
  },
  ja: {
    title: "背景を書き出す",
    format: "保存形式",
    original: "元のファイルをそのまま保存",
    rawSave: "元の画質でダウンロード",
    originalHint: "解像度の変更や再圧縮をせず、元のファイルを保存します。",
    duplicate: "すでに一覧にあるダウンロードです。",
    downloads: "ダウンロード一覧",
    downloadsHint:
      "CoSkinが起動していれば、この画面を閉じてもダウンロードは続きます。",
    limit: "同時ダウンロード数",
    listSummary: "実行中 {running}件・待機 {queued}件・全 {total}件",
    retry: "再試行",
    clear: "終了した履歴を消す",
    clearHint: "一覧の履歴だけを消し、保存したファイルは残します。",
    empty: "ダウンロード一覧は空です。",
    previous: "前へ",
    next: "次へ",
    page: "{start}–{end} / {total}",
    resolution: "解像度",
    native: "元の解像度",
    custom: "指定する",
    width: "幅(px)",
    height: "高さ(px)",
    aspect: "縦横比を維持",
    quality: "圧縮品質",
    high: "高画質",
    standard: "標準",
    compact: "小さいファイル",
    time: "フレームの時刻(秒)",
    hint: "JPG・MP4では透明部分が黒になります。縦横比を維持する場合は指定サイズ内に収めます。",
    converter: "変換ツールを選択",
    converterHint:
      "形式や解像度を変えるにはFFmpegを選択してください。元のファイルはすぐに保存できます。",
    save: "保存場所を選んで書き出す",
    cancel: "書き出しを中止",
    loading: "背景情報を読み込み中…",
    picking: "保存場所を選択中…",
    queued: "書き出し待機中…",
    running: "背景を書き出し中…",
    completed: "背景を保存しました。",
    canceled: "書き出しを中止しました。",
    invalid: "解像度とフレームの時刻を確認してください。",
    failed: "背景を書き出せませんでした。",
    close: "閉じる",
  },
  "zh-CN": {
    title: "导出背景",
    format: "文件格式",
    original: "保留原始文件",
    rawSave: "下载原始画质",
    originalHint: "直接保存原始文件，不缩放或重新压缩。",
    duplicate: "此下载已在列表中。",
    downloads: "下载列表",
    downloadsHint: "CoSkin运行时，关闭此面板后下载仍会继续。",
    limit: "同时下载数量",
    listSummary: "进行中 {running} 个 · 等待 {queued} 个 · 共 {total} 个",
    retry: "重试",
    clear: "清除已结束记录",
    clearHint: "仅清除列表记录，保留已保存的文件。",
    empty: "下载列表为空。",
    previous: "上一页",
    next: "下一页",
    page: "{start}–{end} / {total}",
    resolution: "分辨率",
    native: "原始分辨率",
    custom: "自定义",
    width: "宽度(px)",
    height: "高度(px)",
    aspect: "保持宽高比",
    quality: "压缩质量",
    high: "高画质",
    standard: "标准",
    compact: "较小文件",
    time: "截取时间(秒)",
    hint: "JPG、MP4会将透明区域合成为黑色。保持宽高比时，图片会缩放至指定范围内。",
    converter: "选择转换工具",
    converterHint: "转换格式或分辨率需要选择FFmpeg。原始文件可以直接保存。",
    save: "选择位置并导出",
    cancel: "取消导出",
    loading: "正在读取背景信息…",
    picking: "正在选择保存位置…",
    queued: "等待导出…",
    running: "正在导出背景…",
    completed: "背景已保存。",
    canceled: "已取消导出。",
    invalid: "请检查分辨率和截取时间。",
    failed: "背景导出失败。",
    close: "关闭",
  },
};
export function backgroundExportText(key, values = {}) {
  const locale = applicationLocale(document, navigator);
  return (backgroundExportMessages[locale] || backgroundExportMessages.en)[
    key
  ]?.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}

export function backgroundExportForm(panel) {
  const identity = {
    id: panel.selected,
    revision: panel.baseRevision,
    profile: panel.profile,
  };
  const key = JSON.stringify(identity);
  panel.backgroundExports ??= new Map();
  if (!panel.backgroundExports.has(key))
    panel.backgroundExports.set(key, {
      format: "original",
      resolution: "original",
      width: 1920,
      height: 1080,
      quality: "high",
      keepAspect: true,
      timeSeconds: 0,
    });
  const state = panel.backgroundExports.get(key);
  state.listeners ??= new Set();
  const notify = () => {
    for (const listener of state.listeners) listener();
  };
  const label = backgroundExportText;
  const root = h("div", { class: "panel-card background-export-form" });
  const status = h("p", {
    role: "status",
    "aria-live": "polite",
    text: label("loading"),
  });
  const controls = h("div", { class: "background-export-fields" });
  const progress = h("progress", {
    max: "1",
    hidden: "",
    "aria-label": label("running"),
  });
  const cancel = h("button", {
    type: "button",
    text: label("cancel"),
    hidden: "",
  });
  const save = h("button", {
    type: "button",
    class: "primary",
    text: label("save"),
    disabled: "",
  });
  const rawSave = h("button", {
    type: "button",
    class: "primary",
    text: label("rawSave"),
    disabled: "",
  });
  const downloads = panel.button(label("downloads"), () => {
    panel.downloadsOpen = true;
  });
  const close = panel.button(label("close"), () => {
    panel.backgroundExportOpen = false;
  });
  root.append(
    h("h2", { text: label("title") }),
    h("p", { text: label("originalHint") }),
    controls,
    progress,
    status,
    h("div", { class: "detail-actions" }, [
      rawSave,
      save,
      cancel,
      downloads,
      close,
    ]),
  );
  let alive = true;
  let timer;
  let wake;
  let polling = false;
  panel.pageResources.push(() => {
    alive = false;
    clearTimeout(timer);
    wake?.();
    state.listeners.delete(changed);
  });
  const updateButtons = () => {
    save.disabled =
      !state.info ||
      !!state.starting ||
      (state.format !== "original" && !state.info.converterAvailable);
    rawSave.disabled = !state.info || !!state.starting;
    cancel.hidden = !state.jobId;
    progress.hidden = !state.jobId;
  };
  const poll = async () => {
    if (polling) return;
    polling = true;
    try {
      while (alive && state.jobId) {
        const jobId = state.jobId;
        const result = await panel.c.request("background-export-status", {
          jobId,
        });
        if (!alive) return;
        if (state.jobId !== jobId) continue;
        if (typeof result.progress === "number")
          progress.value = result.progress;
        else progress.removeAttribute("value");
        status.textContent =
          (state.duplicate ? label("duplicate") + " " : "") +
          (label(result.state) || label("running"));
        if (result.error) status.textContent += " " + result.error;
        if (["completed", "canceled", "failed"].includes(result.state)) {
          state.lastMessage =
            status.textContent + (result.path ? " " + result.path : "");
          state.jobId = null;
          notify();
          return;
        }
        await new Promise((resolve) => {
          wake = resolve;
          timer = setTimeout(resolve, 1000);
        });
      }
    } finally {
      polling = false;
    }
  };
  const fail = (error) => {
    if (alive) {
      status.textContent = label("failed") + " " + error.message;
      updateButtons();
    }
  };
  const start = async (original = false) => {
    if (state.starting) return;
    let request;
    try {
      request = backgroundExportRequest(
        identity,
        original ? { ...state, format: "original" } : state,
      );
    } catch {
      status.textContent = label("invalid");
      return;
    }
    state.starting = true;
    notify();
    try {
      const result = await panel.c.request("background-export-start", request);
      state.starting = false;
      if (result.canceled) state.lastMessage = label("canceled");
      else {
        state.jobId = result.jobId;
        state.duplicate = !!result.duplicate;
      }
      notify();
    } catch (error) {
      state.starting = false;
      state.lastMessage = label("failed") + " " + error.message;
      notify();
    }
  };
  save.addEventListener("click", () => start());
  rawSave.addEventListener("click", () => start(true));
  cancel.addEventListener("click", () =>
    panel.c
      .request("background-export-cancel", { jobId: state.jobId })
      .catch(fail),
  );
  const field = (label, element) =>
    h("label", { class: "background-export-field" }, [
      h("span", { text: label }),
      element,
    ]);
  const select = (name, values) => {
    const element = h(
      "select",
      {},
      values.map(([value, text]) => h("option", { value, text })),
    );
    element.value = state[name];
    element.addEventListener("change", () => {
      state[name] = element.value;
      sync();
    });
    return element;
  };
  const format = select("format", []);
  const resolution = select("resolution", [
    ["original", label("native")],
    ["720", "720p"],
    ["1080", "1080p"],
    ["custom", label("custom")],
  ]);
  const quality = select("quality", [
    ["high", label("high")],
    ["standard", label("standard")],
    ["compact", label("compact")],
  ]);
  const qualityField = field(label("quality"), quality);
  const number = (name, min, max, step = 1) => {
    const input = h("input", {
      type: "number",
      min: String(min),
      max: String(max),
      step: String(step),
    });
    input.value = String(state[name]);
    input.addEventListener("input", () => {
      state[name] = input.value;
    });
    return input;
  };
  const size = h("div", { class: "background-export-fields" }, [
    field(label("width"), number("width", 2, 8192)),
    field(label("height"), number("height", 2, 8192)),
  ]);
  const aspect = h("input", { type: "checkbox" });
  aspect.checked = state.keepAspect;
  aspect.addEventListener("change", () => {
    state.keepAspect = aspect.checked;
  });
  const aspectField = field(label("aspect"), aspect);
  const timeField = field(
    label("time"),
    number("timeSeconds", 0, 604800, 0.01),
  );
  const converter = h("button", { type: "button", text: label("converter") });
  const converterHint = h("p", { text: label("converterHint") });
  const converterBox = h("div", {}, [converterHint, converter]);
  const sync = () => {
    if (state.format === "original") {
      state.resolution = "original";
      resolution.value = "original";
    }
    resolution.disabled = state.format === "original" || !!state.starting;
    quality.disabled =
      ["original", "png", "gif"].includes(state.format) || !!state.starting;
    qualityField.hidden = ["original", "png", "gif"].includes(state.format);
    format.disabled = !!state.starting;
    for (const input of controls.querySelectorAll("input"))
      input.disabled = !!state.starting;
    size.hidden = state.resolution !== "custom";
    aspectField.hidden = state.resolution !== "custom";
    timeField.hidden =
      !["jpg", "png"].includes(state.format) || state.info?.kind === "image";
    converterBox.hidden = !state.info || state.info.converterAvailable;
    updateButtons();
  };
  const changed = () => {
    if (!alive) return;
    sync();
    if (state.starting) status.textContent = label("picking");
    else if (!state.jobId) status.textContent = state.lastMessage || "";
    if (state.jobId) poll().catch(fail);
  };
  state.listeners.add(changed);
  controls.append(
    field(label("format"), format),
    field(label("resolution"), resolution),
    qualityField,
    size,
    aspectField,
    timeField,
    h("p", { text: label("hint") }),
    converterBox,
  );
  converter.addEventListener("click", async () => {
    converter.disabled = true;
    try {
      Object.assign(
        state.info,
        await panel.c.request("background-export-converter-pick"),
      );
      sync();
    } catch (error) {
      fail(error);
    } finally {
      converter.disabled = false;
    }
  });
  Promise.resolve()
    .then(async () => {
      state.info = await panel.c.request("background-export-info", identity);
      if (!alive) return;
      format.replaceChildren(
        ...backgroundExportFormats(state.info.kind).map((value) =>
          h("option", {
            value,
            text:
              value === "original"
                ? `${label("original")} (.${state.info.originalFormat})`
                : value.toUpperCase(),
          }),
        ),
      );
      format.value = state.format;
      notify();
    })
    .catch(fail);
  return root;
}
