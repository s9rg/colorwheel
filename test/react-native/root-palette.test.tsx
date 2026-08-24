// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHarmonyPalette } from "../../src/core";
import type { Palette } from "../../src/core";
import { createPickerController, createPickerState } from "../../src/editor";

vi.mock("react-native", async () => {
  const React = await import("react");
  const { createReactNativeMock } = await import("./native-test-runtime");
  return createReactNativeMock(React);
});

vi.mock("../../src/react-native/svg-wheel", () => ({
  NativeSvgWheel: ({ testID }: { readonly testID?: string }) => <div data-testid={testID} />
}));

import {
  NativePickerProvider,
  useNativePickerController,
  useNativePickerSelector
} from "../../src/react-native/context";
import { NativePaletteBlock } from "../../src/react-native/palette";
import { NativePickerPreset } from "../../src/react-native/picker";
import { NativePickerRoot } from "../../src/react-native/root";
import { AccessibilityInfo, findNodeHandle } from "react-native";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function palette(firstName = "Red"): Palette {
  return {
    colors: [
      { id: "red", name: firstName, color: { space: "srgb", r: 1, g: 0, b: 0 } },
      { id: "blue", name: "Blue", color: { space: "srgb", r: 0, g: 0, b: 1 } }
    ],
    kind: "custom",
    provenance: { origin: "manual" }
  };
}

function nativeHandle(node: HTMLElement): number | null {
  return findNodeHandle(node as unknown as Parameters<typeof findNodeHandle>[0]);
}

function ControllerProbe() {
  const controller = useNativePickerController();
  const name = useNativePickerSelector((state) => state.palette.colors[0]?.name);
  const wheelModel = useNativePickerSelector((state) => state.wheel.wheelModel);
  return (
    <>
      <output data-testid="first-name">{name}</output>
      <output data-testid="wheel-model">{wheelModel}</output>
      <button data-testid="rename" onClick={() => controller.commands.setName("red", "Changed")}>
        Rename
      </button>
    </>
  );
}

describe("NativePickerRoot", () => {
  it("rejects wheel overrides for full-state and injected-controller sources at runtime", () => {
    const state = createPickerState({ palette: palette() });
    const controller = createPickerController(state);
    const defaultValueProps = {
      defaultValue: state,
      wheel: { wheelModel: "oklch" }
    } as unknown as Parameters<typeof NativePickerRoot>[0];
    const controllerProps = {
      controller,
      controllerOptions: {}
    } as unknown as Parameters<typeof NativePickerRoot>[0];

    expect(() => render(<NativePickerRoot {...defaultValueProps} />)).toThrow(
      "wheel is configured by full-state and injected-controller sources"
    );
    expect(() => render(<NativePickerRoot {...controllerProps} />)).toThrow(
      "controllerOptions apply only to adapter-owned controllers"
    );
  });

  it("reconciles a rejected controlled palette and accepts external updates", async () => {
    const onPaletteChange = vi.fn<(next: Palette) => void>();
    const initial = palette();
    const view = render(
      <NativePickerRoot palette={initial} onPaletteChange={onPaletteChange}>
        <ControllerProbe />
      </NativePickerRoot>
    );

    fireEvent.click(screen.getByTestId("rename"));
    expect(onPaletteChange).toHaveBeenCalledTimes(1);
    expect(onPaletteChange.mock.calls[0]?.[0].colors[0]?.name).toBe("Changed");
    await waitFor(() => expect(screen.getByTestId("first-name")).toHaveTextContent("Red"));

    const external = palette("External");
    view.rerender(
      <NativePickerRoot palette={external} onPaletteChange={onPaletteChange}>
        <ControllerProbe />
      </NativePickerRoot>
    );
    expect(screen.getByTestId("first-name")).toHaveTextContent("External");
    expect(onPaletteChange).toHaveBeenCalledTimes(1);
  });

  it("switches injected controller identity without retaining the first subscription", () => {
    const first = createPickerController(createPickerState({ palette: palette("First") }));
    const second = createPickerController(createPickerState({ palette: palette("Second") }));
    const view = render(
      <NativePickerRoot controller={first}>
        <ControllerProbe />
      </NativePickerRoot>
    );
    expect(screen.getByTestId("first-name")).toHaveTextContent("First");

    view.rerender(
      <NativePickerRoot controller={second}>
        <ControllerProbe />
      </NativePickerRoot>
    );
    expect(screen.getByTestId("first-name")).toHaveTextContent("Second");
    first.commands.setName("red", "Stale");
    expect(screen.getByTestId("first-name")).toHaveTextContent("Second");
  });

  it("applies live wheel options before the rerender is observable", () => {
    const source = palette();
    const view = render(
      <NativePickerRoot defaultPalette={source} wheel={{ wheelModel: "hsv" }}>
        <ControllerProbe />
      </NativePickerRoot>
    );
    expect(screen.getByTestId("wheel-model")).toHaveTextContent("hsv");

    view.rerender(
      <NativePickerRoot defaultPalette={source} wheel={{ wheelModel: "oklch" }}>
        <ControllerProbe />
      </NativePickerRoot>
    );
    expect(screen.getByTestId("wheel-model")).toHaveTextContent("oklch");
  });
});

