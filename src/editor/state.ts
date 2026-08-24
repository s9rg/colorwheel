import {
  PaletteDocumentValidationError,
  assertPalette,
  mapToGamut,
  normalizeColor,
  validatePalette
} from "../core";
import type { ColorValue, JsonObject, Palette, PaletteColor } from "../core";
import { inspectJsonContainer } from "../core/json";
import {
  DuplicateColorIdError,
  EditorStateError,
  LinkedInteractionError,
  UnknownColorIdError
} from "./errors";
import type {
  ChangeOptions,
  CreatePickerStateOptions,
  PickerState,
  WheelEditorOptions
} from "./types";

export const DEFAULT_WHEEL_OPTIONS: WheelEditorOptions = Object.freeze({
  wheelModel: "hsv",
  interaction: "free",
  outputGamut: "srgb"
});

function owns(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
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

function assertPlainRecord(
  value: unknown,
  label: string
): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value)) throw new EditorStateError(`${label} must be a plain object`);
}

function assertAllowedKeys(value: object, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowedSet.has(key)) {
      throw new EditorStateError(`${label} contains unsupported field ${String(key)}`);
    }
  }
}

function assertOptionalId(value: unknown, label: string): asserts value is string | undefined {
  if (value !== undefined && (typeof value !== "string" || value.length === 0)) {
    throw new EditorStateError(`${label} must be a non-empty string or undefined`);
  }
}

export function assertRuntimePalette<Metadata extends object>(
  palette: unknown
): asserts palette is Palette<Metadata> {
  const result = validatePalette(palette);
  if (result.valid) return;
  const duplicate = result.issues.find((issue) => issue.code === "palette.duplicate-id");
  const index = duplicate?.path.at(-2);
  if (
    typeof index === "number" &&
    isPlainRecord(palette) &&
    Array.isArray(palette.colors) &&
    isPlainRecord(palette.colors[index]) &&
    typeof palette.colors[index].id === "string"
  ) {
    throw new DuplicateColorIdError(palette.colors[index].id);
  }
  throw new PaletteDocumentValidationError(result.issues);
}

/** Validate a stored editor color, then return its canonical structured form. */
export function normalizeStoredColor(color: unknown): ColorValue {
  assertPalette({
    colors: [{ id: "editor-color", color }],
    kind: "custom",
    provenance: { origin: "manual" }
  });
  return normalizeColor(color as ColorValue);
}

export function normalizePaletteColorEntry<Metadata extends object>(
  entry: unknown
): PaletteColor<Metadata> {
  assertPalette({
    colors: [entry],
    kind: "custom",
    provenance: { origin: "manual" }
  });
  const typed = entry as PaletteColor<Metadata>;
  return { ...typed, color: normalizeColor(typed.color) };
}

function assertCanonicalChangeOptions(change: ChangeOptions): void {
  if (
    change.action !== undefined &&
    (typeof change.action !== "string" || change.action.length === 0)
  ) {
    throw new EditorStateError("Change action must be a non-empty string");
  }
  if (
    change.origin !== undefined &&
    change.origin !== "user" &&
    change.origin !== "external" &&
    change.origin !== "extension"
  ) {
    throw new EditorStateError("Unsupported change origin");
  }
  if (
    change.phase !== undefined &&
    change.phase !== "start" &&
    change.phase !== "update" &&
    change.phase !== "commit"
  ) {
    throw new EditorStateError("Unsupported change phase");
  }
  if (
    change.transactionId !== undefined &&
    (typeof change.transactionId !== "string" || change.transactionId.length === 0)
  ) {
    throw new EditorStateError("Change transactionId must be a non-empty string");
  }
}

/** Snapshot and validate an untyped change envelope exactly once. */
export function normalizeChangeOptions(change: unknown): ChangeOptions | undefined {
  if (change === undefined) return undefined;
  assertPlainRecord(change, "Change options");
  assertAllowedKeys(change, ["action", "origin", "phase", "transactionId"], "Change options");
  const snapshot: ChangeOptions = {
    action: change.action as ChangeOptions["action"],
    origin: change.origin as ChangeOptions["origin"],
    phase: change.phase as ChangeOptions["phase"],
    transactionId: change.transactionId as string | undefined
  };
  assertCanonicalChangeOptions(snapshot);
  return snapshot;
}

