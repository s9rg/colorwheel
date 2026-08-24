export const EPSILON = 1e-7;

export function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeHue(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

export function roundTo(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function approximatelyEqual(first: number, second: number, tolerance = EPSILON): boolean {
  return Math.abs(first - second) <= tolerance;
}

export function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

export function copyAlpha(alpha: number | undefined): { alpha?: number } {
  return alpha === undefined ? {} : { alpha };
}
