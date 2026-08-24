import type { JsonObject, Palette, PaletteColor } from "../core";
import {
  DuplicateColorIdError,
  EditorStateError,
  LinkedInteractionError,
  LockedColorConstraintError,
  UnknownColorIdError
} from "./errors";
import {
  areColorValuesEqual,
  assertRuntimePalette,
  createPickerState,
  diffPaletteColorIds,
  hasColorId,
  normalizeChangeOptions,
  normalizeColorFocusOrder,
  normalizePaletteColorEntry,
  normalizePickerState,
  normalizeStoredColor,
  normalizeWheelOptions,
  resolveRecipeSeedColorId
} from "./state";
import type { PickerAction, PickerReduction, PickerState, WheelEditorOptions } from "./types";

function unchanged<Metadata extends object>(
  state: PickerState<Metadata>
): PickerReduction<Metadata> {
  return { state, changedColorIds: [] };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype === null) return true;
  return (
    Object.getPrototypeOf(prototype) === null &&
    Object.prototype.hasOwnProperty.call(prototype, "constructor") &&
    typeof (prototype as { constructor?: unknown }).constructor === "function" &&
    (prototype as { constructor: { name?: unknown } }).constructor.name === "Object"
  );
}

function assertActionId(value: unknown, label = "colorId"): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new EditorStateError(`${label} must be a non-empty string`);
  }
}

function assertActionKeys(action: Record<string, unknown>, fields: readonly string[]): void {
  const allowed = new Set(["type", "change", ...fields]);
  for (const key of Reflect.ownKeys(action)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      throw new EditorStateError(`Unsupported action field ${String(key)}`);
    }
  }
}

function snapshotWheelOptions(value: unknown): Partial<WheelEditorOptions> {
  if (!isPlainRecord(value)) {
    normalizeWheelOptions(value as Partial<WheelEditorOptions>);
    return {};
  }
  const allowed = ["wheelModel", "interaction", "outputGamut"] as const;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key as (typeof allowed)[number])) {
      throw new EditorStateError(`Unsupported wheel option ${String(key)}`);
    }
  }
  const snapshot: Partial<WheelEditorOptions> = {
    wheelModel: value.wheelModel as WheelEditorOptions["wheelModel"] | undefined,
    interaction: value.interaction as WheelEditorOptions["interaction"] | undefined,
    outputGamut: value.outputGamut as WheelEditorOptions["outputGamut"] | undefined
  };
  normalizeWheelOptions(snapshot);
  return snapshot;
}

