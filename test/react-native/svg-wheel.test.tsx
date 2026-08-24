// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const renderCounts = vi.hoisted(() => ({ polygons: 0 }));

vi.mock("react-native", async () => {
  const React = await import("react");
  const { createReactNativeMock } = await import("./native-test-runtime");
  return createReactNativeMock(React);
});

vi.mock("react-native-svg", async () => {
  const React = await import("react");
  function component(name: string, element = "g") {
    return function NativeSvgTestComponent({
      children,
      fill,
      id,
      points,
      stopColor,
      stopOpacity,
      testID
    }: Record<string, unknown>) {
      if (name === "Polygon") renderCounts.polygons += 1;
      return React.createElement(
        element,
        {
          "data-fill": fill,
          "data-id": id,
          "data-points": points,
          "data-stop-color": stopColor,
          "data-stop-opacity": stopOpacity,
          "data-svg": name,
          "data-testid": testID
        },
        children as React.ReactNode
      );
    };
  }
  return {
    Circle: component("Circle", "circle"),
    ClipPath: component("ClipPath", "clipPath"),
    Defs: component("Defs", "defs"),
    default: component("Svg", "svg"),
    G: component("G"),
    Polygon: component("Polygon", "polygon"),
    RadialGradient: component("RadialGradient", "radialGradient"),
    Stop: component("Stop", "stop")
  };
});

import { createDefaultNativePalette } from "../../src/react-native/defaults";
import { NativeSvgWheel } from "../../src/react-native/svg-wheel";

afterEach(cleanup);
beforeEach(() => {
  renderCounts.polygons = 0;
});

describe("NativeSvgWheel", () => {
  it("renders a segmented HSV wheel and its value overlay", () => {
    const { container, rerender } = render(
      <NativeSvgWheel
        model="hsv"
        activeColor={{ space: "hsv", h: 182, s: 1, v: 0.2 }}
        testID="native-graphic"
      />
    );
    expect(screen.getByTestId("native-graphic")).toBeTruthy();
    expect(container.querySelectorAll('[data-svg="Polygon"]')).toHaveLength(120);
    expect(container.querySelectorAll('[data-svg="Circle"]')).toHaveLength(3);
    expect(container.querySelector('[data-fill*="darkness"]')).toBeTruthy();
    expect(container.querySelector('[data-stop-opacity="0.6"]')).toBeTruthy();
    expect(renderCounts.polygons).toBe(120);

    rerender(
      <NativeSvgWheel
        model="hsv"
        activeColor={{ space: "hsv", h: 260, s: 0.4, v: 0.9 }}
        testID="native-graphic"
      />
    );
    expect(renderCounts.polygons).toBe(120);
  });

  it("renders OKLCH without an HSV darkness overlay", () => {
    const { container } = render(
      <NativeSvgWheel model="oklch" activeColor={{ space: "oklch", l: 0.7, c: 0.18, h: 275 }} />
    );
    expect(container.querySelectorAll('[data-svg="Polygon"]')).toHaveLength(120);
    expect(container.querySelectorAll('[data-svg="Circle"]')).toHaveLength(2);
    expect(container.querySelector('[data-fill*="darkness"]')).toBeNull();
  });
});

describe("createDefaultNativePalette", () => {
  it("creates a fresh linked complementary palette", () => {
    const first = createDefaultNativePalette();
    const second = createDefaultNativePalette();
    expect(first).not.toBe(second);
    expect(first.colors).toHaveLength(2);
    expect(first.recipe).toMatchObject({ type: "wheel" });
  });
});
