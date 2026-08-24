import {
  createHarmonyPalette,
  formatColor,
  type HarmonyStrategy,
  type Palette,
  type StrategyReference
} from "@s9rg/colorwheel/core";
import { type ColorwheelMountOptions } from "@s9rg/colorwheel/dom";
import { mountColorwheel } from "@s9rg/colorwheel/vanilla";
import { createPickerControllerFromPalette, type PickerState } from "@s9rg/colorwheel/editor";

interface ConsumerMetadata {
  source: string;
  review: {
    approved: boolean;
  };
  tags: string[];
}

interface ConsumerHarmonyOptions {
  offset: number;
}

const palette: Palette<ConsumerMetadata> = {
  colors: [
    {
      id: "brand",
      color: { space: "oklch", l: 0.68, c: 0.16, h: 250 },
      metadata: {
        source: "design-system",
        review: { approved: true },
        tags: ["brand"]
      }
    }
  ],
  kind: "brand-system",
  provenance: { origin: "manual" },
  metadata: {
    source: "design-system",
    review: { approved: true },
    tags: ["public"]
  }
};

const strategy: HarmonyStrategy<ConsumerHarmonyOptions> = {
  id: "example.offset",
  version: "1.0.0",
  create(seed, options, context) {
    return createHarmonyPalette({
      seed: context.convert(seed, "oklch"),
      harmony: { type: "complementary", angle: 180 + options.offset }
    });
  }
};

const strategyReference: StrategyReference<ConsumerHarmonyOptions> = {
  id: strategy.id,
  version: strategy.version,
  options: { offset: 5 }
};

const controller = createPickerControllerFromPalette(palette);
const state: PickerState<ConsumerMetadata> = controller.getState();
const domOptions: ColorwheelMountOptions<ConsumerMetadata> = {
  palette,
  renderPalette: false
};

void state;
void domOptions;
void strategyReference;
void mountColorwheel;
formatColor(palette.colors[0].color, { format: "hex" });
controller.destroy();
