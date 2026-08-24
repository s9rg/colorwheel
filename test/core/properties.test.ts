import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  convertColor,
  createHarmonyPalette,
  validatePalette,
  type HarmonyRule,
  type SrgbColor
} from "../../src/core";

const unit = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });
const srgb = fc.record({
  r: unit,
  g: unit,
  b: unit,
  alpha: unit
});

const harmonyRule: fc.Arbitrary<HarmonyRule> = fc
  .tuple(
    fc.integer({ min: 0, max: 6 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 0, max: 180 })
  )
  .map(([kind, count, angle]) => {
    switch (kind) {
      case 0:
        return { type: "single" };
      case 1:
        return { type: "complementary", angle };
      case 2:
        return { type: "analogous", count, spread: angle };
      case 3:
        return { type: "triadic", angle };
      case 4:
        return { type: "tetradic", angle };
      case 5:
        return { type: "split-complementary", spread: angle };
      default:
        return { type: "monochromatic", count };
    }
  });

describe("core properties", () => {
  it("round-trips bounded sRGB values through OKLCH with finite channels", () => {
    fc.assert(
      fc.property(srgb, ({ r, g, b, alpha }) => {
        const original: SrgbColor = { space: "srgb", r, g, b, alpha };
        const perceptual = convertColor(original, "oklch");
        const roundTrip = convertColor(perceptual, "srgb");
        expect(
          [perceptual.l, perceptual.c, perceptual.h, roundTrip.r, roundTrip.g, roundTrip.b].every(
            Number.isFinite
          )
        ).toBe(true);
        expect(Math.abs(roundTrip.r - r)).toBeLessThan(2e-6);
        expect(Math.abs(roundTrip.g - g)).toBeLessThan(2e-6);
        expect(Math.abs(roundTrip.b - b)).toBeLessThan(2e-6);
        expect(roundTrip.alpha).toBe(alpha);
      }),
      { seed: 0x5eedc0de, numRuns: 200 }
    );
  });

  it("generates deterministic palettes that satisfy document invariants", () => {
    fc.assert(
      fc.property(srgb, harmonyRule, ({ r, g, b, alpha }, harmony) => {
        const options = {
          seed: { space: "srgb" as const, r, g, b, alpha },
          harmony
        };
        const first = createHarmonyPalette(options);
        const second = createHarmonyPalette(options);
        expect(first).toEqual(second);
        expect(validatePalette(first).valid).toBe(true);
        expect(first.colors.length).toBeGreaterThan(0);
        expect(new Set(first.colors.map(({ id }) => id)).size).toBe(first.colors.length);
        first.colors.forEach(({ color }) => {
          expect(color.space === "srgb" || color.space === "display-p3").toBe(true);
          if (color.space === "srgb" || color.space === "display-p3") {
            expect([color.r, color.g, color.b].every(Number.isFinite)).toBe(true);
            expect(
              [color.r, color.g, color.b].every((channel) => channel >= 0 && channel <= 1)
            ).toBe(true);
          }
        });
      }),
      { seed: 0xc010a11, numRuns: 120 }
    );
  });
});
