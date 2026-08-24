import type { JsonObject, PaletteColor } from "../core";
import { requireColorById } from "./state";
import type { PickerController, PickerState } from "./types";

export interface AccessibilityProps {
  readonly id?: string;
  readonly role?: string;
  readonly tabIndex?: number;
  readonly "aria-label"?: string;
  readonly "aria-description"?: string;
  readonly "aria-orientation"?: "horizontal" | "vertical";
  readonly "aria-selected"?: boolean;
  readonly "aria-pressed"?: boolean;
  readonly "aria-disabled"?: boolean;
  readonly "aria-valuemin"?: number;
  readonly "aria-valuemax"?: number;
  readonly "aria-valuenow"?: number;
  readonly "aria-valuetext"?: string;
  readonly "aria-setsize"?: number;
  readonly "aria-posinset"?: number;
  readonly "data-color-id"?: string;
  readonly "data-active"?: "true" | "false";
  readonly "data-anchor"?: "true" | "false";
  readonly "data-locked"?: "true" | "false";
  readonly "data-focus-order"?: number;
}

export interface ColorAccessibilityContext<Metadata extends object = JsonObject> {
  readonly entry: PaletteColor<Metadata>;
  readonly index: number;
  readonly total: number;
  readonly active: boolean;
  readonly anchor: boolean;
}

export interface AccessibilityLabels<Metadata extends object = JsonObject> {
  readonly wheel: string;
  readonly palette: string;
  readonly pointer: (context: ColorAccessibilityContext<Metadata>) => string;
  readonly swatch: (context: ColorAccessibilityContext<Metadata>) => string;
  readonly lock: (context: ColorAccessibilityContext<Metadata>) => string;
  readonly remove: (context: ColorAccessibilityContext<Metadata>) => string;
  readonly moveEarlier: (context: ColorAccessibilityContext<Metadata>) => string;
  readonly moveLater: (context: ColorAccessibilityContext<Metadata>) => string;
  readonly channel: (channel: ColorChannel, context: ColorAccessibilityContext<Metadata>) => string;
}

export type ColorChannel = "hue" | "saturation" | "value" | "lightness" | "chroma" | "alpha";

export interface ChannelAccessibilityOptions<Metadata extends object = JsonObject> {
  readonly state: PickerState<Metadata>;
  readonly colorId: string;
  readonly channel: ColorChannel;
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly valueText?: string;
  readonly orientation?: "horizontal" | "vertical";
  readonly disabled?: boolean;
  readonly labels?: Partial<AccessibilityLabels<Metadata>>;
}

export interface SliderKeyboardInput {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
}

export interface SliderKeyboardOptions {
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly coarseStep?: number;
  readonly fineStep?: number;
  readonly orientation?: "horizontal" | "vertical";
  readonly direction?: "ltr" | "rtl";
}

export interface PickerAccessibilityBindings<Metadata extends object = JsonObject> {
  getWheelProps(): AccessibilityProps;
  getPaletteProps(): AccessibilityProps;
  getPointerProps(colorId: string): AccessibilityProps;
  getSwatchProps(colorId: string): AccessibilityProps;
  getLockProps(colorId: string): AccessibilityProps;
  getRemoveProps(colorId: string): AccessibilityProps;
  getMoveEarlierProps(colorId: string): AccessibilityProps;
  getMoveLaterProps(colorId: string): AccessibilityProps;
  getChannelProps(
    options: Omit<ChannelAccessibilityOptions<Metadata>, "state" | "labels">
  ): AccessibilityProps;
}

function colorName(context: ColorAccessibilityContext<object>): string {
  return context.entry.name?.trim() || `Color ${context.index + 1}`;
}

