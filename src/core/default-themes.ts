import type { ThemeDocument, Rule } from "./contracts.ts";
interface Palette {
  app: string;
  sidebar: string;
  rail: string;
  composer: string;
  selected: string;
  hover: string;
  ink: string;
  border: string;
}
function theme(id: string, name: string, palette: Palette): ThemeDocument {
  const rules: Rule[] = [
    {
      id: "app",
      target: "app.background",
      states: {
        base: { style: { background: { color: palette.app, opacity: 1 } } },
      },
    },
    {
      id: "main",
      target: "main.surface",
      states: {
        base: {
          style: {
            background: { color: palette.app, opacity: 1 },
            text: { color: palette.ink },
          },
        },
      },
    },
    {
      id: "sidebar",
      target: "sidebar.surface",
      states: {
        base: {
          style: {
            background: { color: palette.sidebar, opacity: 1 },
            text: { color: palette.ink },
          },
        },
      },
    },
    {
      id: "rail",
      target: "navigation.bar",
      states: {
        base: { style: { background: { color: palette.rail, opacity: 1 } } },
      },
    },
    {
      id: "composer",
      target: "composer.surface",
      states: {
        base: {
          style: {
            background: { color: palette.composer, opacity: 1 },
            border: { color: palette.border, widthPx: 1, radiusPx: 16 },
            text: { color: palette.ink },
          },
        },
      },
    },
    {
      id: "threads",
      target: "sidebar.thread-row",
      states: {
        base: {
          style: {
            text: { color: palette.ink },
          },
        },
        selected: {
          style: {
            background: { color: palette.selected, opacity: 1 },
          },
        },
        hover: {
          style: {
            background: { color: palette.hover, opacity: 1 },
          },
        },
        selectedHover: {
          style: {
            background: { color: palette.selected, opacity: 1 },
            border: { color: palette.border, widthPx: 1, radiusPx: 8 },
          },
        },
      },
    },
  ];
  return {
    manifest: {
      format: "coskin.theme",
      formatVersion: 1,
      id: "builtin." + id,
      name,
      version: "1.0.0",
      author: { name: "CoSkin" },
      engine: { minVersion: "0.1.0" },
      requirements: {
        required: rules.map((rule) => "target:" + rule.target),
        optional: [],
      },
      entry: "theme.json",
      defaultProfile: "default",
      files: [],
    },
    theme: { profiles: [{ id: "default", name: "Default", rules }] },
    assets: {},
  };
}
export const defaultThemes: ThemeDocument[] = [
  theme("slate", "Slate", {
    app: "#20232c",
    sidebar: "#191c24",
    rail: "#151820",
    composer: "#2b303c",
    selected: "#3a3d55",
    hover: "#2d3241",
    ink: "#e6eaf3",
    border: "#515974",
  }),
  theme("aurora", "Aurora", {
    app: "#102c34",
    sidebar: "#10232a",
    rail: "#0b1d24",
    composer: "#1b3b43",
    selected: "#245862",
    hover: "#1c444e",
    ink: "#def3f2",
    border: "#45787f",
  }),
  theme("paper", "Paper", {
    app: "#f5f2eb",
    sidebar: "#ece8e1",
    rail: "#e5e0d8",
    composer: "#fffdf9",
    selected: "#ded8ef",
    hover: "#e3e0e8",
    ink: "#3d4051",
    border: "#b8adc9",
  }),
];

// Only an exact previous factory document is eligible for an immutable upgrade.
export const previousDefaultThemes: ThemeDocument[] =
  structuredClone(defaultThemes);
for (const document of previousDefaultThemes) {
  const main = document.theme.profiles[0].rules.find(
    (rule) => rule.target === "main.surface",
  );
  if (main?.states.base?.style) delete main.states.base.style.background;
  const thread = document.theme.profiles[0].rules.find(
    (rule) => rule.target === "sidebar.thread-row",
  );
  if (thread?.states.base?.style) delete thread.states.base.style.background;
}
