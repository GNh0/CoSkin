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
  star: "M12 3l2.8 5.8 6.4.9-4.6 4.5 1.1 6.4L12 17.6l-5.7 3 1.1-6.4-4.6-4.5 6.4-.9z",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  image: "M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M8 7h.01",
  sparkles:
    "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 3v4M18 5h4",
  sliders: "M4 7h16M4 17h16M8 4v6M16 14v6",
  close: "M6 6l12 12M18 6L6 18",
  play: "M8 5l11 7-11 7z",
  stop: "M6 6h12v12H6z",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  folder: "M3 7V4h6l3 3h9v13H3z",
  home: "M3 11l9-8 9 8M5 10v11h14V10M9 21v-7h6v7",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  list: "M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01",
  tree: "M4 3v15h5M4 8h5M10 5h10v6H10zM10 15h10v6H10z",
  sidebar: "M3 3h18v18H3zM9 3v18",
  chevron: "M9 5l7 7-7 7",
  back: "M14 5l-7 7 7 7",
  forward: "M10 5l7 7-7 7",
  up: "M5 14l7-7 7 7",
  plus: "M12 4v16M4 12h16",
  check: "M4 12l5 5L20 6",
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
