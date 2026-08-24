import { describe, expect, it } from "vitest";
import {
  ColorParseError,
  colorToXyz,
  convertColor,
  formatColor,
  isInGamut,
  mapToGamut,
  parseColor,
  perceptualDistance,
  srgbToLinear
} from "../../src/core";

describe("parseColor", () => {
  it("parses short and long hex with alpha", () => {
    expect(parseColor("#0f08")).toEqual({
      space: "srgb",
      r: 0,
      g: 1,
      b: 0,
      alpha: 0x88 / 255
    });
    expect(parseColor("#336699cc")).toEqual({
      space: "srgb",
      r: 0x33 / 255,
      g: 0x66 / 255,
      b: 0x99 / 255,
      alpha: 0xcc / 255
    });
  });

  it("parses modern and legacy rgb forms", () => {
    expect(parseColor("rgb(100% 0% 50% / 25%)")).toEqual({
      space: "srgb",
      r: 1,
      g: 0,
      b: 0.5,
      alpha: 0.25
    });
    expect(parseColor("rgba(255, 128, 0, .5)")).toEqual({
      space: "srgb",
      r: 1,
      g: 128 / 255,
      b: 0,
      alpha: 0.5
    });
  });

  it("normalizes CSS angle units", () => {
    expect(parseColor("hsl(-.25turn 50% 25%)")).toEqual({
      space: "hsl",
      h: 270,
      s: 0.5,
      l: 0.25
    });
    expect(parseColor("oklch(62% 25% 3.141592653589793rad / .8)")).toEqual({
      space: "oklch",
      l: 0.62,
      c: 0.1,
      h: 180,
      alpha: 0.8
    });
  });

  it("rejects unsupported syntax and out-of-range channels", () => {
    expect(() => parseColor("blue")).toThrow(ColorParseError);
    expect(() => parseColor("lab(50% 0 0)")).toThrow(/not supported/);
    expect(() => parseColor("rgb(256 0 0)")).toThrow(/between 0 and 255/);
    expect(() => parseColor("rgb(10% 0 0)")).toThrow(/cannot mix/);
    expect(() => parseColor("oklch(50% .8 30)")).toThrow(/between 0 and 0.5/);
  });
});

describe("color conversions", () => {
  it("matches published sRGB and OKLab reference vectors for red", () => {
    const red = { space: "srgb", r: 1, g: 0, b: 0 } as const;
    expect(srgbToLinear(red)).toMatchObject({ r: 1, g: 0, b: 0 });
    const xyz = colorToXyz(red);
    expect(xyz.x).toBeCloseTo(0.4123907993, 9);
    expect(xyz.y).toBeCloseTo(0.2126390059, 9);
    expect(xyz.z).toBeCloseTo(0.0193308187, 9);
    const lch = convertColor(red, "oklch");
    expect(lch.l).toBeCloseTo(0.62795536, 6);
    expect(lch.c).toBeCloseTo(0.25768331, 6);
    expect(lch.h).toBeCloseTo(29.2339, 3);
  });

  it("converts HSL and HSV primaries exactly", () => {
    expect(convertColor({ space: "hsl", h: 120, s: 1, l: 0.5 }, "srgb")).toEqual({
      space: "srgb",
      r: 0,
      g: 1,
      b: 0
    });
    expect(convertColor({ space: "hsv", h: 240, s: 1, v: 1 }, "srgb")).toEqual({
      space: "srgb",
      r: 0,
      g: 0,
      b: 1
    });
    expect(convertColor("#808080", "hsv")).toMatchObject({ h: 0, s: 0 });
  });

  it("round-trips representative sRGB colors through OKLCH", () => {
    const samples = [
      [0.1, 0.2, 0.3],
      [0.8, 0.15, 0.4],
      [0.03, 0.9, 0.55],
      [0.7, 0.7, 0.2]
    ] as const;
    samples.forEach(([r, g, b]) => {
      const original = { space: "srgb", r, g, b } as const;
      const roundTrip = convertColor(convertColor(original, "oklch"), "srgb");
      expect(roundTrip.r).toBeCloseTo(r, 6);
      expect(roundTrip.g).toBeCloseTo(g, 6);
      expect(roundTrip.b).toBeCloseTo(b, 6);
    });
  });

  it("preserves channels across a deterministic property sample", () => {
    let state = 0x9e3779b9;
    const random = (): number => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 0xffffffff;
    };
    for (let index = 0; index < 128; index += 1) {
      const original = {
        space: "srgb" as const,
        r: random(),
        g: random(),
        b: random(),
        alpha: random()
      };
      const roundTrip = convertColor(convertColor(original, "oklch"), "srgb");
      expect(roundTrip.r).toBeCloseTo(original.r, 6);
      expect(roundTrip.g).toBeCloseTo(original.g, 6);
      expect(roundTrip.b).toBeCloseTo(original.b, 6);
      expect(roundTrip.alpha).toBe(original.alpha);
    }
  });

  it("round-trips display-p3 values through XYZ", () => {
    const original = { space: "display-p3", r: 0.75, g: 0.2, b: 0.6 } as const;
    const result = convertColor(convertColor(original, "oklch"), "display-p3");
    expect(result.r).toBeCloseTo(original.r, 6);
    expect(result.g).toBeCloseTo(original.g, 6);
    expect(result.b).toBeCloseTo(original.b, 6);
  });

  it("returns bounded, reusable HSL and HSV for wide-gamut inputs", () => {
    const wide = { space: "display-p3", r: 1, g: 0, b: 0 } as const;
    for (const space of ["hsl", "hsv"] as const) {
      const converted = convertColor(wide, space);
      const channels =
        converted.space === "hsl" ? [converted.s, converted.l] : [converted.s, converted.v];
      expect(channels.every((channel) => channel >= 0 && channel <= 1)).toBe(true);
      expect(() => convertColor(converted, "srgb")).not.toThrow();
    }
    expect(formatColor(wide, { format: "hsl" })).toMatch(/^hsl\(/);
  });
});

