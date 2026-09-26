/** Supported application locales. Chinese variants intentionally fall back to Simplified Chinese. */
export function normalizeLocale(value) {
  const language = String(value || "")
    .replaceAll("_", "-")
    .toLowerCase();
  if (language.startsWith("ko")) return "ko";
  if (language.startsWith("ja")) return "ja";
  if (language.startsWith("zh")) return "zh-CN";
  return "en";
}
export function applicationLocale(document, navigator) {
  return normalizeLocale(
    document.documentElement.lang || navigator.language || "en",
  );
}
export function observeApplicationLocale(document, navigator, onChange) {
  let current = applicationLocale(document, navigator);
  const observer = new MutationObserver(() => {
    const next = applicationLocale(document, navigator);
    if (next !== current || document.documentElement.dataset.theme) {
      current = next;
      onChange(next);
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang", "data-theme"],
  });
  return { current, dispose: () => observer.disconnect() };
}