/** Validate and canonicalize an action from an untyped JavaScript caller. */
export function preparePickerAction<Metadata extends object>(
  action: unknown
): PickerAction<Metadata> {
  if (!isPlainRecord(action)) throw new EditorStateError("Picker action must be a plain object");
  const type = action.type;
  switch (type) {
    case "replace-state": {
      assertActionKeys(action, ["state"]);
      const change = normalizeChangeOptions(action.change);
      const stateInput = action.state;
      const state = normalizePickerState(stateInput as PickerState<Metadata>);
      return { type, state, ...(change === undefined ? {} : { change }) };
    }
    case "replace-palette":
    case "regenerate": {
      assertActionKeys(action, ["palette"]);
      const change = normalizeChangeOptions(action.change);
      const palette = action.palette;
      assertRuntimePalette<Metadata>(palette);
      return { type, palette, ...(change === undefined ? {} : { change }) };
    }
    case "set-color": {
      assertActionKeys(action, ["colorId", "color", "linkedPalette"]);
      const change = normalizeChangeOptions(action.change);
      const colorId = action.colorId;
      const colorInput = action.color;
      const linkedPalette = action.linkedPalette;
      assertActionId(colorId);
      const color = normalizeStoredColor(colorInput);
      if (linkedPalette !== undefined) {
        assertRuntimePalette<Metadata>(linkedPalette);
      }
      return {
        type,
        colorId,
        color,
        ...(linkedPalette === undefined ? {} : { linkedPalette }),
        ...(change === undefined ? {} : { change })
      };
    }
    case "add-color": {
      assertActionKeys(action, ["entry", "index"]);
      const change = normalizeChangeOptions(action.change);
      const entryInput = action.entry;
      const index = action.index;
      const entry = normalizePaletteColorEntry<Metadata>(entryInput);
      if (index !== undefined && !Number.isInteger(index)) {
        throw new EditorStateError("Add index must be an integer");
      }
      return {
        type,
        entry,
        ...(index === undefined ? {} : { index: index as number }),
        ...(change === undefined ? {} : { change })
      };
    }
    case "remove-color": {
      assertActionKeys(action, ["colorId"]);
      const change = normalizeChangeOptions(action.change);
      const colorId = action.colorId;
      assertActionId(colorId);
      return { type, colorId, ...(change === undefined ? {} : { change }) };
    }
    case "reorder-color": {
      assertActionKeys(action, ["colorId", "toIndex"]);
      const change = normalizeChangeOptions(action.change);
      const colorId = action.colorId;
      const toIndex = action.toIndex;
      assertActionId(colorId);
      if (!Number.isInteger(toIndex)) {
        throw new EditorStateError("Reorder index must be an integer");
      }
      return {
        type,
        colorId,
        toIndex: toIndex as number,
        ...(change === undefined ? {} : { change })
      };
    }
    case "set-color-locked": {
      assertActionKeys(action, ["colorId", "locked"]);
      const change = normalizeChangeOptions(action.change);
      const colorId = action.colorId;
      const locked = action.locked;
      assertActionId(colorId);
      if (typeof locked !== "boolean") {
        throw new EditorStateError("locked must be a boolean");
      }
      return { type, colorId, locked, ...(change === undefined ? {} : { change }) };
    }
    case "set-color-name": {
      assertActionKeys(action, ["colorId", "name"]);
      const change = normalizeChangeOptions(action.change);
      const colorId = action.colorId;
      const name = action.name;
      assertActionId(colorId);
      if (name !== undefined && typeof name !== "string") {
        throw new EditorStateError("name must be a string or undefined");
      }
      return {
        type,
        colorId,
        ...(name === undefined ? {} : { name }),
        ...(change === undefined ? {} : { change })
      };
    }
    case "set-color-role": {
      assertActionKeys(action, ["colorId", "role"]);
      const change = normalizeChangeOptions(action.change);
      const colorId = action.colorId;
      const role = action.role;
      assertActionId(colorId);
      if (role !== undefined && typeof role !== "string") {
        throw new EditorStateError("role must be a string or undefined");
      }
      return {
        type,
        colorId,
        ...(role === undefined ? {} : { role }),
        ...(change === undefined ? {} : { change })
      };
    }
    case "set-active-color":
    case "set-anchor-color": {
      assertActionKeys(action, ["colorId"]);
      const change = normalizeChangeOptions(action.change);
      const colorId = action.colorId;
      if (colorId !== undefined) assertActionId(colorId);
      return {
        type,
        ...(colorId === undefined ? {} : { colorId }),
        ...(change === undefined ? {} : { change })
      };
    }
    case "set-wheel-options": {
      assertActionKeys(action, ["options"]);
      const change = normalizeChangeOptions(action.change);
      const options = snapshotWheelOptions(action.options);
      return { type, options, ...(change === undefined ? {} : { change }) };
    }
    default:
      throw new EditorStateError(`Unsupported picker action "${String(type)}"`);
  }
}

/** Runtime assertion form for integrations that do not need canonical output. */
export function assertPickerAction<Metadata extends object>(
  action: unknown
): asserts action is PickerAction<Metadata> {
  preparePickerAction<Metadata>(action);
}

function withSelections<Metadata extends object>(
  state: PickerState<Metadata>,
  activeColorId: string | undefined,
  anchorColorId: string | undefined
): PickerState<Metadata> {
  const next: PickerState<Metadata> = { ...state };
  if (activeColorId === undefined) Reflect.deleteProperty(next, "activeColorId");
  else Object.assign(next, { activeColorId });
  if (anchorColorId === undefined) Reflect.deleteProperty(next, "anchorColorId");
  else Object.assign(next, { anchorColorId });
  return next;
}

function detachRecipe<Metadata extends object>(
  palette: Palette<Metadata>,
  colors: readonly PaletteColor<Metadata>[]
): Palette<Metadata> {
  if (palette.recipe === undefined) return { ...palette, colors };
  const withoutRecipe = { ...palette, colors };
  Reflect.deleteProperty(withoutRecipe, "recipe");
  return withoutRecipe;
}

function withColors<Metadata extends object>(
  palette: Palette<Metadata>,
  colors: readonly PaletteColor<Metadata>[]
): Palette<Metadata> {
  return { ...palette, colors };
}

function reconcileSelection<Metadata extends object>(
  previousId: string | undefined,
  palette: Palette<Metadata>
): string | undefined {
  if (previousId === undefined) return undefined;
  return hasColorId(palette, previousId) ? previousId : palette.colors[0]?.id;
}

