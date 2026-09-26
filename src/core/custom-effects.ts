import type { CustomEffectDefinition, Effect, Profile } from "./contracts.ts";

export const CUSTOM_EFFECT_LIMITS = {
  definitions: 32,
  bytes: 65536,
  definitionBytes: 8192,
  frames: 16,
  durationMs: 5000,
  iterations: 3,
} as const;
const ranges: Record<string, readonly [number, number]> = {
  opacity: [0, 1],
  translateXPx: [-1000, 1000],
  translateYPx: [-1000, 1000],
  scale: [0.1, 3],
  rotateDeg: [-360, 360],
  blurPx: [0, 20],
  insetTop: [0, 100],
  insetRight: [0, 100],
  insetBottom: [0, 100],
  insetLeft: [0, 100],
};
const layers = ["background", "decoration", "border", "icon", "text"];
function fields(
  value: unknown,
  allowed: string[],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw Error("사용자 효과 객체·속성 오류");
}
function text(value: unknown, maximum: number): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum)
    throw Error("사용자 효과 문자열 오류");
}
export function validateCustomEffects(
  definitions: CustomEffectDefinition[] | undefined,
): CustomEffectDefinition[] {
  if (definitions === undefined) return [];
  if (
    !Array.isArray(definitions) ||
    definitions.length > CUSTOM_EFFECT_LIMITS.definitions ||
    new TextEncoder().encode(JSON.stringify(definitions)).length >
      CUSTOM_EFFECT_LIMITS.bytes
  )
    throw Error("사용자 효과 정의 예산 초과");
  const ids = new Set<string>();
  for (const definition of definitions) {
    fields(definition, [
      "id",
      "version",
      "name",
      "description",
      "layers",
      "frames",
    ]);
    text(definition.id, 128);
    text(definition.name, 80);
    if (
      !/^custom\.[a-z0-9.-]{1,120}$/.test(definition.id) ||
      ids.has(definition.id) ||
      definition.version !== 1
    )
      throw Error("사용자 효과 ID·버전 오류");
    ids.add(definition.id);
    if (definition.description !== undefined) text(definition.description, 512);
    if (
      new TextEncoder().encode(JSON.stringify(definition)).length >
      CUSTOM_EFFECT_LIMITS.definitionBytes
    )
      throw Error("사용자 효과 파일 예산 초과");
    if (
      !Array.isArray(definition.layers) ||
      !definition.layers.length ||
      definition.layers.length > layers.length ||
      new Set(definition.layers).size !== definition.layers.length ||
      definition.layers.some((layer) => !layers.includes(layer))
    )
      throw Error("사용자 효과 레이어 오류");
    if (
      !Array.isArray(definition.frames) ||
      definition.frames.length < 2 ||
      definition.frames.length > CUSTOM_EFFECT_LIMITS.frames
    )
      throw Error("사용자 효과 프레임 개수 오류");
    let previous = -1;
    let shape = "";
    for (const frame of definition.frames) {
      fields(frame, ["offset", "values"]);
      if (
        !Number.isFinite(frame.offset) ||
        frame.offset < 0 ||
        frame.offset > 1 ||
        frame.offset <= previous
      )
        throw Error("사용자 효과 프레임 위치 오류");
      previous = frame.offset;
      fields(frame.values, Object.keys(ranges));
      const keys = Object.keys(frame.values).sort().join(",");
      if (!keys || (shape && shape !== keys))
        throw Error("사용자 효과 프레임 속성 불일치");
      shape = keys;
      for (const [key, value] of Object.entries(frame.values)) {
        const [minimum, maximum] = ranges[key];
        if (
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < minimum ||
          value > maximum
        )
          throw Error("사용자 효과 수치 범위 오류");
      }
    }
    if (
      definition.frames[0].offset !== 0 ||
      definition.frames.at(-1)?.offset !== 1
    )
      throw Error("사용자 효과 시작·끝 위치 오류");
  }
  return definitions;
}
export function customEffectProperties(
  definition: CustomEffectDefinition,
): string[] {
  const values = definition.frames[0].values;
  return [
    values.opacity !== undefined ? "opacity" : null,
    Object.keys(values).some((key) =>
      ["translateXPx", "translateYPx", "scale", "rotateDeg"].includes(key),
    )
      ? "transform"
      : null,
    values.blurPx !== undefined ? "filter" : null,
    Object.keys(values).some((key) => key.startsWith("inset"))
      ? "clipPath"
      : null,
  ].filter((value): value is string => !!value);
}
export function compileCustomFrames(
  definition: CustomEffectDefinition,
): Keyframe[] {
  return definition.frames.map(({ offset, values: v }) => {
    const frame: Keyframe = { offset };
    if (v.opacity !== undefined) frame.opacity = v.opacity;
    if (
      [v.translateXPx, v.translateYPx, v.scale, v.rotateDeg].some(
        (value) => value !== undefined,
      )
    )
      frame.transform = `translate(${v.translateXPx ?? 0}px,${v.translateYPx ?? 0}px) scale(${v.scale ?? 1}) rotate(${v.rotateDeg ?? 0}deg)`;
    if (v.blurPx !== undefined) frame.filter = `blur(${v.blurPx}px)`;
    if (
      [v.insetTop, v.insetRight, v.insetBottom, v.insetLeft].some(
        (value) => value !== undefined,
      )
    )
      frame.clipPath = `inset(${v.insetTop ?? 0}% ${v.insetRight ?? 0}% ${v.insetBottom ?? 0}% ${v.insetLeft ?? 0}%)`;
    return frame;
  });
}
export type RuntimeEffect = Effect & {
  customDefinition?: CustomEffectDefinition;
};
export function hydrateCustomProfile(
  profile: Profile,
  definitions: CustomEffectDefinition[] = [],
): Profile {
  if (!definitions.length) return profile;
  const hydrated = structuredClone(profile);
  for (const rule of hydrated.rules)
    for (const state of Object.values(rule.states))
      for (const list of Object.values(state.motion?.events || {}))
        for (const effect of list as RuntimeEffect[]) {
          const definition = definitions.find(
            (definition) => definition.id === effect.effect,
          );
          if (definition) effect.customDefinition = definition;
        }
  return hydrated;
}