export function assertChangeOptions(change: unknown): void {
  normalizeChangeOptions(change);
}

export function assertUniqueColorIds(palette: Palette<object>): void {
  const ids = new Set<string>();
  for (const entry of palette.colors) {
    if (!isPlainRecord(entry)) {
      throw new EditorStateError("Palette colors must be plain objects");
    }
    if (typeof entry.id !== "string" || entry.id.length === 0) {
      throw new EditorStateError("Palette color IDs must be non-empty strings");
    }
    if (ids.has(entry.id)) {
      throw new DuplicateColorIdError(entry.id);
    }
    ids.add(entry.id);
  }
}

export function hasColorId(palette: Palette<object>, colorId: string | undefined): boolean {
  return colorId !== undefined && palette.colors.some((entry) => entry.id === colorId);
}

export function getColorById<Metadata extends object>(
  palette: Palette<Metadata>,
  colorId: string
): PaletteColor<Metadata> | undefined {
  return palette.colors.find((entry) => entry.id === colorId);
}

export function requireColorById<Metadata extends object>(
  palette: Palette<Metadata>,
  colorId: string
): PaletteColor<Metadata> {
  const entry = getColorById(palette, colorId);
  if (entry === undefined) {
    throw new UnknownColorIdError(colorId);
  }
  return entry;
}

/**
 * Resolve the model-space color that should be used as the basis for a wheel edit.
 *
 * A gamut-mapped linked anchor can become achromatic at an endpoint such as HSV
 * value zero or OKLCH lightness zero. The live wheel recipe keeps the intended
 * hue/chroma channels, so linked anchor edits use that seed while free edits and
 * non-anchor colors continue to use their stored palette color.
 */
export function resolveWheelEditingColor<Metadata extends object>(
  state: PickerState<Metadata>,
  entry: PaletteColor<Metadata>
): ColorValue {
  const recipe = state.palette.recipe;
  const seedColorId = resolveRecipeSeedColorId(state.palette, state.wheel.outputGamut);
  if (
    state.wheel.interaction === "linked" &&
    state.anchorColorId === entry.id &&
    recipe?.type === "wheel" &&
    recipe.seed !== undefined &&
    seedColorId === entry.id
  ) {
    return recipe.seed;
  }
  return entry.color;
}

/**
 * Resolve an explicit seed owner, or safely infer one for an older document only
 * when exactly one stored entry represents the recipe seed.
 */
export function resolveRecipeSeedColorId<Metadata extends object>(
  palette: Palette<Metadata>,
  gamut: "srgb" | "display-p3"
): string | undefined {
  const recipe = palette.recipe;
  if (recipe?.seedColorId !== undefined) return recipe.seedColorId;
  if (recipe?.seed === undefined) return undefined;
  const matches = palette.colors.filter((entry) =>
    mappedColorsEqual(recipe.seed as ColorValue, entry.color, gamut)
  );
  return matches.length === 1 ? matches[0]?.id : undefined;
}

export function normalizeColorFocusOrder(
  palette: Palette<object>,
  order: readonly string[] | undefined
): readonly string[] {
  if (order !== undefined) {
    if (!Array.isArray(order)) throw new EditorStateError("Color focus order must be an array");
    const items: readonly unknown[] = order;
    for (let index = 0; index < items.length; index += 1) {
      if (!Object.hasOwn(items, index)) {
        throw new EditorStateError("Color focus order cannot be sparse");
      }
      const item = items[index];
      if (typeof item !== "string" || item.length === 0) {
        throw new EditorStateError("Color focus order IDs must be non-empty strings");
      }
    }
  }
  const paletteIds = new Set(palette.colors.map((entry) => entry.id));
  const seen = new Set<string>();
  const normalized: string[] = [];

  const requestedOrder: readonly string[] = order ?? [];
  for (const id of requestedOrder) {
    if (paletteIds.has(id) && !seen.has(id)) {
      seen.add(id);
      normalized.push(id);
    }
  }
  for (const entry of palette.colors) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      normalized.push(entry.id);
    }
  }
  return normalized;
}

