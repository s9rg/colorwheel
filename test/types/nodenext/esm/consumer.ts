import { createHarmonyPalette, parseColor } from "@s9rg/colorwheel";
import { contrastRatio } from "@s9rg/colorwheel/core";
import { mountColorwheel } from "@s9rg/colorwheel/dom";
import { mountColorwheel as mountVanillaColorwheel } from "@s9rg/colorwheel/vanilla";
import { createPickerState } from "@s9rg/colorwheel/editor";

const palette = createHarmonyPalette({
  seed: parseColor("#663399"),
  harmony: { type: "triadic" }
});
const state = createPickerState({ palette });

contrastRatio("#000", "#fff");
void mountColorwheel;
void mountVanillaColorwheel;
void state;
