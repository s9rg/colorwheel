import type { JsonObject, PaletteColor } from "../core";
import { getColorById } from "./state";
import type { PickerSelector, PickerState } from "./types";

export const selectPickerState = <Metadata extends object>(
  state: PickerState<Metadata>
): PickerState<Metadata> => state;

export const selectPalette = <Metadata extends object>(state: PickerState<Metadata>) =>
  state.palette;

export const selectColors = <Metadata extends object>(state: PickerState<Metadata>) =>
  state.palette.colors;

export const selectWheel = <Metadata extends object>(state: PickerState<Metadata>) => state.wheel;

export const selectActiveColorId = (state: PickerState): string | undefined => state.activeColorId;

export const selectAnchorColorId = (state: PickerState): string | undefined => state.anchorColorId;

export const selectColorFocusOrder = (state: PickerState): readonly string[] =>
  state.colorFocusOrder;

export const selectActiveColor = <Metadata extends object>(
  state: PickerState<Metadata>
): PaletteColor<Metadata> | undefined =>
  state.activeColorId === undefined ? undefined : getColorById(state.palette, state.activeColorId);

export const selectAnchorColor = <Metadata extends object>(
  state: PickerState<Metadata>
): PaletteColor<Metadata> | undefined =>
  state.anchorColorId === undefined ? undefined : getColorById(state.palette, state.anchorColorId);

export function selectColorById<Metadata extends object = JsonObject>(
  colorId: string
): PickerSelector<PaletteColor<Metadata> | undefined, Metadata> {
  return (state) => getColorById(state.palette, colorId);
}

export function selectColorIndex(colorId: string): PickerSelector<number> {
  return (state) => state.palette.colors.findIndex((entry) => entry.id === colorId);
}

export function selectIsActive(colorId: string): PickerSelector<boolean> {
  return (state) => state.activeColorId === colorId;
}

export function selectIsAnchor(colorId: string): PickerSelector<boolean> {
  return (state) => state.anchorColorId === colorId;
}

export function selectIsLocked(colorId: string): PickerSelector<boolean> {
  return (state) => Boolean(getColorById(state.palette, colorId)?.locked);
}

export function selectCanMoveColor(colorId: string): PickerSelector<boolean> {
  return (state) => {
    const entry = getColorById(state.palette, colorId);
    if (entry === undefined || entry.locked) return false;
    return state.wheel.interaction === "free" || state.anchorColorId === colorId;
  };
}

export function selectNextFocusableColorId(
  state: PickerState,
  colorId: string,
  direction: 1 | -1,
  wrap = true
): string | undefined {
  const length = state.colorFocusOrder.length;
  if (length === 0) return undefined;
  const index = state.colorFocusOrder.indexOf(colorId);
  if (index < 0) return state.colorFocusOrder[0];
  const next = index + direction;
  if (next >= 0 && next < length) return state.colorFocusOrder[next];
  return wrap ? state.colorFocusOrder[(next + length) % length] : undefined;
}
