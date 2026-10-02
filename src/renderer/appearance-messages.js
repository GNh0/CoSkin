import { applicationLocale } from "./locale.js";

const messages = {
  ko: {
    hideGreeting: "시작 화면 안내 숨기기",
    hideGreetingHelp:
      "새 채팅과 프로젝트의 시작 문구·장식 아이콘을 숨깁니다. 입력창은 유지됩니다.",
    backgroundOnly: "배경만 보기",
    restore: "화면 복구",
    restoreHelp: "화면 복구 · Esc",
    image: "이미지",
    animated: "움짤",
    video: "동영상",
    none: "배경 미디어 없음",
    unknown: "배경 정보 확인 불가",
    durationUnknown: "길이 확인 불가",
    assets: "미디어 파일 {count}개",
  },
  en: {
    hideGreeting: "Hide start screen greeting",
    hideGreetingHelp:
      "Hide the greeting and decorative icon on new chats and projects. Keep the composer visible.",
    backgroundOnly: "Background only",
    restore: "Restore interface",
    restoreHelp: "Restore interface · Esc",
    image: "Image",
    animated: "Animated GIF",
    video: "Video",
    none: "No background media",
    unknown: "Background info unavailable",
    durationUnknown: "Duration unavailable",
    assets: "{count} media files",
  },
  ja: {
    hideGreeting: "開始画面の案内を非表示",
    hideGreetingHelp:
      "新しいチャットとプロジェクトの案内・装飾アイコンを隠します。入力欄は残ります。",
    backgroundOnly: "背景のみ表示",
    restore: "画面を復元",
    restoreHelp: "画面を復元 · Esc",
    image: "画像",
    animated: "アニメーションGIF",
    video: "動画",
    none: "背景メディアなし",
    unknown: "背景情報を確認できません",
    durationUnknown: "長さ不明",
    assets: "メディアファイル {count}個",
  },
  "zh-CN": {
    hideGreeting: "隐藏开始页面提示",
    hideGreetingHelp: "隐藏新聊天和项目的提示与装饰图标，保留输入框。",
    backgroundOnly: "仅显示背景",
    restore: "恢复界面",
    restoreHelp: "恢复界面 · Esc",
    image: "图片",
    animated: "动图",
    video: "视频",
    none: "无背景媒体",
    unknown: "背景信息不可用",
    durationUnknown: "时长未知",
    assets: "{count}个媒体文件",
  },
};
export const appearanceText = (key, values = {}) =>
  messages[applicationLocale(document, navigator)][key].replace(
    /\{(\w+)\}/g,
    (_, name) => String(values[name] ?? ""),
  );