describe("formatting and gamut mapping", () => {
  it("formats deterministic CSS forms", () => {
    expect(formatColor({ space: "srgb", r: 0.2, g: 0.4, b: 0.6, alpha: 0.5 })).toBe("#33669980");
    expect(formatColor("hsl(30 50% 25%)")).toBe("hsl(30 50% 25%)");
    expect(formatColor({ space: "oklch", l: 0.625, c: 0.12345, h: 42.125 }, { precision: 2 })).toBe(
      "oklch(62.5% 0.12 42.13)"
    );
  });

  it("rejects malformed runtime format options and hybrid CSS syntax", () => {
    expect(() =>
      formatColor("#f00", { format: "unsupported" } as unknown as Parameters<typeof formatColor>[1])
    ).toThrow(/format/);
    expect(() => formatColor("#f00", { precision: Number.NaN })).toThrow(/precision/);
    expect(() =>
      formatColor("#f00", { alpha: "sometimes" } as unknown as Parameters<typeof formatColor>[1])
    ).toThrow(/alpha/);
    expect(() => parseColor("rgb(1, 2, 3 / .5)")).toThrow(/legacy comma syntax/);
  });

  it("maps out-of-gamut OKLCH by chroma rather than silent clipping", () => {
    const vivid = { space: "oklch", l: 0.72, c: 0.4, h: 40 } as const;
    expect(isInGamut(vivid, "srgb")).toBe(false);
    const extendedSrgb = convertColor(vivid, "srgb");
    expect(
      [extendedSrgb.r, extendedSrgb.g, extendedSrgb.b].some((value) => value > 1 || value < 0)
    ).toBe(true);
    const extendedRoundTrip = convertColor(extendedSrgb, "oklch");
    expect(extendedRoundTrip.l).toBeCloseTo(vivid.l, 6);
    expect(extendedRoundTrip.c).toBeCloseTo(vivid.c, 6);
    expect(extendedRoundTrip.h).toBeCloseTo(vivid.h, 5);
    const result = mapToGamut(vivid, "srgb");
    expect(result.mapped).toBe(true);
    expect(result.method).toBe("oklch-chroma-reduction");
    expect(result.deltaE).toBeGreaterThan(0);
    expect(isInGamut(result.color, "srgb")).toBe(true);
    expect(convertColor(result.color, "oklch").h).toBeCloseTo(40, 3);
  });

  it("leaves in-gamut colors unchanged and measures OKLab distance", () => {
    expect(mapToGamut("#336699", "srgb")).toMatchObject({ mapped: false, deltaE: 0 });
    expect(perceptualDistance("#fff", "#fff")).toBeCloseTo(0, 10);
    expect(perceptualDistance("#000", "#fff")).toBeGreaterThan(0.99);
  });

  it("always returns bounded finite channels across a gamut-map sample", () => {
    for (let hue = 0; hue < 360; hue += 15) {
      for (const lightness of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const result = mapToGamut({ space: "oklch", l: lightness, c: 0.4, h: hue }, "srgb");
        expect([result.color.r, result.color.g, result.color.b].every(Number.isFinite)).toBe(true);
        expect(
          [result.color.r, result.color.g, result.color.b].every(
            (channel) => channel >= 0 && channel <= 1
          )
        ).toBe(true);
      }
    }
  });
});
