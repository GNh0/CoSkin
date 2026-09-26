import { pageStyles } from "./page-styles.js";
let sheet;
export function adoptUiStyles(shadow) {
  sheet ||= new CSSStyleSheet();
  if (!sheet.cssRules.length) sheet.replaceSync(pageStyles);
  shadow.adoptedStyleSheets = [sheet];
}
