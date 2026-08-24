import { convertColor } from "../core";
import type { ColorValue } from "../core";
import { getWheelChannelValue, OKLCH_WHEEL_MAX_CHROMA, setWheelChannelValue } from "../editor";
import type { WheelModel } from "../editor";

export type NativeWheelAdjustment =
  | "decrease-hue"
  | "increase-hue"
  | "decrease-radius"
  | "increase-radius"
  | "minimum-radius"
  | "maximum-radius"
  | "decrease-channel"
  | "increase-channel"
  | "minimum-channel"
  | "maximum-channel";

export interface NativeWheelAdjustmentOptions {
  readonly hueStep?: number;
  /** Normalized saturation/chroma-radius step in the 0..1 range. */
  readonly radiusStep?: number;
  /** Normalized HSV value / OKLCH lightness step in the 0..1 range. */
  readonly channelStep?: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function positiveStep(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
  return resolved;
}

/**
 * Pure native adjustment used by screen-reader actions and hardware-keyboard
 * reachable buttons. It preserves the model-specific lightness/value and alpha.
 */
export function adjustNativeWheelColor(
  color: ColorValue,
  model: WheelModel,
  adjustment: NativeWheelAdjustment,
  options: NativeWheelAdjustmentOptions = {}
): ColorValue {
  const hueStep = positiveStep(options.hueStep, 1, "hueStep");
  const radiusStep = positiveStep(options.radiusStep, 0.02, "radiusStep");
  const channelStep = positiveStep(options.channelStep, 0.02, "channelStep");
  const modelColor = convertColor(color, model);

  if (
    adjustment === "decrease-channel" ||
    adjustment === "increase-channel" ||
    adjustment === "minimum-channel" ||
    adjustment === "maximum-channel"
  ) {
    const current = getWheelChannelValue(modelColor, { model });
    const channel =
      adjustment === "minimum-channel"
        ? 0
        : adjustment === "maximum-channel"
          ? 1
          : clamp(current + (adjustment === "increase-channel" ? channelStep : -channelStep), 0, 1);
    return setWheelChannelValue(modelColor, channel, { model });
  }

  if (adjustment === "decrease-hue" || adjustment === "increase-hue") {
    const direction = adjustment === "increase-hue" ? 1 : -1;
    return { ...modelColor, h: normalizeHue(modelColor.h + direction * hueStep) };
  }

  if (modelColor.space === "oklch") {
    const normalized = modelColor.c / OKLCH_WHEEL_MAX_CHROMA;
    const radius =
      adjustment === "minimum-radius"
        ? 0
        : adjustment === "maximum-radius"
          ? 1
          : clamp(normalized + (adjustment === "increase-radius" ? radiusStep : -radiusStep), 0, 1);
    return { ...modelColor, c: radius * OKLCH_WHEEL_MAX_CHROMA };
  }

  const radius =
    adjustment === "minimum-radius"
      ? 0
      : adjustment === "maximum-radius"
        ? 1
        : clamp(modelColor.s + (adjustment === "increase-radius" ? radiusStep : -radiusStep), 0, 1);
  return { ...modelColor, s: radius };
}