function replacePalette<Metadata extends object>(
  state: PickerState<Metadata>,
  palette: Palette<Metadata>
): PickerReduction<Metadata> {
  if (palette === state.palette) return unchanged(state);
  const changedColorIds = diffPaletteColorIds(state.palette, palette);
  const recipeSeedColorId = resolveRecipeSeedColorId(palette, state.wheel.outputGamut);
  const activeColorId =
    recipeSeedColorId !== undefined &&
    state.activeColorId !== undefined &&
    state.activeColorId === state.anchorColorId
      ? recipeSeedColorId
      : reconcileSelection(state.activeColorId, palette);
  const anchorColorId =
    state.anchorColorId === undefined
      ? undefined
      : (recipeSeedColorId ?? reconcileSelection(state.anchorColorId, palette));
  const next = withSelections({ ...state, palette }, activeColorId, anchorColorId);
  return {
    state: {
      ...next,
      colorFocusOrder: normalizeColorFocusOrder(palette, state.colorFocusOrder),
      wheel:
        state.wheel.interaction === "linked" &&
        (palette.recipe?.type !== "wheel" || palette.recipe.harmony === undefined)
          ? { ...state.wheel, interaction: "free" }
          : state.wheel
    },
    changedColorIds
  };
}

function assertLockedColorsPreserved<Metadata extends object>(
  current: Palette<Metadata>,
  next: Palette<Metadata>
): void {
  const nextById = new Map(next.colors.map((entry) => [entry.id, entry]));
  for (const entry of current.colors) {
    if (!entry.locked) continue;
    const replacement = nextById.get(entry.id);
    if (replacement === undefined || !areColorValuesEqual(entry.color, replacement.color)) {
      throw new LockedColorConstraintError(entry.id);
    }
  }
}

function updateOptionalField<Metadata extends object>(
  entry: PaletteColor<Metadata>,
  field: "name" | "role",
  value: string | undefined
): PaletteColor<Metadata> {
  if (entry[field] === value) return entry;
  if (value !== undefined) return { ...entry, [field]: value };
  const withoutField = { ...entry };
  Reflect.deleteProperty(withoutField, field);
  return withoutField;
}

