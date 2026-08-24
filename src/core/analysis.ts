import { resolveColor, srgbChannelToLinear } from "./convert";
import { assertPalette } from "./document";
import { isInGamut, mapToGamut, perceptualDistance } from "./gamut";
import { clamp } from "./math";
import type {
  ColorInput,
  Palette,
  PaletteAnalysis,
  PaletteAnalyzer,
  PaletteDiagnostic,
  SrgbColor
} from "./types";

export const BUILT_IN_ANALYZER_ID = "analyzer.palette-basics";
export const BUILT_IN_ANALYZER_VERSION = "1.0.0";

export interface ContrastPair {
  readonly foregroundId: string;
  readonly backgroundId: string;
  readonly usage?: "normal-text" | "large-text" | "non-text";
  readonly level?: "AA" | "AAA";
  readonly minimumRatio?: number;
  /** Opaque page color used when the declared background has transparency. */
  readonly canvas?: ColorInput;
}

export interface AnalysisOptions {
  readonly outputGamut?: "srgb" | "display-p3";
  readonly includeGamut?: boolean;
  readonly includePerceptualDistance?: boolean;
  readonly minimumPerceptualDistance?: number;
  /** Contrast is evaluated only for explicitly declared usage pairs. */
  readonly contrastPairs?: readonly ContrastPair[];
}

function validateAnalysisOptions(options: AnalysisOptions): void {
  if (
    options.outputGamut !== undefined &&
    options.outputGamut !== "srgb" &&
    options.outputGamut !== "display-p3"
  ) {
    throw new TypeError("outputGamut must be srgb or display-p3");
  }
  for (const [name, value] of [
    ["includeGamut", options.includeGamut],
    ["includePerceptualDistance", options.includePerceptualDistance]
  ] as const) {
    if (value !== undefined && typeof value !== "boolean") {
      throw new TypeError(`${name} must be a boolean`);
    }
  }
  if (options.contrastPairs !== undefined && !Array.isArray(options.contrastPairs)) {
    throw new TypeError("contrastPairs must be an array");
  }
  const pairs: readonly unknown[] = options.contrastPairs ?? [];
  for (const candidate of pairs) {
    if (typeof candidate !== "object" || candidate === null) {
      throw new TypeError("Each contrast pair requires foregroundId and backgroundId");
    }
    const pair = candidate as Partial<ContrastPair>;
    if (
      typeof pair.foregroundId !== "string" ||
      pair.foregroundId.length === 0 ||
      typeof pair.backgroundId !== "string" ||
      pair.backgroundId.length === 0
    ) {
      throw new TypeError("Each contrast pair requires foregroundId and backgroundId");
    }
    if (
      pair.usage !== undefined &&
      !["normal-text", "large-text", "non-text"].includes(pair.usage)
    ) {
      throw new TypeError("Contrast pair usage is invalid");
    }
    if (pair.level !== undefined && pair.level !== "AA" && pair.level !== "AAA") {
      throw new TypeError("Contrast pair level must be AA or AAA");
    }
    if (pair.usage === "non-text" && pair.level === "AAA") {
      throw new TypeError("WCAG defines non-text contrast at level AA, not AAA");
    }
    if (pair.minimumRatio !== undefined) requiredContrast(pair as ContrastPair);
    if (pair.canvas !== undefined) {
      const canvas = resolveColor(pair.canvas);
      if ((canvas.alpha ?? 1) !== 1) throw new TypeError("canvas must be opaque");
    }
  }
}

function mappedSrgb(input: ColorInput): SrgbColor {
  return mapToGamut(input, "srgb").color;
}

function compositeSrgb(foreground: SrgbColor, background: SrgbColor): SrgbColor {
  const foregroundAlpha = foreground.alpha ?? 1;
  const backgroundAlpha = background.alpha ?? 1;
  const outputAlpha = foregroundAlpha + backgroundAlpha * (1 - foregroundAlpha);
  if (outputAlpha <= 0) return { space: "srgb", r: 0, g: 0, b: 0, alpha: 0 };
  const channel = (front: number, back: number): number => {
    return (front * foregroundAlpha + back * backgroundAlpha * (1 - foregroundAlpha)) / outputAlpha;
  };
  return {
    space: "srgb",
    r: clamp(channel(foreground.r, background.r)),
    g: clamp(channel(foreground.g, background.g)),
    b: clamp(channel(foreground.b, background.b)),
    alpha: outputAlpha
  };
}

/** Alpha-composite one color over another in the browser's default sRGB space. */
export function compositeColors(foreground: ColorInput, background: ColorInput): SrgbColor {
  return compositeSrgb(mappedSrgb(foreground), mappedSrgb(background));
}

export function relativeLuminance(input: ColorInput): number {
  const color = mappedSrgb(input);
  return (
    0.2126 * srgbChannelToLinear(color.r) +
    0.7152 * srgbChannelToLinear(color.g) +
    0.0722 * srgbChannelToLinear(color.b)
  );
}

