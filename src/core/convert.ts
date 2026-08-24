import { assertFiniteNumber, clamp, copyAlpha, normalizeHue } from "./math";
import { parseColor } from "./parse";
import type {
  ColorBySpace,
  ColorInput,
  ColorSpace,
  ColorValue,
  DisplayP3Color,
  HslColor,
  HsvColor,
  LinearSrgbColor,
  OklabColor,
  OklchColor,
  SrgbColor,
  XyzD65Color
} from "./types";

function assertUnit(value: unknown, label: string): number {
  const number = assertFiniteNumber(value, label);
  if (number < 0 || number > 1) {
    throw new RangeError(`${label} must be between 0 and 1`);
  }
  return number;
}

function assertChroma(value: unknown): number {
  const number = assertFiniteNumber(value, "oklch.c");
  if (number < 0 || number > 0.5) {
    throw new RangeError("oklch.c must be between 0 and 0.5");
  }
  return number;
}

function normalizedAlpha(alpha: unknown): number | undefined {
  return alpha === undefined ? undefined : assertUnit(alpha, "alpha");
}

/** Validate and normalize a structured public color value. */
export function normalizeColor(color: ColorValue): ColorValue {
  if (typeof color !== "object" || color === null) {
    throw new TypeError("color must be an object");
  }
  const parsedAlpha = normalizedAlpha(color.alpha);
  const alphaPart = copyAlpha(parsedAlpha);
  switch (color.space) {
    case "srgb":
      return {
        space: "srgb",
        // Conversion results use extended RGB channels for out-of-gamut colors.
        // Palette-document validation separately enforces stored channels in 0..1.
        r: assertFiniteNumber(color.r, "srgb.r"),
        g: assertFiniteNumber(color.g, "srgb.g"),
        b: assertFiniteNumber(color.b, "srgb.b"),
        ...alphaPart
      };
    case "display-p3":
      return {
        space: "display-p3",
        r: assertFiniteNumber(color.r, "display-p3.r"),
        g: assertFiniteNumber(color.g, "display-p3.g"),
        b: assertFiniteNumber(color.b, "display-p3.b"),
        ...alphaPart
      };
    case "hsl":
      return {
        space: "hsl",
        h: normalizeHue(assertFiniteNumber(color.h, "hsl.h")),
        s: assertUnit(color.s, "hsl.s"),
        l: assertUnit(color.l, "hsl.l"),
        ...alphaPart
      };
    case "hsv":
      return {
        space: "hsv",
        h: normalizeHue(assertFiniteNumber(color.h, "hsv.h")),
        s: assertUnit(color.s, "hsv.s"),
        v: assertUnit(color.v, "hsv.v"),
        ...alphaPart
      };
    case "oklch":
      return {
        space: "oklch",
        l: assertUnit(color.l, "oklch.l"),
        c: assertChroma(color.c),
        h: normalizeHue(assertFiniteNumber(color.h, "oklch.h")),
        ...alphaPart
      };
    default: {
      const exhaustive: never = color;
      throw new TypeError(
        `Unsupported color space ${String((exhaustive as { space?: unknown }).space)}`
      );
    }
  }
}

export function resolveColor(input: ColorInput): ColorValue {
  return typeof input === "string" ? parseColor(input) : normalizeColor(input);
}

export function srgbChannelToLinear(channel: number): number {
  const sign = channel < 0 ? -1 : 1;
  const absolute = Math.abs(channel);
  return absolute <= 0.04045 ? channel / 12.92 : sign * ((absolute + 0.055) / 1.055) ** 2.4;
}

export function linearChannelToSrgb(channel: number): number {
  const sign = channel < 0 ? -1 : 1;
  const absolute = Math.abs(channel);
  return absolute <= 0.0031308 ? channel * 12.92 : sign * (1.055 * absolute ** (1 / 2.4) - 0.055);
}

export function srgbToLinear(color: SrgbColor): LinearSrgbColor {
  return {
    r: srgbChannelToLinear(color.r),
    g: srgbChannelToLinear(color.g),
    b: srgbChannelToLinear(color.b),
    ...copyAlpha(color.alpha)
  };
}

export function linearToSrgb(color: LinearSrgbColor): SrgbColor {
  return {
    space: "srgb",
    r: linearChannelToSrgb(color.r),
    g: linearChannelToSrgb(color.g),
    b: linearChannelToSrgb(color.b),
    ...copyAlpha(color.alpha)
  };
}

export function linearSrgbToXyz(color: LinearSrgbColor): XyzD65Color {
  return {
    x: 0.41239079926595934 * color.r + 0.357584339383878 * color.g + 0.1804807884018343 * color.b,
    y: 0.21263900587151027 * color.r + 0.715168678767756 * color.g + 0.07219231536073371 * color.b,
    z: 0.01933081871559182 * color.r + 0.11919477979462598 * color.g + 0.9505321522496607 * color.b,
    ...copyAlpha(color.alpha)
  };
}

