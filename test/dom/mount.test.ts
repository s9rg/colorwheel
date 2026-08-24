import { describe, expect, it, vi } from "vitest";
import { convertColor, createHarmonyPalette, formatColor } from "../../src/core";
import type { ColorValue, Palette, PaletteColor } from "../../src/core";
import {
  DestroyedPickerControllerError,
  createPickerController,
  createPickerState,
  wheelChannelValueToRingPoint
} from "../../src/editor";
import type { ChangeMeta } from "../../src/editor";
import { mountColorwheel } from "../../src/dom";
import type {
  ColorwheelBlockProps,
  ColorwheelPaletteBlockProps,
  ColorwheelWheelBlockProps
} from "../../src/dom";

const red: ColorValue = { space: "hsv", h: 0, s: 1, v: 1 };
const green: ColorValue = { space: "hsv", h: 120, s: 1, v: 1 };
const blue: ColorValue = { space: "hsv", h: 240, s: 1, v: 1 };
const cyan: ColorValue = { space: "hsv", h: 182, s: 1, v: 0.8 };

function entry(id: string, color: ColorValue, name: string): PaletteColor {
  return { id, color, name };
}

function palette(
  colors: readonly PaletteColor[] = [
    entry("red", red, "Red"),
    entry("green", green, "Green"),
    entry("blue", blue, "Blue")
  ]
): Palette {
  return {
    colors,
    kind: "custom",
    provenance: { origin: "manual" }
  };
}

function linkedPalette(seed: ColorValue = red): Palette {
  return createHarmonyPalette({
    seed,
    harmony: { type: "complementary" },
    idFactory: (index) => (index === 0 ? "anchor" : "complement")
  });
}

function part<T extends HTMLElement>(container: ParentNode, name: string): T {
  const element = container.querySelector<T>(`[data-part="${name}"]`);
  if (element === null) throw new Error(`Missing data-part=${name}`);
  return element;
}

function pointerEvent(
  type: string,
  options: { pointerId: number; pointerType: string; clientX: number; clientY: number }
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: options.clientX,
    clientY: options.clientY
  });
  Object.defineProperties(event, {
    pointerId: { value: options.pointerId },
    pointerType: { value: options.pointerType },
    isPrimary: { value: true }
  });
  return event;
}

function unitPointerRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
    toJSON: () => ({})
  };
}

