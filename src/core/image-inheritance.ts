import type {
  LayerName,
  LayerStyle,
  Rule,
  ThemeDocument,
} from "./contracts.ts";
import { resolve } from "./engine.ts";

const imageProperties = [
  "image",
  "fit",
  "position",
  "opacity",
  "blurPx",
  "sizePx",
  "paddingPx",
  "imagePlayback",
] as const;

/** Only same-image conditional overrides are reset; other images and motion remain. */
export function inheritImageAppearance(
  document: ThemeDocument,
  profileId: string,
  target: string,
  item: string | null,
  layer: LayerName,
  base: LayerStyle,
  apply = false,
  includeOpacity = false,
): number {
  if (!base.image) return 0;
  const profile = document.theme.profiles.find(
    (profile) => profile.id === profileId,
  );
  const rules: Rule[] = [
    ...(profile?.rules || []),
    ...(document.localOverrides?.[profileId] || []),
  ].filter(
    (rule) => rule.target === target && (item ? rule.item === item : true),
  );
  let count = 0;
  for (const rule of rules)
    for (const [stateName, state] of Object.entries(rule.states)) {
      if (stateName === "base") continue;
      const style = state?.style?.[layer];
      if (!style || style.image === null) continue;
      const effective = resolve(
        [
          profile,
          {
            id: "local",
            name: "local",
            rules: document.localOverrides?.[profileId] || [],
          },
        ],
        target,
        rule.item || null,
        stateName === "selectedHover"
          ? { selected: true, hover: true }
          : { [stateName]: true },
      );
      if (effective.style?.[layer]?.image !== base.image) continue;
      const properties = includeOpacity
        ? imageProperties
        : imageProperties.filter((key) =>
            ["image", "fit", "position", "sizePx", "paddingPx"].includes(key),
          );
      const differs = properties.some(
        (key) =>
          Object.hasOwn(style, key) &&
          JSON.stringify(style[key]) !== JSON.stringify(base[key]),
      );
      if (!differs) continue;
      count++;
      if (apply) for (const key of properties) delete style[key];
    }
  return count;
}
