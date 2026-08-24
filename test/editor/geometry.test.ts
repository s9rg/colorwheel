import { describe, expect, it } from "vitest";
import {
  clientPointToWheelPoint,
  colorToWheelPoint,
  constrainWheelPoint,
  getWheelChannelValue,
  hueRadiusToWheelPoint,
  ringPointToWheelChannelValue,
  setWheelChannelValue,
  wheelChannelValueToRingPoint,
  wheelPointToClientPoint,
  wheelPointToColor,
  wheelPointToHueRadius
} from "../../src/editor";

describe("wheel geometry", () => {
  it.each([
    [0, 0.5, 0],
    [90, 1, 0.5],
    [180, 0.5, 1],
    [270, 0, 0.5]
  ])("places hue %s at the expected cardinal point", (hue, x, y) => {
    const point = hueRadiusToWheelPoint(hue, 1);
    expect(point.x).toBeCloseTo(x, 12);
    expect(point.y).toBeCloseTo(y, 12);
  });

  it("round-trips HSV hue and saturation while preserving value and alpha", () => {
    const color = { space: "hsv" as const, h: 37, s: 0.63, v: 0.72, alpha: 0.4 };
    const point = colorToWheelPoint(color);
    const result = wheelPointToColor(point, color);

    expect(result.space).toBe("hsv");
    expect(result.h).toBeCloseTo(37, 10);
    if (result.space !== "hsv") throw new Error("Expected HSV result");
    expect(result.s).toBeCloseTo(0.63, 10);
    expect(result.v).toBe(0.72);
    expect(result.alpha).toBe(0.4);
  });

  it("preserves the template hue at the achromatic center", () => {
    const template = { space: "hsv" as const, h: 222, s: 1, v: 0.5 };
    expect(wheelPointToColor({ x: 0.5, y: 0.5 }, template)).toMatchObject({
      space: "hsv",
      h: 222,
      s: 0,
      v: 0.5
    });
  });

  it("constrains points to the circular boundary", () => {
    expect(constrainWheelPoint({ x: 2, y: 0.5 })).toEqual({ x: 1, y: 0.5 });
    const diagonal = constrainWheelPoint({ x: 1, y: 1 });
    expect(Math.hypot(diagonal.x - 0.5, diagonal.y - 0.5)).toBeCloseTo(0.5, 12);
  });

  it("maps client coordinates through the centered square of a rectangular box", () => {
    const rect = { left: 10, top: 20, width: 200, height: 100 };
    const client = wheelPointToClientPoint({ x: 1, y: 0.5 }, rect);
    expect(client).toEqual({ x: 160, y: 70 });
    expect(clientPointToWheelPoint(client, rect)).toEqual({ x: 1, y: 0.5 });
  });

  it("supports configurable orientation and OKLCH chroma radius", () => {
    const counterClockwise = hueRadiusToWheelPoint(90, 1, { clockwise: false });
    expect(counterClockwise.x).toBeCloseTo(0, 12);
    expect(counterClockwise.y).toBeCloseTo(0.5, 12);

    const color = { space: "oklch" as const, l: 0.7, c: 0.2, h: 90 };
    const point = colorToWheelPoint(color, { model: "oklch", maxChroma: 0.4 });
    expect(wheelPointToHueRadius(point).radius).toBeCloseTo(0.5, 12);
    expect(wheelPointToColor(point, color, { model: "oklch", maxChroma: 0.4 })).toMatchObject({
      space: "oklch",
      l: 0.7,
      c: 0.2,
      h: 90
    });
  });

  it("gets and sets the model-specific non-spatial channel", () => {
    const hsv = { space: "hsv" as const, h: 37, s: 0.63, v: 0.72, alpha: 0.4 };
    expect(getWheelChannelValue(hsv)).toBe(0.72);
    expect(setWheelChannelValue(hsv, 0.25)).toEqual({
      space: "hsv",
      h: 37,
      s: 0.63,
      v: 0.25,
      alpha: 0.4
    });

    const oklch = { space: "oklch" as const, l: 0.7, c: 0.2, h: 90, alpha: 0.6 };
    expect(getWheelChannelValue(oklch, { model: "oklch" })).toBe(0.7);
    expect(setWheelChannelValue(oklch, 0.25, { model: "oklch" })).toEqual({
      space: "oklch",
      l: 0.25,
      c: 0.2,
      h: 90,
      alpha: 0.6
    });
  });

  it("clamps channel setters and ring points to the normalized range", () => {
    const hsv = { space: "hsv" as const, h: 10, s: 0.4, v: 0.5 };
    expect(setWheelChannelValue(hsv, -1)).toMatchObject({ v: 0 });
    expect(setWheelChannelValue(hsv, 2)).toMatchObject({ v: 1 });
    expect(wheelChannelValueToRingPoint(-1)).toEqual({ x: 0.5, y: 1 });
    expect(wheelChannelValueToRingPoint(2)).toEqual({ x: 0.5, y: 0 });
  });

  it.each([
    [0, 0.5, 1],
    [0.25, 0.5 + Math.SQRT2 / 4, 0.5 + Math.SQRT2 / 4],
    [0.5, 1, 0.5],
    [0.75, 0.5 + Math.SQRT2 / 4, 0.5 - Math.SQRT2 / 4],
    [1, 0.5, 0]
  ])("places channel value %s on the right semicircle", (value, x, y) => {
    const point = wheelChannelValueToRingPoint(value);
    expect(point.x).toBeCloseTo(x, 12);
    expect(point.y).toBeCloseTo(y, 12);
    expect(ringPointToWheelChannelValue(point)).toBeCloseTo(value, 12);
  });

  it("mirrors channel values onto the left semicircle", () => {
    for (const value of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const right = wheelChannelValueToRingPoint(value);
      const left = wheelChannelValueToRingPoint(value, { side: "left" });
      expect(left.x).toBeCloseTo(1 - right.x, 12);
      expect(left.y).toBeCloseTo(right.y, 12);
      expect(ringPointToWheelChannelValue(left)).toBeCloseTo(value, 12);
    }
  });

  it("uses a uniform arc so equal channel steps travel equal distances", () => {
    const distanceForStep = (value: number) => {
      const from = wheelChannelValueToRingPoint(value);
      const to = wheelChannelValueToRingPoint(value + 0.01);
      return Math.hypot(to.x - from.x, to.y - from.y);
    };
    const expected = Math.sin(Math.PI * 0.01 * 0.5);

    expect(distanceForStep(0)).toBeCloseTo(expected, 12);
    expect(distanceForStep(0.49)).toBeCloseTo(expected, 12);
    expect(distanceForStep(0.99)).toBeCloseTo(expected, 12);
  });

  it("projects pointer direction to the ring before reading its channel", () => {
    expect(ringPointToWheelChannelValue({ x: 0.5, y: 0.5 })).toBe(0.5);
    expect(ringPointToWheelChannelValue({ x: 0.75, y: 0.25 })).toBeCloseTo(0.75, 12);
    expect(ringPointToWheelChannelValue({ x: -1, y: 2 })).toBeCloseTo(0.25, 12);
  });

  it("rejects invalid geometry rather than emitting NaN", () => {
    expect(() => constrainWheelPoint({ x: Number.NaN, y: 0 })).toThrow(TypeError);
    expect(() =>
      clientPointToWheelPoint({ x: 0, y: 0 }, { left: 0, top: 0, width: 0, height: 10 })
    ).toThrow(RangeError);
    expect(() => colorToWheelPoint({ space: "hsv", h: 0, s: 1, v: 1 }, { maxChroma: 0 })).toThrow(
      RangeError
    );
    expect(() => setWheelChannelValue({ space: "hsv", h: 0, s: 1, v: 1 }, Number.NaN)).toThrow(
      TypeError
    );
    expect(() => wheelChannelValueToRingPoint(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => wheelChannelValueToRingPoint(0.5, { side: "center" as never })).toThrow(TypeError);
    expect(() => ringPointToWheelChannelValue({ x: Number.NaN, y: 0.5 })).toThrow(TypeError);
    expect(() =>
      getWheelChannelValue({ space: "hsv", h: 0, s: 1, v: 1 }, { model: "unsupported" as never })
    ).toThrow(TypeError);
  });
});