/** WCAG contrast after alpha compositing both colors over an opaque canvas. */
export function contrastRatio(
  foreground: ColorInput,
  background: ColorInput,
  canvas: ColorInput = "#ffffff"
): number {
  const canvasColor = resolveColor(canvas);
  if ((canvasColor.alpha ?? 1) !== 1) throw new TypeError("canvas must be opaque");
  const opaqueCanvas = mappedSrgb(canvasColor);
  const normalizedCanvas: SrgbColor = {
    ...opaqueCanvas,
    alpha: 1
  };
  const compositedBackground = compositeSrgb(mappedSrgb(background), normalizedCanvas);
  const compositedForeground = compositeSrgb(mappedSrgb(foreground), compositedBackground);
  const foregroundLuminance = relativeLuminance(compositedForeground);
  const backgroundLuminance = relativeLuminance(compositedBackground);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function requiredContrast(pair: ContrastPair): number {
  if (pair.minimumRatio !== undefined) {
    if (!Number.isFinite(pair.minimumRatio) || pair.minimumRatio < 1 || pair.minimumRatio > 21) {
      throw new RangeError("minimumRatio must be between 1 and 21");
    }
    return pair.minimumRatio;
  }
  if (pair.usage === "non-text") return 3;
  if (pair.level === "AAA") return pair.usage === "large-text" ? 4.5 : 7;
  return pair.usage === "large-text" ? 3 : 4.5;
}

function gamutDiagnostics(
  palette: Palette<object>,
  gamut: "srgb" | "display-p3"
): readonly PaletteDiagnostic[] {
  return palette.colors.flatMap((entry) => {
    if (isInGamut(entry.color, gamut)) return [];
    const mapped = mapToGamut(entry.color, gamut);
    return [
      {
        ruleId: "gamut.outside",
        severity: "warning" as const,
        messageKey: "palette.gamut.outside",
        messageParameters: { gamut },
        colorIds: [entry.id],
        data: { gamut, deltaE: mapped.deltaE, method: mapped.method }
      }
    ];
  });
}

function distanceDiagnostics(
  palette: Palette<object>,
  minimumDistance: number
): readonly PaletteDiagnostic[] {
  if (!Number.isFinite(minimumDistance) || minimumDistance < 0 || minimumDistance > 1) {
    throw new RangeError("minimumPerceptualDistance must be between 0 and 1");
  }
  const diagnostics: PaletteDiagnostic[] = [];
  for (let first = 0; first < palette.colors.length; first += 1) {
    for (let second = first + 1; second < palette.colors.length; second += 1) {
      const firstColor = palette.colors[first];
      const secondColor = palette.colors[second];
      if (!firstColor || !secondColor) continue;
      const value = perceptualDistance(firstColor.color, secondColor.color);
      if (value < minimumDistance) {
        diagnostics.push({
          ruleId: "difference.insufficient",
          severity: "warning",
          messageKey: "palette.difference.insufficient",
          messageParameters: { distance: value, minimumDistance },
          colorIds: [firstColor.id, secondColor.id],
          data: { distance: value, minimumDistance, method: "oklab-euclidean" }
        });
      }
    }
  }
  return diagnostics;
}

function contrastDiagnostics(
  palette: Palette<object>,
  pairs: readonly ContrastPair[]
): readonly PaletteDiagnostic[] {
  const colors = new Map(palette.colors.map((entry) => [entry.id, entry.color]));
  return pairs.flatMap<PaletteDiagnostic>((pair) => {
    const foreground = colors.get(pair.foregroundId);
    const background = colors.get(pair.backgroundId);
    if (!foreground || !background) {
      return [
        {
          ruleId: "contrast.missing-color",
          severity: "error" as const,
          messageKey: "palette.contrast.missingColor",
          messageParameters: {
            foregroundId: pair.foregroundId,
            backgroundId: pair.backgroundId
          },
          colorIds: [pair.foregroundId, pair.backgroundId]
        }
      ];
    }
    const minimum = requiredContrast(pair);
    const ratio = contrastRatio(foreground, background, pair.canvas);
    if (ratio + 1e-9 >= minimum) return [];
    return [
      {
        ruleId: "contrast.insufficient",
        severity: "warning" as const,
        messageKey: "palette.contrast.insufficient",
        messageParameters: { ratio, minimum, usage: pair.usage ?? "normal-text" },
        colorIds: [pair.foregroundId, pair.backgroundId],
        data: { ratio, minimum, level: pair.level ?? "AA", usage: pair.usage ?? "normal-text" }
      }
    ];
  });
}

export function analyzePalette(
  palette: Palette<object>,
  options: AnalysisOptions = {}
): PaletteAnalysis {
  assertPalette(palette);
  validateAnalysisOptions(options);
  const diagnostics: PaletteDiagnostic[] = [];
  if (options.includeGamut ?? true) {
    diagnostics.push(...gamutDiagnostics(palette, options.outputGamut ?? "srgb"));
  }
  if (options.includePerceptualDistance ?? true) {
    diagnostics.push(...distanceDiagnostics(palette, options.minimumPerceptualDistance ?? 0.02));
  }
  if (options.contrastPairs) {
    diagnostics.push(...contrastDiagnostics(palette, options.contrastPairs));
  }
  return { diagnostics };
}

export const builtInPaletteAnalyzers: readonly PaletteAnalyzer[] = [
  {
    id: BUILT_IN_ANALYZER_ID,
    version: BUILT_IN_ANALYZER_VERSION,
    analyze(palette, options) {
      // Engine options are validated as finite JSON before reaching the strategy.
      return analyzePalette(palette, options);
    }
  }
];

/** Validate one structured color without changing it; useful to strategy authors. */
export function assertAnalyzableColor(input: ColorInput): void {
  resolveColor(input);
}
