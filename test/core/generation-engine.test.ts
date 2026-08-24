import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_EXPORTER_IDS,
  BUILT_IN_HARMONY_IDS,
  BUILT_IN_IMPORTER_IDS,
  BUILT_IN_SERIALIZER_VERSION,
  BUILT_IN_STRATEGY_VERSION,
  InvalidStrategyOutputError,
  MissingStrategyError,
  PaletteDocumentValidationError,
  StrategyRegistrationError,
  convertColor,
  createColorEngine,
  createHarmonyPalette,
  createTonalPalette,
  mapToGamut,
  serializePaletteDocument,
  type HarmonyStrategy,
  type GamutMappingStrategy,
  type Palette,
  type PaletteExporter,
  type PaletteImporter,
  type PaletteValidator,
  type StrategyReference
} from "../../src/core";
import { testPalette } from "./fixtures";

function hue(color: Palette["colors"][number]["color"]): number {
  return convertColor(color, "oklch").h;
}

describe("built-in palette generation", () => {
  it("creates deterministic hue-geometry harmonies", () => {
    const seed = { space: "oklch", l: 0.62, c: 0.1, h: 40 } as const;
    const analogous = createHarmonyPalette({
      seed,
      harmony: { type: "analogous" }
    });
    expect(analogous.colors).toHaveLength(3);
    expect(analogous.colors.map(({ id }) => id)).toEqual(["color-1", "color-2", "color-3"]);
    expect(analogous.colors.map(({ color }) => hue(color))).toEqual([
      expect.closeTo(10, 3),
      expect.closeTo(40, 3),
      expect.closeTo(70, 3)
    ]);
    expect(analogous.recipe?.seedColorId).toBe("color-2");

    const evenAnalogous = createHarmonyPalette({
      seed,
      harmony: { type: "analogous", count: 4, spread: 30 }
    });
    expect(evenAnalogous.colors.map(({ color }) => hue(color))).toEqual([
      expect.closeTo(10, 3),
      expect.closeTo(40, 3),
      expect.closeTo(70, 3),
      expect.closeTo(100, 3)
    ]);
    expect(evenAnalogous.recipe?.seedColorId).toBe("color-2");
    expect(evenAnalogous.recipe?.colorSlotIds).toEqual([
      "color-1",
      "color-2",
      "color-3",
      "color-4"
    ]);

    const collapsedAnalogous = createHarmonyPalette({
      seed,
      harmony: { type: "analogous", count: 4, spread: 0 }
    });
    expect(collapsedAnalogous.recipe?.seedColorId).toBe("color-2");

    const complement = createHarmonyPalette({
      seed,
      harmony: { type: "complementary" }
    });
    expect(hue(complement.colors[1].color)).toBeCloseTo(220, 3);
    expect(complement.recipe?.harmony).toEqual({
      type: "complementary",
      angle: 180
    });
    expect(complement.provenance).toMatchObject({ origin: "wheel" });
  });

  it("supports every stable harmony rule with documented default counts", () => {
    const seed = "#d64b77";
    const cases = [
      [{ type: "single" as const }, 1],
      [{ type: "complementary" as const }, 2],
      [{ type: "triadic" as const }, 3],
      [{ type: "tetradic" as const }, 4],
      [{ type: "split-complementary" as const }, 3],
      [{ type: "monochromatic" as const }, 5]
    ] as const;
    cases.forEach(([harmony, count]) => {
      expect(createHarmonyPalette({ seed, harmony }).colors).toHaveLength(count);
    });
  });

  it("keeps monochromatic output ordered while assigning the exact seed entry", () => {
    const seed = { space: "oklch", l: 0.63, c: 0.12, h: 285 } as const;
    const palette = createHarmonyPalette({
      seed,
      harmony: { type: "monochromatic", count: 6 }
    });
    const lightness = palette.colors.map(({ color }) => convertColor(color, "oklch").l);
    expect(lightness.every((value, index) => index === 0 || value < lightness[index - 1])).toBe(
      true
    );
    const owner = palette.colors.find((entry) => entry.id === palette.recipe?.seedColorId);
    expect(owner?.color).toEqual(mapToGamut(seed, "srgb").color);
  });

  it("builds a monotonic, gamut-mapped tonal palette", () => {
    const palette = createTonalPalette({ seed: "#7c3aed", count: 7 });
    expect(palette.kind).toBe("tonal");
    expect(palette.provenance.strategy?.id).toBe("generator.tonal");
    const lightness = palette.colors.map(({ color }) => convertColor(color, "oklch").l);
    expect(lightness[0]).toBeCloseTo(0.97, 4);
    expect(lightness.at(-1)).toBeCloseTo(0.18, 4);
    expect(lightness.every((value, index) => index === 0 || value < lightness[index - 1])).toBe(
      true
    );
  });

  it("supports caller-owned IDs and rejects collisions", () => {
    const palette = createHarmonyPalette({
      seed: "#f00",
      harmony: { type: "triadic" },
      idFactory: (index) => `brand-${index}`
    });
    expect(palette.colors.map(({ id }) => id)).toEqual(["brand-0", "brand-1", "brand-2"]);
    expect(palette.recipe?.seedColorId).toBe("brand-0");
    expect(palette.recipe?.colorSlotIds).toEqual(["brand-0", "brand-1", "brand-2"]);
    expect(() =>
      createHarmonyPalette({
        seed: "#f00",
        harmony: { type: "triadic" },
        idFactory: () => "duplicate"
      })
    ).toThrow(PaletteDocumentValidationError);
  });

  it("validates direct generation options before use", () => {
    expect(() => createHarmonyPalette(null as never)).toThrow(/options/);
    expect(() => createHarmonyPalette({ seed: "#fff", harmony: null } as never)).toThrow(/harmony/);
    expect(() => createTonalPalette({ seed: "#fff", lightnessRange: Array(2) } as never)).toThrow(
      /dense/
    );
    expect(() => createTonalPalette({ seed: "#fff", idFactory: "id" } as never)).toThrow(
      /idFactory/
    );
  });
});

