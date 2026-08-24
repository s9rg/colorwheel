import { useId } from "react";
import type { ReactNode } from "react";
import { exportPaletteCss, exportPaletteJson, exportPaletteTokens } from "../core";
import type { ExportArtifact, JsonObject, Palette } from "../core";
import type { PickerState } from "../editor";
import { usePickerSelector } from "./context";

const selectPalette = <Metadata extends object>(state: PickerState<Metadata>): Palette<Metadata> =>
  state.palette;

export type BuiltInExportFormat = "json" | "css" | "tokens";

export interface ExportOption<Metadata extends object = JsonObject> {
  readonly id: string;
  readonly label: ReactNode;
  readonly export: (palette: Palette<Metadata>) => ExportArtifact;
}

const builtInExportOptions: Readonly<Record<BuiltInExportFormat, ExportOption<object>>> = {
  json: {
    id: "json",
    label: "JSON",
    export: (palette) => exportPaletteJson(palette)
  },
  css: {
    id: "css",
    label: "CSS variables",
    export: (palette) => exportPaletteCss(palette)
  },
  tokens: {
    id: "tokens",
    label: "Design tokens",
    export: (palette) => exportPaletteTokens(palette)
  }
};

function downloadArtifact(artifact: ExportArtifact): void {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return;
  }
  for (const file of artifact.files) {
    let content: BlobPart;
    if (typeof file.content === "string") {
      content = file.content;
    } else {
      const bytes = new ArrayBuffer(file.content.byteLength);
      new Uint8Array(bytes).set(file.content);
      content = bytes;
    }
    const blob = new Blob([content], { type: file.mediaType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}

export interface ExportBlockProps<Metadata extends object = JsonObject> {
  readonly title?: ReactNode;
  readonly formats?: readonly BuiltInExportFormat[];
  readonly options?: readonly ExportOption<Metadata>[];
  readonly onExport?: (option: ExportOption<Metadata>, artifact: ExportArtifact) => void | false;
}

export function ExportBlock<Metadata extends object = JsonObject>({
  title = "Export",
  formats = ["json", "css", "tokens"],
  options,
  onExport
}: ExportBlockProps<Metadata>) {
  const titleId = useId();
  const palette = usePickerSelector<Palette<Metadata>, Metadata>(selectPalette);
  const resolvedOptions: readonly ExportOption<Metadata>[] =
    options ?? formats.map((format) => builtInExportOptions[format]);

  function run(option: ExportOption<Metadata>): void {
    const artifact = option.export(palette);
    if (onExport?.(option, artifact) === false) return;
    downloadArtifact(artifact);
  }

  return (
    <section data-part="export" aria-labelledby={titleId}>
      <header data-part="block-header">
        <div>
          <h2 id={titleId} data-part="block-title">
            {title}
          </h2>
          <p data-part="block-description">
            Download portable palette data or implementation-ready tokens.
          </p>
        </div>
      </header>
      <div data-part="export-actions">
        {resolvedOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            data-part="secondary-button"
            onClick={() => run(option)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}
