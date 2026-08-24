import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { startTransition, StrictMode, Suspense, useState } from "react";
import type { FormEvent } from "react";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { convertColor, createHarmonyPalette, formatColor } from "../../src/core";
import type { ExportArtifact, Palette, PaletteAnalysis } from "../../src/core";
import { createPickerController, createPickerState } from "../../src/editor";
import type { ChangeMeta, PickerState } from "../../src/editor";
import {
  ChannelControls,
  DiagnosticsBlock,
  ExportBlock,
  HarmonyControls,
  PaletteBlock,
  Picker,
  PickerRoot,
  WheelBlock,
  usePickerController,
  usePickerSelector
} from "../../src/react";
import type { ExportOption } from "../../src/react";

function manualPalette(first = "#ef4444", second = "#2563eb"): Palette {
  return {
    colors: [
      {
        id: "primary",
        color: first,
        name: "Primary",
        role: "foreground"
      },
      {
        id: "surface",
        color: second,
        name: "Surface",
        role: "background"
      }
    ].map((entry) => ({
      ...entry,
      color: {
        space: "srgb" as const,
        ...(() => {
          const value = Number.parseInt(entry.color.slice(1), 16);
          return {
            r: ((value >> 16) & 255) / 255,
            g: ((value >> 8) & 255) / 255,
            b: (value & 255) / 255
          };
        })()
      }
    })),
    kind: "custom",
    provenance: { origin: "manual" }
  };
}

function markerAnalysis(marker: string): PaletteAnalysis {
  return {
    diagnostics: [
      {
        ruleId: marker,
        severity: "info",
        messageKey: marker
      }
    ]
  };
}