describe("instance-scoped strategy engine", () => {
  it("does not request built-in analyzers from an intentionally empty engine", () => {
    const engine = createColorEngine({ includeBuiltIns: false });
    expect(engine.listStrategies("analyzer")).toEqual([]);
    expect(engine.analyze(testPalette())).toEqual({ diagnostics: [] });
  });

  const customStrategy: HarmonyStrategy = {
    id: "example.identity",
    version: "1.0.0",
    create(seed) {
      return {
        colors: [{ id: "seed", color: seed }],
        kind: "example.identity",
        provenance: {
          origin: "generated",
          strategy: { id: this.id, version: this.version },
          seeds: [seed]
        }
      };
    }
  };
  const reference = { id: customStrategy.id, version: customStrategy.version };

  it("keeps custom registrations isolated per engine", () => {
    const withCustom = createColorEngine({ harmonies: [customStrategy] });
    const defaultsOnly = createColorEngine();
    expect(withCustom.createHarmony(reference, "#123456").colors[0]?.id).toBe("seed");
    expect(() => defaultsOnly.createHarmony(reference, "#123456")).toThrow(MissingStrategyError);
  });

  it("keeps delimiter-bearing strategy identities distinct", () => {
    const first: HarmonyStrategy = {
      ...customStrategy,
      id: "example",
      version: "one\u0000two",
      create(seed) {
        return {
          colors: [{ id: "first", color: seed }],
          kind: "custom",
          provenance: { origin: "generated" }
        };
      }
    };
    const second: HarmonyStrategy = {
      ...customStrategy,
      id: "example\u0000one",
      version: "two",
      create(seed) {
        return {
          colors: [{ id: "second", color: seed }],
          kind: "custom",
          provenance: { origin: "generated" }
        };
      }
    };
    const engine = createColorEngine({ harmonies: [first, second] });
    expect(engine.createHarmony(first, "#fff").colors[0]?.id).toBe("first");
    expect(engine.createHarmony(second, "#fff").colors[0]?.id).toBe("second");
  });

  it("enforces instance-specific palette resource limits", () => {
    const constrained = createColorEngine({
      harmonies: [customStrategy],
      validationLimits: { maxColors: 0 }
    });
    expect(() => constrained.createHarmony(reference, "#123456")).toThrow(
      PaletteDocumentValidationError
    );
  });

  it("runs built-ins through the same registry contract", () => {
    const engine = createColorEngine();
    const builtInReference: StrategyReference = {
      id: BUILT_IN_HARMONY_IDS.complementary,
      version: BUILT_IN_STRATEGY_VERSION,
      options: { outputGamut: "srgb" }
    };
    expect(engine.createHarmony(builtInReference, "#ef4444")).toEqual(
      createHarmonyPalette({ seed: "#ef4444", harmony: { type: "complementary" } })
    );
    expect(engine.hasStrategy("harmony", builtInReference)).toBe(true);
    expect(engine.listStrategies("harmony").length).toBeGreaterThanOrEqual(7);
  });

  it("accepts plain strategy references and options from another JavaScript realm", () => {
    const reference = runInNewContext(`({
      id: "harmony.complementary",
      version: "1.0.0",
      options: { angle: 180, outputGamut: "srgb" }
    })`) as StrategyReference;
    expect(createColorEngine().createHarmony(reference, "#ef4444").colors).toHaveLength(2);
  });

  it("rejects cross-realm strategy options with inherited JSON hooks", () => {
    const reference = runInNewContext(`(() => {
      Object.defineProperty(Object.prototype, "toJSON", {
        value() { return { substituted: true }; },
        enumerable: false
      });
      return {
        id: "harmony.complementary",
        version: "1.0.0",
        options: { angle: 180, outputGamut: "srgb" }
      };
    })()`) as StrategyReference;
    expect(() => createColorEngine().createHarmony(reference, "#ef4444")).toThrow(/toJSON|inherit/);
  });

  it("rejects registry collisions unless override is explicit", () => {
    const collision: HarmonyStrategy = {
      ...customStrategy,
      id: BUILT_IN_HARMONY_IDS.single,
      version: BUILT_IN_STRATEGY_VERSION
    };
    expect(() => createColorEngine({ harmonies: [collision] })).toThrow(StrategyRegistrationError);
    expect(() =>
      createColorEngine({ harmonies: [collision], overrideStrategies: true })
    ).not.toThrow();
  });

  it("reports missing analyzers without discarding the palette", () => {
    const engine = createColorEngine();
    const palette = testPalette();
    const result = engine.analyze(palette, [{ id: "missing", version: "1" }]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        ruleId: "strategy.missing",
        severity: "error",
        data: { category: "analyzer", id: "missing", version: "1" }
      })
    ]);
    expect(palette).toEqual(testPalette());
  });

  it("rejects non-serializable strategy options and invalid outputs", () => {
    const engine = createColorEngine({ harmonies: [customStrategy] });
    const invalidOptions = {
      ...reference,
      options: { value: Number.NaN }
    } as unknown as StrategyReference;
    expect(() => engine.createHarmony(invalidOptions, "#fff")).toThrow(/non-finite/);

    const invalid: HarmonyStrategy = {
      id: "example.invalid",
      version: "1",
      create(seed) {
        return {
          colors: [
            { id: "duplicate", color: seed },
            { id: "duplicate", color: seed }
          ],
          kind: "custom",
          provenance: { origin: "generated" }
        };
      }
    };
    const unsafeEngine = createColorEngine({ harmonies: [invalid] });
    expect(() =>
      unsafeEngine.createHarmony({ id: invalid.id, version: invalid.version }, "#fff")
    ).toThrow(PaletteDocumentValidationError);

    const sparse: HarmonyStrategy = {
      id: "example.sparse",
      version: "1",
      create() {
        return {
          colors: Array(1),
          kind: "custom",
          provenance: { origin: "generated" }
        };
      }
    };
    expect(() => createColorEngine({ harmonies: [sparse] }).createHarmony(sparse, "#fff")).toThrow(
      PaletteDocumentValidationError
    );
  });

  it("rejects sparse registration, reference, and diagnostic arrays", () => {
    expect(() =>
      createColorEngine({ harmonies: Array(1) as unknown as readonly HarmonyStrategy[] })
    ).toThrow(/cannot be sparse/);

    const engine = createColorEngine();
    expect(() =>
      engine.validate(testPalette(), Array(1) as unknown as readonly StrategyReference[])
    ).toThrow(/cannot be sparse/);
    expect(() =>
      engine.analyze(testPalette(), Array(1) as unknown as readonly StrategyReference[])
    ).toThrow(/cannot be sparse/);

    const validator: PaletteValidator = {
      id: "example.sparse-diagnostic",
      version: "1",
      validate() {
        return [
          {
            ruleId: "example.rule",
            severity: "warning",
            messageKey: "example.message",
            colorIds: Array(1)
          }
        ];
      }
    };
    expect(() =>
      createColorEngine({ validators: [validator] }).validate(testPalette(), [validator])
    ).toThrow(InvalidStrategyOutputError);
  });

  it("validates custom gamut-policy and exporter output", () => {
    const invalidGamut: GamutMappingStrategy = {
      id: "example.invalid-gamut",
      version: "1",
      map() {
        return {
          color: { space: "srgb", r: Number.NaN, g: 3, b: -1 },
          gamut: "display-p3",
          mapped: false,
          deltaE: -1,
          method: "none"
        };
      }
    };
    const invalidGamutEngine = createColorEngine({ gamutPolicies: [invalidGamut] });
    expect(() => invalidGamutEngine.map("#fff", "srgb", invalidGamut)).toThrow(
      InvalidStrategyOutputError
    );

    const customGamut: GamutMappingStrategy = {
      id: "example.custom-gamut",
      version: "1",
      map(_color, gamut) {
        return gamut === "srgb"
          ? {
              color: { space: "srgb", r: 0.25, g: 0.5, b: 0.75 },
              gamut,
              mapped: true,
              deltaE: 0.1,
              method: "example.custom-map"
            }
          : {
              color: { space: "display-p3", r: 0.25, g: 0.5, b: 0.75 },
              gamut,
              mapped: true,
              deltaE: 0.1,
              method: "example.custom-map"
            };
      }
    };
    expect(
      createColorEngine({ gamutPolicies: [customGamut] }).map("#fff", "srgb", customGamut)
    ).toMatchObject({ method: "example.custom-map", gamut: "srgb" });

    const sparseExporter: PaletteExporter = {
      id: "example.sparse-export",
      version: "1",
      export() {
        return { files: Array(1) };
      }
    };
    expect(() =>
      createColorEngine({ exporters: [sparseExporter] }).export(testPalette(), sparseExporter)
    ).toThrow(InvalidStrategyOutputError);
  });

  it("preflights imported bytes and rejects malformed UTF-8", () => {
    let called = false;
    const importer: PaletteImporter = {
      id: "example.importer",
      version: "1",
      import() {
        called = true;
        return { schema: "color-palette", schemaVersion: 1, palette: testPalette() };
      }
    };
    const constrained = createColorEngine({
      importers: [importer],
      validationLimits: { maxDocumentBytes: 10 }
    });
    expect(() => constrained.import("x".repeat(11), importer)).toThrow(
      PaletteDocumentValidationError
    );
    expect(called).toBe(false);

    const valid = serializePaletteDocument({
      colors: [],
      kind: "custom",
      provenance: { origin: "manual" }
    });
    const asciiTail = [...valid.slice(1)].map((character) => character.charCodeAt(0));
    const invalidUtf8Inputs = [
      new Uint8Array([0xc1, 0xbb, ...asciiTail]),
      new Uint8Array([0x80]),
      new Uint8Array([0xe2, 0x82]),
      new Uint8Array([0xed, 0xa0, 0x80]),
      new Uint8Array([0xf4, 0x90, 0x80, 0x80])
    ];
    const builtInImporter = {
      id: BUILT_IN_IMPORTER_IDS.json,
      version: BUILT_IN_SERIALIZER_VERSION
    };
    for (const invalidUtf8 of invalidUtf8Inputs) {
      expect(() => createColorEngine().import(invalidUtf8, builtInImporter)).toThrow(/valid UTF-8/);
    }

    const unicode = serializePaletteDocument({
      name: "Brand 🎨",
      colors: [],
      kind: "custom",
      provenance: { origin: "manual" }
    });
    expect(
      createColorEngine().import(new TextEncoder().encode(unicode), builtInImporter).palette.name
    ).toBe("Brand 🎨");
  });

  it("exports and imports through registered serializers", () => {
    const engine = createColorEngine();
    const palette = testPalette();
    const artifact = engine.export(palette, {
      id: BUILT_IN_EXPORTER_IDS.json,
      version: BUILT_IN_SERIALIZER_VERSION
    });
    const content = artifact.files[0]?.content;
    expect(typeof content).toBe("string");
    const imported = engine.import(content, {
      id: BUILT_IN_IMPORTER_IDS.json,
      version: BUILT_IN_SERIALIZER_VERSION
    });
    expect(imported.palette).toEqual(palette);
    expect(content).toBe(serializePaletteDocument(palette));
  });
});