export const defaultAccessibilityLabels: AccessibilityLabels<object> = {
  wheel: "Color wheel",
  palette: "Color palette",
  pointer: (context) => {
    const states = [context.anchor ? "anchor" : "", context.entry.locked ? "locked" : ""]
      .filter(Boolean)
      .join(", ");
    return `${colorName(context)} wheel handle${states.length > 0 ? `, ${states}` : ""}`;
  },
  swatch: (context) => `${colorName(context)}, ${context.index + 1} of ${context.total}`,
  lock: (context) => `${context.entry.locked ? "Unlock" : "Lock"} ${colorName(context)}`,
  remove: (context) => `Remove ${colorName(context)}`,
  moveEarlier: (context) => `Move ${colorName(context)} earlier`,
  moveLater: (context) => `Move ${colorName(context)} later`,
  channel: (channel, context) => `${colorName(context)} ${channel}`
};

function resolveLabels<Metadata extends object>(
  labels: Partial<AccessibilityLabels<Metadata>> | undefined
): AccessibilityLabels<Metadata> {
  return { ...defaultAccessibilityLabels, ...labels };
}

function getContext<Metadata extends object>(
  state: PickerState<Metadata>,
  colorId: string
): ColorAccessibilityContext<Metadata> {
  const entry = requireColorById(state.palette, colorId);
  const index = state.palette.colors.findIndex((color) => color.id === colorId);
  return {
    entry,
    index,
    total: state.palette.colors.length,
    active: state.activeColorId === colorId,
    anchor: state.anchorColorId === colorId
  };
}

function colorDataProps<Metadata extends object>(
  state: PickerState<Metadata>,
  context: ColorAccessibilityContext<Metadata>
): AccessibilityProps {
  return {
    "data-color-id": context.entry.id,
    "data-active": context.active ? "true" : "false",
    "data-anchor": context.anchor ? "true" : "false",
    "data-locked": context.entry.locked ? "true" : "false",
    "data-focus-order": state.colorFocusOrder.indexOf(context.entry.id)
  };
}

export function getWheelAccessibilityProps<Metadata extends object = JsonObject>(
  labels?: Partial<AccessibilityLabels<Metadata>>
): AccessibilityProps {
  return { role: "group", "aria-label": resolveLabels(labels).wheel };
}

export function getPaletteAccessibilityProps<Metadata extends object = JsonObject>(
  labels?: Partial<AccessibilityLabels<Metadata>>
): AccessibilityProps {
  return { role: "listbox", "aria-label": resolveLabels(labels).palette };
}

export function getPointerAccessibilityProps<Metadata extends object = JsonObject>(
  state: PickerState<Metadata>,
  colorId: string,
  labels?: Partial<AccessibilityLabels<Metadata>>
): AccessibilityProps {
  const context = getContext(state, colorId);
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": resolveLabels(labels).pointer(context),
    "aria-pressed": context.active,
    ...colorDataProps(state, context)
  };
}

export function getSwatchAccessibilityProps<Metadata extends object = JsonObject>(
  state: PickerState<Metadata>,
  colorId: string,
  labels?: Partial<AccessibilityLabels<Metadata>>
): AccessibilityProps {
  const context = getContext(state, colorId);
  return {
    role: "option",
    tabIndex: context.active ? 0 : -1,
    "aria-label": resolveLabels(labels).swatch(context),
    "aria-selected": context.active,
    "aria-setsize": context.total,
    "aria-posinset": context.index + 1,
    ...colorDataProps(state, context)
  };
}

export function getLockAccessibilityProps<Metadata extends object = JsonObject>(
  state: PickerState<Metadata>,
  colorId: string,
  labels?: Partial<AccessibilityLabels<Metadata>>
): AccessibilityProps {
  const context = getContext(state, colorId);
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": resolveLabels(labels).lock(context),
    "aria-pressed": Boolean(context.entry.locked),
    ...colorDataProps(state, context)
  };
}

export function getRemoveAccessibilityProps<Metadata extends object = JsonObject>(
  state: PickerState<Metadata>,
  colorId: string,
  labels?: Partial<AccessibilityLabels<Metadata>>
): AccessibilityProps {
  const context = getContext(state, colorId);
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": resolveLabels(labels).remove(context),
    ...colorDataProps(state, context)
  };
}

