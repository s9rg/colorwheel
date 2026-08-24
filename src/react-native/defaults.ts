import { createHarmonyPalette } from "../core";
import type { Palette } from "../core";

/** Creates a fresh palette for uncontrolled native pickers. */
export function createDefaultNativePalette(): Palette {
  return createHarmonyPalette({
    seed: { space: "hsv", h: 258, s: 0.72, v: 0.96 },
    harmony: { type: "complementary" },
    name: "Complementary violet"
  });
}
