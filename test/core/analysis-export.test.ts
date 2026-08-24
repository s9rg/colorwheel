import { describe, expect, it } from "vitest";
import {
  analyzePalette,
  compositeColors,
  contrastRatio,
  exportPaletteCss,
  exportPaletteJson,
  exportPaletteTokens,
  parsePaletteDocument,
  relativeLuminance,
  type Palette
} from "../../src/core";
import { testPalette } from "./fixtures";

describe("palette diagnostics", () => {
  it("computes WCAG luminance and contrast reference values", () => {
    expect(relativeLuminance("#000")).toBe(0);
    expect(relativeLuminance("#fff")).toBeCloseTo(1, 10);
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 10);
    expect(contrastRatio("#777", "#fff")).toBeCloseTo(4.478, 2);
  });

  it("handles alpha explicitly over an opaque canvas", () => {
    const composite = compositeColors("rgb(0 0 0 / 50%)", "#fff");
    expect(composite.alpha).toBe(1);
    expect(composite.r).toBeCloseTo(0.5, 4);
    expect(contrastRatio("rgb(0 0 0 / 50%)", "#fff")).toBeCloseTo(3.98, 2);
    expect(() => contrastRatio("#000", "#fff", "rgb(255 255 255 / 50%)")).toThrow(/opaque/);
  });

  it("evaluates only declared foreground/background pairs", () => {
    const palette: Palette = {
      colors: [
        { id: "text", color: { space: "srgb", r: 0.5, g: 0.5, b: 0.5 } },
        { id: "surface", color: { space: "srgb", r: 1, g: 1, b: 1 } }
      ],
      kind: "semantic",
      provenance: { origin: "manual" }
    };
    expect(
      analyzePalette(palette).diagnostics.some(({ ruleId }) => ruleId.startsWith("contrast."))
    ).toBe(false);
    const analysis = analyzePalette(palette, {
      contrastPairs: [{ foregroundId: "text", backgroundId: "surface" }]
    });
    expect(analysis.diagnostics).toContainEqual(
      expect.objectContaining({
        ruleId: "contrast.insufficient",
        colorIds: ["text", "surface"]
      })
    );
  });

  it("reports missing context colors, gamut overflow, and close pairs separately", () => {
    const palette: Palette = {
      colors: [
        { id: "a", color: { space: "oklch", l: 0.7, c: 0.4, h: 30 } },
        { id: "b", color: { space: "oklch", l: 0.7, c: 0.4, h: 30.5 } }
      ],
      kind: "qualitative",
      provenance: { origin: "manual" }
    };
    const ruleIds = analyzePalette(palette, {
      minimumPerceptualDistance: 0.02,
      contrastPairs: [{ foregroundId: "missing", backgroundId: "a" }]
    }).diagnostics.map(({ ruleId }) => ruleId);
    expect(ruleIds).toContain("gamut.outside");
    expect(ruleIds).toContain("difference.insufficient");
    expect(ruleIds).toContain("contrast.missing-color");
  });

  it("rejects contrast contexts that do not correspond to a WCAG criterion", () => {
    const palette = testPalette();
    expect(() =>
      analyzePalette(palette, {
        contrastPairs: [
          { foregroundId: "text", backgroundId: "surface", usage: "non-text", level: "AAA" }
        ]
      })
    ).toThrow(/non-text contrast at level AA/);
    expect(() =>
      analyzePalette(palette, {
        contrastPairs: [
          {
            foregroundId: "missing",
            backgroundId: "also-missing",
            minimumRatio: Number.NaN
          }
        ]
      })
    ).toThrow(/minimumRatio/);
    expect(() =>
      analyzePalette(palette, {
        contrastPairs: [
          {
            foregroundId: "text",
            backgroundId: "surface",
            canvas: "rgb(255 255 255 / 50%)"
          }
        ]
      })
    ).toThrow(/opaque/);
  });
});

