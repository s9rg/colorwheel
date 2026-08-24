import type { Palette } from "@s9rg/colorwheel/core";
import {
  ColorwheelComponent,
  ColorwheelPaletteTemplateDirective,
  type ColorwheelChangeEvent
} from "@s9rg/colorwheel/angular";

interface ProductMetadata {
  source: string;
}

declare const component: ColorwheelComponent<ProductMetadata>;
declare const event: ColorwheelChangeEvent<ProductMetadata>;

const palette: Palette<ProductMetadata> = {
  kind: "brand",
  provenance: { origin: "manual" },
  metadata: { source: "design-system" },
  colors: [
    {
      id: "brand",
      color: { space: "oklch", l: 0.68, c: 0.16, h: 250 },
      metadata: { source: "design-system" }
    }
  ]
};

component.defaultPalette = palette;
component.colorwheelChange.subscribe((change) => {
  change.palette.metadata?.source.toUpperCase();
});
event.value.palette.metadata?.source.toUpperCase();
void ColorwheelPaletteTemplateDirective;
