import { normalizeHue } from "./math";
import type { ColorValue, HslColor, OklchColor, SrgbColor } from "./types";

const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

export class ColorParseError extends SyntaxError {
  readonly input: string;

  constructor(input: string, reason: string) {
    super(`Cannot parse color ${JSON.stringify(input)}: ${reason}`);
    this.name = "ColorParseError";
    this.input = input;
  }
}

function numeric(token: string, input: string, label: string): number {
  if (!NUMBER_PATTERN.test(token)) {
    throw new ColorParseError(input, `${label} is not a number`);
  }
  const value = Number(token);
  if (!Number.isFinite(value)) {
    throw new ColorParseError(input, `${label} must be finite`);
  }
  return value;
}

function bounded(
  value: number,
  minimum: number,
  maximum: number,
  input: string,
  label: string
): number {
  if (value < minimum || value > maximum) {
    throw new ColorParseError(input, `${label} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function percent(token: string, input: string, label: string): number {
  if (!token.endsWith("%")) {
    throw new ColorParseError(input, `${label} must be a percentage`);
  }
  return bounded(numeric(token.slice(0, -1), input, label), 0, 100, input, label) / 100;
}

function alpha(token: string | undefined, input: string): number | undefined {
  if (token === undefined) return undefined;
  const value = token.endsWith("%")
    ? percent(token, input, "alpha")
    : bounded(numeric(token, input, "alpha"), 0, 1, input, "alpha");
  return value;
}

function angle(token: string, input: string): number {
  const lower = token.toLowerCase();
  let value: number;
  if (lower.endsWith("deg")) {
    value = numeric(lower.slice(0, -3), input, "hue");
  } else if (lower.endsWith("grad")) {
    value = numeric(lower.slice(0, -4), input, "hue") * 0.9;
  } else if (lower.endsWith("rad")) {
    value = (numeric(lower.slice(0, -3), input, "hue") * 180) / Math.PI;
  } else if (lower.endsWith("turn")) {
    value = numeric(lower.slice(0, -4), input, "hue") * 360;
  } else {
    value = numeric(lower, input, "hue");
  }
  return normalizeHue(value);
}

interface FunctionChannels {
  readonly channels: readonly string[];
  readonly alpha?: string;
}

function functionChannels(body: string, input: string): FunctionChannels {
  const slashParts = body.split("/");
  if (slashParts.length > 2) {
    throw new ColorParseError(input, "contains more than one alpha separator");
  }

  const main = slashParts[0]?.trim() ?? "";
  const slashAlpha = slashParts[1]?.trim();
  let legacyAlpha: string | undefined;
  let channels: string[];

  if (main.includes(",")) {
    if (slashAlpha !== undefined) {
      throw new ColorParseError(input, "cannot mix legacy comma syntax with a slash alpha");
    }
    channels = main.split(",").map((part) => part.trim());
    if (channels.length === 4 && slashAlpha === undefined) {
      legacyAlpha = channels[3];
      channels = channels.slice(0, 3);
    }
  } else {
    channels = main.split(/\s+/).filter(Boolean);
  }

  const alphaToken = slashAlpha ?? legacyAlpha;
  if (channels.some((channel) => channel.length === 0) || alphaToken === "") {
    throw new ColorParseError(input, "contains an empty channel");
  }

  return alphaToken === undefined ? { channels } : { channels, alpha: alphaToken };
}

function parseHex(input: string): SrgbColor | undefined {
  const match = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(input);
  if (!match) return undefined;
  const source = match[1];
  const expanded =
    source.length <= 4 ? [...source].map((character) => character.repeat(2)).join("") : source;
  const r = Number.parseInt(expanded.slice(0, 2), 16) / 255;
  const g = Number.parseInt(expanded.slice(2, 4), 16) / 255;
  const b = Number.parseInt(expanded.slice(4, 6), 16) / 255;
  const parsedAlpha =
    expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : undefined;
  return parsedAlpha === undefined
    ? { space: "srgb", r, g, b }
    : { space: "srgb", r, g, b, alpha: parsedAlpha };
}

function parseRgb(body: string, input: string): SrgbColor {
  const parts = functionChannels(body, input);
  if (parts.channels.length !== 3) {
    throw new ColorParseError(input, "rgb() requires three color channels");
  }
  const usesPercent = parts.channels.map((channel) => channel.endsWith("%"));
  if (!usesPercent.every(Boolean) && usesPercent.some(Boolean)) {
    throw new ColorParseError(input, "rgb() cannot mix number and percentage channels");
  }
  const [r, g, b] = parts.channels.map((channel, index) =>
    usesPercent[0]
      ? percent(channel, input, `rgb channel ${index + 1}`)
      : bounded(
          numeric(channel, input, `rgb channel ${index + 1}`),
          0,
          255,
          input,
          `rgb channel ${index + 1}`
        ) / 255
  );
  const parsedAlpha = alpha(parts.alpha, input);
  return parsedAlpha === undefined
    ? { space: "srgb", r, g, b }
    : { space: "srgb", r, g, b, alpha: parsedAlpha };
}

function parseHsl(body: string, input: string): HslColor {
  const parts = functionChannels(body, input);
  if (parts.channels.length !== 3) {
    throw new ColorParseError(input, "hsl() requires hue, saturation, and lightness");
  }
  const h = angle(parts.channels[0], input);
  const s = percent(parts.channels[1], input, "saturation");
  const l = percent(parts.channels[2], input, "lightness");
  const parsedAlpha = alpha(parts.alpha, input);
  return parsedAlpha === undefined
    ? { space: "hsl", h, s, l }
    : { space: "hsl", h, s, l, alpha: parsedAlpha };
}

function parseOklch(body: string, input: string): OklchColor {
  const parts = functionChannels(body, input);
  if (parts.channels.length !== 3) {
    throw new ColorParseError(input, "oklch() requires lightness, chroma, and hue");
  }
  const lightnessToken = parts.channels[0];
  const l = lightnessToken.endsWith("%")
    ? percent(lightnessToken, input, "lightness")
    : bounded(numeric(lightnessToken, input, "lightness"), 0, 1, input, "lightness");
  const chromaToken = parts.channels[1];
  // CSS Color 4 defines 100% chroma as 0.4 for OKLCH.
  const c = chromaToken.endsWith("%")
    ? percent(chromaToken, input, "chroma") * 0.4
    : bounded(numeric(chromaToken, input, "chroma"), 0, 0.5, input, "chroma");
  const h = angle(parts.channels[2], input);
  const parsedAlpha = alpha(parts.alpha, input);
  return parsedAlpha === undefined
    ? { space: "oklch", l, c, h }
    : { space: "oklch", l, c, h, alpha: parsedAlpha };
}

/**
 * Parse the deliberately small v1 CSS subset: hex, rgb(), hsl(), and oklch().
 * Out-of-range channels are rejected instead of being silently clamped.
 */
export function parseColor(input: string): ColorValue {
  const source = input.trim();
  const hex = parseHex(source);
  if (hex) return hex;

  const match = /^([a-z][a-z\d-]*)\((.*)\)$/i.exec(source);
  if (!match) {
    throw new ColorParseError(input, "expected hex, rgb(), hsl(), or oklch()");
  }
  const name = match[1].toLowerCase();
  const body = match[2];
  switch (name) {
    case "rgb":
    case "rgba":
      return parseRgb(body, input);
    case "hsl":
    case "hsla":
      return parseHsl(body, input);
    case "oklch":
      return parseOklch(body, input);
    default:
      throw new ColorParseError(input, `${name}() is not supported in v1`);
  }
}
