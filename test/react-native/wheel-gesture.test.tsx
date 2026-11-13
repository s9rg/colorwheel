// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { convertColor } from "../../src/core";
import type { Palette } from "../../src/core";
import { createPickerController, createPickerState } from "../../src/editor";

type ResponderConfig = Readonly<
  Record<
    | "onPanResponderGrant"
    | "onPanResponderMove"
    | "onPanResponderRelease"
    | "onPanResponderTerminate",
    (event: unknown) => void
  >
>;

type Measurement = (
  x: number,
  y: number,
  width: number,
  height: number,
  pageX: number,
  pageY: number
) => void;
const captured = vi.hoisted(() => ({
  config: null as ResponderConfig | null,
  measurements: [] as Measurement[],
  deferred: false,
  left: 40,
  top: 80
}));

vi.mock("react-native", async () => {
  const React = await import("react");
  const { createReactNativeMock } = await import("./native-test-runtime");
  return {
    ...createReactNativeMock(React, {
      measure(callback) {
        if (captured.deferred) captured.measurements.push(callback);
        else callback(0, 0, 200, 200, captured.left, captured.top);
      }
    }),
    PanResponder: {
      create(config: ResponderConfig) {
        captured.config = config;
        return { panHandlers: {} };
      }
    }
  };
});

vi.mock("../../src/react-native/svg-wheel", () => ({
  NativeSvgWheel: () => <div />
}));

import { NativePickerProvider } from "../../src/react-native/context";
import { NativeWheelBlock } from "../../src/react-native/wheel";

afterEach(() => {
  captured.config = null;
  captured.measurements = [];
  captured.deferred = false;
  captured.left = 40;
  captured.top = 80;
  cleanup();
});

function touch(x: number, y: number) {
  return {
    nativeEvent: {
      locationX: 14,
      locationY: 14,
      pageX: captured.left + x,
      pageY: captured.top + y
    }
  };
}

describe("Native wheel gesture lifecycle", () => {
  it("translates child-handle touches into surface coordinates and closes the transaction", () => {
    const palette: Palette = {
      colors: [{ id: "red", color: { space: "hsv", h: 0, s: 1, v: 0.8 } }],
      kind: "custom",
      provenance: { origin: "manual" }
    };
    const phases: string[] = [];
    const controller = createPickerController(createPickerState({ palette }), {
      onChange(_state, meta) {
        phases.push(meta.phase);
      }
    });
    render(
      <StrictMode>
        <NativePickerProvider controller={controller}>
          <NativeWheelBlock />
        </NativePickerProvider>
      </StrictMode>
    );
    const responder = captured.config;
    expect(responder).not.toBeNull();
    if (responder === null) throw new Error("Missing native pan responder");

    act(() => responder.onPanResponderGrant(touch(100, 0)));
    act(() => responder.onPanResponderMove(touch(200, 100)));
    captured.left = 100;
    captured.top = 240;
    act(() => responder.onPanResponderRelease(touch(100, 200)));

    const color = convertColor(controller.getPalette().colors[0]?.color ?? "#000", "hsv");
    expect(color.h).toBeCloseTo(180, 4);
    expect(color.s).toBeCloseTo(1, 4);
    expect(color.v).toBeCloseTo(0.8, 4);
    expect(phases[0]).toBe("start");
    expect(phases).toContain("update");
    expect(phases.at(-1)).toBe("commit");
  });

  it("waits for fresh measurement on a first tap and ignores obsolete callbacks", () => {
    captured.deferred = true;
    const palette: Palette = {
      colors: [{ id: "red", color: { space: "hsv", h: 0, s: 1, v: 0.8 } }],
      kind: "custom",
      provenance: { origin: "manual" }
    };
    const controller = createPickerController(createPickerState({ palette }));
    render(
      <NativePickerProvider controller={controller}>
        <NativeWheelBlock />
      </NativePickerProvider>
    );
    const responder = captured.config!;
    act(() => responder.onPanResponderGrant(touch(100, 0)));
    act(() => responder.onPanResponderRelease(touch(100, 0)));
    expect(captured.measurements).toHaveLength(1);
    act(() => captured.measurements[0](0, 0, 200, 200, 40, 80));
    expect(convertColor(controller.getPalette().colors[0].color, "hsv").h).toBeCloseTo(0, 4);

    act(() => responder.onPanResponderGrant(touch(100, 0)));
    act(() => responder.onPanResponderMove(touch(200, 100)));
    act(() => responder.onPanResponderTerminate({}));
    act(() => captured.measurements.at(-1)!(0, 0, 200, 200, 40, 80));
    expect(convertColor(controller.getPalette().colors[0].color, "hsv").h).toBeCloseTo(0, 4);

    act(() => responder.onPanResponderGrant(touch(100, 0)));
    act(() => responder.onPanResponderMove(touch(200, 100)));
    act(() => captured.measurements[1](0, 0, 200, 200, 900, 900));
    expect(convertColor(controller.getPalette().colors[0].color, "hsv").h).toBeCloseTo(0, 4);
    act(() => captured.measurements.at(-1)!(0, 0, 200, 200, 40, 80));
    expect(convertColor(controller.getPalette().colors[0].color, "hsv").h).toBeCloseTo(90, 4);
  });

  it("ignores deferred measurements after its surface unmounts", () => {
    captured.deferred = true;
    const palette: Palette = {
      colors: [{ id: "red", color: { space: "hsv", h: 0, s: 1, v: 0.8 } }],
      kind: "custom",
      provenance: { origin: "manual" }
    };
    const onChange = vi.fn();
    const controller = createPickerController(createPickerState({ palette }), { onChange });
    const view = render(
      <NativePickerProvider controller={controller}>
        <NativeWheelBlock />
      </NativePickerProvider>
    );
    const responder = captured.config!;
    act(() => responder.onPanResponderGrant(touch(100, 0)));
    act(() => responder.onPanResponderRelease(touch(200, 100)));
    view.unmount();
    act(() => captured.measurements[0](0, 0, 200, 200, 40, 80));
    expect(controller.getPalette()).toBe(palette);
    expect(onChange).not.toHaveBeenCalled();
  });
});
