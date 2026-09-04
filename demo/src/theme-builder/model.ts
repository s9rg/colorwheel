import type {
  ColorReference,
  StructuredColor,
  ThemeColorInput,
  ThemeScheme
} from "@s9rg/theme-compiler";
import { contrastRatio, convertColor, formatColor, mapToGamut } from "../../../src/core";
import type { ColorValue, Palette } from "../../../src/core";

export type ThemeTargetKey =
  | "css"
  | "tailwind"
  | "mui"
  | "dtcg"
  | "antd"
  | "shadcn"
  | "daisyui"
  | "vuetify"
  | "angular-material"
  | "ionic"
  | "react-native-paper";

export type PreviewProfile = "light" | "dark";

export interface ThemeTargetDefinition {
  readonly key: ThemeTargetKey;
  readonly name: string;
  readonly version: string;
  readonly artifact: string;
  readonly description: string;
  readonly previewStyle: "sharp" | "balanced" | "rounded";
}

export const THEME_TARGETS: readonly ThemeTargetDefinition[] = [
  {
    key: "css",
    name: "CSS variables",
    version: "Modern CSS",
    artifact: "CSS",
    description: "Framework-neutral custom properties with light and dark schemes.",
    previewStyle: "balanced"
  },
  {
    key: "tailwind",
    name: "Tailwind CSS",
    version: "v4",
    artifact: "CSS",
    description: "CSS-first theme variables ready for Tailwind utilities.",
    previewStyle: "sharp"
  },
  {
    key: "mui",
    name: "Material UI",
    version: "v9",
    artifact: "TypeScript",
    description: "Typed color-scheme options for the MUI theme provider.",
    previewStyle: "balanced"
  },
  {
    key: "dtcg",
    name: "Design Tokens",
    version: "DTCG 2025.10",
    artifact: "JSON",
    description: "Portable token sets and a resolver document for downstream tooling.",
    previewStyle: "sharp"
  },
  {
    key: "antd",
    name: "Ant Design",
    version: "v6",
    artifact: "TypeScript",
    description: "Typed light and dark ThemeConfig objects for Ant Design.",
    previewStyle: "balanced"
  },
  {
    key: "shadcn",
    name: "shadcn/ui",
    version: "v4",
    artifact: "JSON",
    description: "A registry theme with explicit light and dark semantic variables.",
    previewStyle: "balanced"
  },
  {
    key: "daisyui",
    name: "daisyUI",
    version: "v5",
    artifact: "CSS",
    description: "Tailwind plugin theme blocks extending the built-in schemes.",
    previewStyle: "rounded"
  },
  {
    key: "vuetify",
    name: "Vuetify",
    version: "v4",
    artifact: "TypeScript",
    description: "Typed ThemeDefinition objects for Vue light and dark themes.",
    previewStyle: "balanced"
  },
  {
    key: "angular-material",
    name: "Angular Material",
    version: "Material 3 · v22",
    artifact: "SCSS",
    description: "Material 3 tonal palettes, overrides, and Sass theme mixins.",
    previewStyle: "balanced"
  },
  {
    key: "ionic",
    name: "Ionic",
    version: "v9",
    artifact: "CSS",
    description: "Cross-framework variables for Ionic React, Angular, Vue, and Core.",
    previewStyle: "rounded"
  },
  {
    key: "react-native-paper",
    name: "React Native Paper",
    version: "MD3 · v5",
    artifact: "TypeScript",
    description: "Typed MD3 light and dark themes for native applications.",
    previewStyle: "rounded"
  }
] as const;

export interface PreviewSemanticColors {
  readonly background: string;
  readonly surface: string;
  readonly foreground: string;
  readonly muted: string;
  readonly primary: string;
  readonly primaryText: string;
  readonly accent: string;
  readonly accentText: string;
  readonly border: string;
}

export interface ThemeBuilderModel {
  readonly primitives: Readonly<Record<string, ThemeColorInput>>;
  readonly schemes: Readonly<Record<PreviewProfile, ThemeScheme>>;
  readonly previews: Readonly<Record<PreviewProfile, PreviewSemanticColors>>;
  readonly swatches: readonly {
    readonly id: string;
    readonly name: string;
    readonly color: string;
  }[];
}

const FOUNDATION = {
  "canvas-light": "#f8fafe",
  "surface-light": "#ffffff",
  "text-light": "#13161f",
  "muted-light": "#66708a",
  "border-light": "#d9deea",
  "canvas-dark": "#07090f",
  "surface-dark": "#13161f",
  "text-dark": "#ffffff",
  "muted-dark": "#9aa3b4",
  "border-dark": "#2a303d",
  white: "#ffffff",
  ink: "#13161f"
} as const satisfies Readonly<Record<string, ThemeColorInput>>;

