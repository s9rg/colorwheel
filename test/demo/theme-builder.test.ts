import { describe, expect, it } from "vitest";
import { createHarmonyPalette } from "../../src/core";
import type { Palette } from "../../src/core";
import { EMPTY_THEME_COMPILATION, compilePaletteTheme } from "../../demo/src/theme-builder/compile";
import { THEME_TARGETS, buildThemeBuilderModel } from "../../demo/src/theme-builder/model";
import type { ThemeTargetKey } from "../../demo/src/theme-builder/model";

const TARGET_ARTIFACTS = {
  css: "theme.css",
  tailwind: "theme.tailwind.css",
  mui: "theme.ts",
  dtcg: "theme.primitives.tokens.json",
  antd: "antd/theme.ts",
  shadcn: "shadcn/theme.json",
  daisyui: "daisyui/theme.css",
  vuetify: "vuetify.theme.ts",
  "angular-material": "angular-material.theme.scss",
  ionic: "ionic.theme.css",
  "react-native-paper": "react-native-paper/theme.ts"
} as const satisfies Readonly<Record<ThemeTargetKey, string>>;

function complementaryPalette(): Palette {
  return createHarmonyPalette({
    seed: "#00c4cc",
    harmony: { type: "complementary" },
    name: "Complementary"
  });
}

function explicitPalette(): Palette {
  return {
    name: "Mapped brand",
    kind: "custom",
    provenance: { origin: "manual" },
    recipe: {
      type: "wheel",
      seed: { space: "srgb", r: 0.04, g: 0.05, b: 0.06 },
      seedColorId: "seed"
    },
    colors: [
      {
        id: "companion",
        name: "Companion",
        color: { space: "srgb", r: 0.96, g: 0.97, b: 0.98 }
      },
      {
        id: "seed",
        name: "Seed",
        color: { space: "srgb", r: 0.04, g: 0.05, b: 0.06 }
      }
    ]
  };
}

describe("demo theme-builder model", () => {
  it("offers exactly the eleven unique supported targets", () => {
    const keys = THEME_TARGETS.map((target) => target.key);

    expect(keys).toEqual(Object.keys(TARGET_ARTIFACTS));
    expect(new Set(keys).size).toBe(11);
  });

  it("maps the recipe seed to primary, another swatch to secondary, and picks readable text", () => {
    const model = buildThemeBuilderModel(explicitPalette());

    expect(model.schemes.light.roles).toMatchObject({
      background: { ref: "palette.canvas-light" },
      surface: { ref: "palette.surface-light" },
      foreground: { ref: "palette.text-light" },
      "muted-foreground": { ref: "palette.muted-light" },
      divider: { ref: "palette.border-light" },
      primary: { ref: "palette.brand-2" },
      "primary-foreground": { ref: "palette.white" },
      secondary: { ref: "palette.brand-1" },
      "secondary-foreground": { ref: "palette.ink" }
    });
    expect(model.schemes.dark.roles.primary).toEqual({ ref: "palette.brand-2" });
    expect(model.previews.light).toMatchObject({
      background: "#f8fafe",
      surface: "#ffffff",
      primaryText: "#ffffff",
      accentText: "#13161f"
    });
  });

  it("falls back to the primary swatch for a single-color palette", () => {
    const palette: Palette = {
      name: "One color",
      kind: "custom",
      provenance: { origin: "manual" },
      colors: [
        {
          id: "only",
          name: "Only",
          color: { space: "srgb", r: 0.1, g: 0.2, b: 0.3 }
        }
      ]
    };

    const model = buildThemeBuilderModel(palette);

    expect(model.schemes.light.roles.primary).toEqual({ ref: "palette.brand-1" });
    expect(model.schemes.light.roles.secondary).toEqual({ ref: "palette.brand-1" });
    expect(model.previews.light.accent).toBe(model.previews.light.primary);
    expect(model.swatches).toHaveLength(1);
  });

  it("converts transparent out-of-gamut colors to bounded structured sRGB", () => {
    const palette: Palette = {
      name: "Portable color",
      kind: "custom",
      provenance: { origin: "manual" },
      colors: [
        {
          id: "vivid",
          name: "Vivid",
          color: { space: "oklch", l: 0.7, c: 0.5, h: 30, alpha: 0.4 }
        }
      ]
    };

    const model = buildThemeBuilderModel(palette);
    const value = model.primitives["brand-1"];

    if (typeof value === "string") {
      throw new TypeError("Expected the brand color to remain structured.");
    }
    expect(value).toMatchObject({ colorSpace: "srgb", alpha: 0.4 });
    expect(value.hex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(value.components).toHaveLength(3);
    for (const component of value.components) {
      expect(component).toBeGreaterThanOrEqual(0);
      expect(component).toBeLessThanOrEqual(1);
    }
  });

  it("chooses readable foregrounds for transparent colors in each scheme", () => {
    const palette: Palette = {
      name: "Translucent brand",
      kind: "custom",
      provenance: { origin: "manual" },
      colors: [
        {
          id: "translucent-white",
          color: { space: "srgb", r: 1, g: 1, b: 1, alpha: 0.15 }
        }
      ]
    };

    const model = buildThemeBuilderModel(palette);

    expect(model.schemes.light.roles["primary-foreground"]).toEqual({ ref: "palette.ink" });
    expect(model.schemes.dark.roles["primary-foreground"]).toEqual({ ref: "palette.white" });
    expect(model.previews.light.primaryText).toBe("#13161f");
    expect(model.previews.dark.primaryText).toBe("#ffffff");
  });
});

describe("demo theme-builder compilation", () => {
  it.each(Object.entries(TARGET_ARTIFACTS) as [ThemeTargetKey, string][])(
    "compiles the default complementary palette for %s",
    async (target, expectedArtifact) => {
      const result = await compilePaletteTheme(complementaryPalette(), target);
      const paths = result.files.map((file) => file.path);

      expect(result.ok, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
      expect(paths).toContain(expectedArtifact);
      expect(paths).toContain("theme.lock.json");
    }
  );

  it("produces deterministic artifacts for repeated compilation", async () => {
    const palette = complementaryPalette();
    const first = await compilePaletteTheme(palette, "css");
    const second = await compilePaletteTheme(palette, "css");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.files).toEqual(first.files);
  });

  it("returns no files and an informational diagnostic for an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await compilePaletteTheme(complementaryPalette(), "css", controller.signal);

    expect(result).toMatchObject({
      ok: false,
      files: [],
      diagnostics: [
        {
          severity: "info",
          code: "theme-builder.compile-aborted"
        }
      ]
    });
    expect(result).not.toBe(EMPTY_THEME_COMPILATION);
  });
});
