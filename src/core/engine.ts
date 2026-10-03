import type {
  StateName,
  LayerName,
  EventName,
  Effect,
  EffectDefinition,
  Profile,
  Theme,
  ThemeState,
  Flags,
  Manifest,
} from "./contracts.ts";
import {
  validateCustomEffects,
  customEffectProperties,
  compileCustomFrames,
  CUSTOM_EFFECT_LIMITS,
} from "./custom-effects.ts";
import type { RuntimeEffect } from "./custom-effects.ts";
import { MEDIA_LIMITS } from "./media-limits.js";
import { navigationDestinations } from "./navigation-targets.js";
// Pure contract shared by the renderer and executable tests. No CSS or code comes from themes.
export const STATES: StateName[] = [
  "base",
  "selected",
  "hover",
  "selectedHover",
  "focusVisible",
  "pressed",
  "disabled",
];
export const TARGETS = [
  "app.background",
  "navigation.bar",
  "navigation.search",
  ...navigationDestinations.map(([, target]) => target),
  "navigation.new-thread",
  "sidebar.surface",
  "sidebar.project-row",
  "sidebar.thread-row",
  "sidebar.thread-preview",
  "main.surface",
  "message.surface",
  "summary.surface",
  "composer.surface",
  "composer.send",
  "composer.stop",
  "toolbar.button",
  "popover.surface",
  "dialog.surface",
];
export const EFFECTS: Record<string, EffectDefinition> = {
  "reveal.edge": {
    properties: ["clipPath"],
    layers: ["background", "decoration"],
    parameters: {
      direction: [
        "left-to-right",
        "right-to-left",
        "top-to-bottom",
        "bottom-to-top",
      ],
    },
  },
  "reveal.center": {
    properties: ["clipPath"],
    layers: ["background", "decoration"],
    parameters: { axis: ["x", "y"] },
  },
  "reveal.diagonal": {
    properties: ["clipPath"],
    layers: ["background", "decoration"],
    parameters: {},
  },
  "move.slide": {
    properties: ["transform"],
    parameters: { x: [-100, 100], y: [-100, 100] },
  },
  "scale.appear": {
    properties: ["transform"],
    parameters: { scale: [0.1, 2] },
  },
  "scale.bounce": {
    properties: ["transform"],
    parameters: { intensity: [0, 1] },
  },
  fade: { properties: ["opacity"], parameters: { from: [0, 1] } },
  "blur.clear": { properties: ["filter"], parameters: { blurPx: [0, 20] } },
  "light.glow": {
    properties: ["filter"],
    layers: ["border", "decoration"],
    parameters: { intensity: [0, 30] },
  },
  "light.sweep": {
    properties: ["transform"],
    layers: ["decoration"],
    parameters: { angle: [-180, 180] },
  },
  "gradient.move": {
    properties: ["backgroundPosition"],
    layers: ["background", "decoration"],
    parameters: { distance: [0, 100] },
  },
  "border.flow": {
    properties: ["filter"],
    layers: ["border"],
    parameters: { intensity: [0, 30] },
  },
  "icon.rotate": {
    properties: ["transform"],
    layers: ["icon"],
    parameters: { angle: [-360, 360] },
  },
  "icon.shake": {
    properties: ["transform"],
    layers: ["icon"],
    parameters: { distance: [0, 20] },
  },
  "icon.pulse": {
    properties: ["transform"],
    layers: ["icon"],
    parameters: { scale: [1, 1.5] },
  },
  "click.ripple": {
    properties: ["transform", "opacity"],
    layers: ["decoration"],
    parameters: { radius: [1, 200] },
  },
};
export const capabilities = [
  ...TARGETS.map((t) => "target:" + t),
  ...Object.keys(EFFECTS).map((e) => "effect:" + e + "@1"),
];
export function merge<T>(a: T, b: unknown): T {
  if (b === null) return null as T;
  if (Array.isArray(b)) return structuredClone(b) as T;
  if (b && typeof b === "object") {
    const out: Record<string, unknown> =
      a && typeof a === "object" && !Array.isArray(a)
        ? (structuredClone(a) as Record<string, unknown>)
        : {};
    for (const [k, v] of Object.entries(b)) out[k] = merge(out[k], v);
    return out as T;
  }
  return b as T;
}
export function resolve(
  profiles: (Profile | undefined)[],
  target: string,
  item: string | null,
  flags: Flags,
): ThemeState {
  let states: Partial<Record<StateName, ThemeState>> = {};
  for (const profile of profiles.filter((p): p is Profile => Boolean(p))) {
    for (const rule of profile.rules.filter(
      (r) => r.target === target && !r.item,
    ))
      states = merge(states, rule.states);
    for (const rule of profile.rules.filter(
      (r) => r.target === target && r.item === item,
    ))
      states = merge(states, rule.states);
  }
  let result: ThemeState = {};
  for (const s of STATES) {
    if (
      s === "base" ||
      (s === "selectedHover" && flags.selected && flags.hover) ||
      flags[s]
    )
      result = merge(result, states[s] || {});
  }
  return result;
}
const fail = (m: string): never => {
  throw new Error(m);
};
const keys = (o: unknown, allowed: string[]) => {
  if (!o || typeof o !== "object" || Array.isArray(o))
    fail("객체가 필요합니다.");
  for (const k of Object.keys(o as object))
    if (!allowed.includes(k)) fail("알 수 없는 필드: " + k);
};
const num = (v: unknown, a: number, b: number) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < a || v > b)
    fail("숫자 범위 오류");
};
export function validateManifest(manifest: Manifest) {
  keys(manifest, [
    "format",
    "formatVersion",
    "id",
    "name",
    "version",
    "description",
    "author",
    "engine",
    "requirements",
    "entry",
    "defaultProfile",
    "preview",
    "files",
  ]);
  const bounded = (value: unknown, maximum: number) => {
    if (typeof value !== "string" || !value.length || value.length > maximum)
      fail("문자열 길이·타입 오류");
  };
  if (
    manifest.format !== "coskin.theme" ||
    manifest.formatVersion !== 1 ||
    manifest.entry !== "theme.json"
  )
    fail("테마 형식 오류");
  bounded(manifest.id, 128);
  if (!/^[a-z0-9._-]+$/.test(manifest.id)) fail("테마 ID 오류");
  bounded(manifest.name, 256);
  bounded(manifest.defaultProfile, 128);
  const versionPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
  bounded(manifest.version, 64);
  if (!versionPattern.test(manifest.version)) fail("테마 버전 오류");
  if (manifest.description !== undefined) {
    bounded(manifest.description, 4096);
  }
  keys(manifest.author, ["name"]);
  bounded(manifest.author.name, 256);
  keys(manifest.engine, ["minVersion"]);
  bounded(manifest.engine.minVersion, 64);
  if (!versionPattern.test(manifest.engine.minVersion)) fail("엔진 버전 오류");
  keys(manifest.requirements, ["required", "optional"]);
  const declared: string[] = [];
  for (const list of [
    manifest.requirements.required,
    manifest.requirements.optional,
  ]) {
    if (!Array.isArray(list) || list.length > 256) fail("지원 기능 목록 오류");
    for (const capability of list) {
      bounded(capability, 160);
      if (
        !/^(target:[a-z0-9.-]+|effect:[a-z0-9.-]+@[1-9][0-9]*)$/.test(
          capability,
        ) ||
        declared.includes(capability)
      )
        fail("지원 기능 ID 오류");
      declared.push(capability);
    }
  }
  if (!Array.isArray(manifest.files) || manifest.files.length > 511)
    fail("파일 목록 오류");
  const paths = new Set<string>();
  for (const file of manifest.files) {
    keys(file, ["path", "bytes", "sha256"]);
    if (
      !pathValid(file.path) ||
      file.path === "manifest.json" ||
      paths.has(file.path)
    )
      fail("파일 경로 오류");
    paths.add(file.path);
    const limit = file.path.endsWith(".json")
      ? 2 * 1024 * 1024
      : /\.(mp4|webm)$/.test(file.path)
        ? MEDIA_LIMITS.videoBytes
        : MEDIA_LIMITS.bytes;
    num(file.bytes, 0, limit);
    if (
      !Number.isInteger(file.bytes) ||
      typeof file.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      fail("파일 크기·해시 오류");
  }
  if (
    manifest.preview !== undefined &&
    (!pathValid(manifest.preview) || !manifest.preview.startsWith("preview/"))
  )
    fail("미리보기 경로 오류");
  return manifest;
}
export function pathValid(p: unknown): boolean {
  return (
    (typeof p === "string" &&
      p.length <= 240 &&
      /^[a-z0-9_./-]+$/.test(p) &&
      p
        .split("/")
        .every(
          (s) =>
            s &&
            s !== "." &&
            s !== ".." &&
            !s.endsWith(".") &&
            !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/.test(s),
        ) &&
      ["manifest.json", "theme.json"].includes(p)) ||
    (typeof p === "string" &&
      /^(assets|preview)\/[a-z0-9_./-]+$/.test(p) &&
      p.length <= 240 &&
      p
        .split("/")
        .every(
          (s) =>
            s &&
            s !== "." &&
            s !== ".." &&
            !s.endsWith(".") &&
            !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/.test(s),
        ))
  );
}
export function validateTheme(
  theme: Theme,
  files: string[] = [],
  allowLocalItems = false,
  optionalCapabilities: ReadonlySet<string> = new Set(),
) {
  keys(theme, ["profiles", "customEffects", "autoTextColor", "fontFamily"]);
  const validFont = (value: unknown) =>
    typeof value === "string" && /^[\p{L}\p{N} _-]{1,80}$/u.test(value);
  if (theme.fontFamily !== undefined && !validFont(theme.fontFamily))
    fail("글꼴 이름 오류");
  if (
    theme.autoTextColor !== undefined &&
    typeof theme.autoTextColor !== "boolean"
  )
    fail("자동 글자색 설정 오류");
  const definitions = validateCustomEffects(theme.customEffects);
  const specs: Record<string, EffectDefinition> = { ...EFFECTS };
  for (const definition of definitions)
    specs[definition.id] = {
      layers: definition.layers,
      parameters: {},
      properties: customEffectProperties(definition),
    };
  if (
    !Array.isArray(theme.profiles) ||
    !theme.profiles.length ||
    theme.profiles.length > 32
  )
    fail("프로필 개수 오류");
  const ids = new Set();
  for (const p of theme.profiles) {
    keys(p, ["id", "name", "rules"]);
    if (
      typeof p.id !== "string" ||
      !/^[a-z0-9._-]{1,128}$/.test(p.id) ||
      ids.has(p.id)
    )
      fail("프로필 ID 오류");
    ids.add(p.id);
    if (
      typeof p.name !== "string" ||
      !p.name.length ||
      p.name.length > 256 ||
      !Array.isArray(p.rules) ||
      p.rules.length > 256
    )
      fail("프로필 오류");
    const ruleIds = new Set();
    const targetIds = new Set();
    for (const r of p.rules) {
      keys(
        r,
        allowLocalItems
          ? ["id", "target", "states", "item"]
          : ["id", "target", "states"],
      );
      if (
        r.item !== undefined &&
        (typeof r.item !== "string" ||
          !r.item.length ||
          r.item.length > 512 ||
          /[\u0000-\u001f]/.test(r.item))
      )
        fail("개별 항목 ID 오류");
      if (
        typeof r.id !== "string" ||
        !/^[a-z0-9._-]{1,128}$/.test(r.id) ||
        ruleIds.has(r.id)
      )
        fail("규칙 ID 오류");
      ruleIds.add(r.id);
      if (
        typeof r.target !== "string" ||
        !/^[a-z0-9.-]{1,128}$/.test(r.target) ||
        (!TARGETS.includes(r.target) &&
          !optionalCapabilities.has("target:" + r.target))
      )
        fail("대상 미지원");
      const targetId = r.target + ":" + (r.item || "");
      if (targetIds.has(targetId)) fail("같은 대상의 규칙이 중복됩니다.");
      targetIds.add(targetId);
      keys(r.states, STATES);
      for (const state of Object.values(r.states)) {
        keys(state, ["style", "motion"]);
        if (state.style) {
          keys(state.style, [
            "background",
            "decoration",
            "border",
            "icon",
            "text",
          ]);
          for (const [layer, v] of Object.entries(state.style)) {
            if (v === null) continue;
            const allowed = {
              background: [
                "color",
                "opacity",
                "image",
                "fit",
                "position",
                "blurPx",
                "imagePlayback",
                "videoPlaybackRate",
              ],
              decoration: [
                "image",
                "opacity",
                "fit",
                "position",
                "imagePlayback",
                "videoPlaybackRate",
              ],
              border: ["color", "opacity", "widthPx", "radiusPx", "glow"],
              icon: [
                "image",
                "sizePx",
                "opacity",
                "fit",
                "paddingPx",
                "imagePlayback",
                "videoPlaybackRate",
              ],
              text: ["color", "opacity", "weight", "autoColor", "family"],
            }[layer];
            keys(v, allowed ?? fail("레이어 오류"));
            for (const [key, val] of Object.entries(v)) {
              if (val === null) continue;
              if (key === "family" && !validFont(val)) fail("글꼴 이름 오류");
              if (key === "autoColor" && typeof val !== "boolean")
                fail("자동 글자색 설정 오류");
              if (key === "imagePlayback" && !["play", "poster"].includes(val))
                fail("움직이는 이미지 재생 값 오류");
              if (
                key === "color" &&
                (typeof val !== "string" || !/^#[0-9a-fA-F]{6}$/.test(val))
              )
                fail("색상 오류");
              else if (
                key === "image" &&
                (typeof val !== "string" ||
                  !val.startsWith("assets/") ||
                  !pathValid(val) ||
                  !files.includes(val))
              )
                fail("자산 참조 오류");
              else if (key === "opacity") num(val, 0, 1);
              else if (key === "videoPlaybackRate") num(val, 0.1, 4);
              else if (
                [
                  "blurPx",
                  "widthPx",
                  "radiusPx",
                  "sizePx",
                  "paddingPx",
                  "glow",
                ].includes(key)
              )
                num(val, 0, key === "sizePx" ? 256 : 64);
              else if (key === "weight") num(val, 100, 900);
              else if (
                key === "fit" &&
                !["cover", "contain", "stretch", "tile"].includes(val)
              )
                fail("이미지 맞춤 오류");
              else if (key === "position") {
                keys(val, ["x", "y"]);
                num(val.x, 0, 1);
                num(val.y, 0, 1);
              }
            }
          }
        }
        if (state.motion !== undefined && state.motion !== null) {
          keys(state.motion, ["mode", "events", "trigger"]);
          if (
            state.motion.trigger !== undefined &&
            !["always", "hover", "selected", "click"].includes(
              state.motion.trigger,
            )
          )
            fail("효과 실행 조건 오류");
          if (!["none", "effects"].includes(state.motion.mode))
            fail("효과 모드 오류");
          if (state.motion.mode === "none" && state.motion.events)
            fail("효과 없음에는 이벤트를 지정할 수 없습니다.");
          if (state.motion.events) {
            keys(state.motion.events, ["enter", "exit", "click", "idle"]);
            let count = 0;
            for (const [event, effects] of Object.entries(
              state.motion.events,
            )) {
              if (!Array.isArray(effects)) fail("효과 배열 오류");
              count += effects.length;
              const effectIds = new Set();
              for (const e of effects) {
                keys(e, [
                  "id",
                  "layer",
                  "effect",
                  "effectVersion",
                  "durationMs",
                  "delayMs",
                  "easing",
                  "iterations",
                  "reverse",
                  "parameters",
                ]);
                const spec = specs[e.effect];
                const custom = definitions.some(
                  (definition) => definition.id === e.effect,
                );
                const optional = optionalCapabilities.has(
                  "effect:" + e.effect + "@" + e.effectVersion,
                );
                if (
                  ((!spec || e.effectVersion !== 1) && !optional) ||
                  ![
                    "background",
                    "decoration",
                    "border",
                    "icon",
                    "text",
                  ].includes(e.layer) ||
                  (spec?.layers && !spec.layers.includes(e.layer))
                )
                  fail("효과 지원 오류");
                if (
                  typeof e.id !== "string" ||
                  !/^[a-z0-9._-]{1,128}$/.test(e.id) ||
                  effectIds.has(e.id)
                )
                  fail("효과 ID 오류");
                effectIds.add(e.id);
                if (
                  typeof e.effect !== "string" ||
                  !/^[a-z0-9.-]{1,128}$/.test(e.effect) ||
                  !Number.isInteger(e.effectVersion) ||
                  e.effectVersion < 1 ||
                  e.effectVersion > 10000
                )
                  fail("효과 ID·버전 오류");
                num(e.durationMs, 0, 10000);
                num(e.delayMs, 0, 5000);
                if (
                  custom &&
                  (e.durationMs > CUSTOM_EFFECT_LIMITS.durationMs ||
                    e.iterations === "infinite" ||
                    e.iterations > CUSTOM_EFFECT_LIMITS.iterations)
                )
                  fail("사용자 효과 시간·반복 예산 초과");
                if (
                  !["linear", "ease-in", "ease-out", "ease-in-out"].includes(
                    e.easing,
                  )
                )
                  fail("곡선 오류");
                if (e.iterations === "infinite") {
                  if (event !== "idle") fail("무한 반복은 idle 전용입니다.");
                } else {
                  num(e.iterations, 1, 100);
                  if (!Number.isInteger(e.iterations)) fail("반복 정수 오류");
                }
                if (typeof e.reverse !== "boolean") fail("반전 오류");
                keys(
                  e.parameters,
                  Object.keys(spec?.parameters || e.parameters),
                );
                for (const [k, v] of Object.entries(e.parameters)) {
                  const limits = spec?.parameters[k];
                  if (!limits) {
                    if (
                      (typeof v !== "number" && typeof v !== "string") ||
                      (typeof v === "number" && !Number.isFinite(v)) ||
                      (typeof v === "string" && v.length > 256)
                    )
                      fail("선택 효과 매개변수 오류");
                    continue;
                  }
                  if (typeof limits[0] === "number")
                    num(v, Number(limits[0]), Number(limits[1]));
                  else if (
                    typeof v !== "string" ||
                    !(limits as string[]).includes(v)
                  )
                    fail("효과 매개변수 오류");
                }
              }
              for (let i = 0; i < effects.length; i++)
                for (let j = i + 1; j < effects.length; j++) {
                  const a = effects[i],
                    b = effects[j];
                  const end = (e: Effect) =>
                    e.iterations === "infinite"
                      ? Infinity
                      : e.delayMs + e.durationMs * e.iterations;
                  if (
                    a.layer === b.layer &&
                    a.delayMs < end(b) &&
                    b.delayMs < end(a) &&
                    specs[a.effect] &&
                    specs[b.effect] &&
                    a.effectVersion === 1 &&
                    b.effectVersion === 1 &&
                    specs[a.effect].properties.some((x) =>
                      specs[b.effect].properties.includes(x),
                    )
                  )
                    fail("효과 제어 속성이 겹칩니다.");
                }
            }
            if (count > 32) fail("효과 개수 제한");
          }
        }
      }
    }
  }
  return theme;
}
export function keyframes(
  e: RuntimeEffect,
  base: { opacity?: number; filter?: string } = {},
): Keyframe[] {
  const p = e.parameters;
  const maps: Record<string, () => Keyframe[]> = {
    "reveal.edge": () => [
      {
        clipPath: {
          "left-to-right": "inset(0 100% 0 0)",
          "right-to-left": "inset(0 0 0 100%)",
          "top-to-bottom": "inset(0 0 100% 0)",
          "bottom-to-top": "inset(100% 0 0 0)",
        }[p.direction || "left-to-right"],
      },
      { clipPath: "inset(0 0 0 0)" },
    ],
    "reveal.center": () => [
      {
        clipPath: p.axis === "y" ? "inset(50% 0 50% 0)" : "inset(0 50% 0 50%)",
      },
      { clipPath: "inset(0 0 0 0)" },
    ],
    "reveal.diagonal": () => [
      { clipPath: "polygon(0 0,0 0,0 0)" },
      { clipPath: "polygon(0 0,200% 0,0 200%)" },
    ],
    "move.slide": () => [
      { transform: `translate(${p.x || 0}px,${p.y || 0}px)` },
      { transform: "translate(0,0)" },
    ],
    "scale.appear": () => [
      { transform: `scale(${p.scale ?? 0.8})` },
      { transform: "scale(1)" },
    ],
    "scale.bounce": () => [
      { transform: "scale(.9)" },
      {
        transform: `scale(${1 + Number(p.intensity ?? 0.2) * 0.2})`,
        offset: 0.7,
      },
      { transform: "scale(1)" },
    ],
    fade: () => [{ opacity: p.from ?? 0 }, { opacity: 1 }],
    "blur.clear": () => [
      { filter: `blur(${p.blurPx ?? 8}px)` },
      { filter: "blur(0px)" },
    ],
    "light.glow": () => [
      { filter: "brightness(1)" },
      { filter: `brightness(${1 + Number(p.intensity ?? 8) / 10})` },
      { filter: "brightness(1)" },
    ],
    "light.sweep": () => [
      { transform: `translateX(-100%) rotate(${p.angle ?? 0}deg)` },
      { transform: `translateX(100%) rotate(${p.angle ?? 0}deg)` },
    ],
    "gradient.move": () => [
      { backgroundPosition: "0% 50%" },
      { backgroundPosition: `${p.distance ?? 100}% 50%` },
    ],
    "border.flow": () => [
      { filter: "hue-rotate(0deg)" },
      { filter: "hue-rotate(360deg)" },
    ],
    "icon.rotate": () => [
      { transform: `rotate(${p.angle ?? 15}deg)` },
      { transform: "rotate(0deg)" },
    ],
    "icon.shake": () => [
      { transform: "translateX(0)" },
      { transform: `translateX(${p.distance ?? 4}px)` },
      { transform: `translateX(-${p.distance ?? 4}px)` },
      { transform: "translateX(0)" },
    ],
    "icon.pulse": () => [
      { transform: "scale(1)" },
      { transform: `scale(${p.scale ?? 1.1})` },
      { transform: "scale(1)" },
    ],
    "click.ripple": () => [
      { transform: "scale(0)", opacity: 1 },
      { transform: "scale(1)", opacity: 0 },
    ],
  };
  const frames = e.customDefinition
    ? compileCustomFrames(e.customDefinition)
    : maps[e.effect]?.();
  if (!frames) throw Error("지원하지 않는 효과입니다.");
  for (const frame of frames) {
    if (typeof frame.opacity === "number") frame.opacity *= base.opacity ?? 1;
    if (
      typeof frame.filter === "string" &&
      base.filter &&
      base.filter !== "none"
    )
      frame.filter = `${frame.filter} ${base.filter}`;
  }
  return e.reverse
    ? frames.reverse().map((frame) => ({
        ...frame,
        ...(frame.offset !== undefined && frame.offset !== null
          ? { offset: 1 - frame.offset }
          : {}),
      }))
    : frames;
}