export function xyzToLinearSrgb(color: XyzD65Color): LinearSrgbColor {
  return {
    r: 3.2409699419045226 * color.x - 1.537383177570094 * color.y - 0.4986107602930034 * color.z,
    g: -0.9692436362808796 * color.x + 1.8759675015077202 * color.y + 0.04155505740717559 * color.z,
    b: 0.05563007969699366 * color.x - 0.20397695888897652 * color.y + 1.0569715142428786 * color.z,
    ...copyAlpha(color.alpha)
  };
}

export function displayP3ToXyz(color: DisplayP3Color): XyzD65Color {
  const r = srgbChannelToLinear(color.r);
  const g = srgbChannelToLinear(color.g);
  const b = srgbChannelToLinear(color.b);
  return {
    x: 0.4865709486482162 * r + 0.26566769316909306 * g + 0.1982172852343625 * b,
    y: 0.2289745640697488 * r + 0.6917385218365064 * g + 0.079286914093745 * b,
    z: 0 * r + 0.04511338185890264 * g + 1.043944368900976 * b,
    ...copyAlpha(color.alpha)
  };
}

export function xyzToDisplayP3(color: XyzD65Color): DisplayP3Color {
  const r =
    2.493496911941425 * color.x - 0.9313836179191239 * color.y - 0.40271078445071684 * color.z;
  const g =
    -0.8294889695615747 * color.x + 1.7626640603183463 * color.y + 0.023624685841943577 * color.z;
  const b =
    0.03584583024378447 * color.x - 0.07617238926804182 * color.y + 0.9568845240076872 * color.z;
  return {
    space: "display-p3",
    r: linearChannelToSrgb(r),
    g: linearChannelToSrgb(g),
    b: linearChannelToSrgb(b),
    ...copyAlpha(color.alpha)
  };
}

export function xyzToOklab(color: XyzD65Color): OklabColor {
  const l =
    0.819022437996703 * color.x + 0.3619062600528904 * color.y - 0.1288737815209879 * color.z;
  const m =
    0.0329836539323885 * color.x + 0.9292868615863434 * color.y + 0.0361446663506424 * color.z;
  const s =
    0.0481771893596242 * color.x + 0.2642395317527308 * color.y + 0.6335478284694309 * color.z;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  return {
    l: 0.210454268309314 * lRoot + 0.7936177747023054 * mRoot - 0.0040720430116193 * sRoot,
    a: 1.9779985324311684 * lRoot - 2.42859224204858 * mRoot + 0.450593709617411 * sRoot,
    b: 0.0259040424655478 * lRoot + 0.7827717124575296 * mRoot - 0.8086757549230774 * sRoot,
    ...copyAlpha(color.alpha)
  };
}

export function oklabToXyz(color: OklabColor): XyzD65Color {
  const lRoot = color.l + 0.3963377773761749 * color.a + 0.2158037573099136 * color.b;
  const mRoot = color.l - 0.1055613458156586 * color.a - 0.0638541728258133 * color.b;
  const sRoot = color.l - 0.0894841775298119 * color.a - 1.2914855480194092 * color.b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return {
    x: 1.2268798758459243 * l - 0.5578149944602171 * m + 0.2813910456659647 * s,
    y: -0.0405757452148008 * l + 1.112286803280317 * m - 0.0717110580655164 * s,
    z: -0.0763729366746601 * l - 0.4214933324022432 * m + 1.5869240198367816 * s,
    ...copyAlpha(color.alpha)
  };
}

export function oklabToOklch(color: OklabColor): OklchColor {
  const c = Math.sqrt(color.a ** 2 + color.b ** 2);
  // Hue is powerless at (near) zero chroma; zero is our stable serialized value.
  const h = c < 1e-12 ? 0 : normalizeHue((Math.atan2(color.b, color.a) * 180) / Math.PI);
  return {
    space: "oklch",
    l: color.l,
    c,
    h,
    ...copyAlpha(color.alpha)
  };
}

export function oklchToOklab(color: OklchColor): OklabColor {
  const radians = (color.h * Math.PI) / 180;
  return {
    l: color.l,
    a: color.c * Math.cos(radians),
    b: color.c * Math.sin(radians),
    ...copyAlpha(color.alpha)
  };
}

export function hslToSrgb(color: HslColor): SrgbColor {
  const chroma = (1 - Math.abs(2 * color.l - 1)) * color.s;
  const segment = normalizeHue(color.h) / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (segment < 1) [r, g] = [chroma, secondary];
  else if (segment < 2) [r, g] = [secondary, chroma];
  else if (segment < 3) [g, b] = [chroma, secondary];
  else if (segment < 4) [g, b] = [secondary, chroma];
  else if (segment < 5) [r, b] = [secondary, chroma];
  else [r, b] = [chroma, secondary];
  const match = color.l - chroma / 2;
  return {
    space: "srgb",
    r: r + match,
    g: g + match,
    b: b + match,
    ...copyAlpha(color.alpha)
  };
}