export function reducePreparedPickerState<Metadata extends object = JsonObject>(
  state: PickerState<Metadata>,
  action: PickerAction<Metadata>
): PickerReduction<Metadata> {
  switch (action.type) {
    case "replace-state": {
      const next = action.state;
      if (next === state) return unchanged(state);
      return { state: next, changedColorIds: diffPaletteColorIds(state.palette, next.palette) };
    }
    case "replace-palette":
      return replacePalette(state, action.palette);
    case "set-color": {
      const index = state.palette.colors.findIndex((entry) => entry.id === action.colorId);
      if (index < 0) throw new UnknownColorIdError(action.colorId);
      const current = state.palette.colors[index];
      if (current === undefined || current.locked) return unchanged(state);
      const color = action.color;
      if (areColorValuesEqual(current.color, color)) return unchanged(state);

      if (state.wheel.interaction === "linked") {
        if (action.linkedPalette === undefined) {
          throw new LinkedInteractionError(
            "A linked color update must supply the recalculated palette"
          );
        }
        assertLockedColorsPreserved(state.palette, action.linkedPalette);
        return replacePalette(state, action.linkedPalette);
      }

      const colors = state.palette.colors.slice();
      colors[index] = { ...current, color };
      return {
        state: { ...state, palette: detachRecipe(state.palette, colors) },
        changedColorIds: [action.colorId]
      };
    }
    case "add-color": {
      const entry = action.entry;
      if (hasColorId(state.palette, entry.id)) {
        throw new DuplicateColorIdError(entry.id);
      }
      const index = action.index ?? state.palette.colors.length;
      if (!Number.isInteger(index) || index < 0 || index > state.palette.colors.length) {
        throw new RangeError(`Add index ${index} is outside the palette`);
      }
      const colors = state.palette.colors.slice();
      colors.splice(index, 0, entry);
      const palette = detachRecipe(state.palette, colors);
      const activeColorId = state.activeColorId ?? entry.id;
      const anchorColorId = state.anchorColorId ?? entry.id;
      return {
        state: withSelections(
          {
            ...state,
            palette,
            colorFocusOrder: [...state.colorFocusOrder, entry.id],
            wheel:
              state.wheel.interaction === "linked"
                ? { ...state.wheel, interaction: "free" }
                : state.wheel
          },
          activeColorId,
          anchorColorId
        ),
        changedColorIds: [entry.id]
      };
    }
    case "remove-color": {
      const index = state.palette.colors.findIndex((entry) => entry.id === action.colorId);
      if (index < 0) return unchanged(state);
      const colors = state.palette.colors.filter((entry) => entry.id !== action.colorId);
      const fallback = colors[Math.min(index, Math.max(0, colors.length - 1))]?.id;
      return {
        state: withSelections(
          {
            ...state,
            palette: detachRecipe(state.palette, colors),
            colorFocusOrder: state.colorFocusOrder.filter((id) => id !== action.colorId),
            wheel:
              state.wheel.interaction === "linked"
                ? { ...state.wheel, interaction: "free" }
                : state.wheel
          },
          state.activeColorId === action.colorId ? fallback : state.activeColorId,
          state.anchorColorId === action.colorId ? fallback : state.anchorColorId
        ),
        changedColorIds: [action.colorId]
      };
    }
    case "reorder-color": {
      const fromIndex = state.palette.colors.findIndex((entry) => entry.id === action.colorId);
      if (fromIndex < 0) throw new UnknownColorIdError(action.colorId);
      if (
        !Number.isInteger(action.toIndex) ||
        action.toIndex < 0 ||
        action.toIndex >= state.palette.colors.length
      ) {
        throw new RangeError(`Reorder index ${action.toIndex} is outside the palette`);
      }
      if (fromIndex === action.toIndex) return unchanged(state);
      const colors = state.palette.colors.slice();
      const [entry] = colors.splice(fromIndex, 1);
      if (entry === undefined) return unchanged(state);
      colors.splice(action.toIndex, 0, entry);
      return {
        state: { ...state, palette: withColors(state.palette, colors) },
        changedColorIds: [action.colorId]
      };
    }
    case "set-color-locked": {
      const index = state.palette.colors.findIndex((entry) => entry.id === action.colorId);
      if (index < 0) throw new UnknownColorIdError(action.colorId);
      const current = state.palette.colors[index];
      if (current === undefined || Boolean(current.locked) === action.locked)
        return unchanged(state);
      const colors = state.palette.colors.slice();
      if (action.locked) {
        colors[index] = { ...current, locked: true };
      } else {
        const unlocked = { ...current };
        Reflect.deleteProperty(unlocked, "locked");
        colors[index] = unlocked;
      }
      return {
        state: { ...state, palette: withColors(state.palette, colors) },
        changedColorIds: [action.colorId]
      };
    }
    case "set-color-name":
    case "set-color-role": {
      const index = state.palette.colors.findIndex((entry) => entry.id === action.colorId);
      if (index < 0) throw new UnknownColorIdError(action.colorId);
      const current = state.palette.colors[index];
      if (current === undefined) return unchanged(state);
      const field = action.type === "set-color-name" ? "name" : "role";
      const value = action.type === "set-color-name" ? action.name : action.role;
      const updated = updateOptionalField(current, field, value);
      if (updated === current) return unchanged(state);
      const next = normalizePaletteColorEntry<Metadata>(updated);
      const colors = state.palette.colors.slice();
      colors[index] = next;
      return {
        state: { ...state, palette: withColors(state.palette, colors) },
        changedColorIds: [action.colorId]
      };
    }
    case "set-active-color": {
      if (action.colorId !== undefined && !hasColorId(state.palette, action.colorId)) {
        throw new UnknownColorIdError(action.colorId);
      }
      return action.colorId === state.activeColorId
        ? unchanged(state)
        : {
            state: withSelections(state, action.colorId, state.anchorColorId),
            changedColorIds: []
          };
    }
    case "set-anchor-color": {
      if (action.colorId !== undefined && !hasColorId(state.palette, action.colorId)) {
        throw new UnknownColorIdError(action.colorId);
      }
      return action.colorId === state.anchorColorId
        ? unchanged(state)
        : {
            state: withSelections(state, state.activeColorId, action.colorId),
            changedColorIds: []
          };
    }
    case "set-wheel-options": {
      const wheel = normalizeWheelOptions(action.options, state.wheel);
      if (
        wheel.interaction === "linked" &&
        (state.palette.recipe?.type !== "wheel" || state.palette.recipe.harmony === undefined)
      ) {
        throw new LinkedInteractionError(
          "Linked interaction requires a live wheel recipe with a harmony rule"
        );
      }
      return wheel === state.wheel
        ? unchanged(state)
        : { state: { ...state, wheel }, changedColorIds: [] };
    }
    case "regenerate": {
      assertLockedColorsPreserved(state.palette, action.palette);
      return replacePalette(state, action.palette);
    }
  }
}

export function reducePickerState<Metadata extends object = JsonObject>(
  state: PickerState<Metadata>,
  action: PickerAction<Metadata>
): PickerReduction<Metadata> {
  return reducePreparedPickerState(state, preparePickerAction<Metadata>(action));
}

export function pickerReducer<Metadata extends object = JsonObject>(
  state: PickerState<Metadata>,
  action: PickerAction<Metadata>
): PickerState<Metadata> {
  return reducePickerState(state, action).state;
}

export function replacePickerPalette<Metadata extends object>(
  state: PickerState<Metadata>,
  palette: Palette<Metadata>
): PickerState<Metadata> {
  assertRuntimePalette<Metadata>(palette);
  return replacePalette(state, palette).state;
}

export function stateFromPalette<Metadata extends object>(
  palette: Palette<Metadata>
): PickerState<Metadata> {
  return createPickerState({ palette });
}
