// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { convertColor, createHarmonyPalette } from "../../src/core";
import type { Palette } from "../../src/core";
import { createPickerController, createPickerState, setWheelChannelValue } from "../../src/editor";

vi.mock("react-native", async () => {
  const React = await import("react");
  const { createReactNativeMock } = await import("./native-test-runtime");
  return createReactNativeMock(React);
});

vi.mock("../../src/react-native/svg-wheel", () => ({
  NativeSvgWheel: ({ testID }: { readonly testID?: string }) => <div data-testid={testID} />
}));

import { NativePickerProvider } from "../../src/react-native/context";
import { NativeWheelBlock } from "../../src/react-native/wheel";

afterEach(cleanup);

function linkedController() {
  const palette = createHarmonyPalette({
    seed: "#00c4cc",
    harmony: { type: "complementary" }
  });
  return createPickerController(
    createPickerState({
      palette,
      wheel: { interaction: "linked" }
    })
  );
}

describe("NativeWheelBlock", () => {
  it("exposes primitive block titles as semantic headers", () => {
    const controller = linkedController();
    render(
      <NativePickerProvider controller={controller}>
        <NativeWheelBlock title="Harmony editor" />
      </NativePickerProvider>
    );

    expect(screen.getByRole("heading", { name: "Harmony editor" })).toBeTruthy();
  });

  it("recovers a linked hue after the value reaches zero", () => {
    const controller = linkedController();
    const state = controller.getState();
    const anchorId = state.anchorColorId;
    const seed = state.palette.recipe?.seed;
    expect(anchorId).toBeDefined();
    expect(seed).toBeDefined();
    if (anchorId === undefined || seed === undefined) throw new Error("Expected linked seed owner");

    controller.commands.setColor(anchorId, setWheelChannelValue(seed, 0, { model: "hsv" }));

    render(
      <NativePickerProvider controller={controller}>
        <NativeWheelBlock />
      </NativePickerProvider>
    );
    fireEvent.click(screen.getByTestId("colorwheel-wheel-increase-channel"));

    const recoveredSeed = controller.getPalette().recipe?.seed;
    expect(recoveredSeed).toBeDefined();
    if (recoveredSeed === undefined) throw new Error("Expected regenerated seed");
    const hsv = convertColor(recoveredSeed, "hsv");
    expect(hsv.h).toBeCloseTo(182, 0);
    expect(hsv.s).toBeGreaterThan(0.99);
    expect(hsv.v).toBeCloseTo(0.02, 5);
  });

  it("exposes and applies the model-specific third-channel controls", () => {
    const controller = linkedController();
    const anchorId = controller.getState().anchorColorId;
    expect(anchorId).toBeDefined();
    if (anchorId === undefined) throw new Error("Expected anchor");
    const before = convertColor(controller.getPalette().recipe?.seed ?? "#000", "hsv").v;

    render(
      <NativePickerProvider controller={controller}>
        <NativeWheelBlock channelStep={0.1} />
      </NativePickerProvider>
    );
    expect(screen.getByText(/Value 80%/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("colorwheel-wheel-decrease-channel"));

    const after = convertColor(controller.getPalette().recipe?.seed ?? "#000", "hsv").v;
    expect(after).toBeCloseTo(before - 0.1, 5);
  });

  it("makes non-editable handles actually disabled", () => {
    const controller = linkedController();
    const state = controller.getState();
    const derived = state.palette.colors.find((entry) => entry.id !== state.anchorColorId);
    expect(derived).toBeDefined();
    if (derived === undefined) throw new Error("Expected derived color");

    render(
      <NativePickerProvider controller={controller}>
        <NativeWheelBlock />
      </NativePickerProvider>
    );
    const handle = screen.getByTestId(`colorwheel-wheel-handle-${derived.id}`);
    expect(handle).toBeDisabled();
    expect(handle).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(handle);
    expect(controller.getState().activeColorId).toBe(state.activeColorId);
  });

  it("announces the linked anchor on its wheel handle", () => {
    const controller = linkedController();
    const anchorId = controller.getState().anchorColorId;
    expect(anchorId).toBeDefined();
    if (anchorId === undefined) throw new Error("Expected anchor");

    render(
      <NativePickerProvider controller={controller}>
        <NativeWheelBlock />
      </NativePickerProvider>
    );

    expect(screen.getByTestId(`colorwheel-wheel-handle-${anchorId}`)).toHaveAccessibleName(
      /anchor color/i
    );
  });

  it("labels and edits the OKLCH lightness channel", () => {
    const palette: Palette = {
      colors: [
        {
          id: "accent",
          name: "Accent",
          color: { space: "oklch", l: 0.7, c: 0.18, h: 275 }
        }
      ],
      kind: "custom",
      provenance: { origin: "manual" }
    };
    const controller = createPickerController(
      createPickerState({ palette, wheel: { wheelModel: "oklch" } })
    );
    render(
      <NativePickerProvider controller={controller}>
        <NativeWheelBlock channelStep={0.1} />
      </NativePickerProvider>
    );

    expect(screen.getByText(/Lightness 70%/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("colorwheel-wheel-decrease-channel"));
    expect(convertColor(controller.getPalette().colors[0]?.color ?? "#000", "oklch").l).toBeCloseTo(
      0.6,
      5
    );
  });
});
