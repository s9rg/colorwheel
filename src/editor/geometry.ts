import { convertColor } from "../core";
import type { ColorValue, HsvColor, OklchColor } from "../core";
import type { WheelModel } from "./types";

export interface WheelPoint {
  readonly x: number;
  readonly y: number;
}

export interface ClientPoint {
  readonly x: number;
  readonly y: number;
}

export interface WheelRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface WheelGeometryOptions {
  readonly model?: WheelModel;
  /** Hue zero in screen-space degrees. -90 places red at twelve o'clock. */
  readonly startAngle?: number;
  readonly clockwise?: boolean;
  /** Radial extent used by an OKLCH wheel. */
  readonly maxChroma?: number;
}

export interface WheelChannelOptions {
  readonly model?: WheelModel;
}

export type WheelRingSide = "left" | "right";

export interface WheelRingPointOptions {
  readonly side?: WheelRingSide;
}

const FULL_TURN = 360;
const DEFAULT_START_ANGLE = -90;
/** Maximum OKLCH chroma represented by the built-in wheel adapters. */
export const OKLCH_WHEEL_MAX_CHROMA = 0.5;

function assertFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number`);
  return value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeHue(hue: number): number {
  return ((hue % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

function resolveWheelModel(model: WheelModel | undefined): WheelModel {
  if (model === undefined || model === "hsv") return "hsv";
  if (model === "oklch") return "oklch";
  throw new TypeError(`Unsupported wheel model ${String(model)}`);
}

function resolveWheelRingSide(side: WheelRingSide | undefined): WheelRingSide {
  if (side === undefined || side === "right") return "right";
  if (side === "left") return "left";
  throw new TypeError(`Unsupported wheel ring side ${String(side)}`);
}

function resolvedOptions(options: WheelGeometryOptions): Required<WheelGeometryOptions> {
  const maxChroma = options.maxChroma ?? OKLCH_WHEEL_MAX_CHROMA;
  if (!Number.isFinite(maxChroma) || maxChroma <= 0 || maxChroma > 0.5) {
    throw new RangeError("maxChroma must be greater than 0 and no more than 0.5");
  }
  return {
    model: resolveWheelModel(options.model),
    startAngle: assertFinite(options.startAngle ?? DEFAULT_START_ANGLE, "startAngle"),
    clockwise: options.clockwise ?? true,
    maxChroma
  };
}

/** Read the color channel that is preserved by the wheel's two-dimensional surface. */
export function getWheelChannelValue(color: ColorValue, options: WheelChannelOptions = {}): number {
  if (resolveWheelModel(options.model) === "hsv") {
    return clamp(assertFinite(convertColor(color, "hsv").v, "hsv.v"), 0, 1);
  }
  return clamp(assertFinite(convertColor(color, "oklch").l, "oklch.l"), 0, 1);
}

/** Replace the wheel's non-spatial channel while preserving its other model channels and alpha. */
export function setWheelChannelValue(
  template: ColorValue,
  value: number,
  options: WheelChannelOptions = {}
): HsvColor | OklchColor {
  const channel = clamp(assertFinite(value, "value"), 0, 1);
  if (resolveWheelModel(options.model) === "hsv") {
    const hsv = convertColor(template, "hsv");
    return {
      space: "hsv",
      h: hsv.h,
      s: hsv.s,
      v: channel,
      ...(hsv.alpha === undefined ? {} : { alpha: hsv.alpha })
    };
  }
  const oklch = convertColor(template, "oklch");
  return {
    space: "oklch",
    l: channel,
    c: oklch.c,
    h: oklch.h,
    ...(oklch.alpha === undefined ? {} : { alpha: oklch.alpha })
  };
}

/**
 * Place a normalized channel value on a semicircle, with zero at the bottom,
 * one half at the side, and one at the top. The right side is the default.
 */
export function wheelChannelValueToRingPoint(
  value: number,
  options: WheelRingPointOptions = {}
): WheelPoint {
  const channel = clamp(assertFinite(value, "value"), 0, 1);
  const angle = Math.PI / 2 - Math.PI * channel;
  const side = resolveWheelRingSide(options.side) === "right" ? 1 : -1;
  return {
    x: 0.5 + side * Math.cos(angle) * 0.5,
    y: 0.5 + Math.sin(angle) * 0.5
  };
}

/**
 * Project a pointer direction onto either semicircle and read its normalized
 * arc position. The center has no direction and resolves to the midpoint.
 */
export function ringPointToWheelChannelValue(point: WheelPoint): number {
  const xFromCenter = assertFinite(point.x, "point.x") - 0.5;
  const yFromCenter = assertFinite(point.y, "point.y") - 0.5;
  const distance = Math.hypot(xFromCenter, yFromCenter);
  if (distance < 1e-12) return 0.5;
  const theta = Math.atan2(yFromCenter, Math.abs(xFromCenter));
  return clamp(0.5 - theta / Math.PI, 0, 1);
}

export function constrainWheelPoint(point: WheelPoint): WheelPoint {
  const x = assertFinite(point.x, "point.x");
  const y = assertFinite(point.y, "point.y");
  const dx = x - 0.5;
  const dy = y - 0.5;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0.5) return { x, y };
  const scale = 0.5 / distance;
  return { x: 0.5 + dx * scale, y: 0.5 + dy * scale };
}

export function hueRadiusToWheelPoint(
  hue: number,
  radius: number,
  options: WheelGeometryOptions = {}
): WheelPoint {
  const resolved = resolvedOptions(options);
  const direction = resolved.clockwise ? 1 : -1;
  const angle = ((resolved.startAngle + direction * normalizeHue(hue)) * Math.PI) / 180;
  const normalizedRadius = clamp(assertFinite(radius, "radius"), 0, 1) * 0.5;
  return {
    x: 0.5 + Math.cos(angle) * normalizedRadius,
    y: 0.5 + Math.sin(angle) * normalizedRadius
  };
}

export function wheelPointToHueRadius(
  point: WheelPoint,
  options: WheelGeometryOptions = {},
  fallbackHue = 0
): { readonly hue: number; readonly radius: number } {
  const resolved = resolvedOptions(options);
  const constrained = constrainWheelPoint(point);
  const dx = constrained.x - 0.5;
  const dy = constrained.y - 0.5;
  const radius = clamp(Math.hypot(dx, dy) * 2, 0, 1);
  if (radius < 1e-12) return { hue: normalizeHue(fallbackHue), radius: 0 };
  const screenAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const direction = resolved.clockwise ? 1 : -1;
  return {
    hue: normalizeHue(direction * (screenAngle - resolved.startAngle)),
    radius
  };
}

export function colorToWheelPoint(
  color: ColorValue,
  options: WheelGeometryOptions = {}
): WheelPoint {
  const resolved = resolvedOptions(options);
  if (resolved.model === "hsv") {
    const hsv = convertColor(color, "hsv");
    return hueRadiusToWheelPoint(hsv.h, hsv.s, resolved);
  }
  const oklch = convertColor(color, "oklch");
  return hueRadiusToWheelPoint(oklch.h, oklch.c / resolved.maxChroma, resolved);
}

export function wheelPointToColor(
  point: WheelPoint,
  template: ColorValue,
  options: WheelGeometryOptions = {}
): HsvColor | OklchColor {
  const resolved = resolvedOptions(options);
  if (resolved.model === "hsv") {
    const hsv = convertColor(template, "hsv");
    const polar = wheelPointToHueRadius(point, resolved, hsv.h);
    return {
      space: "hsv",
      h: polar.hue,
      s: polar.radius,
      v: hsv.v,
      ...(hsv.alpha === undefined ? {} : { alpha: hsv.alpha })
    };
  }
  const oklch = convertColor(template, "oklch");
  const polar = wheelPointToHueRadius(point, resolved, oklch.h);
  return {
    space: "oklch",
    l: oklch.l,
    c: polar.radius * resolved.maxChroma,
    h: polar.hue,
    ...(oklch.alpha === undefined ? {} : { alpha: oklch.alpha })
  };
}

export function clientPointToWheelPoint(client: ClientPoint, rect: WheelRect): WheelPoint {
  const width = assertFinite(rect.width, "rect.width");
  const height = assertFinite(rect.height, "rect.height");
  if (width <= 0 || height <= 0) throw new RangeError("Wheel bounds must have positive dimensions");
  const size = Math.min(width, height);
  const left = assertFinite(rect.left, "rect.left") + (width - size) / 2;
  const top = assertFinite(rect.top, "rect.top") + (height - size) / 2;
  return constrainWheelPoint({
    x: (assertFinite(client.x, "client.x") - left) / size,
    y: (assertFinite(client.y, "client.y") - top) / size
  });
}

export function wheelPointToClientPoint(point: WheelPoint, rect: WheelRect): ClientPoint {
  const width = assertFinite(rect.width, "rect.width");
  const height = assertFinite(rect.height, "rect.height");
  if (width <= 0 || height <= 0) throw new RangeError("Wheel bounds must have positive dimensions");
  const size = Math.min(width, height);
  const left = assertFinite(rect.left, "rect.left") + (width - size) / 2;
  const top = assertFinite(rect.top, "rect.top") + (height - size) / 2;
  const constrained = constrainWheelPoint(point);
  return { x: left + constrained.x * size, y: top + constrained.y * size };
}