export function hsvToSrgb(color: HsvColor): SrgbColor {
  const chroma = color.v * color.s;
  const segment = normalizeHue(color.h) / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (segment < 1) [r, g] = [chroma, secondary];
  else if (segment < 2) [r, g] = [secondary, chroma];
  else if (segment < 3) [g, b] = [chroma, secondary];
  else if (segment < 4) [g, b] = [secondary, chroma];
  else if (segment < 5) [r, b] = [secondary, chroma];
  else [r, b] = [chroma, secondary];
  const match = color.v - chroma;
  return {
    space: "srgb",
    r: r + match,
    g: g + match,
    b: b + match,
    ...copyAlpha(color.alpha)
  };
}

export function srgbToHsl(color: SrgbColor): HslColor {
  const maximum = Math.max(color.r, color.g, color.b);
  const minimum = Math.min(color.r, color.g, color.b);
  const delta = maximum - minimum;
  const l = (maximum + minimum) / 2;
  let h = 0;
  if (delta !== 0) {
    if (maximum === color.r) h = 60 * (((color.g - color.b) / delta) % 6);
    else if (maximum === color.g) h = 60 * ((color.b - color.r) / delta + 2);
    else h = 60 * ((color.r - color.g) / delta + 4);
  }
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return {
    space: "hsl",
    h: normalizeHue(h),
    s,
    l,
    ...copyAlpha(color.alpha)
  };
}

export function srgbToHsv(color: SrgbColor): HsvColor {
  const maximum = Math.max(color.r, color.g, color.b);
  const minimum = Math.min(color.r, color.g, color.b);
  const delta = maximum - minimum;
  let h = 0;
  if (delta !== 0) {
    if (maximum === color.r) h = 60 * (((color.g - color.b) / delta) % 6);
    else if (maximum === color.g) h = 60 * ((color.b - color.r) / delta + 2);
    else h = 60 * ((color.r - color.g) / delta + 4);
  }
  return {
    space: "hsv",
    h: normalizeHue(h),
    s: maximum === 0 ? 0 : delta / maximum,
    v: maximum,
    ...copyAlpha(color.alpha)
  };
}

function boundedSrgb(color: SrgbColor): SrgbColor {
  return {
    ...color,
    r: clamp(color.r),
    g: clamp(color.g),
    b: clamp(color.b)
  };
}

export function colorToXyz(input: ColorInput): XyzD65Color {
  const color = resolveColor(input);
  switch (color.space) {
    case "srgb":
      return linearSrgbToXyz(srgbToLinear(color));
    case "display-p3":
      return displayP3ToXyz(color);
    case "hsl":
      return linearSrgbToXyz(srgbToLinear(hslToSrgb(color)));
    case "hsv":
      return linearSrgbToXyz(srgbToLinear(hsvToSrgb(color)));
    case "oklch":
      return oklabToXyz(oklchToOklab(color));
  }
}

export function convertColor<Space extends ColorSpace>(
  input: ColorInput,
  space: Space
): ColorBySpace<Space> {
  const color = resolveColor(input);
  if (color.space === space) return color as ColorBySpace<Space>;
  if (space === "srgb" && color.space === "hsl") {
    return hslToSrgb(color) as ColorBySpace<Space>;
  }
  if (space === "srgb" && color.space === "hsv") {
    return hsvToSrgb(color) as ColorBySpace<Space>;
  }
  if (space === "hsl" && color.space === "srgb") {
    return srgbToHsl(boundedSrgb(color)) as ColorBySpace<Space>;
  }
  if (space === "hsv" && color.space === "srgb") {
    return srgbToHsv(boundedSrgb(color)) as ColorBySpace<Space>;
  }
  const xyz = colorToXyz(color);
  let result: ColorValue;
  switch (space) {
    case "srgb":
      result = linearToSrgb(xyzToLinearSrgb(xyz));
      break;
    case "display-p3":
      result = xyzToDisplayP3(xyz);
      break;
    case "hsl":
      // HSL and HSV are sRGB-derived spaces. Wide-gamut inputs must first be
      // represented in the bounded sRGB cube so their public 0..1 channels stay
      // valid and can be passed back into every core API.
      result = srgbToHsl(boundedSrgb(linearToSrgb(xyzToLinearSrgb(xyz))));
      break;
    case "hsv":
      result = srgbToHsv(boundedSrgb(linearToSrgb(xyzToLinearSrgb(xyz))));
      break;
    case "oklch":
      result = oklabToOklch(xyzToOklab(xyz));
      break;
    default: {
      const exhaustive: never = space;
      throw new TypeError(`Unsupported target color space ${String(exhaustive)}`);
    }
  }
  return result as ColorBySpace<Space>;
}