export function normalizeWheelOptions(
  options: Partial<WheelEditorOptions> = {},
  base: WheelEditorOptions = DEFAULT_WHEEL_OPTIONS
): WheelEditorOptions {
  assertPlainRecord(options, "Wheel options");
  assertAllowedKeys(options, ["wheelModel", "interaction", "outputGamut"], "Wheel options");
  const wheelModel = options.wheelModel ?? base.wheelModel;
  const interaction = options.interaction ?? base.interaction;
  const outputGamut = options.outputGamut ?? base.outputGamut;

  if (wheelModel !== "hsv" && wheelModel !== "oklch") {
    throw new EditorStateError(`Unsupported wheel model "${String(wheelModel)}"`);
  }
  if (interaction !== "linked" && interaction !== "free") {
    throw new EditorStateError(`Unsupported interaction policy "${String(interaction)}"`);
  }
  if (outputGamut !== "srgb" && outputGamut !== "display-p3") {
    throw new EditorStateError(`Unsupported output gamut "${String(outputGamut)}"`);
  }

  if (
    wheelModel === base.wheelModel &&
    interaction === base.interaction &&
    outputGamut === base.outputGamut
  ) {
    return base;
  }
  return { wheelModel, interaction, outputGamut };
}

function resolveInitialSelection<Metadata extends object>(
  palette: Palette<Metadata>,
  key: "activeColorId" | "anchorColorId",
  selection: unknown
): string | undefined {
  assertOptionalId(selection, key);
  if (selection !== undefined && !hasColorId(palette, selection)) {
    throw new UnknownColorIdError(selection);
  }
  return selection;
}

export function createPickerState<Metadata extends object = JsonObject>(
  options: CreatePickerStateOptions<Metadata>
): PickerState<Metadata> {
  assertPlainRecord(options, "Picker state options");
  assertAllowedKeys(
    options,
    ["palette", "activeColorId", "anchorColorId", "colorFocusOrder", "wheel"],
    "Picker state options"
  );
  const hasActiveColorId = owns(options, "activeColorId");
  const hasAnchorColorId = owns(options, "anchorColorId");
  const palette = options.palette;
  const requestedActiveColorId = options.activeColorId;
  const requestedAnchorColorId = options.anchorColorId;
  const requestedFocusOrder = options.colorFocusOrder;
  const requestedWheel = options.wheel;
  assertRuntimePalette<Metadata>(palette);
  const wheel = normalizeWheelOptions(requestedWheel);
  if (
    wheel.interaction === "linked" &&
    (palette.recipe?.type !== "wheel" || palette.recipe.harmony === undefined)
  ) {
    throw new LinkedInteractionError(
      "Linked interaction requires a live wheel recipe with a harmony rule"
    );
  }
  const firstColorId = palette.colors[0]?.id;
  const seedColorId = resolveRecipeSeedColorId(palette, wheel.outputGamut) ?? firstColorId;
  const activeColorId = resolveInitialSelection(
    palette,
    "activeColorId",
    hasActiveColorId
      ? requestedActiveColorId
      : wheel.interaction === "linked"
        ? seedColorId
        : firstColorId
  );
  const anchorColorId = resolveInitialSelection(
    palette,
    "anchorColorId",
    hasAnchorColorId ? requestedAnchorColorId : seedColorId
  );
  return {
    palette,
    ...(activeColorId === undefined ? {} : { activeColorId }),
    ...(anchorColorId === undefined ? {} : { anchorColorId }),
    colorFocusOrder: normalizeColorFocusOrder(palette, requestedFocusOrder),
    wheel
  };
}