function structuredSrgb(color: ColorValue): StructuredColor {
  const converted = convertColor(color, "srgb");
  const mapped = mapToGamut(converted, "srgb").color;
  return {
    colorSpace: "srgb",
    components: [mapped.r, mapped.g, mapped.b],
    ...(mapped.alpha === undefined ? {} : { alpha: mapped.alpha }),
    hex: formatColor(mapped, { format: "hex", alpha: "never" })
  };
}

function previewColor(color: ColorValue): string {
  const mapped = mapToGamut(convertColor(color, "srgb"), "srgb").color;
  return formatColor(mapped, { format: "hex", alpha: "auto" });
}

function reference(name: string): ColorReference {
  return { ref: `palette.${name}` };
}

function readableTextReference(background: string, canvas: string): ColorReference {
  return contrastRatio("#ffffff", background, canvas) >=
    contrastRatio("#13161f", background, canvas)
    ? reference("white")
    : reference("ink");
}

function readableTextColor(background: string, canvas: string): string {
  return contrastRatio("#ffffff", background, canvas) >=
    contrastRatio("#13161f", background, canvas)
    ? "#ffffff"
    : "#13161f";
}

/**
 * Builds the demo's explicit starter mapping. Colorwheel remains the owner of
 * the authored brand palette; the neutral foundation exists only in the
 * compiler input and is never written back to picker state.
 */
export function buildThemeBuilderModel(palette: Palette): ThemeBuilderModel {
  if (palette.colors.length === 0) {
    throw new TypeError("A palette must contain at least one color before a theme can be built.");
  }

  const brandEntries = palette.colors.map((entry, index) => {
    const name = `brand-${index + 1}`;
    return {
      id: entry.id,
      name,
      label: entry.name?.trim() || `Brand ${index + 1}`,
      value: structuredSrgb(entry.color),
      preview: previewColor(entry.color)
    };
  });
  const seedIndex = Math.max(
    0,
    brandEntries.findIndex((entry) => entry.id === palette.recipe?.seedColorId)
  );
  const primary = brandEntries[seedIndex] ?? brandEntries[0];
  if (primary === undefined) throw new TypeError("The palette has no primary color.");
  const accent = brandEntries.find((_, index) => index !== seedIndex) ?? primary;

  const primitives: Record<string, ThemeColorInput> = { ...FOUNDATION };
  for (const entry of brandEntries) primitives[entry.name] = entry.value;

  const commonRoles = {
    primary: reference(primary.name),
    secondary: reference(accent.name)
  } as const;
  const lightRoles: Readonly<Record<string, ColorReference>> = {
    ...commonRoles,
    "primary-foreground": readableTextReference(primary.preview, FOUNDATION["surface-light"]),
    "secondary-foreground": readableTextReference(accent.preview, FOUNDATION["surface-light"]),
    background: reference("canvas-light"),
    surface: reference("surface-light"),
    foreground: reference("text-light"),
    "muted-foreground": reference("muted-light"),
    divider: reference("border-light")
  };
  const darkRoles: Readonly<Record<string, ColorReference>> = {
    ...commonRoles,
    "primary-foreground": readableTextReference(primary.preview, FOUNDATION["surface-dark"]),
    "secondary-foreground": readableTextReference(accent.preview, FOUNDATION["surface-dark"]),
    background: reference("canvas-dark"),
    surface: reference("surface-dark"),
    foreground: reference("text-dark"),
    "muted-foreground": reference("muted-dark"),
    divider: reference("border-dark")
  };

  return {
    primitives,
    schemes: {
      light: { id: "light", label: "Light", roles: lightRoles },
      dark: { id: "dark", label: "Dark", roles: darkRoles }
    },
    previews: {
      light: {
        background: FOUNDATION["canvas-light"],
        surface: FOUNDATION["surface-light"],
        foreground: FOUNDATION["text-light"],
        muted: FOUNDATION["muted-light"],
        primary: primary.preview,
        primaryText: readableTextColor(primary.preview, FOUNDATION["surface-light"]),
        accent: accent.preview,
        accentText: readableTextColor(accent.preview, FOUNDATION["surface-light"]),
        border: FOUNDATION["border-light"]
      },
      dark: {
        background: FOUNDATION["canvas-dark"],
        surface: FOUNDATION["surface-dark"],
        foreground: FOUNDATION["text-dark"],
        muted: FOUNDATION["muted-dark"],
        primary: primary.preview,
        primaryText: readableTextColor(primary.preview, FOUNDATION["surface-dark"]),
        accent: accent.preview,
        accentText: readableTextColor(accent.preview, FOUNDATION["surface-dark"]),
        border: FOUNDATION["border-dark"]
      }
    },
    swatches: brandEntries.map((entry) => ({
      id: entry.id,
      name: entry.label,
      color: entry.preview
    }))
  };
}
