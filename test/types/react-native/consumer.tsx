import type { Palette } from "@s9rg/colorwheel/core";
import {
  NativePaletteBlock,
  NativeWheelBlock,
  Picker,
  type NativePickerProps
} from "@s9rg/colorwheel/react-native";

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

const pickerProps = {
  defaultPalette: palette,
  blocks: {
    wheel: NativeWheelBlock<ProductMetadata>,
    palette: NativePaletteBlock<ProductMetadata>
  }
} satisfies NativePickerProps<ProductMetadata>;

export function ProductPicker() {
  return <Picker<ProductMetadata> {...pickerProps} />;
}
