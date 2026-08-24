import { describe, expect, it } from "vitest";
import { OKLCH_WHEEL_MAX_CHROMA } from "../../src/editor";
import { adjustNativeWheelColor } from "../../src/react-native/interactions";

describe("React Native wheel adjustments", () => {
  it("wraps HSV hue and preserves value and alpha", () => {
    const next = adjustNativeWheelColor(
      { space: "hsv", h: 359, s: 0.4, v: 0.7, alpha: 0.5 },
      "hsv",
      "increase-hue",
      { hueStep: 2 }
    );

    expect(next).toEqual({
      space: "hsv",
      h: 1,
      s: 0.4,
      v: 0.7,
      alpha: 0.5
    });
  });

  it("clamps HSV radius at the center and edge", () => {
    expect(
      adjustNativeWheelColor({ space: "hsv", h: 40, s: 0.99, v: 1 }, "hsv", "increase-radius", {
        radiusStep: 0.1
      })
    ).toMatchObject({ s: 1 });
    expect(
      adjustNativeWheelColor({ space: "hsv", h: 40, s: 0.01, v: 1 }, "hsv", "decrease-radius", {
        radiusStep: 0.1
      })
    ).toMatchObject({ s: 0 });
  });

  it("uses the shared OKLCH wheel chroma limit", () => {
    const next = adjustNativeWheelColor(
      { space: "oklch", l: 0.65, c: 0.1, h: 120 },
      "oklch",
      "maximum-radius"
    );

    expect(next).toEqual({
      space: "oklch",
      l: 0.65,
      c: OKLCH_WHEEL_MAX_CHROMA,
      h: 120
    });
  });

  it("adjusts the model-specific third channel without changing spatial channels", () => {
    expect(
      adjustNativeWheelColor({ space: "hsv", h: 182, s: 1, v: 0 }, "hsv", "increase-channel", {
        channelStep: 0.1
      })
    ).toEqual({ space: "hsv", h: 182, s: 1, v: 0.1 });
    expect(
      adjustNativeWheelColor(
        { space: "oklch", l: 0.7, c: 0.18, h: 275, alpha: 0.8 },
        "oklch",
        "minimum-channel"
      )
    ).toEqual({ space: "oklch", l: 0, c: 0.18, h: 275, alpha: 0.8 });
  });

  it("validates adjustment steps", () => {
    expect(() =>
      adjustNativeWheelColor({ space: "hsv", h: 0, s: 1, v: 1 }, "hsv", "increase-hue", {
        hueStep: 0
      })
    ).toThrow("hueStep must be a positive finite number");
  });
});