export function normalizePickerState<Metadata extends object>(
  state: PickerState<Metadata>
): PickerState<Metadata> {
  assertPlainRecord(state, "Picker state");
  assertAllowedKeys(
    state,
    ["palette", "activeColorId", "anchorColorId", "colorFocusOrder", "wheel"],
    "Picker state"
  );
  if (inspectJsonContainer(state) !== undefined)
    throw new EditorStateError("Picker state must be a plain object");
  if (!owns(state, "colorFocusOrder")) {
    throw new EditorStateError("Picker state requires colorFocusOrder");
  }
  if (!owns(state, "wheel")) throw new EditorStateError("Picker state requires wheel options");
  const palette = state.palette;
  const activeColorId = state.activeColorId;
  const anchorColorId = state.anchorColorId;
  const colorFocusOrder = state.colorFocusOrder;
  const wheelInput = state.wheel;
  assertRuntimePalette<Metadata>(palette);
  assertOptionalId(activeColorId, "activeColorId");
  assertOptionalId(anchorColorId, "anchorColorId");
  if (activeColorId !== undefined && !hasColorId(palette, activeColorId)) {
    throw new UnknownColorIdError(activeColorId);
  }
  if (anchorColorId !== undefined && !hasColorId(palette, anchorColorId)) {
    throw new UnknownColorIdError(anchorColorId);
  }
  const focusOrder = normalizeColorFocusOrder(palette, colorFocusOrder);
  const wheel = normalizeWheelOptions(wheelInput);
  if (
    wheel.interaction === "linked" &&
    (palette.recipe?.type !== "wheel" || palette.recipe.harmony === undefined)
  ) {
    throw new LinkedInteractionError(
      "Linked interaction requires a live wheel recipe with a harmony rule"
    );
  }
  const canonicalOptionalIds =
    (activeColorId !== undefined || !owns(state, "activeColorId")) &&
    (anchorColorId !== undefined || !owns(state, "anchorColorId"));
  if (
    focusOrder.length === colorFocusOrder.length &&
    focusOrder.every((id, index) => id === colorFocusOrder[index]) &&
    wheel === wheelInput &&
    canonicalOptionalIds
  ) {
    return state;
  }
  return {
    palette,
    ...(activeColorId === undefined ? {} : { activeColorId }),
    ...(anchorColorId === undefined ? {} : { anchorColorId }),
    colorFocusOrder: focusOrder,
    wheel
  };
}

function mappedColorsEqual(
  left: ColorValue,
  right: ColorValue,
  gamut: "srgb" | "display-p3"
): boolean {
  const mappedLeft = mapToGamut(left, gamut).color;
  const mappedRight = mapToGamut(right, gamut).color;
  const epsilon = 1e-9;
  return (
    mappedLeft.space === mappedRight.space &&
    Math.abs(mappedLeft.r - mappedRight.r) <= epsilon &&
    Math.abs(mappedLeft.g - mappedRight.g) <= epsilon &&
    Math.abs(mappedLeft.b - mappedRight.b) <= epsilon &&
    mappedLeft.alpha === mappedRight.alpha
  );
}

export function areColorValuesEqual(left: ColorValue, right: ColorValue): boolean {
  if (left === right) return true;
  if (left.space !== right.space || left.alpha !== right.alpha) return false;
  switch (left.space) {
    case "srgb":
    case "display-p3": {
      if (right.space !== left.space) return false;
      return left.r === right.r && left.g === right.g && left.b === right.b;
    }
    case "hsl": {
      if (right.space !== "hsl") return false;
      return left.h === right.h && left.s === right.s && left.l === right.l;
    }
    case "hsv": {
      if (right.space !== "hsv") return false;
      return left.h === right.h && left.s === right.s && left.v === right.v;
    }
    case "oklch": {
      if (right.space !== "oklch") return false;
      return left.l === right.l && left.c === right.c && left.h === right.h;
    }
  }
}

export function arePaletteColorsEqual(
  left: PaletteColor<object>,
  right: PaletteColor<object>
): boolean {
  return (
    left === right ||
    (left.id === right.id &&
      areColorValuesEqual(left.color, right.color) &&
      left.name === right.name &&
      left.role === right.role &&
      left.locked === right.locked &&
      left.metadata === right.metadata)
  );
}

export function diffPaletteColorIds(
  left: Palette<object>,
  right: Palette<object>
): readonly string[] {
  const leftById = new Map(left.colors.map((entry) => [entry.id, entry]));
  const rightById = new Map(right.colors.map((entry) => [entry.id, entry]));
  const changed: string[] = [];

  for (const entry of left.colors) {
    const next = rightById.get(entry.id);
    if (next === undefined || !arePaletteColorsEqual(entry, next)) changed.push(entry.id);
  }
  for (const entry of right.colors) {
    if (!leftById.has(entry.id)) changed.push(entry.id);
  }

  if (
    left.colors.length === right.colors.length &&
    !left.colors.every((entry, index) => entry.id === right.colors[index]?.id)
  ) {
    for (const entry of right.colors) {
      if (!changed.includes(entry.id)) changed.push(entry.id);
    }
  }
  return changed;
}
