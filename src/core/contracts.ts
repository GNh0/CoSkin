export type StateName =
  | "base"
  | "selected"
  | "hover"
  | "selectedHover"
  | "focusVisible"
  | "pressed"
  | "disabled";
export type LayerName =
  | "background"
  | "decoration"
  | "border"
  | "icon"
  | "text";
export type EventName = "enter" | "exit" | "click" | "idle";
export type Fit = "cover" | "contain" | "stretch" | "tile";
export interface LayerStyle {
  family?: string | null;
  autoColor?: boolean;
  imagePlayback?: "play" | "poster";
  color?: string | null;
  opacity?: number | null;
  image?: string | null;
  fit?: Fit | null;
  position?: { x: number; y: number } | null;
  blurPx?: number | null;
  widthPx?: number | null;
  radiusPx?: number | null;
  glow?: number | null;
  sizePx?: number | null;
  paddingPx?: number | null;
  weight?: number | null;
}
export interface Effect {
  id: string;
  layer: LayerName;
  effect: string;
  effectVersion: number;
  durationMs: number;
  delayMs: number;
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
  iterations: number | "infinite";
  reverse: boolean;
  parameters: Record<string, string | number>;
}
export interface Motion {
  mode: "none" | "effects";
  trigger?: "always" | "hover" | "selected" | "click";
  events?: Partial<Record<EventName, Effect[]>>;
}
export interface ThemeState {
  style?: Partial<Record<LayerName, LayerStyle | null>>;
  motion?: Motion | null;
}
export interface Rule {
  id: string;
  target: string;
  item?: string;
  states: Partial<Record<StateName, ThemeState>>;
}
export interface Profile {
  id: string;
  name: string;
  rules: Rule[];
}
export interface Theme {
  fontFamily?: string;
  autoTextColor?: boolean;
  profiles: Profile[];
  customEffects?: CustomEffectDefinition[];
}
export interface CustomEffectFrame {
  offset: number;
  values: Partial<
    Record<
      | "opacity"
      | "translateXPx"
      | "translateYPx"
      | "scale"
      | "rotateDeg"
      | "blurPx"
      | "insetTop"
      | "insetRight"
      | "insetBottom"
      | "insetLeft",
      number
    >
  >;
}
export interface CustomEffectDefinition {
  id: string;
  version: 1;
  name: string;
  description?: string;
  layers: LayerName[];
  frames: CustomEffectFrame[];
}
export type Flags = Partial<Record<StateName, boolean>>;
export interface EffectDefinition {
  properties: string[];
  layers?: LayerName[];
  parameters: Record<string, [number, number] | string[]>;
}
export interface Manifest {
  format: "coskin.theme";
  formatVersion: 1;
  id: string;
  name: string;
  version: string;
  description?: string;
  author: { name: string };
  engine: { minVersion: string };
  requirements: { required: string[]; optional: string[] };
  entry: "theme.json";
  defaultProfile: string;
  preview?: string;
  files: { path: string; bytes: number; sha256: string }[];
}
export interface ThemeDocument {
  manifest: Manifest;
  theme: Theme;
  assets: Record<string, string>;
  localOverrides?: Record<string, Rule[]>;
}
export interface Binding {
  id: string;
  revision: number;
  profile: string;
}
export interface LibraryEntry {
  key: string;
  name: string;
  revision: number;
  packageHash?: string;
}
export interface LibrarySummary {
  enabled: boolean;
  themes: Record<string, LibraryEntry>;
  bindings: Record<string, Binding>;
  documents: Record<string, ThemeDocument>;
}
