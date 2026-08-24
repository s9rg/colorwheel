import { useState } from "react";
import type { Palette } from "@s9rg/colorwheel/core";
import {
  DiagnosticsBlock,
  ExportBlock,
  PaletteSwatch,
  Picker,
  WheelPointer,
  type DiagnosticsBlockProps,
  type ExportBlockProps,
  type ExportOption,
  type PaletteSwatchProps,
  type PickerProps,
  type WheelPointerProps
} from "@s9rg/colorwheel/react";
import "@s9rg/colorwheel/styles.css";

const initialPalette: Palette = {
  colors: [
    {
      id: "brand",
      color: { space: "oklch", l: 0.68, c: 0.16, h: 250 }
    }
  ],
  kind: "custom",
  provenance: { origin: "manual" }
};

const pickerProps = {
  defaultPalette: initialPalette,
  blocks: { diagnostics: false }
} satisfies PickerProps;

interface ProductMetadata {
  source: string;
}

const productPalette: Palette<ProductMetadata> = {
  ...initialPalette,
  metadata: { source: "design-system" },
  colors: initialPalette.colors.map((entry) => ({
    ...entry,
    metadata: { source: "design-system" }
  }))
};

const productExportOption: ExportOption<ProductMetadata> = {
  id: "product-metadata",
  label: "Product metadata",
  export(palette) {
    return {
      files: [
        {
          name: "product-metadata.txt",
          mediaType: "text/plain",
          content: palette.metadata?.source ?? "unknown"
        }
      ]
    };
  }
};

function ProductDiagnostics(props: DiagnosticsBlockProps<ProductMetadata>) {
  return <DiagnosticsBlock<ProductMetadata> {...props} />;
}

function ProductExport(props: ExportBlockProps<ProductMetadata>) {
  return <ExportBlock<ProductMetadata> {...props} />;
}

function ProductSwatch(props: PaletteSwatchProps<ProductMetadata>) {
  props.entry.metadata?.source.toUpperCase();
  return <PaletteSwatch {...props} />;
}

function ProductPointer(props: WheelPointerProps<ProductMetadata>) {
  props.entry.metadata?.source.toUpperCase();
  return <WheelPointer {...props} />;
}

const defaultMetadataProps = {
  defaultPalette: productPalette,
  blockProps: {
    palette: { swatch: ProductSwatch },
    wheel: { pointer: ProductPointer },
    diagnostics: {
      analyze(palette) {
        palette.metadata?.source.toUpperCase();
        palette.colors[0]?.metadata?.source.toUpperCase();
        return { diagnostics: [] };
      }
    },
    export: {
      options: [productExportOption],
      onExport(option, artifact) {
        option.export(productPalette);
        void artifact.files.length;
        return false;
      }
    }
  }
} satisfies PickerProps<ProductMetadata>;

const customMetadataProps = {
  ...defaultMetadataProps,
  blocks: {
    diagnostics: ProductDiagnostics,
    export: ProductExport
  }
} satisfies PickerProps<ProductMetadata>;

export function ConsumerPicker() {
  const [palette, setPalette] = useState(initialPalette);

  return (
    <Picker
      palette={palette}
      onPaletteChange={(nextPalette) => setPalette(nextPalette)}
      blocks={{ diagnostics: false }}
    />
  );
}

export function MetadataPicker() {
  return <Picker<ProductMetadata> {...defaultMetadataProps} />;
}

export function CustomMetadataBlocksPicker() {
  return <Picker<ProductMetadata> {...customMetadataProps} />;
}

void pickerProps;