describe("mountColorwheel", () => {
  it("rejects wheel overrides for full-state and injected-controller sources at runtime", () => {
    const container = document.createElement("div");
    const state = createPickerState({ palette: palette() });
    const controller = createPickerController(state);
    const stateOptions = {
      state,
      wheel: { wheelModel: "oklch" }
    } as unknown as NonNullable<Parameters<typeof mountColorwheel>[1]>;
    const controllerOptions = {
      controller,
      controllerOptions: {}
    } as unknown as NonNullable<Parameters<typeof mountColorwheel>[1]>;

    expect(() => mountColorwheel(container, stateOptions)).toThrow(
      "wheel is configured by full-state and injected-controller sources"
    );
    expect(() => mountColorwheel(container, controllerOptions)).toThrow(
      "controllerOptions apply only to adapter-owned controllers"
    );
    controller.destroy();
  });

  it("infers linked interaction for a live wheel recipe unless explicitly overridden", () => {
    const linkedContainer = document.createElement("div");
    const linked = mountColorwheel(linkedContainer, { palette: linkedPalette() });
    expect(linked.controller.getState().wheel.interaction).toBe("linked");

    const freeContainer = document.createElement("div");
    const free = mountColorwheel(freeContainer, {
      palette: linkedPalette(),
      wheel: { interaction: "free" }
    });
    expect(free.controller.getState().wheel.interaction).toBe("free");

    linked.destroy();
    free.destroy();
  });

  it("mounts an editable wheel and palette with stable customization hooks", () => {
    const container = document.createElement("div");
    const instance = mountColorwheel(container, {
      palette: palette(),
      className: "product-picker",
      ariaLabel: "Brand palette",
      unstyled: true
    });

    expect(instance.root).toHaveAttribute("data-colorwheel", "");
    expect(instance.root).toHaveAttribute("data-unstyled", "");
    expect(instance.root).toHaveClass("colorwheel", "product-picker");
    expect(instance.root).toHaveAttribute("aria-label", "Brand palette");
    expect(container.querySelectorAll('[data-part="pointer"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-part="palette-item"]')).toHaveLength(3);
    expect(part(container, "color-input")).not.toBeDisabled();
    expect(part(container, "name-input")).toHaveAccessibleName("Red name");
    const wheel = part(container, "wheel");
    const instructionsId = wheel.getAttribute("aria-describedby");
    expect(instructionsId).toBeTruthy();
    expect(container.querySelector(`#${instructionsId}`)).toHaveAttribute(
      "data-part",
      "wheel-instructions"
    );
    expect(wheel.style.getPropertyValue("--colorwheel-lightness")).toMatch(/%$/);

    instance.destroy();
  });

  it("updates the built-in render tree incrementally while retaining keyed node identity", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const replaceChildren = vi.spyOn(Element.prototype, "replaceChildren");
    const instance = mountColorwheel(container, { palette: palette() });
    const nodes = {
      root: part(container, "root"),
      layout: part(container, "picker-layout"),
      wheelBlock: part(container, "wheel-block"),
      wheel: part(container, "wheel"),
      ring: part(container, "channel-ring"),
      pointer: container.querySelector('[data-part="pointer"][data-color-id="red"]'),
      palette: part(container, "palette"),
      paletteList: part(container, "palette-list"),
      paletteItem: container.querySelector('[data-part="palette-item"][data-color-id="red"]'),
      swatch: container.querySelector('[data-part="swatch"][data-color-id="red"]'),
      colorInput: container.querySelector<HTMLInputElement>(
        '[data-part="color-input"][data-color-id="red"]'
      )
    };
    if (nodes.colorInput === null) throw new Error("Missing red color input");
    nodes.colorInput.focus();

    instance.controller.commands.setColor("red", cyan);

    expect(part(container, "root")).toBe(nodes.root);
    expect(part(container, "picker-layout")).toBe(nodes.layout);
    expect(part(container, "wheel-block")).toBe(nodes.wheelBlock);
    expect(part(container, "wheel")).toBe(nodes.wheel);
    expect(part(container, "channel-ring")).toBe(nodes.ring);
    expect(container.querySelector('[data-part="pointer"][data-color-id="red"]')).toBe(
      nodes.pointer
    );
    expect(part(container, "palette")).toBe(nodes.palette);
    expect(part(container, "palette-list")).toBe(nodes.paletteList);
    expect(container.querySelector('[data-part="palette-item"][data-color-id="red"]')).toBe(
      nodes.paletteItem
    );
    expect(container.querySelector('[data-part="swatch"][data-color-id="red"]')).toBe(nodes.swatch);
    expect(container.querySelector('[data-part="color-input"][data-color-id="red"]')).toBe(
      nodes.colorInput
    );
    expect(nodes.colorInput).toHaveValue(formatColor(cyan, { format: "hex" }));
    expect(document.activeElement).toBe(nodes.colorInput);

    instance.controller.commands.reorderColor("blue", 0);
    expect(container.querySelector('[data-part="palette-item"][data-color-id="red"]')).toBe(
      nodes.paletteItem
    );
    expect(replaceChildren).not.toHaveBeenCalled();

    instance.destroy();
    replaceChildren.mockRestore();
    container.remove();
  });

  it("renders a model-aware channel ring around the unchanged wheel and supports omission", () => {
    const container = document.createElement("div");
    const instance = mountColorwheel(container, {
      palette: palette([entry("tone", { space: "hsv", h: 28, s: 0.6, v: 0.4 }, "Tone")])
    });

    let frame = part<HTMLElement>(container, "wheel-frame");
    let wheel = part<HTMLElement>(container, "wheel");
    let ring = part<HTMLElement>(container, "channel-ring");
    expect(frame).toContainElement(wheel);
    expect(frame).toContainElement(ring);
    expect(frame).toHaveAttribute("data-ring", "true");
    expect(ring).toHaveAttribute("role", "slider");
    expect(ring).toHaveAccessibleName("Tone value ring");
    expect(ring).toHaveAttribute("aria-valuemin", "0");
    expect(ring).toHaveAttribute("aria-valuemax", "100");
    expect(ring).toHaveAttribute("aria-valuenow", "40");
    expect(ring).toHaveAttribute("aria-valuetext", "40 percent");
    expect(ring).toHaveAttribute("aria-orientation", "vertical");
    expect(ring).not.toHaveAttribute("aria-disabled");
    expect(ring).toHaveAttribute("data-channel", "value");
    expect(ring).toHaveAttribute("data-model", "hsv");
    expect(ring).toHaveAttribute("data-side", "right");
    const initialRingPoint = wheelChannelValueToRingPoint(0.4);
    expect(
      Number.parseFloat(frame.style.getPropertyValue("--colorwheel-channel-ring-y"))
    ).toBeCloseTo(initialRingPoint.y * 100);
    expect(
      Number.parseFloat(frame.style.getPropertyValue("--colorwheel-channel-ring-angle"))
    ).toBeCloseTo(Math.atan2(initialRingPoint.y - 0.5, initialRingPoint.x - 0.5));
    expect(frame.style.getPropertyValue("--colorwheel-channel-start")).not.toBe("");
    expect(frame.style.getPropertyValue("--colorwheel-channel-mid")).not.toBe("");
    expect(frame.style.getPropertyValue("--colorwheel-channel-end")).not.toBe("");
    expect(frame.style.getPropertyValue("--colorwheel-channel-color")).not.toBe("");
    expect(ring.querySelector('[data-part="channel-ring-track"]')).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(ring.querySelector('[data-part="channel-ring-thumb"]')).toHaveAttribute(
      "aria-hidden",
      "true"
    );

    instance.update({ blockProps: { wheel: { showChannelRing: false } } });
    frame = part(container, "wheel-frame");
    wheel = part(container, "wheel");
    expect(frame).toContainElement(wheel);
    expect(frame).toHaveAttribute("data-ring", "false");
    expect(container.querySelector('[data-part="channel-ring"]')).toBeNull();

    instance.setState(
      createPickerState({
        palette: palette([entry("tone", { space: "oklch", l: 0.63, c: 0.12, h: 210 }, "Tone")]),
        wheel: { wheelModel: "oklch", interaction: "free" }
      })
    );
    instance.update({ blockProps: undefined });
    ring = part(container, "channel-ring");
    expect(ring).toHaveAccessibleName("Tone lightness ring");
    expect(ring).toHaveAttribute("aria-valuenow", "63");
    expect(ring).toHaveAttribute("data-channel", "lightness");
    expect(ring).toHaveAttribute("data-model", "oklch");

    instance.destroy();
  });

  it("edits the channel ring from the keyboard and preserves focus and model channels", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const changes: ChangeMeta[] = [];
    const instance = mountColorwheel(container, {
      palette: palette([
        entry("tone", { space: "hsv", h: 28, s: 0.6, v: 0.4, alpha: 0.35 }, "Tone")
      ]),
      onChange: (_state, meta) => changes.push(meta)
    });

    let ring = part<HTMLElement>(container, "channel-ring");
    ring.focus();
    ring.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));

    ring = part(container, "channel-ring");
    expect(document.activeElement).toBe(ring);
    expect(ring).toHaveAttribute("aria-valuenow", "41");
    expect(convertColor(instance.controller.getPalette().colors[0]?.color ?? red, "hsv")).toEqual({
      space: "hsv",
      h: 28,
      s: 0.6,
      v: 0.41,
      alpha: 0.35
    });

    ring.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true, bubbles: true })
    );
    ring = part(container, "channel-ring");
    expect(ring).toHaveAttribute("aria-valuenow", "31");
    ring.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(
      convertColor(instance.controller.getPalette().colors[0]?.color ?? red, "hsv")
    ).toMatchObject({ h: 28, s: 0.6, v: 1, alpha: 0.35 });
    expect(changes).toEqual([
      expect.objectContaining({ action: "keyboard", phase: "commit" }),
      expect.objectContaining({ action: "keyboard", phase: "commit" }),
      expect.objectContaining({ action: "keyboard", phase: "commit" })
    ]);

    instance.destroy();
    container.remove();
  });

  it("targets the linked anchor from the channel ring and reflects locked editability", () => {
    const container = document.createElement("div");
    const instance = mountColorwheel(container, {
      palette: linkedPalette(cyan),
      wheel: { interaction: "linked" }
    });

    container
      .querySelector<HTMLButtonElement>('[data-part="swatch"][data-color-id="complement"]')
      ?.click();
    expect(instance.controller.getState().activeColorId).toBe("complement");
    let ring = part<HTMLElement>(container, "channel-ring");
    expect(ring).toHaveAttribute("data-color-id", "anchor");
    expect(ring).toHaveAccessibleName("Color 1 value ring");
    expect(ring).not.toHaveAttribute("aria-disabled");
    expect(ring.tabIndex).toBe(0);

    const complementBefore = instance.controller.getPalette().colors[1]?.color;
    ring.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(instance.controller.getState().activeColorId).toBe("anchor");
    expect(convertColor(instance.controller.getPalette().colors[0]?.color ?? red, "hsv").v).toBe(0);
    expect(instance.controller.getPalette().colors[1]?.color).not.toBe(complementBefore);

    ring = part(container, "channel-ring");
    expect(
      part<HTMLElement>(container, "wheel-frame").style.getPropertyValue("--colorwheel-channel-end")
    ).toBe(
      formatColor(
        { space: "hsv", h: 182, s: 1, v: 1 },
        {
          format: "rgb",
          alpha: "never"
        }
      )
    );
    ring.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(instance.controller.getPalette().recipe?.seed).toEqual({
      space: "hsv",
      h: 182,
      s: 1,
      v: 0.01
    });
    const recovered = instance.controller.getPalette().colors[0]?.color;
    expect(recovered).toBeDefined();
    if (recovered !== undefined) {
      expect(convertColor(recovered, "hsv").s).toBeGreaterThan(0.9);
      expect(formatColor(recovered, { format: "hex", alpha: "never" })).not.toBe("#030303");
    }

    instance.controller.commands.setLocked("anchor", true);
    ring = part(container, "channel-ring");
    expect(ring).toHaveAttribute("aria-disabled", "true");
    expect(ring.tabIndex).toBe(-1);
    const anchorBefore = instance.controller.getPalette().colors[0]?.color;
    ring.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(instance.controller.getPalette().colors[0]?.color).toBe(anchorBefore);

    instance.destroy();
  });

  it("maps channel-ring pointer gestures through one transaction", () => {
    const container = document.createElement("div");
    const changes: Array<{ phase: string; transactionId?: string }> = [];
    const instance = mountColorwheel(container, {
      palette: palette([
        entry("tone", { space: "hsv", h: 28, s: 0.6, v: 0.8, alpha: 0.35 }, "Tone")
      ]),
      onChange: (_state, meta) => changes.push(meta)
    });
    const ring = part<HTMLElement>(container, "channel-ring");
    const root = part<HTMLElement>(container, "root");
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    ring.getBoundingClientRect = unitPointerRect;
    root.setPointerCapture = setPointerCapture;
    root.hasPointerCapture = () => true;
    root.releasePointerCapture = releasePointerCapture;

    ring.dispatchEvent(
      pointerEvent("pointerdown", {
        pointerId: 11,
        pointerType: "touch",
        clientX: 100,
        clientY: 50
      })
    );
    expect(part(container, "channel-ring")).toBe(ring);
    expect(part(container, "root")).toBe(root);
    document.dispatchEvent(
      pointerEvent("pointermove", {
        pointerId: 11,
        pointerType: "touch",
        clientX: 50,
        clientY: 0
      })
    );
    document.dispatchEvent(
      pointerEvent("pointerup", {
        pointerId: 11,
        pointerType: "touch",
        clientX: 50,
        clientY: 100
      })
    );

    expect(convertColor(instance.controller.getPalette().colors[0]?.color ?? red, "hsv")).toEqual({
      space: "hsv",
      h: 28,
      s: 0.6,
      v: 0,
      alpha: 0.35
    });
    expect(changes.map((meta) => meta.phase)).toEqual([
      "start",
      "update",
      "update",
      "update",
      "commit"
    ]);
    expect(new Set(changes.map((meta) => meta.transactionId)).size).toBe(1);
    expect(changes[0]?.transactionId).toBeTruthy();
    expect(setPointerCapture).toHaveBeenCalledWith(11);
    expect(releasePointerCapture).toHaveBeenCalledWith(11);

    instance.destroy();
  });

  it("keeps the channel-ring thumb on the pointer side with center hysteresis", () => {
    const container = document.createElement("div");
    const instance = mountColorwheel(container, {
      palette: palette([entry("tone", { space: "hsv", h: 28, s: 0.6, v: 0.5 }, "Tone")])
    });
    const root = part<HTMLElement>(container, "root");
    root.setPointerCapture = vi.fn();
    root.hasPointerCapture = () => false;
    const ring = part<HTMLElement>(container, "channel-ring");
    ring.getBoundingClientRect = unitPointerRect;

    ring.dispatchEvent(
      pointerEvent("pointerdown", {
        pointerId: 12,
        pointerType: "touch",
        clientX: 0,
        clientY: 50
      })
    );
    let frame = part<HTMLElement>(container, "wheel-frame");
    expect(part(container, "channel-ring")).toHaveAttribute("data-side", "left");
    expect(
      Number.parseFloat(frame.style.getPropertyValue("--colorwheel-channel-ring-x"))
    ).toBeLessThan(50);

    document.dispatchEvent(
      pointerEvent("pointermove", {
        pointerId: 12,
        pointerType: "touch",
        clientX: 50,
        clientY: 25
      })
    );
    frame = part(container, "wheel-frame");
    expect(part(container, "channel-ring")).toHaveAttribute("data-side", "left");
    expect(
      Number.parseFloat(frame.style.getPropertyValue("--colorwheel-channel-ring-x"))
    ).toBeLessThan(50);

    document.dispatchEvent(
      pointerEvent("pointermove", {
        pointerId: 12,
        pointerType: "touch",
        clientX: 60,
        clientY: 25
      })
    );
    frame = part(container, "wheel-frame");
    expect(part(container, "channel-ring")).toHaveAttribute("data-side", "right");
    expect(
      Number.parseFloat(frame.style.getPropertyValue("--colorwheel-channel-ring-x"))
    ).toBeGreaterThan(50);
    document.dispatchEvent(
      pointerEvent("pointerup", {
        pointerId: 12,
        pointerType: "touch",
        clientX: 60,
        clientY: 25
      })
    );

    instance.destroy();
  });

  it("ends the active transaction when stable-root pointer capture is lost", () => {
    const container = document.createElement("div");
    const changes: Array<{ phase: string; transactionId?: string }> = [];
    const instance = mountColorwheel(container, {
      palette: palette([entry("tone", { space: "hsv", h: 28, s: 0.6, v: 0.5 }, "Tone")]),
      onChange: (_state, meta) => changes.push(meta)
    });
    const root = part<HTMLElement>(container, "root");
    root.setPointerCapture = vi.fn();
    root.hasPointerCapture = () => false;
    const ring = part<HTMLElement>(container, "channel-ring");
    ring.getBoundingClientRect = unitPointerRect;

    ring.dispatchEvent(
      pointerEvent("pointerdown", {
        pointerId: 13,
        pointerType: "touch",
        clientX: 50,
        clientY: 0
      })
    );
    root.dispatchEvent(
      pointerEvent("lostpointercapture", {
        pointerId: 13,
        pointerType: "touch",
        clientX: 50,
        clientY: 0
      })
    );
    document.dispatchEvent(
      pointerEvent("pointermove", {
        pointerId: 13,
        pointerType: "touch",
        clientX: 50,
        clientY: 100
      })
    );
    document.dispatchEvent(
      pointerEvent("pointerup", {
        pointerId: 13,
        pointerType: "touch",
        clientX: 50,
        clientY: 100
      })
    );

    expect(changes.map((meta) => meta.phase)).toEqual(["start", "update", "commit"]);
    expect(new Set(changes.map((meta) => meta.transactionId)).size).toBe(1);
    expect(changes[0]?.transactionId).toBeTruthy();

    instance.destroy();
  });

  it("configures compact built-in blocks without replacing DOM adapter behavior", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onPaletteChange = vi.fn();
    const wheelBlock: ColorwheelWheelBlockProps = {
      title: "Harmony wheel",
      description: "Move a handle to edit its color.",
      showInstructions: false,
      showChannels: false
    };
    const paletteBlock: ColorwheelPaletteBlockProps = {
      title: "Brand palette",
      description: "Select a swatch or enter a color value.",
      showName: false,
      showActions: false,
      allowAdd: false
    };
    const blockProps: ColorwheelBlockProps = { wheel: wheelBlock, palette: paletteBlock };
    const instance = mountColorwheel(container, {
      palette: linkedPalette(),
      wheel: { interaction: "linked" },
      blockProps,
      onPaletteChange
    });

    const wheelBlockElement = part(container, "wheel-block");
    const paletteBlockElement = part(container, "palette");
    expect(part(container, "block-title")).toHaveTextContent("Harmony wheel");
    expect(paletteBlockElement.querySelector('[data-part="block-title"]')).toHaveTextContent(
      "Brand palette"
    );
    expect(wheelBlockElement).toHaveAccessibleDescription("Move a handle to edit its color.");
    expect(paletteBlockElement).toHaveAccessibleDescription(
      "Select a swatch or enter a color value."
    );
    expect(container.querySelectorAll('[data-part="block-description"]')).toHaveLength(2);

    const wheel = part(container, "wheel");
    expect(wheel).not.toHaveAttribute("aria-describedby");
    expect(container.querySelector('[data-part="wheel-instructions"]')).toBeNull();
    expect(container.querySelector('[data-part="channels"]')).toBeNull();
    expect(container.querySelector('[data-part="name-input"]')).toBeNull();
    expect(container.querySelector('[data-part="palette-item-actions"]')).toBeNull();
    expect(container.querySelector('[data-part="add-color"]')).toBeNull();

    const colorInputs = [
      ...container.querySelectorAll<HTMLInputElement>('[data-part="color-input"]')
    ];
    expect(colorInputs).toHaveLength(2);
    expect(colorInputs[0]).not.toBeDisabled();
    expect(colorInputs[1]).toBeDisabled();
    expect(container.querySelectorAll('[data-part="anchor-mark"]')).toHaveLength(1);
    expect(part(container, "anchor-mark")).toHaveTextContent("Anchor");

    const anchorInput = colorInputs[0];
    if (anchorInput === undefined) throw new Error("Missing anchor color input");
    anchorInput.value = "#00ffff";
    anchorInput.dispatchEvent(new Event("change", { bubbles: true }));
    const updatedAnchor = convertColor(
      instance.controller.getPalette().colors[0]?.color ?? red,
      "srgb"
    );
    expect(updatedAnchor.r).toBeCloseTo(0);
    expect(updatedAnchor.g).toBeCloseTo(1);
    expect(updatedAnchor.b).toBeCloseTo(1);
    expect(onPaletteChange).toHaveBeenCalledOnce();

    instance.destroy();
    container.remove();
  });

  it("keeps linked editability, channel state, and the anchor marker in sync", () => {
    const container = document.createElement("div");
    const onPaletteChange = vi.fn();
    const instance = mountColorwheel(container, {
      palette: linkedPalette(),
      wheel: { interaction: "linked" },
      onPaletteChange
    });

    const colorInput = (colorId: string): HTMLInputElement => {
      const input = container.querySelector<HTMLInputElement>(
        `[data-part="color-input"][data-color-id="${colorId}"]`
      );
      if (input === null) throw new Error(`Missing ${colorId} color input`);
      return input;
    };
    const anchorMarkerColorId = (): string | undefined =>
      container
        .querySelector('[data-part="anchor-mark"]')
        ?.closest<HTMLElement>('[data-part="swatch"]')?.dataset.colorId;

    expect(colorInput("anchor")).not.toBeDisabled();
    expect(colorInput("complement")).toBeDisabled();
    expect(container.querySelectorAll('[data-part="name-input"]')).toHaveLength(2);
    expect(anchorMarkerColorId()).toBe("anchor");

    const originalComplement = instance.controller.getPalette().colors[1]?.color;
    const disabledComplement = colorInput("complement");
    disabledComplement.value = "#ffffff";
    expect(() =>
      disabledComplement.dispatchEvent(new Event("change", { bubbles: true }))
    ).not.toThrow();
    expect(instance.controller.getPalette().colors[1]?.color).toBe(originalComplement);
    expect(onPaletteChange).not.toHaveBeenCalled();

    container
      .querySelector<HTMLButtonElement>('[data-part="swatch"][data-color-id="complement"]')
      ?.click();
    expect(
      [...container.querySelectorAll<HTMLInputElement>('[data-part="channel-input"]')].every(
        (input) => input.disabled
      )
    ).toBe(true);

    instance.controller.commands.setAnchor("complement");
    expect(anchorMarkerColorId()).toBe("complement");
    expect(colorInput("anchor")).toBeDisabled();
    expect(colorInput("complement")).not.toBeDisabled();
    expect(
      [...container.querySelectorAll<HTMLInputElement>('[data-part="channel-input"]')].every(
        (input) => !input.disabled
      )
    ).toBe(true);

    instance.controller.commands.setLocked("complement", true);
    expect(colorInput("complement")).toBeDisabled();
    instance.controller.commands.setWheelOptions({ interaction: "free" });
    expect(colorInput("anchor")).not.toBeDisabled();
    expect(colorInput("complement")).toBeDisabled();
    instance.controller.commands.setLocked("complement", false);
    expect(colorInput("complement")).not.toBeDisabled();

    instance.destroy();
  });

  it("updates and restores built-in block presentation", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const instance = mountColorwheel(container, { palette: palette() });

    expect(container.querySelector('[data-part="wheel-instructions"]')).not.toBeNull();
    expect(container.querySelector('[data-part="channels"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-part="name-input"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-part="palette-item-actions"]')).toHaveLength(3);
    expect(container.querySelector('[data-part="add-color"]')).not.toBeNull();

    instance.update({
      blockProps: {
        wheel: {
          title: "Compact wheel",
          description: "Compact wheel description",
          showInstructions: false,
          showChannels: false
        },
        palette: {
          title: "Compact palette",
          description: "Compact palette description",
          showName: false,
          showActions: false,
          allowAdd: false
        }
      }
    });

    expect(container.querySelector('[data-part="wheel-instructions"]')).toBeNull();
    expect(container.querySelector('[data-part="channels"]')).toBeNull();
    expect(container.querySelector('[data-part="name-input"]')).toBeNull();
    expect(container.querySelector('[data-part="palette-item-actions"]')).toBeNull();
    expect(container.querySelector('[data-part="add-color"]')).toBeNull();
    expect(part(container, "wheel-block")).toHaveAccessibleDescription("Compact wheel description");
    expect(part(container, "palette")).toHaveAccessibleDescription("Compact palette description");

    instance.update({ blockProps: undefined });

    expect(container.querySelector('[data-part="wheel-instructions"]')).not.toBeNull();
    expect(container.querySelector('[data-part="channels"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-part="name-input"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-part="palette-item-actions"]')).toHaveLength(3);
    expect(container.querySelector('[data-part="add-color"]')).not.toBeNull();
    expect(part(container, "wheel-block")).not.toHaveAttribute("aria-describedby");
    expect(part(container, "palette")).not.toHaveAttribute("aria-describedby");

    instance.destroy();
    container.remove();
  });

  it("renders harmony lines between wheel handles using matching geometry", () => {
    const container = document.createElement("div");
    const instance = mountColorwheel(container, { palette: palette() });
    const wheel = part(container, "wheel");
    const pointers = [...wheel.querySelectorAll<HTMLElement>('[data-part="pointer"]')];
    const harmony = wheel.querySelector<SVGSVGElement>('[data-part="harmony-lines"]');
    if (harmony === null) throw new Error("Missing harmony lines");
    const lines = [...harmony.querySelectorAll("line")];

    expect(harmony).toHaveAttribute("viewBox", "0 0 100 100");
    expect(harmony).toHaveAttribute("aria-hidden", "true");
    expect(lines).toHaveLength(pointers.length);
    lines.forEach((line, index) => {
      const current = pointers[index];
      const next = pointers[(index + 1) % pointers.length];
      if (current === undefined || next === undefined) throw new Error("Missing wheel pointer");
      expect(Number(line.getAttribute("x1"))).toBeCloseTo(
        Number.parseFloat(current.style.getPropertyValue("--colorwheel-pointer-x"))
      );
      expect(Number(line.getAttribute("y1"))).toBeCloseTo(
        Number.parseFloat(current.style.getPropertyValue("--colorwheel-pointer-y"))
      );
      expect(Number(line.getAttribute("x2"))).toBeCloseTo(
        Number.parseFloat(next.style.getPropertyValue("--colorwheel-pointer-x"))
      );
      expect(Number(line.getAttribute("y2"))).toBeCloseTo(
        Number.parseFloat(next.style.getPropertyValue("--colorwheel-pointer-y"))
      );
    });

    instance.setPalette(palette([entry("red", red, "Red")]));
    expect(container.querySelector('[data-part="harmony-lines"]')).toBeNull();

    instance.destroy();
  });

  it("preserves node identity and semantic focus through palette and channel updates", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const instance = mountColorwheel(container, { palette: palette() });
    const originalSwatch = container.querySelector<HTMLButtonElement>(
      '[data-part="swatch"][data-color-id="green"]'
    );
    if (originalSwatch === null) throw new Error("Missing green swatch");

    originalSwatch.focus();
    originalSwatch.click();

    const renderedSwatch = container.querySelector<HTMLButtonElement>(
      '[data-part="swatch"][data-color-id="green"]'
    );
    expect(renderedSwatch).toBe(originalSwatch);
    expect(document.activeElement).toBe(renderedSwatch);

    const originalRange = container.querySelector<HTMLInputElement>(
      '[data-part="channel-input"][data-color-id="green"][data-channel="hue"]'
    );
    if (originalRange === null) throw new Error("Missing green hue range");
    originalRange.focus();
    originalRange.value = "180";
    originalRange.dispatchEvent(new Event("change", { bubbles: true }));

    const renderedRange = container.querySelector<HTMLInputElement>(
      '[data-part="channel-input"][data-color-id="green"][data-channel="hue"]'
    );
    expect(renderedRange).toBe(originalRange);
    expect(document.activeElement).toBe(renderedRange);
    expect(renderedRange).toHaveAccessibleName("Green hue");

    instance.destroy();
    container.remove();
  });

  it("moves focus to the nearest swatch or add control after removal", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const instance = mountColorwheel(container, { palette: palette() });
    const removeGreen = container.querySelector<HTMLButtonElement>(
      '[data-action="remove"][data-color-id="green"]'
    );
    if (removeGreen === null) throw new Error("Missing green remove button");

    removeGreen.focus();
    removeGreen.click();
    expect(document.activeElement).toBe(
      container.querySelector('[data-part="swatch"][data-color-id="blue"]')
    );

    for (const colorId of ["blue", "red"]) {
      const remove = container.querySelector<HTMLButtonElement>(
        `[data-action="remove"][data-color-id="${colorId}"]`
      );
      if (remove === null) throw new Error(`Missing ${colorId} remove button`);
      remove.focus();
      remove.click();
    }
    expect(document.activeElement).toBe(container.querySelector('[data-part="add-color"]'));

    instance.destroy();
    container.remove();
  });

  it("applies external palette updates without callback echo", () => {
    const container = document.createElement("div");
    const onChange = vi.fn();
    const onPaletteChange = vi.fn();
    const instance = mountColorwheel(container, {
      palette: palette(),
      onChange,
      onPaletteChange
    });
    const next = palette([entry("violet", { space: "hsv", h: 280, s: 0.8, v: 0.9 }, "Violet")]);

    instance.setPalette(next);

    expect(instance.controller.getPalette()).toBe(next);
    expect(container.querySelectorAll('[data-part="palette-item"]')).toHaveLength(1);
    expect(container.textContent).toContain("Violet");
    expect(onChange).not.toHaveBeenCalled();
    expect(onPaletteChange).not.toHaveBeenCalled();
    instance.destroy();
  });

  it("edits a color through the CSS text alternative and reports invalid input", () => {
    const container = document.createElement("div");
    const onPaletteChange = vi.fn();
    const instance = mountColorwheel(container, { palette: palette(), onPaletteChange });
    let input = part<HTMLInputElement>(container, "color-input");
    input.value = "#00ffff";
    input.dispatchEvent(new Event("change", { bubbles: true }));

    const updated = instance.controller.getPalette().colors[0];
    expect(updated?.color).toMatchObject({ space: "srgb", r: 0, g: 1, b: 1 });
    expect(onPaletteChange).toHaveBeenCalledOnce();

    input = part<HTMLInputElement>(container, "color-input");
    input.value = "not-a-color";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(input).toHaveAttribute("aria-invalid", "true");
    const error = container.querySelector<HTMLElement>("[data-part='field-error']");
    if (error === null) throw new Error("Missing actionable color error");
    expect(error).toHaveAttribute("role", "alert");
    expect(error).toHaveTextContent("Enter a supported CSS color.");
    expect(input).toHaveAttribute("aria-describedby", error.id);
    expect(instance.controller.getPalette().colors[0]?.color).toBe(updated?.color);
    expect(onPaletteChange).toHaveBeenCalledOnce();

    instance.controller.commands.setActive("green");
    input = part<HTMLInputElement>(container, "color-input");
    expect(input.value).toBe("not-a-color");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(container.querySelector("[data-part='field-error']")).toHaveTextContent(
      "Enter a supported CSS color."
    );

    input.value = "#123";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    instance.controller.commands.setActive("blue");
    input = part<HTMLInputElement>(container, "color-input");
    expect(input.value).toBe("#123");
    expect(input).not.toHaveAttribute("aria-invalid");
    instance.destroy();
  });

  it("retains color-input focus while Enter commits or validates and Escape cancels", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onPaletteChange = vi.fn();
    const instance = mountColorwheel(container, { palette: palette(), onPaletteChange });
    const input = part<HTMLInputElement>(container, "color-input");
    input.focus();
    input.value = "#00ffff";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    );

    expect(document.activeElement).toBe(input);
    expect(part<HTMLInputElement>(container, "color-input")).toBe(input);
    expect(input).toHaveValue("#00ffff");
    expect(onPaletteChange).toHaveBeenCalledOnce();

    input.blur();
    expect(onPaletteChange).toHaveBeenCalledOnce();
    input.focus();
    input.value = "not-a-color";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    );

    expect(document.activeElement).toBe(input);
    expect(input).toHaveAttribute("aria-invalid", "true");
    const error = part<HTMLElement>(container, "field-error");
    expect(input).toHaveAttribute("aria-describedby", error.id);
    expect(error).toHaveAttribute("role", "alert");
    expect(onPaletteChange).toHaveBeenCalledOnce();

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    );
    expect(document.activeElement).toBe(input);
    expect(input).toHaveValue("#00ffff");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(container.querySelector('[data-part="field-error"]')).toBeNull();
    expect(onPaletteChange).toHaveBeenCalledOnce();

    instance.destroy();
    container.remove();
  });

  it("supports wheel keyboard editing without treating selection as a palette change", () => {
    const container = document.createElement("div");
    const onChange = vi.fn();
    const onPaletteChange = vi.fn();
    const instance = mountColorwheel(container, { palette: palette(), onChange, onPaletteChange });
    const greenSwatch = container.querySelector<HTMLButtonElement>(
      '[data-part="swatch"][data-color-id="green"]'
    );
    greenSwatch?.click();
    expect(instance.controller.getState().activeColorId).toBe("green");
    expect(onChange).toHaveBeenCalledOnce();
    expect(onPaletteChange).not.toHaveBeenCalled();

    const handle = container.querySelector<HTMLButtonElement>(
      '[data-part="pointer"][data-color-id="green"]'
    );
    handle?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const hsv = convertColor(instance.controller.getPalette().colors[1]?.color ?? green, "hsv");
    expect(hsv.h).toBe(121);
    expect(onPaletteChange).toHaveBeenCalledOnce();
    expect(onPaletteChange.mock.calls[0]?.[1]).toMatchObject({
      action: "keyboard",
      phase: "commit"
    });
    instance.destroy();
  });

  it("commits inactive-handle selection outside paired pointer and keyboard edits", () => {
    const container = document.createElement("div");
    const changes: ChangeMeta[] = [];
    const instance = mountColorwheel(container, {
      palette: palette(),
      onChange: (_state, meta) => changes.push(meta)
    });
    const root = part<HTMLElement>(container, "root");
    const wheel = part<HTMLElement>(container, "wheel");
    const bluePointer = container.querySelector<HTMLButtonElement>(
      '[data-part="pointer"][data-color-id="blue"]'
    );
    if (bluePointer === null) throw new Error("Missing blue pointer");
    wheel.getBoundingClientRect = unitPointerRect;
    root.setPointerCapture = vi.fn();
    root.hasPointerCapture = () => false;

    bluePointer.dispatchEvent(
      pointerEvent("pointerdown", {
        pointerId: 17,
        pointerType: "touch",
        clientX: 100,
        clientY: 50
      })
    );
    document.dispatchEvent(
      pointerEvent("pointermove", {
        pointerId: 17,
        pointerType: "touch",
        clientX: 50,
        clientY: 100
      })
    );
    document.dispatchEvent(
      pointerEvent("pointerup", {
        pointerId: 17,
        pointerType: "touch",
        clientX: 0,
        clientY: 50
      })
    );

    const selection = changes.filter((meta) => meta.action === "selection");
    const pointer = changes.filter((meta) => meta.action === "pointer");
    expect(selection).toHaveLength(1);
    expect(selection[0]).toMatchObject({ phase: "commit", changedColorIds: [] });
    expect(selection[0]?.transactionId).toBeUndefined();
    expect(pointer.map((meta) => meta.phase)).toEqual([
      "start",
      "update",
      "update",
      "update",
      "commit"
    ]);
    expect(pointer[0]?.changedColorIds).toEqual([]);
    expect(pointer.slice(1).every((meta) => meta.changedColorIds.includes("blue"))).toBe(true);
    expect(pointer[0]?.transactionId).toBeTruthy();
    expect(new Set(pointer.map((meta) => meta.transactionId))).toEqual(
      new Set([pointer[0]?.transactionId])
    );

    instance.controller.commands.setActive("red");
    changes.length = 0;
    bluePointer.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    expect(
      changes.map(({ action, phase, transactionId }) => ({
        action,
        phase,
        transactionId
      }))
    ).toEqual([
      { action: "selection", phase: "commit", transactionId: undefined },
      { action: "keyboard", phase: "commit", transactionId: undefined }
    ]);

    instance.destroy();
  });

  it("represents the complete accepted OKLCH chroma range", () => {
    const container = document.createElement("div");
    const vivid = palette([entry("vivid", { space: "oklch", l: 0.7, c: 0.5, h: 40 }, "Vivid")]);
    const instance = mountColorwheel(container, {
      palette: vivid,
      wheel: { wheelModel: "oklch", interaction: "free" }
    });

    const chroma = container.querySelector<HTMLInputElement>(
      '[data-part="channel-input"][data-channel="chroma"]'
    );
    expect(chroma).not.toBeNull();
    expect(chroma?.max).toBe("0.5");
    expect(chroma?.value).toBe("0.5");

    const handle = container.querySelector<HTMLButtonElement>(
      '[data-part="pointer"][data-color-id="vivid"]'
    );
    handle?.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    const updatedHandle = container.querySelector<HTMLButtonElement>(
      '[data-part="pointer"][data-color-id="vivid"]'
    );
    updatedHandle?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(instance.controller.getPalette().colors[0]?.color).toMatchObject({
      space: "oklch",
      c: 0.5
    });

    instance.destroy();
  });

  it("maps mouse and touch pointer interactions and releases pointer capture", () => {
    const container = document.createElement("div");
    const instance = mountColorwheel(container, { palette: palette() });
    const surface = part<HTMLElement>(container, "wheel");
    const root = part<HTMLElement>(container, "root");
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    surface.getBoundingClientRect = unitPointerRect;
    root.setPointerCapture = setPointerCapture;
    root.hasPointerCapture = () => true;
    root.releasePointerCapture = releasePointerCapture;

    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        pointerId: 7,
        pointerType: "touch",
        clientX: 100,
        clientY: 50
      })
    );
    document.dispatchEvent(
      pointerEvent("pointermove", {
        pointerId: 7,
        pointerType: "touch",
        clientX: 50,
        clientY: 100
      })
    );
    document.dispatchEvent(
      pointerEvent("pointerup", {
        pointerId: 7,
        pointerType: "touch",
        clientX: 50,
        clientY: 100
      })
    );

    const hsv = convertColor(instance.controller.getPalette().colors[0]?.color ?? red, "hsv");
    expect(hsv).toMatchObject({ h: 180, s: 1 });
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    instance.destroy();
  });

  it("keeps custom palette renderers mounted and updates their live context", () => {
    const container = document.createElement("div");
    const cleanup = vi.fn();
    const node = document.createElement("aside");
    let mountedContext: { readonly state: ReturnType<typeof createPickerState> } | undefined;
    const update = vi.fn(() => {
      const state = mountedContext?.state;
      if (state !== undefined) {
        node.textContent = `${state.palette.colors.length} custom colors, ${state.activeColorId} active`;
      }
    });
    const renderPalette = vi.fn((context: { state: ReturnType<typeof createPickerState> }) => {
      mountedContext = context;
      node.dataset.part = "custom-palette";
      update();
      return { node, update, destroy: cleanup };
    });
    const instance = mountColorwheel(container, { palette: palette(), renderPalette });

    expect(part(container, "custom-palette")).toHaveTextContent("3 custom colors, red active");
    expect(container.querySelector('[data-part="palette-list"]')).toBeNull();
    instance.controller.commands.setActive("green");
    expect(part(container, "custom-palette")).toBe(node);
    expect(part(container, "custom-palette")).toHaveTextContent("3 custom colors, green active");
    expect(mountedContext?.state.activeColorId).toBe("green");
    expect(renderPalette).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledTimes(2);
    expect(cleanup).not.toHaveBeenCalled();
    instance.destroy();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("replaces a custom palette only when its renderer identity changes", () => {
    const container = document.createElement("div");
    const firstNode = document.createElement("aside");
    firstNode.dataset.part = "first-custom-palette";
    const secondNode = document.createElement("aside");
    secondNode.dataset.part = "second-custom-palette";
    const firstCleanup = vi.fn();
    const secondCleanup = vi.fn();
    const firstRenderer = vi.fn(() => ({ node: firstNode, destroy: firstCleanup }));
    const secondRenderer = vi.fn(() => ({ node: secondNode, destroy: secondCleanup }));
    const instance = mountColorwheel(container, {
      palette: palette(),
      renderPalette: firstRenderer
    });

    instance.update({ className: "updated" });
    expect(firstRenderer).toHaveBeenCalledOnce();
    expect(firstCleanup).not.toHaveBeenCalled();
    expect(part(container, "first-custom-palette")).toBe(firstNode);

    instance.update({ renderPalette: secondRenderer });
    expect(firstCleanup).toHaveBeenCalledOnce();
    expect(firstNode.isConnected).toBe(false);
    expect(secondRenderer).toHaveBeenCalledOnce();
    expect(part(container, "second-custom-palette")).toBe(secondNode);

    instance.destroy();
    expect(firstCleanup).toHaveBeenCalledOnce();
    expect(secondCleanup).toHaveBeenCalledOnce();
  });

  it("keeps injected controllers and sibling instances isolated", () => {
    const firstContainer = document.createElement("div");
    const secondContainer = document.createElement("div");
    const external = createPickerController(createPickerState({ palette: palette() }));
    const first = mountColorwheel(firstContainer, { controller: external });
    const second = mountColorwheel(secondContainer, { palette: palette() });

    first.controller.commands.setName("red", "Crimson");
    expect(firstContainer.textContent).toContain("Crimson");
    expect(secondContainer.textContent).toContain("Red");
    expect(secondContainer.textContent).not.toContain("Crimson");

    first.destroy();
    expect(() => external.commands.setName("green", "Mint")).not.toThrow();
    second.destroy();
  });

  it("accepts iframe-owned hosts, events, and renderer nodes from another realm", () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const frameDocument = frame.contentDocument;
    const frameWindow = frame.contentWindow;
    if (frameDocument === null || frameWindow === null) throw new Error("Missing iframe realm");
    const container = frameDocument.createElement("div");
    frameDocument.body.append(container);
    const customPalette = document.createElement("aside");
    customPalette.dataset.part = "cross-realm-palette";

    const instance = mountColorwheel(container, {
      palette: palette(),
      renderPalette: () => customPalette
    });
    expect(container.querySelector('[data-part="cross-realm-palette"]')).toBe(customPalette);

    instance.update({ renderPalette: undefined });
    const input = container.querySelector<HTMLInputElement>(
      '[data-part="color-input"][data-color-id="red"]'
    );
    if (input === null) throw new Error("Missing iframe color input");
    input.value = "#00ffff";
    const FrameEvent = (frameWindow as unknown as { Event: typeof Event }).Event;
    input.dispatchEvent(new FrameEvent("change", { bubbles: true }));
    expect(instance.controller.getPalette().colors[0]?.color).toMatchObject({
      space: "srgb",
      r: 0,
      g: 1,
      b: 1
    });

    instance.destroy();
    frame.remove();
  });

  it("rolls back DOM, listeners, and subscriptions after an initial renderer failure", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = createPickerController(createPickerState({ palette: palette() }));
    const addListener = vi.spyOn(document, "addEventListener");
    const removeListener = vi.spyOn(document, "removeEventListener");
    const failure = new Error("custom renderer failed");
    const renderPalette = vi.fn(() => {
      throw failure;
    });

    expect(() =>
      mountColorwheel(container, {
        controller,
        renderPalette
      })
    ).toThrow(failure);

    expect(container).toBeEmptyDOMElement();
    expect(renderPalette).toHaveBeenCalledOnce();
    const pointerListeners = addListener.mock.calls.filter(([type]) =>
      ["pointermove", "pointerup", "pointercancel"].includes(type)
    );
    for (const [type, listener] of pointerListeners) {
      expect(
        removeListener.mock.calls.some(
          ([removedType, removedListener]) => removedType === type && removedListener === listener
        )
      ).toBe(true);
    }
    expect(() => controller.commands.setName("red", "Still alive")).not.toThrow();
    expect(renderPalette).toHaveBeenCalledOnce();

    addListener.mockRestore();
    removeListener.mockRestore();
    controller.destroy();
    container.remove();
  });

  it("rolls back the mounted shell when controller subscription fails", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const controller = createPickerController(createPickerState({ palette: palette() }));
    const failure = new Error("subscription failed");
    vi.spyOn(controller, "subscribe").mockImplementation(() => {
      throw failure;
    });

    expect(() => mountColorwheel(container, { controller })).toThrow(failure);
    expect(container).toBeEmptyDOMElement();
    expect(() => controller.commands.setName("red", "Still alive")).not.toThrow();

    controller.destroy();
    container.remove();
  });

  it("destroys owned controllers, DOM, listeners, and custom cleanup idempotently", () => {
    const container = document.createElement("div");
    const cleanup = vi.fn();
    const instance = mountColorwheel(container, {
      palette: palette(),
      renderPalette: () => ({ destroy: cleanup })
    });
    const controller = instance.controller;

    instance.destroy();
    instance.destroy();

    expect(container).toBeEmptyDOMElement();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(() => controller.commands.removeColor("red")).toThrow(DestroyedPickerControllerError);
  });

  it("finishes every destroy step when custom cleanup throws", () => {
    const container = document.createElement("div");
    const failure = new Error("cleanup failed");
    const instance = mountColorwheel(container, {
      palette: palette(),
      renderPalette: () => ({
        node: document.createElement("aside"),
        destroy: () => {
          throw failure;
        }
      })
    });
    const controller = instance.controller;

    expect(() => instance.destroy()).toThrow(failure);
    expect(container).toBeEmptyDOMElement();
    expect(() => controller.commands.removeColor("red")).toThrow(DestroyedPickerControllerError);
    expect(() => instance.destroy()).not.toThrow();
  });
});
