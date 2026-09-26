import { applicationLocale } from "./locale.js";
const errors = {
  ko: {
    "json-syntax":
      "JSON 문법 오류: {line}행, UTF-8 {column}바이트 위치를 확인해 주세요.",
    validation: "설정이나 파일 내용을 확인해 주세요.",
    "invalid-data": "파일이 손상되었거나 지원하지 않는 형식입니다.",
    "access-denied": "파일 접근 권한을 확인하지 못했습니다.",
    "file-error":
      "파일을 읽거나 저장하지 못했습니다. 원본과 마지막 적용 상태는 보존했습니다.",
    timeout: "응답 시간이 초과되었습니다. 다시 연결해 주세요.",
    unexpected: "요청을 처리하지 못했습니다. 진단 기록을 확인해 주세요.",
  },
  en: {
    "json-syntax": "JSON syntax error: check line {line}, UTF-8 byte {column}.",
    validation: "Check the settings and file contents.",
    "invalid-data": "The file is damaged or uses an unsupported format.",
    "access-denied": "File access could not be verified.",
    "file-error":
      "The file could not be read or saved. The source and last applied state were preserved.",
    timeout: "The response timed out. Reconnect and try again.",
    unexpected: "The request could not be completed. Check the diagnostic log.",
  },
  ja: {
    "json-syntax":
      "JSON構文エラー: {line}行、UTF-8の{column}バイト位置を確認してください。",
    validation: "設定とファイルの内容を確認してください。",
    "invalid-data": "ファイルが破損しているか、対応していない形式です。",
    "access-denied": "ファイルへのアクセス権限を確認できませんでした。",
    "file-error":
      "ファイルの読み込み・保存に失敗しました。元ファイルと最後の適用状態は保持しています。",
    timeout: "応答がタイムアウトしました。再接続してください。",
    unexpected: "処理できませんでした。診断ログを確認してください。",
  },
  "zh-CN": {
    "json-syntax": "JSON语法错误：请检查第{line}行、UTF-8第{column}字节位置。",
    validation: "请检查设置和文件内容。",
    "invalid-data": "文件已损坏或格式不受支持。",
    "access-denied": "无法验证文件访问权限。",
    "file-error": "无法读取或保存文件。已保留原文件和最后的应用状态。",
    timeout: "响应超时，请重新连接后重试。",
    unexpected: "无法完成请求，请查看诊断日志。",
  },
};
export function localizedFailure(error) {
  const locale = applicationLocale(document, navigator);
  // Detailed host validation messages are currently authored in Korean; preserve them only in that locale.
  if (locale === "ko" && error.code === "validation") return error.message;
  return (errors[locale][error.code] || errors[locale].unexpected)
    .replace("{line}", String(error.line ?? 1))
    .replace("{column}", String(error.column ?? 1));
}
export { errors };
