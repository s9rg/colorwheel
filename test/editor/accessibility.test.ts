import { describe, expect, it } from "vitest";
import {
  createPickerAccessibilityBindings,
  createPickerController,
  createPickerState,
  getChannelAccessibilityProps,
  getLockAccessibilityProps,
  getMoveAccessibilityProps,
  getPointerAccessibilityProps,
  getSliderKeyboardValue,
  getSwatchAccessibilityProps
} from "../../src/editor";
import { makePalette } from "./fixtures";

describe("accessibility bindings", () => {
  it("describes wheel pointers as buttons rather than misleading scalar sliders", () => {
    const state = createPickerState({ palette: makePalette() });
    expect(getPointerAccessibilityProps(state, "red")).toMatchObject({
      role: "button",
      tabIndex: 0,
      "aria-label": "Red wheel handle, anchor",
      "aria-pressed": true,
      "data-active": "true",
      "data-anchor": "true",
      "data-locked": "false",
      "data-focus-order": 0
    });
  });

  it("provides roving swatch selection and explicit non-drag actions", () => {
    const state = createPickerState({ palette: makePalette() });
    expect(getSwatchAccessibilityProps(state, "green")).toMatchObject({
      role: "option",
      tabIndex: -1,
      "aria-selected": false,
      "aria-posinset": 2
    });
    expect(getLockAccessibilityProps(state, "green")).toMatchObject({
      role: "button",
      "aria-label": "Lock Green",
      "aria-pressed": false
    });
    expect(getMoveAccessibilityProps(state, "red", "earlier")).toMatchObject({
      "aria-label": "Move Red earlier",
      "aria-disabled": true
    });
    expect(getMoveAccessibilityProps(state, "red", "later")).toMatchObject({
      "aria-disabled": false
    });
  });

  it("creates explicit channel slider data with customizable labels", () => {
    const state = createPickerState({ palette: makePalette() });
    expect(
      getChannelAccessibilityProps({
        state,
        colorId: "red",
        channel: "hue",
        value: 120,
        minimum: 0,
        maximum: 360,
        valueText: "120 degrees",
        labels: { channel: (channel, context) => `${context.entry.id}: ${channel}` }
      })
    ).toMatchObject({
      role: "slider",
      tabIndex: 0,
      "aria-label": "red: hue",
      "aria-valuemin": 0,
      "aria-valuemax": 360,
      "aria-valuenow": 120,
      "aria-valuetext": "120 degrees"
    });
  });

  it("calculates standard, coarse, fine, bounded, and RTL keyboard values", () => {
    const options = { minimum: 0, maximum: 100, step: 1 };
    expect(getSliderKeyboardValue(50, { key: "ArrowRight" }, options)).toBe(51);
    expect(getSliderKeyboardValue(50, { key: "ArrowRight", shiftKey: true }, options)).toBe(60);
    expect(getSliderKeyboardValue(50, { key: "ArrowRight", altKey: true }, options)).toBe(50.1);
    expect(getSliderKeyboardValue(95, { key: "PageUp" }, options)).toBe(100);
    expect(getSliderKeyboardValue(50, { key: "Home" }, options)).toBe(0);
    expect(
      getSliderKeyboardValue(50, { key: "ArrowRight" }, { ...options, direction: "rtl" })
    ).toBe(49);
    expect(getSliderKeyboardValue(50, { key: "Enter" }, options)).toBeUndefined();
  });

  it("reads fresh state through controller-bound prop getters", () => {
    const controller = createPickerController(createPickerState({ palette: makePalette() }));
    const bindings = createPickerAccessibilityBindings(controller);
    expect(bindings.getSwatchProps("blue")["aria-selected"]).toBe(false);
    controller.commands.setActive("blue");
    expect(bindings.getSwatchProps("blue")["aria-selected"]).toBe(true);
  });

  it("keeps pointer focus position stable when swatches reorder", () => {
    const controller = createPickerController(createPickerState({ palette: makePalette() }));
    controller.commands.reorderColor("blue", 0);
    const props = getPointerAccessibilityProps(controller.getState(), "blue");
    expect(controller.getState().palette.colors[0]?.id).toBe("blue");
    expect(props["data-focus-order"]).toBe(2);
  });
});