describe("React picker composition", () => {
  it("renders the complete default preset with stable blocks", () => {
    render(<Picker defaultPalette={manualPalette()} />);

    expect(screen.getByRole("heading", { name: "Color wheel" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Palette" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Create" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Palette checks" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Export" })).toBeVisible();
    expect(document.querySelector("[data-part='wheel']")).toBeVisible();
    expect(document.querySelectorAll("[data-part='pointer']")).toHaveLength(2);
  });

  it("accepts a controlled palette and does not echo external updates", async () => {
    const onPaletteChange = vi.fn();
    const first = manualPalette();
    const second = manualPalette("#22c55e", "#0f172a");
    const { rerender } = render(
      <Picker
        palette={first}
        onPaletteChange={onPaletteChange}
        blocks={{ controls: false, diagnostics: false, export: false }}
      />
    );

    const input = screen.getByLabelText<HTMLInputElement>("Primary value");
    expect(input).toHaveValue("#ef4444");
    input.focus();
    fireEvent.change(input, { target: { value: "#123456" } });

    rerender(
      <Picker
        palette={second}
        onPaletteChange={onPaletteChange}
        blocks={{ controls: false, diagnostics: false, export: false }}
      />
    );
    await waitFor(() => expect(screen.getByLabelText("Primary value")).toHaveValue("#22c55e"));
    expect(onPaletteChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onPaletteChange).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Primary value"), {
      target: { value: "#ffffff" }
    });
    fireEvent.blur(screen.getByLabelText("Primary value"));
    expect(onPaletteChange).toHaveBeenCalledTimes(1);
    expect(onPaletteChange.mock.calls[0]?.[1]).toMatchObject({
      action: "text-input",
      phase: "commit",
      origin: "user"
    });
  });

  it("does not echo an external removal during an active name edit", () => {
    const onChange = vi.fn();
    const onPaletteChange = vi.fn();
    const first = manualPalette();
    const second: Palette = { ...first, colors: first.colors.slice(1) };
    const props = {
      onChange,
      onPaletteChange,
      blocks: { wheel: false, controls: false, diagnostics: false, export: false } as const
    };
    const { rerender, unmount } = render(<Picker {...props} palette={first} />);

    fireEvent.focus(screen.getByLabelText("Primary name"));
    fireEvent.change(screen.getByLabelText("Primary name"), { target: { value: "Rouge" } });
    const changeCount = onChange.mock.calls.length;
    const paletteChangeCount = onPaletteChange.mock.calls.length;

    rerender(<Picker {...props} palette={second} />);
    expect(onChange).toHaveBeenCalledTimes(changeCount);
    expect(onPaletteChange).toHaveBeenCalledTimes(paletteChangeCount);
    unmount();
    expect(onChange).toHaveBeenCalledTimes(changeCount);
    expect(onPaletteChange).toHaveBeenCalledTimes(paletteChangeCount);
  });

  it("keeps a rejected controlled palette authoritative", async () => {
    const onPaletteChange = vi.fn();
    const palette = manualPalette();
    render(
      <Picker
        palette={palette}
        onPaletteChange={onPaletteChange}
        blocks={{ wheel: false, controls: false, diagnostics: false, export: false }}
      />
    );

    const input = screen.getByLabelText("Primary value");
    fireEvent.change(input, { target: { value: "#00ff00" } });
    fireEvent.blur(input);

    expect(onPaletteChange).toHaveBeenCalledTimes(1);
    expect(onPaletteChange.mock.calls[0]?.[0]).not.toBe(palette);
    await waitFor(() => expect(screen.getByLabelText("Primary value")).toHaveValue("#ef4444"));
  });

  it("refreshes diagnostics when switching from manual to commit scheduling", () => {
    const controller = createPickerController(createPickerState({ palette: manualPalette() }));
    const analyze = vi.fn((palette: Palette) => markerAnalysis(palette.colors[0]?.name ?? "empty"));
    const view = render(
      <PickerRoot controller={controller}>
        <DiagnosticsBlock schedule="manual" analyze={analyze} />
      </PickerRoot>
    );

    expect(document.querySelector("[data-rule-id='Primary']")).toBeVisible();
    act(() => {
      controller.commands.setName("primary", "Updated", {
        action: "text-input",
        phase: "commit"
      });
    });

    view.rerender(
      <PickerRoot controller={controller}>
        <DiagnosticsBlock schedule="commit" analyze={analyze} />
      </PickerRoot>
    );

    expect(document.querySelector("[data-rule-id='Updated']")).toBeVisible();
    expect(analyze).toHaveBeenCalledTimes(2);
  });

  it("refreshes diagnostics after a supplied analysis is removed", async () => {
    const controller = createPickerController(createPickerState({ palette: manualPalette() }));
    const analyze = vi.fn((palette: Palette) => markerAnalysis(palette.colors[0]?.name ?? "empty"));
    const view = render(
      <PickerRoot controller={controller}>
        <DiagnosticsBlock schedule="commit" analyze={analyze} />
      </PickerRoot>
    );

    act(() => {
      controller.commands.setName("primary", "Intermediate", {
        action: "text-input",
        phase: "commit"
      });
    });
    await waitFor(() =>
      expect(document.querySelector("[data-rule-id='Intermediate']")).toBeVisible()
    );

    view.rerender(
      <PickerRoot controller={controller}>
        <DiagnosticsBlock
          schedule="commit"
          analyze={analyze}
          analysis={markerAnalysis("Supplied")}
        />
      </PickerRoot>
    );
    act(() => {
      controller.commands.setName("primary", "Current", {
        action: "text-input",
        phase: "commit"
      });
    });
    expect(document.querySelector("[data-rule-id='Supplied']")).toBeVisible();

    view.rerender(
      <PickerRoot controller={controller}>
        <DiagnosticsBlock schedule="commit" analyze={analyze} />
      </PickerRoot>
    );

    expect(document.querySelector("[data-rule-id='Current']")).toBeVisible();
  });

  it("supports block replacement and headless hooks", async () => {
    function CustomPalette() {
      const count = usePickerSelector((state) => state.palette.colors.length);
      const controller = usePickerController();
      return (
        <button
          type="button"
          onClick={() =>
            controller.commands.addColor({
              color: { space: "srgb", r: 1, g: 1, b: 1 }
            })
          }
        >
          Custom palette: {count}
        </button>
      );
    }

    const user = userEvent.setup();
    render(
      <Picker
        defaultPalette={manualPalette()}
        blocks={{
          palette: CustomPalette,
          controls: false,
          diagnostics: false,
          export: false
        }}
      />
    );
    const custom = screen.getByRole("button", { name: "Custom palette: 2" });
    await user.click(custom);
    expect(screen.getByRole("button", { name: "Custom palette: 3" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Palette" })).not.toBeInTheDocument();
  });

  it("keeps complete custom primitive replacements non-submitting inside forms", () => {
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PickerRoot defaultPalette={manualPalette()}>
          <WheelBlock
            renderPointer={(props) => (
              <button {...props.buttonProps}>Custom pointer {props.entry.name}</button>
            )}
          />
          <PaletteBlock
            renderSwatch={(props) => (
              <li>
                <button {...props.actionProps.select}>Custom swatch {props.entry.name}</button>
              </li>
            )}
          />
        </PickerRoot>
      </form>
    );

    const pointer = screen.getByRole("button", { name: /Primary wheel handle/ });
    const swatch = screen.getByRole("button", { name: /Select Primary/ });
    expect(pointer).toHaveAttribute("type", "button");
    expect(swatch).toHaveAttribute("type", "button");
    fireEvent.click(pointer);
    fireEvent.click(swatch);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps multiple instances labelled independently", () => {
    render(
      <>
        <Picker
          defaultPalette={manualPalette()}
          blocks={{ controls: false, diagnostics: false, export: false }}
        />
        <Picker
          defaultPalette={manualPalette()}
          blocks={{ controls: false, diagnostics: false, export: false }}
        />
      </>
    );
    const palettes = document.querySelectorAll("[data-part='palette']");
    expect(palettes).toHaveLength(2);
    const labels = [...palettes].map((element) => element.getAttribute("aria-labelledby"));
    expect(labels[0]).toBeTruthy();
    expect(labels[0]).not.toBe(labels[1]);
  });

  it("supports keyboard wheel editing without dragging", () => {
    const onPaletteChange = vi.fn();
    render(
      <PickerRoot defaultPalette={manualPalette()} onPaletteChange={onPaletteChange}>
        <WheelBlock />
      </PickerRoot>
    );
    const pointer = screen.getByRole("button", {
      name: /Primary wheel handle/
    });
    fireEvent.keyDown(pointer, { key: "ArrowRight" });
    expect(onPaletteChange).toHaveBeenCalledTimes(1);
    expect(onPaletteChange.mock.calls[0]?.[1]).toMatchObject({
      action: "keyboard",
      phase: "commit"
    });
  });

  it("uses a model-aware outer channel ring without changing the polar wheel contract", () => {
    const palettes: Palette[] = [];
    render(
      <PickerRoot
        defaultPalette={manualPalette()}
        wheel={{ interaction: "free" }}
        onPaletteChange={(palette) => palettes.push(palette)}
      >
        <WheelBlock />
      </PickerRoot>
    );

    const ring = screen.getByRole("slider", { name: "Primary value ring" });
    expect(ring).toHaveAttribute("data-part", "channel-ring");
    expect(ring).toHaveAttribute("data-model", "hsv");
    expect(ring).toHaveAttribute("aria-valuemin", "0");
    expect(ring).toHaveAttribute("aria-valuemax", "100");
    expect(ring).toHaveAttribute("aria-orientation", "vertical");
    expect(document.querySelector("[data-part='wheel']")).toHaveAttribute("data-model", "hsv");
    expect(document.querySelector("[data-part='channel-ring-track']")).toBeVisible();

    fireEvent.keyDown(ring, { key: "Home" });
    const next = palettes.at(-1)?.colors[0]?.color;
    expect(next).toBeDefined();
    if (next !== undefined) {
      expect(formatColor(next, { format: "hex", alpha: "never" })).toBe("#000000");
    }
  });

  it("recovers a linked cyan anchor from zero value without replacing its hue basis", () => {
    const generated = createHarmonyPalette({
      seed: { space: "hsv", h: 182, s: 1, v: 0.8 },
      harmony: { type: "complementary" },
      idFactory: (index) => (index === 0 ? "base" : "complement")
    });
    const linked: Palette = {
      ...generated,
      colors: generated.colors.map((entry, index) => ({
        ...entry,
        name: index === 0 ? "Base" : "Complement"
      }))
    };
    const palettes: Palette[] = [];
    render(
      <PickerRoot
        defaultPalette={linked}
        wheel={{ interaction: "linked" }}
        onPaletteChange={(palette) => palettes.push(palette)}
      >
        <WheelBlock />
        <ChannelControls />
      </PickerRoot>
    );

    fireEvent.keyDown(screen.getByRole("slider", { name: "Base value ring" }), {
      key: "Home"
    });

    const frame = document.querySelector<HTMLElement>("[data-part='wheel-frame']");
    expect(frame?.style.getPropertyValue("--colorwheel-channel-end")).toBe(
      formatColor({ space: "hsv", h: 182, s: 1, v: 1 }, { format: "rgb", alpha: "never" })
    );
    expect(screen.getByRole("slider", { name: /^Hue / })).toHaveValue("182");
    expect(screen.getByRole("slider", { name: /^Saturation / })).toHaveValue("100");

    fireEvent.keyDown(screen.getByRole("slider", { name: "Base value ring" }), {
      key: "ArrowUp"
    });

    const next = palettes.at(-1);
    expect(next?.recipe?.seed).toEqual({ space: "hsv", h: 182, s: 1, v: 0.01 });
    const anchor = next?.colors[0]?.color;
    expect(anchor).toBeDefined();
    if (anchor !== undefined) {
      const hsv = convertColor(anchor, "hsv");
      expect(hsv.s).toBeGreaterThan(0.9);
      expect(hsv.h).toBeGreaterThan(175);
      expect(hsv.h).toBeLessThan(190);
      expect(formatColor(anchor, { format: "hex", alpha: "never" })).not.toBe("#030303");
    }
  });

  it("keeps the pointer-selected ring side through hysteresis and keyboard updates", () => {
    render(
      <PickerRoot defaultPalette={manualPalette()} wheel={{ interaction: "free" }}>
        <WheelBlock />
      </PickerRoot>
    );

    const ring = screen.getByRole("slider", { name: "Primary value ring" });
    const frame = document.querySelector<HTMLElement>("[data-part='wheel-frame']");
    expect(frame).not.toBeNull();
    if (frame === null) return;
    vi.spyOn(ring, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      toJSON: () => ({})
    });

    expect(ring).toHaveAttribute("data-side", "right");
    fireEvent.pointerDown(ring, {
      pointerId: 17,
      button: 0,
      isPrimary: true,
      clientX: 0,
      clientY: 100
    });
    expect(ring).toHaveAttribute("data-side", "left");
    expect(
      Number.parseFloat(frame.style.getPropertyValue("--colorwheel-channel-ring-x"))
    ).toBeLessThan(50);

    // Four pixels right of center remains inside the eight-pixel hysteresis
    // zone for this 200px ring, so the thumb does not jump across the wheel.
    fireEvent.pointerMove(ring, {
      pointerId: 17,
      isPrimary: true,
      clientX: 104,
      clientY: 70
    });
    expect(ring).toHaveAttribute("data-side", "left");
    expect(
      Number.parseFloat(frame.style.getPropertyValue("--colorwheel-channel-ring-x"))
    ).toBeLessThan(50);
    fireEvent.pointerUp(ring, {
      pointerId: 17,
      button: 0,
      isPrimary: true,
      clientX: 104,
      clientY: 70
    });

    const beforeKeyboard = Number.parseFloat(
      frame.style.getPropertyValue("--colorwheel-channel-ring-y")
    );
    fireEvent.keyDown(ring, { key: "ArrowUp" });
    const afterKeyboard = Number.parseFloat(
      frame.style.getPropertyValue("--colorwheel-channel-ring-y")
    );
    expect(afterKeyboard).toBeLessThan(beforeKeyboard);
    expect(ring).toHaveAttribute("data-side", "left");
    expect(
      Number.parseFloat(frame.style.getPropertyValue("--colorwheel-channel-ring-x"))
    ).toBeLessThan(50);
  });

  it("can omit the outer channel ring without removing the wheel", () => {
    render(
      <PickerRoot defaultPalette={manualPalette()}>
        <WheelBlock showChannelRing={false} />
      </PickerRoot>
    );

    expect(screen.queryByRole("slider", { name: "Primary value ring" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-part='wheel-frame']")).toHaveAttribute(
      "data-ring",
      "false"
    );
    expect(document.querySelector("[data-part='wheel']")).toBeVisible();
  });

  it("does not cancel a committed drag when pointer capture is released synchronously", () => {
    const changes: ChangeMeta[] = [];
    render(
      <PickerRoot
        defaultPalette={manualPalette()}
        wheel={{ interaction: "free" }}
        onChange={(_state, meta) => changes.push(meta)}
      >
        <WheelBlock />
      </PickerRoot>
    );

    const wheel = document.querySelector<HTMLElement>("[data-part='wheel']");
    expect(wheel).not.toBeNull();
    if (wheel === null) return;
    vi.spyOn(wheel, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      toJSON: () => ({})
    });
    wheel.releasePointerCapture = (pointerId: number) => {
      fireEvent.lostPointerCapture(wheel, { pointerId });
    };

    fireEvent.pointerDown(wheel, {
      pointerId: 9,
      button: 0,
      isPrimary: true,
      clientX: 100,
      clientY: 20
    });
    fireEvent.pointerMove(wheel, {
      pointerId: 9,
      isPrimary: true,
      clientX: 180,
      clientY: 100
    });
    expect(() =>
      fireEvent.pointerUp(wheel, {
        pointerId: 9,
        button: 0,
        isPrimary: true,
        clientX: 180,
        clientY: 100
      })
    ).not.toThrow();

    expect(changes.map((meta) => meta.phase)).toEqual(["start", "update", "update", "commit"]);
    expect(changes.at(-1)).toMatchObject({ action: "pointer", phase: "commit" });
  });

  it("uses OKLCH geometry, channels, and keyboard behavior together", () => {
    const onPaletteChange = vi.fn();
    render(
      <PickerRoot
        defaultPalette={manualPalette()}
        wheel={{ wheelModel: "oklch", interaction: "free" }}
        onPaletteChange={onPaletteChange}
      >
        <WheelBlock />
        <ChannelControls />
      </PickerRoot>
    );

    expect(screen.getByRole("slider", { name: /^Chroma / })).toBeVisible();
    expect(screen.getByRole("slider", { name: /^Lightness / })).toBeVisible();
    expect(screen.queryByRole("slider", { name: /^Saturation / })).not.toBeInTheDocument();
    const wheel = document.querySelector<HTMLElement>("[data-part='wheel']");
    expect(wheel).toHaveAttribute("data-model", "oklch");
    const frame = document.querySelector<HTMLElement>("[data-part='wheel-frame']");
    expect(frame?.style.getPropertyValue("--colorwheel-lightness")).toMatch(/%$/);
    const ring = document.querySelector<HTMLElement>("[data-part='channel-ring']");
    expect(ring).toHaveAttribute("role", "slider");
    expect(ring).toHaveAttribute("aria-label", "Primary lightness ring");
    expect(ring).toHaveAttribute("data-model", "oklch");

    fireEvent.keyDown(screen.getByRole("button", { name: /Primary wheel handle/ }), {
      key: "ArrowUp"
    });
    expect(onPaletteChange).toHaveBeenCalledTimes(1);
    expect(onPaletteChange.mock.calls[0]?.[1]).toMatchObject({
      action: "keyboard",
      phase: "commit",
      changedColorIds: ["primary"]
    });
  });

  it("represents the complete accepted OKLCH chroma range", () => {
    const palette: Palette = {
      colors: [
        {
          id: "vivid",
          name: "Vivid",
          color: { space: "oklch", l: 0.7, c: 0.5, h: 40 }
        }
      ],
      kind: "custom",
      provenance: { origin: "manual" }
    };
    const palettes: Palette[] = [];
    render(
      <PickerRoot
        defaultPalette={palette}
        wheel={{ wheelModel: "oklch", interaction: "free" }}
        onPaletteChange={(next) => palettes.push(next)}
      >
        <WheelBlock />
        <ChannelControls />
      </PickerRoot>
    );

    const chroma = screen.getByRole("slider", { name: /^Chroma / });
    expect(chroma).toHaveAttribute("max", "0.5");
    expect(chroma).toHaveValue("0.5");

    const pointer = screen.getByRole("button", { name: /Vivid wheel handle/ });
    fireEvent.keyDown(pointer, { key: "Home" });
    fireEvent.keyDown(pointer, { key: "End" });
    expect(palettes.at(-1)?.colors[0]?.color).toMatchObject({
      space: "oklch",
      c: 0.5
    });
  });

  it("marks non-editable wheel handles disabled", () => {
    const palette = manualPalette();
    const locked: Palette = {
      ...palette,
      colors: palette.colors.map((entry, index) =>
        index === 0 ? { ...entry, locked: true } : entry
      )
    };
    render(
      <PickerRoot defaultPalette={locked}>
        <WheelBlock />
      </PickerRoot>
    );

    const pointer = screen.getByRole("button", { name: /Primary wheel handle/ });
    expect(pointer).toBeDisabled();
    expect(pointer).toHaveAttribute("data-color-id", "primary");
  });

  it("keeps pointer channel edits in one interaction lifecycle", () => {
    const changes: ChangeMeta[] = [];
    const onChange = vi.fn((_state: PickerState, meta: ChangeMeta) => {
      changes.push(meta);
    });
    render(
      <PickerRoot defaultPalette={manualPalette()} onChange={onChange}>
        <ChannelControls />
      </PickerRoot>
    );

    const hue = screen.getByRole("slider", { name: /^Hue / });
    fireEvent.pointerDown(hue, { pointerId: 7, button: 0, isPrimary: true });
    fireEvent.change(hue, { target: { value: "180" } });
    fireEvent.pointerUp(hue, { pointerId: 7, button: 0, isPrimary: true });

    expect(onChange).toHaveBeenCalledTimes(3);
    expect(changes.map((meta) => meta.phase)).toEqual(["start", "update", "commit"]);
    expect(new Set(changes.map((meta) => meta.transactionId)).size).toBe(1);
    expect(changes[0]).toMatchObject({ action: "pointer", changedColorIds: [] });
    expect(changes[1]).toMatchObject({ action: "pointer", changedColorIds: ["primary"] });
    expect(changes[2]).toMatchObject({ action: "pointer", changedColorIds: ["primary"] });
  });

  it("commits an active channel interaction when its block unmounts", () => {
    const changes: ChangeMeta[] = [];
    const onChange = (_state: PickerState, meta: ChangeMeta) => {
      changes.push(meta);
    };
    const palette = manualPalette();
    const view = render(
      <PickerRoot defaultPalette={palette} onChange={onChange}>
        <ChannelControls />
      </PickerRoot>
    );

    const hue = screen.getByRole("slider", { name: /^Hue / });
    fireEvent.pointerDown(hue, { pointerId: 7, button: 0, isPrimary: true });
    fireEvent.change(hue, { target: { value: "180" } });
    view.rerender(
      <PickerRoot defaultPalette={palette} onChange={onChange}>
        <p>Channels removed</p>
      </PickerRoot>
    );

    expect(changes.map((meta) => meta.phase)).toEqual(["start", "update", "commit"]);
    expect(new Set(changes.map((meta) => meta.transactionId)).size).toBe(1);
  });

  it("emits a final commit for an edited palette name", () => {
    const changes: ChangeMeta[] = [];
    render(
      <PickerRoot
        defaultPalette={manualPalette()}
        onChange={(_state, meta) => {
          changes.push(meta);
        }}
      >
        <PaletteBlock />
      </PickerRoot>
    );

    const name = screen.getByRole("textbox", { name: "Primary name" });
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: "Brand" } });
    fireEvent.blur(name);

    expect(changes.map((meta) => meta.phase)).toEqual(["start", "update", "commit"]);
    expect(new Set(changes.map((meta) => meta.transactionId)).size).toBe(1);
    expect(changes.at(-1)).toMatchObject({
      action: "text-input",
      changedColorIds: ["primary"]
    });
  });

  it("keeps the color input focused while committing, validating, and cancelling drafts", () => {
    const onPaletteChange = vi.fn();
    render(
      <PickerRoot defaultPalette={manualPalette()} onPaletteChange={onPaletteChange}>
        <PaletteBlock />
      </PickerRoot>
    );

    const input = screen.getByLabelText<HTMLInputElement>("Primary value");
    input.focus();
    fireEvent.change(input, { target: { value: "#00ffff" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input).toHaveFocus();
    expect(input).toHaveValue("#00ffff");
    expect(onPaletteChange).toHaveBeenCalledOnce();

    fireEvent.blur(input);
    expect(onPaletteChange).toHaveBeenCalledOnce();
    input.focus();
    fireEvent.change(input, { target: { value: "garbage" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-invalid", "true");
    const error = screen.getByRole("alert");
    expect(input).toHaveAttribute("aria-describedby", error.id);
    expect(onPaletteChange).toHaveBeenCalledOnce();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(input).toHaveFocus();
    expect(input).toHaveValue("#00ffff");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onPaletteChange).toHaveBeenCalledOnce();
  });

  it("moves focus after removing the focused swatch", async () => {
    render(
      <PickerRoot defaultPalette={manualPalette()}>
        <PaletteBlock />
      </PickerRoot>
    );

    const remove = screen.getByRole("button", { name: "Remove Primary" });
    remove.focus();
    fireEvent.click(remove);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Select Surface/ })).toHaveFocus()
    );
  });

  it("moves focus to the palette when its final swatch is removed without an add action", async () => {
    const palette = manualPalette();
    render(
      <PickerRoot defaultPalette={{ ...palette, colors: palette.colors.slice(0, 1) }}>
        <PaletteBlock allowAdd={false} />
      </PickerRoot>
    );

    const remove = screen.getByRole("button", { name: "Remove Primary" });
    remove.focus();
    fireEvent.click(remove);

    await waitFor(() => expect(document.querySelector("[data-part='palette']")).toHaveFocus());
  });

  it("reports locked entries as non-editable to custom swatches", () => {
    const palette = manualPalette();
    render(
      <PickerRoot
        defaultPalette={{
          ...palette,
          colors: palette.colors.map((entry, index) =>
            index === 0 ? { ...entry, locked: true } : entry
          )
        }}
      >
        <PaletteBlock
          renderSwatch={(props) => (
            <li>
              <button {...props.actionProps.select} data-editable={String(props.editable)}>
                Custom {props.entry.name}
              </button>
            </li>
          )}
        />
      </PickerRoot>
    );

    expect(screen.getByRole("button", { name: /Select Primary/ })).toHaveAttribute(
      "data-editable",
      "false"
    );
  });

  it("keeps committed controlled callbacks active while a transition is suspended", async () => {
    const committedPalette = manualPalette();
    const pendingPalette = manualPalette("#22c55e", "#0f172a");
    const suspension = new Promise<never>(() => {
      // Deliberately remains pending while the committed picker stays interactive.
    });
    const observedVersions: number[] = [];

    function MutationButton() {
      const controller = usePickerController();
      return (
        <button
          type="button"
          onClick={() =>
            controller.commands.setColor("primary", {
              space: "srgb",
              r: 0.5,
              g: 0.5,
              b: 0
            })
          }
        >
          Mutate committed picker
        </button>
      );
    }

    function SuspendPendingVersion({ pending }: { readonly pending: boolean }) {
      // React Suspense deliberately uses a thrown thenable as its suspension protocol.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      if (pending) throw suspension;
      return null;
    }

    function Harness() {
      const [version, setVersion] = useState(0);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              startTransition(() => setVersion(1));
            }}
          >
            Begin suspended transition
          </button>
          <Suspense fallback={<p>Loading pending picker</p>}>
            <PickerRoot
              palette={version === 0 ? committedPalette : pendingPalette}
              onPaletteChange={() => {
                observedVersions.push(version);
              }}
            >
              <MutationButton />
              <SuspendPendingVersion pending={version === 1} />
            </PickerRoot>
          </Suspense>
        </>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Begin suspended transition" }));
    expect(screen.getByRole("button", { name: "Mutate committed picker" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Mutate committed picker" }));
    await Promise.resolve();

    expect(observedVersions).toEqual([0]);
  });

  it("does not reconcile a controlled controller after its callback unmounts the root", async () => {
    function Harness() {
      const [mounted, setMounted] = useState(true);
      const [palette] = useState(() => manualPalette());
      return mounted ? (
        <PickerRoot
          palette={palette}
          onChange={() => {
            flushSync(() => setMounted(false));
          }}
        >
          <PaletteBlock />
        </PickerRoot>
      ) : (
        <p>Picker removed</p>
      );
    }

    render(<Harness />);
    const input = screen.getByLabelText("Primary value");
    fireEvent.change(input, { target: { value: "#00ff00" } });
    fireEvent.blur(input);

    expect(screen.getByText("Picker removed")).toBeVisible();
    await Promise.resolve();
  });

  it("keeps the current relationship visible when a custom mode list omits it", () => {
    render(
      <PickerRoot
        defaultPalette={createHarmonyPalette({
          seed: "#00c4cc",
          harmony: { type: "triadic" }
        })}
      >
        <HarmonyControls modes={["complementary"]} />
      </PickerRoot>
    );

    const relationship = screen.getByLabelText("Palette relationship");
    expect(relationship).toHaveValue("triadic");
    expect(screen.getByRole("option", { name: "Triadic" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Complementary" })).toBeVisible();
  });

  it("applies live wheel option props before the rerender is observable", () => {
    const palette = manualPalette();
    const view = render(
      <PickerRoot defaultPalette={palette} wheel={{ wheelModel: "hsv" }}>
        <WheelBlock />
      </PickerRoot>
    );
    expect(document.querySelector("[data-part='wheel']")).toHaveAttribute("data-model", "hsv");

    view.rerender(
      <PickerRoot defaultPalette={palette} wheel={{ wheelModel: "oklch" }}>
        <WheelBlock />
      </PickerRoot>
    );
    expect(document.querySelector("[data-part='wheel']")).toHaveAttribute("data-model", "oklch");
  });

  it("preserves palette metadata and locked entries when changing harmony", () => {
    const base = manualPalette();
    const palette: Palette<{ source: string }> = {
      ...base,
      name: "Product colors",
      metadata: { source: "design-system" },
      colors: base.colors.map((entry, index) => ({
        ...entry,
        locked: index === 0,
        metadata: { source: index === 0 ? "approved" : "draft" }
      }))
    };
    const palettes: Palette<{ source: string }>[] = [];
    render(
      <PickerRoot
        defaultPalette={palette}
        onPaletteChange={(next) => {
          palettes.push(next);
        }}
      >
        <HarmonyControls />
      </PickerRoot>
    );

    fireEvent.change(screen.getByLabelText("Palette relationship"), {
      target: { value: "triadic" }
    });

    const next = palettes.at(-1);
    expect(next).toMatchObject({
      name: "Product colors",
      metadata: { source: "design-system" },
      recipe: { harmony: { type: "triadic" } }
    });
    expect(next?.colors[0]).toMatchObject({
      id: "primary",
      name: "Primary",
      role: "foreground",
      locked: true,
      metadata: { source: "approved" },
      color: palette.colors[0]?.color
    });
  });

  it("preserves the generation seed when leaving a tonal palette", () => {
    const palettes: Palette[] = [];
    render(
      <PickerRoot
        defaultPalette={createHarmonyPalette({
          seed: "#00c4cc",
          harmony: { type: "complementary" }
        })}
        onPaletteChange={(next) => {
          palettes.push(next);
        }}
      >
        <HarmonyControls />
      </PickerRoot>
    );

    const relationship = screen.getByLabelText("Palette relationship");
    fireEvent.change(relationship, { target: { value: "tonal" } });
    fireEvent.change(relationship, { target: { value: "triadic" } });

    const seed = palettes.at(-1)?.recipe?.seed;
    expect(seed).toBeDefined();
    if (seed === undefined) throw new Error("Expected the regenerated palette to retain a seed");
    expect(formatColor(seed, { format: "hex", alpha: "never", mapToSrgb: true })).toBe("#00c4cc");
  });

  it("selects the generated seed owner when a harmony seed is not the first swatch", () => {
    const controller = createPickerController(
      createPickerState({
        palette: createHarmonyPalette({
          seed: "#00c4cc",
          harmony: { type: "complementary" }
        })
      })
    );
    render(
      <PickerRoot controller={controller}>
        <HarmonyControls />
      </PickerRoot>
    );

    const relationship = screen.getByLabelText("Palette relationship");
    for (const mode of ["analogous", "monochromatic"]) {
      fireEvent.change(relationship, { target: { value: mode } });
      const ownerId = controller.getPalette().recipe?.seedColorId;
      expect(ownerId).toBeDefined();
      expect(controller.getState().anchorColorId).toBe(ownerId);
      expect(controller.getState().activeColorId).toBe(ownerId);
    }
  });

  it("does not assign seed ownership to an unrelated locked slot", () => {
    const palette: Palette = {
      colors: [
        { id: "base", name: "Base", color: { space: "srgb", r: 1, g: 0, b: 0 } },
        {
          id: "locked-companion",
          name: "Locked companion",
          color: { space: "srgb", r: 0, g: 1, b: 0 },
          locked: true
        },
        { id: "accent", name: "Accent", color: { space: "srgb", r: 0, g: 0, b: 1 } }
      ],
      kind: "custom",
      provenance: { origin: "manual" }
    };
    const controller = createPickerController(
      createPickerState({
        palette,
        activeColorId: "base",
        anchorColorId: "base"
      })
    );
    render(
      <PickerRoot controller={controller}>
        <HarmonyControls />
      </PickerRoot>
    );

    fireEvent.change(screen.getByLabelText("Palette relationship"), {
      target: { value: "analogous" }
    });

    const next = controller.getState();
    expect(next.palette.recipe?.seedColorId).toBe("base");
    expect(next.anchorColorId).toBe("base");
    expect(next.activeColorId).toBe("base");
    expect(next.palette.colors.find((entry) => entry.id === "locked-companion")).toMatchObject({
      locked: true,
      color: { space: "srgb", r: 0, g: 1, b: 0 }
    });
    expect(next.palette.recipe?.colorSlotIds).not.toContain("locked-companion");

    expect(() =>
      controller.commands.setColor("base", {
        space: "srgb",
        r: 1,
        g: 0.5,
        b: 0
      })
    ).not.toThrow();
    expect(
      controller.getPalette().colors.find((entry) => entry.id === "locked-companion")
    ).toMatchObject({
      locked: true,
      color: { space: "srgb", r: 0, g: 1, b: 0 }
    });
  });

  it("keeps an owned controller usable through React Strict Mode effect replay", () => {
    render(
      <StrictMode>
        <PickerRoot defaultPalette={manualPalette()}>
          <PaletteBlock />
        </PickerRoot>
      </StrictMode>
    );
    expect(screen.getByRole("heading", { name: "Palette" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add color" }));
    expect(document.querySelectorAll("[data-part='palette-item']")).toHaveLength(3);
  });

  it("rejects wheel overrides for full-state and injected-controller sources at runtime", () => {
    const state = createPickerState({ palette: manualPalette() });
    const controller = createPickerController(state);
    const defaultValueProps = {
      defaultValue: state,
      wheel: { wheelModel: "oklch" }
    } as unknown as Parameters<typeof PickerRoot>[0];
    const controllerProps = {
      controller,
      controllerOptions: {}
    } as unknown as Parameters<typeof PickerRoot>[0];

    expect(() => render(<PickerRoot {...defaultValueProps} />)).toThrow(
      "wheel is configured by full-state and injected-controller sources"
    );
    expect(() => render(<PickerRoot {...controllerProps} />)).toThrow(
      "controllerOptions apply only to adapter-owned controllers"
    );
  });

  it("accepts an injected controller and custom export handling", () => {
    const controller = createPickerController(createPickerState({ palette: manualPalette() }));
    const onExport = vi.fn((option: ExportOption, artifact: ExportArtifact) => {
      expect(option.id).toBe("json");
      expect(artifact.files).toHaveLength(1);
      return false as const;
    });
    render(
      <PickerRoot controller={controller} unstyled>
        <ExportBlock formats={["json"]} onExport={onExport} />
      </PickerRoot>
    );
    expect(document.querySelector("[data-colorwheel]")).toHaveAttribute("data-unstyled", "");
    fireEvent.click(screen.getByRole("button", { name: "JSON" }));
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport.mock.calls[0]?.[1]?.files[0]).toMatchObject({
      name: "palette.json",
      mediaType: "application/json"
    });
  });
});
