import { decodeMedia, disposeMedia } from "./media.js";
import { isVideoMime } from "../core/media-limits.js";
import { downloadBytes, downloadBlob, throwIfAborted } from "./file-transfer.js";
import { resolve } from "../core/engine.ts";
import { applyThemeTypography } from "./theme-typography.js";
import { t } from "./messages.js";
import { readPoster, storePoster } from "./poster-cache.js";
import { openAssetSource, decodeAssetSource } from "./media-source.js";
/** Draws a code-owned sample workspace. No current Codex content is read. */
export async function drawPreviewScene(context, controller, document, signal) {
  throwIfAborted(signal);
  const profile = document.theme.profiles.find(
    (p) => p.id === document.manifest.defaultProfile,
  );
  const styles = new Map();
  const images = new Map();
  const videos = [];
  const previewMedia = new Map();
  const animatedAssets = new Set();
  const styledProfile = {
    ...profile,
    autoTextColor: !!document.theme.autoTextColor,
    fontFamily: document.theme.fontFamily,
  };
  let loaded = false;
  const style = (target, state = {}) => {
    const key = target + JSON.stringify(state);
    if (!styles.has(key)) {
      const final = resolve([profile], target, null, state);
      if (loaded)
        applyThemeTypography(
          final,
          [styledProfile],
          (image) => previewMedia.get(document.assets[image]),
          target,
        );
      styles.set(key, final.style || {});
    }
    return styles.get(key);
  };
  try {
    for (const target of [
      "app.background",
      "navigation.bar",
      "navigation.home",
      "navigation.library",
      "navigation.images",
      "sidebar.surface",
      "sidebar.project-row",
      "sidebar.thread-row",
      "main.surface",
      "composer.surface",
      "composer.send",
    ])
      for (const layer of Object.values(style(target)))
        if (layer?.image && document.assets[layer.image]) {
          throwIfAborted(signal);
          const hash = document.assets[layer.image];
          if (images.has(hash)) continue;
          const videoAsset = /\.(mp4|webm)$/i.test(layer.image);
          const poster = videoAsset ? await readPoster(controller, hash, signal) : null;
          if (poster) {
            images.set(hash, poster);
            animatedAssets.add(hash);
            continue;
          }
          const source = await openAssetSource(controller, hash, signal);
          if (source) {
            const media = await decodeAssetSource(controller, source, signal);
            if (isVideoMime(source.mime)) {
              videos.push(media);
              images.set(hash, media.frames[0].image);
              await storePoster(controller, hash, media.frames[0].image, signal);
            } else {
              // Only the first image is used by the static gallery card.
              images.set(hash, media.frames[0].image);
              for (const frame of media.frames.slice(1)) frame.image.close();
              if (source.mime === "image/gif") animatedAssets.add(hash);
            }
            throwIfAborted(signal);
            continue;
          }
          const transfer = await controller.request("asset-read", {
            hash,
            largeChunks: true,
          });
          const mime = transfer.mime;
          if (mime === "image/gif") animatedAssets.add(hash);
          const bytes = await (isVideoMime(mime) ? downloadBlob : downloadBytes)(controller, transfer, signal);
          throwIfAborted(signal);
          if (isVideoMime(mime)) {
            const media = await decodeMedia(bytes, mime);
            videos.push(media);
            images.set(hash, media.frames[0].image);
            await storePoster(controller, hash, media.frames[0].image, signal);
          } else
            images.set(
              hash,
              await createImageBitmap(new Blob([bytes], { type: mime })),
            );
          throwIfAborted(signal);
        }
    throwIfAborted(signal);
    for (const [hash, image] of images)
      previewMedia.set(hash, {
        width: image.width,
        height: image.height,
        frames: [{ image }],
        videoUrl: videos.find((media) => media.frames[0].image === image)
          ?.videoUrl,
        animated: animatedAssets.has(hash),
      });
    loaded = true;
    styles.clear();
    const rounded = (x, y, w, h, r) => {
      context.beginPath();
      context.roundRect(x, y, w, h, r);
    };
    const surface = (target, x, y, w, h, color, r = 0, state = {}) => {
      const values = style(target, state);
      context.save();
      rounded(x, y, w, h, values.background?.radiusPx ?? r);
      context.clip();
      context.fillStyle = color;
      context.fillRect(x, y, w, h);
      for (const name of ["background", "decoration"]) {
        const layer = values[name];
        if (!layer) continue;
        context.globalAlpha = layer.opacity ?? 1;
        if (layer.color) {
          context.fillStyle = layer.color;
          context.fillRect(x, y, w, h);
        }
        const image = images.get(document.assets[layer.image]);
        if (image) {
          let iw = w,
            ih = h;
          if (layer.fit !== "stretch") {
            const factor =
              layer.fit === "contain"
                ? Math.min(w / image.width, h / image.height)
                : Math.max(w / image.width, h / image.height);
            iw = image.width * factor;
            ih = image.height * factor;
          }
          context.drawImage(
            image,
            x + (w - iw) * (layer.position?.x ?? 0.5),
            y + (h - ih) * (layer.position?.y ?? 0.5),
            iw,
            ih,
          );
        }
      }
      context.restore();
      if (values.border?.color) {
        context.save();
        context.globalAlpha = values.border.opacity ?? 1;
        context.strokeStyle = values.border.color;
        context.lineWidth = values.border.widthPx ?? 1;
        rounded(x + 0.5, y + 0.5, w - 1, h - 1, values.border.radiusPx ?? r);
        context.stroke();
        context.restore();
      }
      return values;
    };
    const label = (value, x, y, size = 11, color = "#aeb5c5", weight = 400) => {
      context.fillStyle = color;
      context.font =
        weight +
        " " +
        size +
        'px "' +
        (document.theme.fontFamily || "Segoe UI") +
        '",sans-serif';
      context.fillText(value, x, y);
    };
    const mainInk = style("main.surface").text?.color || "#eff2f9";
    const sidebarInk = style("sidebar.surface").text?.color || "#aeb5c5";
    const projectInk = style("sidebar.project-row").text?.color || sidebarInk;
    context.fillStyle = "#12141a";
    context.fillRect(0, 0, 640, 400);
    surface("app.background", 8, 8, 624, 384, "#1c2029", 12);
    context.fillStyle = "#ffffff09";
    context.fillRect(8, 8, 624, 25);
    for (let i = 0; i < 3; i++) {
      context.beginPath();
      context.arc(21 + i * 12, 20, 3, 0, Math.PI * 2);
      context.fillStyle = ["#ec7772", "#e9c06c", "#7ab998"][i];
      context.fill();
    }
    label("Codex", 72, 24, 10, "#a9afbd");
    surface("navigation.bar", 8, 33, 36, 359, "#151820");
    surface("sidebar.surface", 44, 33, 150, 359, "#191d26");
    surface("main.surface", 194, 33, 438, 359, "transparent");
    for (const [target, glyph, y] of [
      ["navigation.home", "⌂", 68],
      ["navigation.library", "▤", 108],
      ["navigation.images", "▧", 148],
    ]) {
      const values = surface(target, 14, y - 17, 24, 26, "#ffffff03", 7);
      const image = images.get(document.assets[values.icon?.image]);
      if (image) context.drawImage(image, 18, y - 13, 16, 16);
      else label(glyph, 20, y, 18, "#b8c0cf");
    }
    label("CoSkin", 64, 64, 13, sidebarInk, 600);
    label(t("sampleProject"), 64, 106, 10, sidebarInk, 500);
    surface("sidebar.project-row", 55, 118, 129, 25, "#ffffff04", 6);
    label("▱", 64, 135, 12, projectInk);
    label(t("sampleProject"), 81, 134, 10, projectInk);
    const selected = surface(
      "sidebar.thread-row",
      55,
      151,
      129,
      27,
      "#363b51",
      7,
      { selected: true },
    );
    label(t("sampleChat"), 70, 169, 10, selected.text?.color || sidebarInk);
    for (let i = 0; i < 3; i++) {
      surface("sidebar.thread-row", 55, 186 + i * 31, 129, 25, "#ffffff02", 6);
      context.fillStyle = "#69758b33";
      rounded(69, 195 + i * 31, 82 - i * 14, 5, 2);
      context.fill();
    }
    label("✦", 397, 131, 27, mainInk);
    label(t("samplePrompt"), 265, 167, 20, mainInk, 600);
    const composer = surface(
      "composer.surface",
      228,
      227,
      370,
      104,
      "#2c3341",
      15,
    );
    label(t("sampleComposer"), 244, 254, 11, composer.text?.color || "#aeb8ce");
    label("+", 245, 310, 19, "#c1cadc");
    surface("composer.send", 563, 292, 24, 24, "#c6d1e9", 12);
    label("↑", 570, 309, 15, "#252b3a", 600);
    label("CoSkin", 375, 361, 10, "#8e99b2");
  } finally {
    for (const image of images.values())
      if (!videos.some((media) => media.frames[0].image === image))
        image.close();
    for (const media of videos) disposeMedia(media);
  }
}
