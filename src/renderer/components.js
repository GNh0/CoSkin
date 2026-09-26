import { t } from "./messages.js";
export const h = (tag, attributes = {}, children = []) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key.startsWith("on")) element.addEventListener(key.slice(2), value);
    else if (key === "text") element.textContent = value;
    else element.setAttribute(key, value);
  }
  element.append(...children);
  return element;
};
export function busyImage() {
  return h("div", {
    class: "thumb",
    text: t("loadingPreview"),
    role: "img",
    "aria-label": t("loadingPreview"),
  });
}
const iconPaths = {
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  image: "M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M8 7h.01",
  sparkles:
    "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 3v4M18 5h4",
  sliders: "M4 7h16M4 17h16M8 4v6M16 14v6",
  close: "M6 6l12 12M18 6L6 18",
  play: "M8 5l11 7-11 7z",
  stop: "M6 6h12v12H6z",
};
export function icon(name) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  element.setAttribute("viewBox", "0 0 24 24");
  element.setAttribute("width", "18");
  element.setAttribute("height", "18");
  element.setAttribute("fill", "none");
  element.setAttribute("stroke", "currentColor");
  element.setAttribute("stroke-width", "1.6");
  element.setAttribute("stroke-linecap", "round");
  element.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(element.namespaceURI, "path");
  path.setAttribute("d", iconPaths[name]);
  element.append(path);
  return element;
}
