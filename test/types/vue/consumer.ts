import { h, ref } from "vue";
import type { Palette } from "@s9rg/colorwheel/core";
import {
  Colorwheel,
  createColorwheelComponent,
  useColorwheel,
  type ColorwheelProps
} from "@s9rg/colorwheel/vue";

interface ProductMetadata {
  source: string;
}

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

const productProps = {
  defaultPalette: palette,
  ariaLabel: "Product palette"
} satisfies ColorwheelProps<ProductMetadata>;

const ProductColorwheel = createColorwheelComponent<ProductMetadata>();
const paletteModel = ref(palette);
const editor = useColorwheel<ProductMetadata>({ palette: paletteModel });

h(ProductColorwheel, productProps);
h(Colorwheel, { ariaLabel: "Default palette" });
editor.palette.value.metadata?.source.toUpperCase();
editor.destroy();
