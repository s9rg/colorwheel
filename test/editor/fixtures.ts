import type { ColorValue, Palette, PaletteColor } from "../../src/core";

export const red: ColorValue = { space: "hsv", h: 0, s: 1, v: 1 };
export const green: ColorValue = { space: "hsv", h: 120, s: 1, v: 1 };
export const blue: ColorValue = { space: "hsv", h: 240, s: 1, v: 1 };

export function makeEntry(
  id: string,
  color: ColorValue,
  extra: Partial<PaletteColor> = {}
): PaletteColor {
  return { id, color, ...extra };
}

export function makePalette(
  colors: readonly PaletteColor[] = [
    makeEntry("red", red, { name: "Red" }),
    makeEntry("green", green, { name: "Green" }),
    makeEntry("blue", blue, { name: "Blue" })
  ],
  extra: Partial<Palette> = {}
): Palette {
  return {
    colors,
    kind: "custom",
    provenance: { origin: "manual" },
    ...extra
  };
}

export function makeHarmonyPalette(): Palette {
  return makePalette(undefined, {
    kind: "harmony",
    recipe: {
      type: "wheel",
      seed: red,
      harmony: { type: "triadic" }
    },
    provenance: { origin: "wheel", seeds: [red] },
    name: "Brand colors"
  });
}
