import {
  colorToXyz,
  convertColor,
  oklabToOklch,
  oklchToOklab,
  resolveColor,
  xyzToOklab
} from "./convert";
import { clamp, copyAlpha } from "./math";
import type {
  ColorByGamut,
  ColorInput,
  DisplayP3Color,
  GamutResult,
  OklabColor,
  OklchColor,
  OutputGamut,
  SrgbColor
} from "./types";

const GAMUT_EPSILON = 1e-7;
const SEARCH_ITERATIONS = 28;

function convertToGamut<Gamut extends OutputGamut>(
  input: ColorInput,
  gamut: Gamut
): ColorByGamut<Gamut> {
  return convertColor(input, gamut) as ColorByGamut<Gamut>;
}

function channelsInRange(color: SrgbColor | DisplayP3Color): boolean {
  return [color.r, color.g, color.b].every(
    (channel) => channel >= -GAMUT_EPSILON && channel <= 1 + GAMUT_EPSILON
  );
}

function clipped<Gamut extends OutputGamut>(color: ColorByGamut<Gamut>): ColorByGamut<Gamut> {
  return {
    ...color,
    r: clamp(color.r),
    g: clamp(color.g),
    b: clamp(color.b)
  };
}

function distance(first: OklabColor, second: OklabColor): number {
  return Math.sqrt(
    (first.l - second.l) ** 2 + (first.a - second.a) ** 2 + (first.b - second.b) ** 2
  );
}

/** Return whether a color can be represented in the requested RGB gamut. */
export function isInGamut(input: ColorInput, gamut: OutputGamut = "srgb"): boolean {
  const output = convertToGamut(input, gamut);
  return channelsInRange(output);
}

/**
 * Map to an RGB gamut by reducing OKLCH chroma while preserving lightness and
 * hue. A neutral fallback is channel-clipped only for numerical edge cases.
 */
export function mapToGamut<Gamut extends OutputGamut>(
  input: ColorInput,
  gamut: Gamut
): GamutResult<ColorByGamut<Gamut>> {
  const source = resolveColor(input);
  const raw = convertToGamut(source, gamut);
  const originalLab = xyzToOklab(colorToXyz(source));

  if (channelsInRange(raw)) {
    return {
      color: clipped(raw),
      gamut,
      mapped: false,
      deltaE: 0,
      method: "none"
    };
  }

  const originalLch = oklabToOklch(originalLab);
  let lower = 0;
  let upper = originalLch.c;
  let best: ColorByGamut<Gamut> | undefined;

  for (let iteration = 0; iteration < SEARCH_ITERATIONS; iteration += 1) {
    const chroma = (lower + upper) / 2;
    const candidate: OklchColor = {
      space: "oklch",
      l: clamp(originalLch.l),
      c: chroma,
      h: originalLch.h,
      ...copyAlpha(source.alpha)
    };
    const converted = convertToGamut(candidate, gamut);
    if (channelsInRange(converted)) {
      lower = chroma;
      best = converted;
    } else {
      upper = chroma;
    }
  }

  const method = best === undefined ? "channel-clipping" : "oklch-chroma-reduction";
  const mapped = clipped(best ?? raw);
  const mappedLab = xyzToOklab(colorToXyz(mapped));
  return {
    color: mapped,
    gamut,
    mapped: true,
    deltaE: distance(originalLab, mappedLab),
    method
  };
}

export function perceptualDistance(first: ColorInput, second: ColorInput): number {
  const firstLab = oklchToOklab(convertColor(first, "oklch"));
  const secondLab = oklchToOklab(convertColor(second, "oklch"));
  return distance(firstLab, secondLab);
}
