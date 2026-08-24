import { convertColor, resolveColor } from "./convert";
import { mapToGamut } from "./gamut";
import { clamp, roundTo } from "./math";
import type { ColorInput, ColorValue } from "./types";

export interface FormatOptions {
  /** `auto` uses the input space; sRGB defaults to hex. */
  readonly format?: "auto" | "hex" | "rgb" | "hsl" | "oklch" | "display-p3";
  readonly precision?: number;
  readonly alpha?: "auto" | "always" | "never";
  /** Explicitly maps perceptual colors before RGB/hex formatting. */
  readonly mapToSrgb?: boolean;
}

function compactNumber(value: number, precision: number): string {
  const rounded = roundTo(value, precision);
  if (Object.is(rounded, -0)) return "0";
  return String(rounded);
}

function alphaSuffix(
  alpha: number | undefined,
  mode: NonNullable<FormatOptions["alpha"]>,
  precision: number
): string {
  if (mode === "never" || (mode === "auto" && (alpha === undefined || alpha === 1))) {
    return "";
  }
  return ` / ${compactNumber(alpha ?? 1, precision)}`;
}

function byteHex(value: number): string {
  return Math.round(clamp(value) * 255)
    .toString(16)
    .padStart(2, "0");
}

/** Format a color using deterministic, compact CSS syntax. */
export function formatColor(input: ColorInput, options: FormatOptions = {}): string {
  const requestedPrecision = options.precision ?? 3;
  if (
    typeof requestedPrecision !== "number" ||
    !Number.isInteger(requestedPrecision) ||
    requestedPrecision < 0 ||
    requestedPrecision > 8
  ) {
    throw new RangeError("precision must be an integer between 0 and 8");
  }
  if (
    options.format !== undefined &&
    !["auto", "hex", "rgb", "hsl", "oklch", "display-p3"].includes(options.format)
  ) {
    throw new TypeError("format is not supported");
  }
  if (
    options.alpha !== undefined &&
    options.alpha !== "auto" &&
    options.alpha !== "always" &&
    options.alpha !== "never"
  ) {
    throw new TypeError("alpha must be auto, always, or never");
  }
  if (options.mapToSrgb !== undefined && typeof options.mapToSrgb !== "boolean") {
    throw new TypeError("mapToSrgb must be a boolean");
  }
  const precision = requestedPrecision;
  const alphaMode = options.alpha ?? "auto";
  const parsed: ColorValue = resolveColor(input);
  const format =
    options.format === undefined || options.format === "auto"
      ? parsed.space === "srgb"
        ? "hex"
        : parsed.space === "hsv"
          ? "hsl"
          : parsed.space
      : options.format;

  if (format === "hex") {
    const srgb =
      options.mapToSrgb === false ? convertColor(parsed, "srgb") : mapToGamut(parsed, "srgb").color;
    const base = `#${byteHex(srgb.r)}${byteHex(srgb.g)}${byteHex(srgb.b)}`;
    const includeAlpha =
      alphaMode === "always" ||
      (alphaMode === "auto" && srgb.alpha !== undefined && srgb.alpha !== 1);
    return includeAlpha ? `${base}${byteHex(srgb.alpha ?? 1)}` : base;
  }

  if (format === "rgb") {
    const srgb =
      options.mapToSrgb === false ? convertColor(parsed, "srgb") : mapToGamut(parsed, "srgb").color;
    return `rgb(${compactNumber(clamp(srgb.r) * 255, precision)} ${compactNumber(clamp(srgb.g) * 255, precision)} ${compactNumber(clamp(srgb.b) * 255, precision)}${alphaSuffix(srgb.alpha, alphaMode, precision)})`;
  }

  if (format === "hsl") {
    const hsl = convertColor(parsed, "hsl");
    return `hsl(${compactNumber(hsl.h, precision)} ${compactNumber(hsl.s * 100, precision)}% ${compactNumber(hsl.l * 100, precision)}%${alphaSuffix(hsl.alpha, alphaMode, precision)})`;
  }

  if (format === "oklch") {
    const oklch = convertColor(parsed, "oklch");
    return `oklch(${compactNumber(oklch.l * 100, precision)}% ${compactNumber(oklch.c, precision)} ${compactNumber(oklch.h, precision)}${alphaSuffix(oklch.alpha, alphaMode, precision)})`;
  }

  const p3 = mapToGamut(parsed, "display-p3").color;
  return `color(display-p3 ${compactNumber(p3.r, precision)} ${compactNumber(p3.g, precision)} ${compactNumber(p3.b, precision)}${alphaSuffix(p3.alpha, alphaMode, precision)})`;
}
