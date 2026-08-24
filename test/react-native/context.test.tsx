// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Palette } from "../../src/core";
import { createPickerController, createPickerState } from "../../src/editor";
import { NativePickerProvider, useNativePickerSelector } from "../../src/react-native/context";

afterEach(cleanup);

function palette(): Palette {
  return {
    colors: [
      { id: "primary", color: { space: "srgb", r: 1, g: 0, b: 0 } },
      { id: "surface", color: { space: "srgb", r: 0, g: 0, b: 1 } }
    ],
    kind: "custom",
    provenance: { origin: "manual" }
  };
}

describe("useNativePickerSelector", () => {
  it("stabilizes allocating selector results with the supplied equality", () => {
    const controller = createPickerController(createPickerState({ palette: palette() }));
    const selections: { activeColorId: string | undefined }[] = [];
    const renders = vi.fn();

    function Probe({ revision }: { revision: number }) {
      const selection = useNativePickerSelector(
        (state) => ({ activeColorId: state.activeColorId }),
        (previous, next) => previous.activeColorId === next.activeColorId
      );
      selections.push(selection);
      renders(revision);
      return <output>{selection.activeColorId}</output>;
    }

    const view = render(
      <StrictMode>
        <NativePickerProvider controller={controller}>
          <Probe revision={0} />
        </NativePickerProvider>
      </StrictMode>
    );
    const initialSelection = selections.at(-1);
    view.rerender(
      <StrictMode>
        <NativePickerProvider controller={controller}>
          <Probe revision={1} />
        </NativePickerProvider>
      </StrictMode>
    );

    expect(screen.getByText("primary")).toBeTruthy();
    expect(selections.at(-1)).toBe(initialSelection);

    const renderCountBeforeUnrelatedUpdate = renders.mock.calls.length;
    act(() => {
      controller.commands.setName("primary", "Updated");
    });
    expect(renders).toHaveBeenCalledTimes(renderCountBeforeUnrelatedUpdate);

    act(() => {
      controller.commands.setActive("surface");
    });
    expect(screen.getByText("surface")).toBeTruthy();
    expect(selections.at(-1)).not.toBe(initialSelection);
  });

  it("resets its cached snapshot when the controller is replaced", () => {
    const first = createPickerController(createPickerState({ palette: palette() }));
    const second = createPickerController(
      createPickerState({ palette: palette(), activeColorId: "surface" })
    );

    function Probe() {
      const selection = useNativePickerSelector(
        (state) => ({ activeColorId: state.activeColorId }),
        (previous, next) => previous.activeColorId === next.activeColorId
      );
      return <output>{selection.activeColorId}</output>;
    }

    const view = render(
      <NativePickerProvider controller={first}>
        <Probe />
      </NativePickerProvider>
    );
    expect(screen.getByText("primary")).toBeTruthy();

    view.rerender(
      <NativePickerProvider controller={second}>
        <Probe />
      </NativePickerProvider>
    );
    expect(screen.getByText("surface")).toBeTruthy();

    act(() => first.commands.setActive("surface"));
    act(() => second.commands.setActive("primary"));
    expect(screen.getByText("primary")).toBeTruthy();
  });
});
