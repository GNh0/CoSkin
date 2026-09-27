import {
  paletteFromPixels,
  readableThemeColor,
  blendColors,
  contrastRatio,
} from "../core/theme-colors.js";
import { resolve } from "../core/engine.ts";
const palettes = new WeakMap();
export function mediaPalette(media) {
  if (!media?.frames?.[0]?.image) return null;
  if (!palettes.has(media)) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 24;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(media.frames[0].image, 0, 0, 24, 24);
    palettes.set(
      media,
      paletteFromPixels(context.getImageData(0, 0, 24, 24).data),
    );
  }
  return palettes.get(media);
}
export function applyThemeTypography(final, profiles, asset, target) {
  const text = final.style?.text;
  if (text === null) return;
  const family = text?.family || profiles.at(-1)?.fontFamily;
  if (family) {
    final.style ??= {};
    final.style.text = { ...text, family, cascade: true };
  }
  if (text?.autoColor === false && text.color) {
    final.style.text = { ...final.style.text, cascade: true };
    return;
  }
  if (
    text === null ||
    text?.autoColor === false ||
    !(text?.autoColor === true || profiles.at(-1)?.autoTextColor)
  )
    return;
  const wallpaper = [...profiles]
    .reverse()
    .flatMap((profile) => profile.rules)
    .find(
      (rule) =>
        ["app.background", "main.surface"].includes(rule.target) &&
        rule.states.base?.style?.background?.image,
    )?.states.base.style.background;
  const themePalette = mediaPalette(
    wallpaper?.image ? asset(wallpaper.image) : null,
  );
  const own = final.style?.background;
  const mediaBounds = (layer) => {
    const media = layer?.image ? asset(layer.image) : null;
    const palette = mediaPalette(media);
    return media?.videoUrl || media?.animated || media?.frames?.length > 1
      ? ["#000000", "#ffffff"]
      : palette?.bounds || [layer?.color || "#20232c"];
  };
  const paint = (layer, behind) => {
    if (!layer) return behind;
    return [
      ...new Set(
        mediaBounds(layer).flatMap((color) =>
          behind.map((base) => blendColors(color, base, layer.opacity ?? 1)),
        ),
      ),
    ];
  };
  let behind =
    target === "app.background" ? ["#20232c"] : paint(wallpaper, ["#20232c"]);
  const parents =
    target?.startsWith("sidebar.") && target !== "sidebar.surface"
      ? ["sidebar.surface"]
      : target?.startsWith("navigation.") && target !== "navigation.bar"
        ? ["navigation.bar"]
        : target === "composer.send"
          ? ["main.surface", "composer.surface"]
          : ["composer.surface", "summary.surface"].includes(target)
            ? ["main.surface"]
            : [];
  for (const parent of parents)
    behind = paint(
      resolve(profiles, parent, null, {}).style?.background,
      behind,
    );
  let backgrounds = paint(own, behind);
  const accent =
    themePalette?.accent || final.style?.border?.color || "#bda5ec";
  let color = readableThemeColor(accent, backgrounds);
  if (
    own?.color &&
    !own.image &&
    backgrounds.some((background) => contrastRatio(color, background) < 4.5)
  ) {
    // A single color cannot cover both light and dark frames without a stable surface.
    let opacity = own.opacity ?? 1;
    while (
      opacity < 1 &&
      backgrounds.some((background) => contrastRatio(color, background) < 4.5)
    ) {
      opacity = Math.min(1, opacity + 0.025);
      backgrounds = paint({ ...own, opacity }, behind);
      color = readableThemeColor(accent, backgrounds);
    }
    final.style.background = { ...own, opacity };
  }
  final.style ??= {};
  final.style.text = {
    ...final.style.text,
    color,
    opacity: 1,
    cascade: true,
  };
}
