const rgb = (hex) =>
  [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
const hex = (color) =>
  "#" +
  color
    .map((value) => Math.round(value).toString(16).padStart(2, "0"))
    .join("");
export const blendColors = (foreground, background, opacity) =>
  hex(
    rgb(foreground).map(
      (value, index) =>
        value * opacity + rgb(background)[index] * (1 - opacity),
    ),
  );
const luminance = (color) =>
  rgb(color)
    .map((value) => {
      const channel = value / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    })
    .reduce(
      (value, channel, index) =>
        value + channel * [0.2126, 0.7152, 0.0722][index],
      0,
    );
export const contrastRatio = (left, right) => {
  const a = luminance(left),
    b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
export function readableThemeColor(accent, background) {
  const backgrounds = Array.isArray(background) ? background : [background];
  const minimum = (color) =>
    Math.min(...backgrounds.map((surface) => contrastRatio(color, surface)));
  const end = minimum("#ffffff") >= minimum("#000000") ? "#ffffff" : "#000000";
  // Theme tint is secondary to legibility, including the brightest video frame.
  for (let weight = 0.9; weight <= 1.001; weight += 0.025) {
    const candidate = blendColors(end, accent, Math.min(1, weight));
    if (minimum(candidate) >= 4.5) return candidate;
  }
  return end;
}
export function paletteFromPixels(pixels) {
  const buckets = new Map();
  const total = [0, 0, 0];
  let darkest = "#20232c",
    lightest = "#20232c";
  let minimum = Infinity,
    maximum = -Infinity;
  let count = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] < 128) continue;
    const color = Array.from(pixels.slice(offset, offset + 3));
    const value = hex(color),
      light = luminance(value);
    if (light < minimum) {
      minimum = light;
      darkest = value;
    }
    if (light > maximum) {
      maximum = light;
      lightest = value;
    }
    color.forEach((value, index) => (total[index] += value));
    count++;
    const chroma = Math.max(...color) - Math.min(...color);
    if (chroma < 24) continue;
    const key = color.map((value) => Math.floor(value / 32)).join(",");
    const bucket = buckets.get(key) || { color: [0, 0, 0], count: 0, score: 0 };
    bucket.count++;
    bucket.score += chroma;
    bucket.color = bucket.color.map((value, index) => value + color[index]);
    buckets.set(key, bucket);
  }
  const dominant = [...buckets.values()].sort((a, b) => b.score - a.score)[0];
  return {
    accent: dominant
      ? hex(dominant.color.map((value) => value / dominant.count))
      : "#bda5ec",
    background: count ? hex(total.map((value) => value / count)) : "#20232c",
    bounds: [darkest, lightest],
  };
}
