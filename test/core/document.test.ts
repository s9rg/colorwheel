import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  PaletteDocumentValidationError,
  assignPaletteColorIds,
  assertPaletteDocument,
  createPaletteDocument,
  parsePaletteDocument,
  serializePaletteDocument,
  validatePalette,
  validatePaletteDocument
} from "../../src/core";
import { testPalette } from "./fixtures";

describe("palette documents", () => {
  it("round-trips a versioned portable document", () => {
    const palette = testPalette();
    const document = createPaletteDocument(palette);
    expect(document).toEqual({
      schema: "color-palette",
      schemaVersion: 1,
      palette
    });
    const encoded = serializePaletteDocument(document);
    expect(parsePaletteDocument(encoded)).toEqual(document);
    expect(validatePaletteDocument(document)).toMatchObject({ valid: true });
  });

  it("accepts empty palettes and duplicate color values", () => {
    const document = createPaletteDocument({
      colors: [],
      kind: "custom",
      provenance: { origin: "manual" }
    });
    expect(() => assertPaletteDocument(document)).not.toThrow();

    const duplicateValues = {
      ...document,
      palette: {
        ...document.palette,
        colors: [
          { id: "a", color: { space: "srgb", r: 1, g: 0, b: 0 } },
          { id: "b", color: { space: "srgb", r: 1, g: 0, b: 0 } }
        ]
      }
    };
    expect(validatePaletteDocument(duplicateValues).valid).toBe(true);
  });

  it("rejects duplicate IDs with a precise path", () => {
    const document = createPaletteDocument(testPalette());
    const invalid = {
      ...document,
      palette: {
        ...document.palette,
        colors: document.palette.colors.map((entry) => ({ ...entry, id: "same" }))
      }
    };
    const result = validatePaletteDocument(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: "palette.duplicate-id",
          path: ["palette", "colors", 1, "id"]
        })
      );
    }
  });

  it("rejects non-finite, unnormalized, and non-JSON values", () => {
    const base = createPaletteDocument(testPalette());
    const nonFinite = structuredClone(base) as unknown as {
      palette: { colors: { color: { r: number } }[] };
    };
    nonFinite.palette.colors[0].color.r = Number.NaN;
    expect(validatePaletteDocument(nonFinite).valid).toBe(false);

    const hue = structuredClone(base) as unknown as {
      palette: { colors: { color: unknown }[] };
    };
    hue.palette.colors[0].color = { space: "hsl", h: 360, s: 1, l: 0.5 };
    expect(validatePaletteDocument(hue).valid).toBe(false);

    const withFunction = {
      ...base,
      palette: { ...base.palette, metadata: { callback: () => undefined } }
    };
    expect(validatePaletteDocument(withFunction).valid).toBe(false);
  });

  it("enforces object and integer fields in recipes and metadata", () => {
    const base = createPaletteDocument(testPalette());
    const invalid = {
      ...base,
      palette: {
        ...base.palette,
        name: 42,
        metadata: ["not", "an", "object"],
        recipe: {
          type: "wheel",
          harmony: { type: "analogous", count: 2.5 },
          strategy: { id: "harmony.analogous", version: "1", options: [] }
        }
      }
    };
    const result = validatePaletteDocument(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.map(({ code }) => code)).toEqual(
        expect.arrayContaining([
          "palette.name",
          "palette.metadata",
          "schema.integer",
          "strategy.options"
        ])
      );
    }
  });

  it("round-trips and validates portable recipe seed ownership", () => {
    const base = testPalette();
    const owned = {
      ...base,
      recipe: {
        type: "wheel" as const,
        seed: base.colors[0]?.color,
        seedColorId: base.colors[0]?.id,
        colorSlotIds: base.colors.slice(0, 2).map((entry) => entry.id),
        harmony: { type: "complementary" as const }
      }
    };
    expect(parsePaletteDocument(serializePaletteDocument(owned)).palette.recipe?.seedColorId).toBe(
      base.colors[0]?.id
    );
    expect(
      parsePaletteDocument(serializePaletteDocument(owned)).palette.recipe?.colorSlotIds
    ).toEqual(base.colors.slice(0, 2).map((entry) => entry.id));

    expect(
      validatePalette({
        ...owned,
        recipe: { ...owned.recipe, seedColorId: "missing" }
      }).valid
    ).toBe(false);
    expect(
      validatePalette({
        ...owned,
        recipe: { ...owned.recipe, colorSlotIds: [base.colors[0]?.id, "missing"] }
      }).valid
    ).toBe(false);
    expect(
      validatePalette({
        ...owned,
        recipe: {
          ...owned.recipe,
          colorSlotIds: [base.colors[0]?.id, base.colors[0]?.id]
        }
      }).valid
    ).toBe(false);
    expect(
      validatePalette({
        ...owned,
        recipe: { ...owned.recipe, colorSlotIds: [base.colors[1]?.id] }
      }).valid
    ).toBe(false);

    // Strategy-owned slots may be a subset when the palette retains locked or manual extras.
    expect(validatePalette(owned).valid).toBe(true);
    expect(
      validatePalette({
        ...owned,
        recipe: { type: "wheel", seedColorId: base.colors[0]?.id }
      }).valid
    ).toBe(false);

    // Additive compatibility: pre-field v1 recipes remain valid.
    expect(
      validatePalette({
        ...owned,
        recipe: { type: "wheel", seed: owned.recipe.seed, harmony: owned.recipe.harmony }
      }).valid
    ).toBe(true);
  });

  it("enforces each built-in harmony rule's executable fields and ranges", () => {
    const base = testPalette();
    const valid = (harmony: unknown): boolean =>
      validatePalette({
        ...base,
        recipe: { type: "wheel", harmony }
      }).valid;

    expect(valid({ type: "single" })).toBe(true);
    expect(valid({ type: "complementary", angle: 360 })).toBe(true);
    expect(valid({ type: "analogous", count: 12, spread: 180 })).toBe(true);
    expect(valid({ type: "triadic", angle: 180 })).toBe(true);
    expect(valid({ type: "tetradic", angle: 180 })).toBe(true);
    expect(valid({ type: "split-complementary", spread: 180 })).toBe(true);
    expect(valid({ type: "monochromatic", count: 16 })).toBe(true);

    expect(valid({ type: "single", count: 2 })).toBe(false);
    expect(valid({ type: "complementary", spread: 30 })).toBe(false);
    expect(valid({ type: "complementary", angle: 361 })).toBe(false);
    expect(valid({ type: "analogous", count: 13 })).toBe(false);
    expect(valid({ type: "analogous", spread: 181 })).toBe(false);
    expect(valid({ type: "triadic", angle: 181 })).toBe(false);
    expect(valid({ type: "tetradic", angle: 181 })).toBe(false);
    expect(valid({ type: "split-complementary", spread: 181 })).toBe(false);
    expect(valid({ type: "monochromatic", count: 17 })).toBe(false);
    expect(valid({ type: "monochromatic", angle: 20 })).toBe(false);
  });

  it("rejects legacy custom harmony discriminants and incomplete custom identities", () => {
    const base = createPaletteDocument(testPalette());
    const withHarmony = (harmony: unknown): unknown => ({
      ...base,
      palette: {
        ...base.palette,
        recipe: { type: "wheel", harmony }
      }
    });

    expect(
      validatePaletteDocument(
        withHarmony({
          type: "com.example.harmony.brand",
          version: "1",
          options: {}
        })
      ).valid
    ).toBe(false);
    expect(validatePaletteDocument(withHarmony({ type: "custom", options: {} })).valid).toBe(false);
    expect(
      validatePaletteDocument(
        withHarmony({ type: "custom", id: "com.example.harmony.brand", version: "", options: {} })
      ).valid
    ).toBe(false);
  });

  it("rejects circular values, unsupported versions, and malformed JSON", () => {
    const circular: Record<string, unknown> = {
      schema: "color-palette",
      schemaVersion: 1
    };
    circular.palette = circular;
    expect(validatePaletteDocument(circular).valid).toBe(false);

    expect(
      validatePaletteDocument({
        ...createPaletteDocument(testPalette()),
        schemaVersion: 2
      }).valid
    ).toBe(false);
    expect(() => parsePaletteDocument("{")).toThrow(PaletteDocumentValidationError);
  });

  it("enforces palette, metadata, and document resource limits", () => {
    const document = createPaletteDocument(testPalette());
    expect(validatePaletteDocument(document, { maxColors: 2 }).valid).toBe(false);
    const metadataHeavy = {
      ...document,
      palette: { ...document.palette, metadata: { note: "x".repeat(100) } }
    };
    expect(validatePaletteDocument(metadataHeavy, { maxMetadataBytes: 32 }).valid).toBe(false);
    expect(validatePaletteDocument(document, { maxDocumentBytes: 20 }).valid).toBe(false);
    expect(validatePalette(document.palette, { maxDocumentBytes: 20 }).valid).toBe(false);
  });

  it("rejects accessors, hidden data, inherited fields, and custom JSON hooks", () => {
    const accessorPalette = { ...testPalette() };
    let accessorReads = 0;
    Object.defineProperty(accessorPalette, "kind", {
      enumerable: true,
      get() {
        accessorReads += 1;
        return "custom";
      }
    });
    expect(validatePalette(accessorPalette).valid).toBe(false);
    expect(accessorReads).toBe(0);

    const hidden = { ...testPalette() };
    Object.defineProperty(hidden, "hidden", { value: "not portable", enumerable: false });
    expect(validatePalette(hidden).valid).toBe(false);

    const withOwnHook = { ...testPalette(), metadata: {} };
    Object.defineProperty(withOwnHook.metadata, "toJSON", {
      value: () => ({ substituted: true }),
      enumerable: false
    });
    expect(validatePalette(withOwnHook).valid).toBe(false);
    expect(() => serializePaletteDocument(withOwnHook)).toThrow(PaletteDocumentValidationError);

    const inheritedHookMetadata = runInNewContext(`(() => {
      Object.defineProperty(Object.prototype, "toJSON", {
        value() { return { substituted: true }; },
        enumerable: false
      });
      return { note: "foreign" };
    })()`) as object;
    expect(validatePalette({ ...testPalette(), metadata: inheritedHookMetadata }).valid).toBe(
      false
    );

    const inheritedSchemaPalette = runInNewContext(`(() => {
      Object.defineProperty(Object.prototype, "kind", { value: "custom" });
      Object.defineProperty(Object.prototype, "colors", { value: [] });
      Object.defineProperty(Object.prototype, "provenance", {
        value: { origin: "manual" }
      });
      return {};
    })()`) as unknown;
    expect(validatePalette(inheritedSchemaPalette).valid).toBe(false);
  });

  it("reserves document envelope fields instead of ambiguously serializing palettes", () => {
    const palette = { ...testPalette(), schema: "palette-extension" };
    expect(validatePalette(palette).valid).toBe(false);
    expect(() => serializePaletteDocument(palette)).toThrow(PaletteDocumentValidationError);

    const exactCollision = {
      ...testPalette(),
      schema: "color-palette" as const,
      schemaVersion: 1 as const,
      palette: testPalette()
    };
    expect(validatePalette(exactCollision).valid).toBe(false);
    expect(() => serializePaletteDocument(exactCollision)).toThrow(PaletteDocumentValidationError);
    expect(
      validatePaletteDocument({ ...createPaletteDocument(testPalette()), colors: [] }).valid
    ).toBe(false);
  });

  it("rejects sparse arrays instead of accepting values that serialize as null", () => {
    const sparseColors = Array(1);
    const sparsePalette = {
      colors: sparseColors,
      kind: "custom",
      provenance: { origin: "manual", seeds: Array(1) },
      metadata: { nested: Array(1) }
    };
    const paletteResult = validatePalette(sparsePalette);
    expect(paletteResult.valid).toBe(false);
    if (!paletteResult.valid) {
      expect(paletteResult.issues.map(({ code }) => code)).toContain("json.sparse-array");
    }
    expect(
      validatePaletteDocument({
        schema: "color-palette",
        schemaVersion: 1,
        palette: sparsePalette
      }).valid
    ).toBe(false);
  });

  it("checks byte limits before parsing and rejects invalid limit configuration", () => {
    const parse = vi.spyOn(JSON, "parse");
    try {
      expect(() => parsePaletteDocument(" ".repeat(21), { maxDocumentBytes: 20 })).toThrow(
        PaletteDocumentValidationError
      );
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
    expect(() => validatePaletteDocument({}, { maxColors: Number.NaN })).toThrow(/maxColors/);
    expect(() => validatePaletteDocument({}, { maxDepth: -1 })).toThrow(/maxDepth/);
  });

  it("injects deterministic unique IDs while preserving supplied entries", () => {
    const entries = assignPaletteColorIds([
      { id: "color-1", color: "#f00", name: "First" },
      { color: "#0f0" },
      { id: "color-1", color: "#00f", locked: true }
    ]);
    expect(entries.map(({ id }) => id)).toEqual(["color-1", "color-2", "color-3"]);
    expect(entries[0]).toMatchObject({ name: "First" });
    expect(entries[2]).toMatchObject({ locked: true });
    expect(() => assignPaletteColorIds(Array(1))).toThrow(/sparse/);
    expect(() => assignPaletteColorIds([{ color: "#fff", locked: "yes" }] as never)).toThrow(
      PaletteDocumentValidationError
    );
  });
});
