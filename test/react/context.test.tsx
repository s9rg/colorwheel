import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Palette } from "../../src/core";
import { createPickerController, createPickerState } from "../../src/editor";
import { PickerRoot, usePickerSelector } from "../../src/react";

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

describe("usePickerSelector", () => {
  it("stabilizes allocating selector results with the supplied equality", () => {
    const controller = createPickerController(createPickerState({ palette: palette() }));
    const selections: { activeColorId: string | undefined }[] = [];
    const renders = vi.fn();

    function Probe({ revision }: { revision: number }) {
      const selection = usePickerSelector(
        (state) => ({ activeColorId: state.activeColorId }),
        (previous, next) => previous.activeColorId === next.activeColorId
      );
      selections.push(selection);
      renders(revision);
      return <output>{selection.activeColorId}</output>;
    }

    const view = render(
      <StrictMode>
        <PickerRoot controller={controller}>
          <Probe revision={0} />
        </PickerRoot>
      </StrictMode>
    );
    const initialSelection = selections.at(-1);
    view.rerender(
      <StrictMode>
        <PickerRoot controller={controller}>
          <Probe revision={1} />
        </PickerRoot>
      </StrictMode>
    );

    expect(screen.getByText("primary")).toBeInTheDocument();
    expect(selections.at(-1)).toBe(initialSelection);

    const renderCountBeforeUnrelatedUpdate = renders.mock.calls.length;
    act(() => {
      controller.commands.setName("primary", "Updated");
    });
    expect(renders).toHaveBeenCalledTimes(renderCountBeforeUnrelatedUpdate);

    act(() => {
      controller.commands.setActive("surface");
    });
    expect(screen.getByText("surface")).toBeInTheDocument();
    expect(selections.at(-1)).not.toBe(initialSelection);
  });

  it("resets its cached snapshot when the controller is replaced", () => {
    const first = createPickerController(createPickerState({ palette: palette() }));
    const second = createPickerController(
      createPickerState({ palette: palette(), activeColorId: "surface" })
    );

    function Probe() {
      const selection = usePickerSelector(
        (state) => ({ activeColorId: state.activeColorId }),
        (previous, next) => previous.activeColorId === next.activeColorId
      );
      return <output>{selection.activeColorId}</output>;
    }

    const view = render(
      <PickerRoot controller={first}>
        <Probe />
      </PickerRoot>
    );
    expect(screen.getByText("primary")).toBeInTheDocument();

    view.rerender(
      <PickerRoot controller={second}>
        <Probe />
      </PickerRoot>
    );
    expect(screen.getByText("surface")).toBeInTheDocument();

    act(() => first.commands.setActive("surface"));
    act(() => second.commands.setActive("primary"));
    expect(screen.getByText("primary")).toBeInTheDocument();
  });
});
