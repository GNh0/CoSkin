const defaults = {
  "app.background": [1920, 1080],
  "main.surface": [1280, 800],
  "sidebar.surface": [320, 900],
  "sidebar.project-row": [300, 32],
  "sidebar.thread-row": [300, 32],
  "composer.surface": [800, 160],
  "sidebar.thread-preview": [320, 180],
  "summary.surface": [320, 420],
  "dialog.surface": [640, 480],
  "navigation.bar": [48, 900],
};
export function assetGuidance(target, layer, rectangle) {
  const icon = layer === "icon";
  const fallback =
    defaults[target] ||
    (target.startsWith("navigation.") ? [36, 36] : [640, 400]);
  const width = icon
    ? 32
    : Math.max(
        1,
        Math.round(
          Number.isFinite(rectangle?.width) && rectangle.width > 0
            ? rectangle.width
            : fallback[0],
        ),
      );
  const height = icon
    ? 32
    : Math.max(
        1,
        Math.round(
          Number.isFinite(rectangle?.height) && rectangle.height > 0
            ? rectangle.height
            : fallback[1],
        ),
      );
  const ratio = width / height;
  const common = [
    [1, 1],
    [16, 9],
    [16, 10],
    [4, 3],
    [3, 2],
    [3, 1],
    [8, 1],
    [10, 1],
    [1, 3],
    [1, 2],
  ];
  const match = common.find(([x, y]) => Math.abs(x / y / ratio - 1) < 0.025);
  const aspect = match
    ? match.join(":")
    : ratio >= 1
      ? ratio.toFixed(1) + ":1"
      : "1:" + (1 / ratio).toFixed(1);
  const round = (value) => Math.max(8, Math.round(value / 8) * 8);
  const scale = Math.min(
    target.endsWith("-row") ? 4 : 2,
    1920 / Math.max(width, height),
  );
  const recommended = icon
    ? [256, 256]
    : [round(width * scale), round(height * scale)];
  const animatedScale = Math.min(
    1,
    768 / Math.max(...recommended),
    Math.sqrt(384000 / (recommended[0] * recommended[1])),
  );
  const gif = icon
    ? [128, 128]
    : recommended.map((value) => round(value * animatedScale));
  return {
    width,
    height,
    aspect,
    recommended: recommended.join(" × "),
    gif: gif.join(" × "),
    measured: !icon && !!rectangle?.width && !!rectangle?.height,
  };
}