describe("palette exporters", () => {
  it("exports a validated versioned JSON document", () => {
    const artifact = exportPaletteJson(testPalette());
    expect(artifact.files).toHaveLength(1);
    expect(artifact.files[0]).toMatchObject({
      name: "palette.json",
      mediaType: "application/json"
    });
    const content = artifact.files[0]?.content;
    expect(typeof content).toBe("string");
    expect(parsePaletteDocument(content as string).palette).toEqual(testPalette());
  });

  it("exports safe, unique CSS custom properties", () => {
    const palette: Palette = {
      ...testPalette(),
      colors: [
        { id: "one", role: "Accent", color: { space: "srgb", r: 1, g: 0, b: 0 } },
        { id: "two", role: "Accent", color: { space: "srgb", r: 0, g: 0, b: 1 } }
      ]
    };
    const content = exportPaletteCss(palette, {
      prefix: "Brand UI",
      selector: ".theme"
    }).files[0]?.content;
    expect(content).toBe(
      ".theme {\n  --brand-ui-accent: #ff0000;\n  --brand-ui-accent-2: #0000ff;\n}\n"
    );
    expect(() => exportPaletteCss(palette, { selector: ":root { color:red; }" })).toThrow(
      /selector/
    );
  });

  it("exports current DTCG color objects with names and roles", () => {
    const artifact = exportPaletteTokens(testPalette(), {
      groupName: "Product Colors"
    });
    expect(artifact.files[0]?.mediaType).toBe("application/design-tokens+json");
    const content = artifact.files[0]?.content;
    expect(typeof content).toBe("string");
    const tokens = JSON.parse(content as string) as Record<string, unknown>;
    expect(tokens).toHaveProperty("product-colors.$type", "color");
    expect(tokens).toHaveProperty("product-colors.text.$value", {
      colorSpace: "srgb",
      components: [0.05, 0.07, 0.1],
      hex: "#0d121a"
    });
    expect(tokens).toHaveProperty("product-colors.text.$description", "Ink — Role: text");
  });

  it("preserves prototype-like names and resolves every normalized-name collision", () => {
    const palette: Palette = {
      colors: [
        { id: "__proto__", color: { space: "srgb", r: 1, g: 0, b: 0 } },
        { id: "first", role: "Accent", color: { space: "srgb", r: 0, g: 1, b: 0 } },
        { id: "second", role: "Accent 2", color: { space: "srgb", r: 0, g: 0, b: 1 } },
        { id: "third", role: "Accent", color: { space: "srgb", r: 1, g: 1, b: 0 } }
      ],
      kind: "custom",
      provenance: { origin: "manual" }
    };
    const tokenContent = exportPaletteTokens(palette).files[0]?.content;
    const tokenDocument = JSON.parse(String(tokenContent)) as {
      color: Record<string, unknown>;
    };
    expect(Object.hasOwn(tokenDocument.color, "__proto__")).toBe(true);
    expect(Object.keys(tokenDocument.color)).toEqual([
      "$type",
      "__proto__",
      "accent",
      "accent-2",
      "accent-3"
    ]);

    const css = String(exportPaletteCss(palette).files[0]?.content);
    expect(css).toContain("--palette-accent-3:");
  });

  it("rejects path-like file names and unreasonable indentation", () => {
    expect(() => exportPaletteJson(testPalette(), { filename: "../palette.json" })).toThrow(
      /file name/
    );
    expect(() => exportPaletteTokens(testPalette(), { indentation: 20 })).toThrow(/indentation/);
    expect(() => exportPaletteJson(testPalette(), { filename: 42 as unknown as string })).toThrow(
      /file name/
    );
    expect(() =>
      exportPaletteCss(testPalette(), {
        colorFormat: "unsupported" as unknown as "hex"
      })
    ).toThrow(/colorFormat/);
    expect(() => exportPaletteCss(testPalette(), { selector: 42 as unknown as string })).toThrow(
      /selector/
    );
  });
});
