import { convertColor } from "./convert";
import {
  PaletteDocumentValidationError,
  assertPalette,
  assertPaletteDocumentContentSize,
  parsePaletteDocument,
  serializePaletteDocument
} from "./document";
import { formatColor } from "./format";
import { mapToGamut } from "./gamut";
import type {
  ExportArtifact,
  JsonObject,
  Palette,
  PaletteExporter,
  PaletteImporter
} from "./types";

export const BUILT_IN_EXPORTER_IDS = {
  json: "exporter.palette-json",
  css: "exporter.css-custom-properties",
  tokens: "exporter.design-tokens"
} as const;

export const BUILT_IN_IMPORTER_IDS = {
  json: "importer.palette-json"
} as const;

export const BUILT_IN_SERIALIZER_VERSION = "1.0.0";

export interface JsonExportOptions {
  readonly filename?: string;
  readonly indentation?: number;
}

export interface CssExportOptions {
  readonly filename?: string;
  readonly selector?: string;
  readonly prefix?: string;
  readonly colorFormat?: "hex" | "oklch";
}

export interface DesignTokenExportOptions {
  readonly filename?: string;
  readonly groupName?: string;
  readonly colorFormat?: "hex" | "oklch";
  readonly indentation?: number;
}

function optionString(options: JsonObject, name: string, fallback: string): string {
  const value = options[name] ?? fallback;
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function optionIndentation(options: JsonObject, fallback = 2): number {
  const value = options.indentation ?? fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 8) {
    throw new RangeError("indentation must be an integer between 0 and 8");
  }
  return value;
}

function nonEmptyString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function safeFilename(value: unknown): string {
  const hasUnsafeCharacter =
    typeof value === "string" &&
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return '<>:"/\\|?*'.includes(character) || code <= 0x1f || code === 0x7f;
    });
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    hasUnsafeCharacter ||
    value === "." ||
    value === ".."
  ) {
    throw new TypeError("filename must be a plain file name without path separators");
  }
  return value;
}

function safeSelector(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || /[{};\r\n]/.test(value)) {
    throw new TypeError("selector cannot contain CSS blocks or declarations");
  }
  return value;
}

function slug(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z\d_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  const result = normalized || fallback;
  return /^\d/.test(result) ? `color-${result}` : result;
}

function uniqueNames(palette: Palette<object>): readonly string[] {
  const used = new Set<string>();
  return palette.colors.map((entry, index) => {
    const base = slug(entry.role ?? entry.name ?? entry.id, `color-${index + 1}`);
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    return candidate;
  });
}

function colorFormat(value: unknown): "hex" | "oklch" {
  if (value === undefined || value === "hex") return "hex";
  if (value === "oklch") return "oklch";
  throw new TypeError("colorFormat must be hex or oklch");
}

export function exportPaletteJson(
  palette: Palette<object>,
  options: JsonExportOptions = {}
): ExportArtifact {
  assertPalette(palette);
  const indentation = options.indentation ?? 2;
  if (!Number.isInteger(indentation) || indentation < 0 || indentation > 8) {
    throw new RangeError("indentation must be an integer between 0 and 8");
  }
  return {
    files: [
      {
        name: safeFilename(options.filename ?? "palette.json"),
        mediaType: "application/json",
        content: serializePaletteDocument(palette, indentation)
      }
    ]
  };
}

export function exportPaletteCss(
  palette: Palette<object>,
  options: CssExportOptions = {}
): ExportArtifact {
  assertPalette(palette);
  const selector = safeSelector(options.selector ?? ":root");
  const prefix = slug(nonEmptyString(options.prefix ?? "palette", "prefix"), "palette");
  const format = colorFormat(options.colorFormat);
  const names = uniqueNames(palette);
  const declarations = palette.colors.map(
    (entry, index) => `  --${prefix}-${names[index]}: ${formatColor(entry.color, { format })};`
  );
  return {
    files: [
      {
        name: safeFilename(options.filename ?? "palette.css"),
        mediaType: "text/css",
        content: `${selector} {\n${declarations.join("\n")}\n}\n`
      }
    ]
  };
}

