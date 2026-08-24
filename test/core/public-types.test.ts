import { describe, expect, expectTypeOf, it } from "vitest";
import {
  analyzePalette,
  createColorEngine,
  createHarmonyPalette,
  createPaletteDocument,
  exportPaletteJson,
  parsePaletteDocument,
  serializePaletteDocument,
  type CustomHarmonyRule,
  type ExportArtifact,
  type HarmonyRule,
  type HarmonyStrategy,
  type Palette,
  type PaletteDocument,
  type PaletteExporter,
  type StrategyReference
} from "../../src/core";

// These are deliberately interfaces rather than type aliases. They have no
// string index signature, which is the common shape used by library consumers.
interface ShowcaseMetadata {
  source: string;
  research: {
    citation: string;
    confidence: number;
  };
}

interface ShiftOptions {
  degrees: number;
  label: string;
  tags: readonly string[];
}

interface TextExportOptions {
  filename: string;
  heading: string;
}

const paletteWithDeclaredMetadata: Palette<ShowcaseMetadata> = {
  colors: [
    {
      id: "seed",
      color: { space: "srgb", r: 0.2, g: 0.4, b: 0.6 },
      metadata: {
        source: "manual",
        research: { citation: "example", confidence: 0.9 }
      }
    }
  ],
  kind: "showcase.research",
  metadata: {
    source: "portfolio",
    research: { citation: "example", confidence: 1 }
  },
  provenance: { origin: "manual" }
};

const shiftStrategy: HarmonyStrategy<ShiftOptions> = {
  id: "showcase.shift",
  version: "1.0.0",
  create(seed, options, context) {
    const base = context.convert(seed, "oklch");
    const shifted = context.mapToGamut(
      {
        ...base,
        h: (base.h + options.degrees + 360) % 360
      },
      "srgb"
    ).color;
    return {
      colors: [{ id: "shifted", name: options.label, color: shifted }],
      kind: "showcase.shift",
      provenance: {
        origin: "generated",
        strategy: {
          id: "showcase.shift",
          version: "1.0.0",
          options
        },
        seeds: [seed]
      }
    };
  }
};

const textExporter: PaletteExporter<TextExportOptions> = {
  id: "showcase.text",
  version: "1.0.0",
  export(palette, options): ExportArtifact {
    return {
      files: [
        {
          name: options.filename,
          mediaType: "text/plain",
          content: `${options.heading}: ${palette.colors.length}`
        }
      ]
    };
  }
};

describe("public generic ergonomics", () => {
  it("accepts declared metadata interfaces throughout palette operations", () => {
    const document = createPaletteDocument(paletteWithDeclaredMetadata);
    expectTypeOf(document).toMatchTypeOf<PaletteDocument<ShowcaseMetadata>>();
    expect(document.palette.metadata?.source).toBe("portfolio");
    expect(analyzePalette(paletteWithDeclaredMetadata).diagnostics).toEqual([]);
    expect(exportPaletteJson(paletteWithDeclaredMetadata).files).toHaveLength(1);
  });

  it("accepts declared strategy-option interfaces without index signatures", () => {
    const shiftOptions: ShiftOptions = {
      degrees: 30,
      label: "Shifted",
      tags: ["custom"]
    };
    const reference: StrategyReference<ShiftOptions> = {
      id: shiftStrategy.id,
      version: shiftStrategy.version,
      options: shiftOptions
    };
    const rule: CustomHarmonyRule<ShiftOptions> = {
      type: "custom",
      id: shiftStrategy.id,
      version: shiftStrategy.version,
      options: shiftOptions
    };
    expectTypeOf(rule).toMatchTypeOf<HarmonyRule>();

    const builtInRule: HarmonyRule = { type: "complementary", angle: 175 };
    function inspectHarmony(candidate: HarmonyRule): string | number | undefined {
      if (candidate.type === "custom") {
        expectTypeOf(candidate.id).toEqualTypeOf<string>();
        return candidate.id;
      }
      if (candidate.type === "complementary") {
        expectTypeOf(candidate.angle).toEqualTypeOf<number | undefined>();
        return candidate.angle;
      }
      return candidate.type;
    }
    expect(inspectHarmony(builtInRule)).toBe(175);
    expect(inspectHarmony(rule)).toBe(shiftStrategy.id);

    const customPalette: Palette<ShowcaseMetadata> = {
      ...paletteWithDeclaredMetadata,
      recipe: {
        type: "wheel",
        seed: paletteWithDeclaredMetadata.colors[0].color,
        harmony: rule,
        strategy: reference
      },
      provenance: {
        origin: "generated",
        strategy: reference,
        seeds: [paletteWithDeclaredMetadata.colors[0].color]
      }
    };
    const roundTripped = parsePaletteDocument(
      serializePaletteDocument(createPaletteDocument(customPalette))
    );
    expect(roundTripped.palette.recipe?.harmony).toEqual(rule);

    const engine = createColorEngine({
      harmonies: [shiftStrategy],
      exporters: [textExporter]
    });
    const generated = engine.createHarmony(reference, "#336699");
    expect(generated.colors[0]?.name).toBe("Shifted");

    const artifact = engine.export(generated, {
      id: textExporter.id,
      version: textExporter.version,
      options: { filename: "palette.txt", heading: "Colors" }
    } satisfies StrategyReference<TextExportOptions>);
    expect(artifact.files[0]?.content).toBe("Colors: 1");
  });

  it("keeps built-in direct generation and identifies custom rules unambiguously", () => {
    const builtIn = createHarmonyPalette({
      seed: "#336699",
      harmony: { type: "complementary" }
    });
    expect(builtIn.colors).toHaveLength(2);

    expect(() =>
      createHarmonyPalette({
        seed: "#336699",
        harmony: {
          type: "custom",
          id: shiftStrategy.id,
          version: shiftStrategy.version,
          options: { degrees: 30, label: "Shifted", tags: ["custom"] }
        }
      })
    ).toThrow(shiftStrategy.id);
  });
});