export function getMoveAccessibilityProps<Metadata extends object = JsonObject>(
  state: PickerState<Metadata>,
  colorId: string,
  direction: "earlier" | "later",
  labels?: Partial<AccessibilityLabels<Metadata>>
): AccessibilityProps {
  const context = getContext(state, colorId);
  const disabled =
    direction === "earlier" ? context.index === 0 : context.index === context.total - 1;
  const resolved = resolveLabels(labels);
  return {
    role: "button",
    tabIndex: 0,
    "aria-label":
      direction === "earlier" ? resolved.moveEarlier(context) : resolved.moveLater(context),
    "aria-disabled": disabled,
    ...colorDataProps(state, context)
  };
}

export function getChannelAccessibilityProps<Metadata extends object = JsonObject>(
  options: ChannelAccessibilityOptions<Metadata>
): AccessibilityProps {
  const context = getContext(options.state, options.colorId);
  return {
    role: "slider",
    tabIndex: options.disabled ? -1 : 0,
    "aria-label": resolveLabels(options.labels).channel(options.channel, context),
    "aria-orientation": options.orientation ?? "horizontal",
    "aria-disabled": options.disabled,
    "aria-valuemin": options.minimum,
    "aria-valuemax": options.maximum,
    "aria-valuenow": options.value,
    "aria-valuetext": options.valueText,
    ...colorDataProps(options.state, context)
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Returns the next value for a standard slider key, or undefined when unhandled. */
export function getSliderKeyboardValue(
  current: number,
  input: SliderKeyboardInput,
  options: SliderKeyboardOptions
): number | undefined {
  const { minimum, maximum, step } = options;
  if (![current, minimum, maximum, step].every(Number.isFinite) || maximum < minimum || step <= 0) {
    throw new RangeError("Slider limits and steps must be finite and ordered");
  }
  if (input.ctrlKey || input.metaKey) return undefined;
  if (input.key === "Home") return minimum;
  if (input.key === "End") return maximum;

  const coarseStep = options.coarseStep ?? step * 10;
  const fineStep = options.fineStep ?? step / 10;
  let delta: number;
  if (input.key === "PageUp") delta = coarseStep;
  else if (input.key === "PageDown") delta = -coarseStep;
  else {
    const vertical = options.orientation === "vertical";
    const rtlMultiplier = options.direction === "rtl" && !vertical ? -1 : 1;
    if (input.key === "ArrowUp") delta = step;
    else if (input.key === "ArrowDown") delta = -step;
    else if (input.key === "ArrowRight") delta = step * rtlMultiplier;
    else if (input.key === "ArrowLeft") delta = -step * rtlMultiplier;
    else return undefined;
    if (input.shiftKey) delta = Math.sign(delta) * coarseStep;
    else if (input.altKey) delta = Math.sign(delta) * fineStep;
  }
  return clamp(current + delta, minimum, maximum);
}

export function createPickerAccessibilityBindings<Metadata extends object = JsonObject>(
  controller: Pick<PickerController<Metadata>, "getState">,
  labels?: Partial<AccessibilityLabels<Metadata>>
): PickerAccessibilityBindings<Metadata> {
  return {
    getWheelProps: () => getWheelAccessibilityProps(labels),
    getPaletteProps: () => getPaletteAccessibilityProps(labels),
    getPointerProps: (colorId) =>
      getPointerAccessibilityProps(controller.getState(), colorId, labels),
    getSwatchProps: (colorId) =>
      getSwatchAccessibilityProps(controller.getState(), colorId, labels),
    getLockProps: (colorId) => getLockAccessibilityProps(controller.getState(), colorId, labels),
    getRemoveProps: (colorId) =>
      getRemoveAccessibilityProps(controller.getState(), colorId, labels),
    getMoveEarlierProps: (colorId) =>
      getMoveAccessibilityProps(controller.getState(), colorId, "earlier", labels),
    getMoveLaterProps: (colorId) =>
      getMoveAccessibilityProps(controller.getState(), colorId, "later", labels),
    getChannelProps: (options) =>
      getChannelAccessibilityProps({ ...options, state: controller.getState(), labels })
  };
}