export function exportPaletteTokens(
  palette: Palette<object>,
  options: DesignTokenExportOptions = {}
): ExportArtifact {
  assertPalette(palette);
  const indentation = options.indentation ?? 2;
  if (!Number.isInteger(indentation) || indentation < 0 || indentation > 8) {
    throw new RangeError("indentation must be an integer between 0 and 8");
  }
  const format = colorFormat(options.colorFormat);
  const names = uniqueNames(palette);
  const tokenEntries = palette.colors.map((entry, index) => {
    const description = [entry.name, entry.role && `Role: ${entry.role}`]
      .filter(Boolean)
      .join(" — ");
    const converted =
      format === "hex" ? mapToGamut(entry.color, "srgb").color : convertColor(entry.color, "oklch");
    const components =
      converted.space === "srgb"
        ? [converted.r, converted.g, converted.b]
        : [converted.l, converted.c, converted.h];
    const value = {
      colorSpace: converted.space,
      components,
      ...(converted.alpha === undefined || converted.alpha === 1 ? {} : { alpha: converted.alpha }),
      hex: formatColor(entry.color, { format: "hex", alpha: "never" })
    };
    return [
      names[index] ?? `color-${index + 1}`,
      {
        $value: value,
        ...(description.length === 0 ? {} : { $description: description })
      }
    ] as const;
  });
  const tokens: Record<string, unknown> = Object.fromEntries<unknown>([
    ["$type", "color"],
    ...tokenEntries
  ]);
  const group = slug(nonEmptyString(options.groupName ?? "color", "groupName"), "color");
  return {
    files: [
      {
        name: safeFilename(options.filename ?? "palette.tokens.json"),
        mediaType: "application/design-tokens+json",
        content: `${JSON.stringify({ [group]: tokens }, null, indentation)}\n`
      }
    ]
  };
}

function decodeUtf8(bytes: Uint8Array): string {
  const result: string[] = [];
  const continuation = (value: number | undefined): value is number =>
    value !== undefined && value >= 0x80 && value <= 0xbf;
  const invalid = (): never => {
    throw new PaletteDocumentValidationError([
      { code: "document.encoding", path: [], message: "Document must use valid UTF-8" }
    ]);
  };
  for (let index = 0; index < bytes.length; index += 1) {
    const first = bytes[index];
    if (first === undefined) invalid();
    if (first < 0x80) {
      result.push(String.fromCodePoint(first));
    } else if (first >= 0xc2 && first <= 0xdf) {
      const second = bytes[index + 1];
      if (!continuation(second)) invalid();
      result.push(String.fromCodePoint(((first & 0x1f) << 6) | (second & 0x3f)));
      index += 1;
    } else if (first >= 0xe0 && first <= 0xef) {
      const second = bytes[index + 1];
      const third = bytes[index + 2];
      if (
        !continuation(second) ||
        !continuation(third) ||
        (first === 0xe0 && second < 0xa0) ||
        (first === 0xed && second > 0x9f)
      ) {
        invalid();
      }
      result.push(
        String.fromCodePoint(((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f))
      );
      index += 2;
    } else if (first >= 0xf0 && first <= 0xf4) {
      const second = bytes[index + 1];
      const third = bytes[index + 2];
      const fourth = bytes[index + 3];
      if (
        !continuation(second) ||
        !continuation(third) ||
        !continuation(fourth) ||
        (first === 0xf0 && second < 0x90) ||
        (first === 0xf4 && second > 0x8f)
      ) {
        invalid();
      }
      result.push(
        String.fromCodePoint(
          ((first & 0x07) << 18) | ((second & 0x3f) << 12) | ((third & 0x3f) << 6) | (fourth & 0x3f)
        )
      );
      index += 3;
    } else invalid();
  }
  return result.join("");
}

export const builtInPaletteExporters: readonly PaletteExporter[] = [
  {
    id: BUILT_IN_EXPORTER_IDS.json,
    version: BUILT_IN_SERIALIZER_VERSION,
    export(palette, options) {
      return exportPaletteJson(palette, {
        filename: optionString(options, "filename", "palette.json"),
        indentation: optionIndentation(options)
      });
    }
  },
  {
    id: BUILT_IN_EXPORTER_IDS.css,
    version: BUILT_IN_SERIALIZER_VERSION,
    export(palette, options) {
      return exportPaletteCss(palette, {
        filename: optionString(options, "filename", "palette.css"),
        selector: optionString(options, "selector", ":root"),
        prefix: optionString(options, "prefix", "palette"),
        colorFormat: colorFormat(options.colorFormat)
      });
    }
  },
  {
    id: BUILT_IN_EXPORTER_IDS.tokens,
    version: BUILT_IN_SERIALIZER_VERSION,
    export(palette, options) {
      return exportPaletteTokens(palette, {
        filename: optionString(options, "filename", "palette.tokens.json"),
        groupName: optionString(options, "groupName", "color"),
        colorFormat: colorFormat(options.colorFormat),
        indentation: optionIndentation(options)
      });
    }
  }
];

export const builtInPaletteImporters: readonly PaletteImporter[] = [
  {
    id: BUILT_IN_IMPORTER_IDS.json,
    version: BUILT_IN_SERIALIZER_VERSION,
    import(content) {
      assertPaletteDocumentContentSize(content);
      return parsePaletteDocument(typeof content === "string" ? content : decodeUtf8(content));
    }
  }
];