describe("NativePaletteBlock", () => {
  it("supports selection, adding, color text edits, and inline validation", () => {
    const controller = createPickerController(createPickerState({ palette: palette() }));
    render(
      <NativePickerProvider controller={controller}>
        <NativePaletteBlock />
      </NativePickerProvider>
    );

    fireEvent.click(screen.getByTestId("colorwheel-palette-select-blue"));
    expect(controller.getState().activeColorId).toBe("blue");
    fireEvent.click(screen.getByTestId("colorwheel-palette-add"));
    expect(controller.getPalette().colors).toHaveLength(3);

    const redInput = screen.getByTestId("colorwheel-palette-value-red");
    fireEvent.focus(redInput);
    fireEvent.change(redInput, { target: { value: "#00ff00" } });
    fireEvent.keyDown(redInput, { key: "Enter" });
    expect(controller.getPalette().colors[0]?.color).toMatchObject({
      space: "srgb",
      r: 0,
      g: 1,
      b: 0
    });

    fireEvent.change(redInput, { target: { value: "not-a-color" } });
    fireEvent.keyDown(redInput, { key: "Enter" });
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a supported CSS color");
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
    expect(screen.getByRole("alert")).toHaveAttribute(
      "id",
      "colorwheel-palette-color-red-value-error"
    );
    expect(redInput).toHaveAccessibleName(/invalid/i);
    expect(redInput).toHaveAccessibleDescription("Enter a supported CSS color.");

    fireEvent.change(redInput, { target: { value: "#00" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a supported CSS color");

    fireEvent.change(redInput, { target: { value: "#000000" } });
    fireEvent.keyDown(redInput, { key: "Enter" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(redInput).not.toHaveAccessibleName(/invalid/i);
  });

  it("exposes primitive block titles as semantic headers", () => {
    const controller = createPickerController(createPickerState({ palette: palette() }));
    render(
      <NativePickerProvider controller={controller}>
        <NativePaletteBlock title="Saved colors" />
      </NativePickerProvider>
    );

    expect(screen.getByRole("heading", { name: "Saved colors" })).toBeTruthy();
  });

  it("recovers accessibility focus to the next or previous swatch after removal", async () => {
    const setAccessibilityFocus = vi.spyOn(AccessibilityInfo, "setAccessibilityFocus");
    const controller = createPickerController(createPickerState({ palette: palette() }));
    render(
      <NativePickerProvider controller={controller}>
        <NativePaletteBlock />
      </NativePickerProvider>
    );

    const removeRed = screen.getByTestId("colorwheel-palette-remove-red");
    fireEvent.focus(removeRed);
    fireEvent.click(removeRed);

    await waitFor(() =>
      expect(setAccessibilityFocus).toHaveBeenLastCalledWith(
        nativeHandle(screen.getByTestId("colorwheel-palette-select-blue"))
      )
    );

    const addButton = screen.getByTestId("colorwheel-palette-add");
    fireEvent.click(addButton);
    const newColor = controller.getPalette().colors.at(-1);
    expect(newColor).toBeDefined();
    if (newColor === undefined) throw new Error("Expected added color");
    const removeNew = screen.getByTestId(`colorwheel-palette-remove-${newColor.id}`);
    fireEvent.focus(removeNew);
    fireEvent.click(removeNew);

    await waitFor(() =>
      expect(setAccessibilityFocus).toHaveBeenLastCalledWith(
        nativeHandle(screen.getByTestId("colorwheel-palette-select-blue"))
      )
    );
  });

  it("recovers accessibility focus to Add color or the palette root heading after the last removal", async () => {
    const setAccessibilityFocus = vi.spyOn(AccessibilityInfo, "setAccessibilityFocus");
    const oneColor: Palette = {
      ...palette(),
      colors: palette().colors.slice(0, 1)
    };
    const controller = createPickerController(createPickerState({ palette: oneColor }));
    const view = render(
      <NativePickerProvider controller={controller}>
        <NativePaletteBlock />
      </NativePickerProvider>
    );

    const addFallbackRemoval = screen.getByTestId("colorwheel-palette-remove-red");
    fireEvent.focus(addFallbackRemoval);
    fireEvent.click(addFallbackRemoval);
    await waitFor(() =>
      expect(setAccessibilityFocus).toHaveBeenLastCalledWith(
        nativeHandle(screen.getByTestId("colorwheel-palette-add"))
      )
    );

    view.unmount();
    setAccessibilityFocus.mockClear();
    const rootController = createPickerController(createPickerState({ palette: oneColor }));
    render(
      <NativePickerProvider controller={rootController}>
        <NativePaletteBlock allowAdd={false} />
      </NativePickerProvider>
    );

    const rootFallbackRemoval = screen.getByTestId("colorwheel-palette-remove-red");
    fireEvent.focus(rootFallbackRemoval);
    fireEvent.click(rootFallbackRemoval);
    await waitFor(() =>
      expect(setAccessibilityFocus).toHaveBeenLastCalledWith(
        nativeHandle(screen.getByRole("heading", { name: "Palette" }))
      )
    );
  });

  it("announces anchor ownership on the palette selection control", () => {
    const controller = createPickerController(
      createPickerState({
        palette: createHarmonyPalette({
          seed: "#ff0000",
          harmony: { type: "complementary" }
        }),
        wheel: { interaction: "linked" }
      })
    );
    render(
      <NativePickerProvider controller={controller}>
        <NativePaletteBlock />
      </NativePickerProvider>
    );

    const anchorId = controller.getState().anchorColorId;
    expect(anchorId).toBeDefined();
    if (anchorId === undefined) throw new Error("Expected anchor");
    expect(screen.getByTestId(`colorwheel-palette-select-${anchorId}`)).toHaveAccessibleName(
      /anchor color/i
    );
  });

  it("preserves custom swatch component state across controller updates", () => {
    const controller = createPickerController(createPickerState({ palette: palette() }));
    const mounts = vi.fn<(id: string) => void>();
    const unmounts = vi.fn<(id: string) => void>();

    function StableSwatch({ id }: { readonly id: string }) {
      useEffect(() => {
        mounts(id);
        return () => {
          unmounts(id);
        };
      }, [id]);
      return <output data-testid={`custom-${id}`}>{id}</output>;
    }

    render(
      <NativePickerProvider controller={controller}>
        <NativePaletteBlock renderSwatch={(props) => <StableSwatch id={props.entry.id} />} />
      </NativePickerProvider>
    );
    expect(mounts).toHaveBeenCalledTimes(2);
    controller.commands.setName("red", "Updated");
    expect(screen.getByTestId("custom-red")).toBeTruthy();
    expect(mounts).toHaveBeenCalledTimes(2);
    expect(unmounts).not.toHaveBeenCalled();
  });
});

describe("NativePickerPreset", () => {
  it("composes native wheel and palette blocks and supports block omission", () => {
    const view = render(<NativePickerPreset defaultPalette={palette()} />);
    expect(screen.getByTestId("colorwheel-wheel")).toBeTruthy();
    expect(screen.getByTestId("colorwheel-palette")).toBeTruthy();

    view.unmount();
    render(
      <NativePickerPreset defaultPalette={palette()} blocks={{ wheel: false, palette: false }} />
    );
    expect(screen.queryByTestId("colorwheel-wheel")).toBeNull();
    expect(screen.queryByTestId("colorwheel-palette")).toBeNull();
  });
});
