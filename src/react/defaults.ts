import { createHarmonyPalette } from "../core";
import type { Palette } from "../core";

export function createDefaultPalette(): Palette {
  return createHarmonyPalette({
    seed: { space: "hsv", h: 258, s: 0.72, v: 0.96 },
    harmony: { type: "complementary" },
    name: "Complementary violet"
  });
}
