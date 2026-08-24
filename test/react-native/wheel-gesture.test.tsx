// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { convertColor } from "../../src/core";
import type { Palette } from "../../src/core";
import { createPickerController, createPickerState } from "../../src/editor";

type ResponderConfig = Readonly<
  Record<
    "onPanResponderGrant" | "onPanResponderMove" | "onPanResponderRelease",
    (event: unknown) => void
  >
>;

const captured = vi.hoisted(() => ({ config: null as ResponderConfig | null }));

vi.mock("react-native", async () => {
  const React = await import("react");
  const { createReactNativeMock } = await import("./native-test-runtime");
  return {
    ...createReactNativeMock(React),
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
  cleanup();
});

function touch(locationX: number, locationY: number) {
  return {
    nativeEvent: {
      locationX,
      locationY,
      pageX: 9999,
      pageY: -9999
    }
  };
}

describe("Native wheel gesture lifecycle", () => {
  it("uses synchronous local coordinates on the first drag and closes the transaction", () => {
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
      <NativePickerProvider controller={controller}>
        <NativeWheelBlock />
      </NativePickerProvider>
    );
    const responder = captured.config;
    expect(responder).not.toBeNull();
    if (responder === null) throw new Error("Missing native pan responder");

    act(() => responder.onPanResponderGrant(touch(100, 0)));
    act(() => responder.onPanResponderMove(touch(200, 100)));
    act(() => responder.onPanResponderRelease(touch(100, 200)));

    const color = convertColor(controller.getPalette().colors[0]?.color ?? "#000", "hsv");
    expect(color.h).toBeCloseTo(180, 4);
    expect(color.s).toBeCloseTo(1, 4);
    expect(color.v).toBeCloseTo(0.8, 4);
    expect(phases[0]).toBe("start");
    expect(phases).toContain("update");
    expect(phases.at(-1)).toBe("commit");
  });
});
