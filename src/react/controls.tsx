import { useEffect, useRef } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { convertColor, createHarmonyPalette, createTonalPalette, formatColor } from "../core";
import type { BuiltInHarmonyRule, ColorValue, HsvColor, Palette } from "../core";
import { OKLCH_WHEEL_MAX_CHROMA, resolveWheelEditingColor } from "../editor";
import type { PickerInteraction, PickerState } from "../editor";
import { usePickerController, usePickerSelector } from "./context";

const selectState = (state: PickerState): PickerState => state;

export type BuiltInPaletteMode =
  | "single"
  | "complementary"
  | "analogous"
  | "triadic"
  | "tetradic"
  | "split-complementary"
  | "monochromatic"
  | "tonal";

const modeLabels: Readonly<Record<BuiltInPaletteMode, string>> = {
  single: "Single",
  complementary: "Complementary",
  analogous: "Analogous",
  triadic: "Triadic",
  tetradic: "Tetradic",
  "split-complementary": "Split complementary",
  monochromatic: "Monochromatic",
  tonal: "Tonal scale"
};

export const DEFAULT_PALETTE_MODES: readonly BuiltInPaletteMode[] = [
  "complementary",
  "monochromatic",
  "analogous",
  "triadic",
  "tetradic",
  "split-complementary",
  "tonal",
  "single"
];

function currentMode(state: PickerState): BuiltInPaletteMode | "custom" {
  if (state.palette.kind === "tonal") return "tonal";
  const type = state.palette.recipe?.harmony?.type;
  return type !== undefined && type in modeLabels ? type : "custom";
}

function uniqueIdFactory(palette: Palette): (index: number) => string {
  const claimed = new Set<string>();
  return (index) => {
    const existing = palette.colors[index]?.id;
    if (existing !== undefined && !claimed.has(existing)) {
      claimed.add(existing);
      return existing;
    }
    let counter = index + 1;
    let candidate = `color-${counter}`;
    while (claimed.has(candidate)) {
      counter += 1;
      candidate = `color-${counter}`;
    }
    claimed.add(candidate);
    return candidate;
  };
}

function invalidHarmonySlots(): never {
  throw new Error("Invalid built-in harmony slots");
}

function remapHarmonyIds(state: PickerState, generated: Palette): Palette {
  const recipe = generated.recipe;
  const generatedSeedColorId = recipe?.seedColorId;
  const generatedSlotIds = recipe?.colorSlotIds;
  const seedOwnerId = state.anchorColorId ?? state.palette.colors[0]?.id ?? generatedSeedColorId;
  if (
    recipe === undefined ||
    generatedSeedColorId === undefined ||
    generatedSlotIds === undefined ||
    seedOwnerId === undefined
  ) {
    invalidHarmonySlots();
  }

  const seedIndex = generatedSlotIds.indexOf(generatedSeedColorId);
  const generatedById = new Map(generated.colors.map((entry) => [entry.id, entry]));
  if (seedIndex < 0) invalidHarmonySlots();

  const currentSlotIds = state.palette.recipe?.colorSlotIds ?? state.colorFocusOrder;
  const lockedIds = new Set(
    state.palette.colors.filter((entry) => entry.locked).map((entry) => entry.id)
  );
  const companionIds = currentSlotIds.filter((id) => id !== seedOwnerId && !lockedIds.has(id));
  const reservedIds = new Set(state.palette.colors.map((entry) => entry.id));
  const assignedIds = new Set<string>();
  let companionIndex = 0;
  let generatedIndex = 0;
  const nextGeneratedId = (): string => {
    let id: string;
    do id = `generated-color-${++generatedIndex}`;
    while (reservedIds.has(id) || assignedIds.has(id));
    return id;
  };

  const colors = generatedSlotIds.map((slotId, index) => {
    const entry = generatedById.get(slotId);
    if (entry === undefined) invalidHarmonySlots();
    const id =
      index === seedIndex ? seedOwnerId : (companionIds[companionIndex++] ?? nextGeneratedId());
    assignedIds.add(id);
    return { ...entry, id };
  });

  return {
    ...generated,
    colors,
    recipe: {
      ...recipe,
      seedColorId: seedOwnerId,
      colorSlotIds: colors.map((entry) => entry.id)
    }
  };
}

function harmonyRule(mode: Exclude<BuiltInPaletteMode, "tonal">): BuiltInHarmonyRule {
  switch (mode) {
    case "single":
      return { type: "single" };
    case "complementary":
      return { type: "complementary" };
    case "analogous":
      return { type: "analogous", count: 3, spread: 30 };
    case "triadic":
      return { type: "triadic" };
    case "tetradic":
      return { type: "tetradic" };
    case "split-complementary":
      return { type: "split-complementary", spread: 60 };
    case "monochromatic":
      return { type: "monochromatic", count: 5 };
  }
}

function activeColor(state: PickerState): ColorValue | undefined {
  return state.palette.colors.find((entry) => entry.id === state.activeColorId)?.color;
}

function anchorColor(state: PickerState): ColorValue | undefined {
  if (state.palette.kind === "tonal") {
    const generatedSeed = state.palette.recipe?.seed ?? state.palette.provenance.seeds?.[0];
    if (generatedSeed !== undefined) return generatedSeed;
  }
  const anchor =
    state.palette.colors.find((entry) => entry.id === state.anchorColorId) ??
    state.palette.colors[0];
  return anchor === undefined ? undefined : resolveWheelEditingColor(state, anchor);
}

function mergeGeneratedPalette(previous: Palette, generated: Palette): Palette {
  const previousById = new Map(previous.colors.map((entry) => [entry.id, entry]));
  const generatedIds = new Set(generated.colors.map((entry) => entry.id));
  const colors = generated.colors.map((entry) => {
    const existing = previousById.get(entry.id);
    if (existing === undefined) return entry;
    return {
      ...existing,
      color: existing.locked ? existing.color : entry.color
    };
  });
  for (const entry of previous.colors) {
    if (entry.locked && !generatedIds.has(entry.id)) colors.push(entry);
  }
  return {
    ...previous,
    kind: generated.kind,
    colors,
    recipe: generated.recipe,
    provenance: generated.provenance,
    name: previous.name ?? generated.name
  };
}

export interface HarmonyControlsProps {
  readonly modes?: readonly BuiltInPaletteMode[];
  readonly label?: ReactNode;
}

export function HarmonyControls({
  modes = DEFAULT_PALETTE_MODES,
  label = "Palette relationship"
}: HarmonyControlsProps) {
  const state = usePickerSelector(selectState);
  const controller = usePickerController();
  const value = currentMode(state);
  const displayedModes: readonly BuiltInPaletteMode[] =
    value !== "custom" && !modes.includes(value) ? [value, ...modes] : modes;

  function selectMode(mode: BuiltInPaletteMode): void {
    const seed = anchorColor(state) ?? { space: "hsv", h: 258, s: 0.72, v: 0.96 };
    const next =
      mode === "tonal"
        ? createTonalPalette({
            seed,
            count: 7,
            outputGamut: state.wheel.outputGamut,
            name: modeLabels[mode],
            idFactory: uniqueIdFactory(state.palette)
          })
        : remapHarmonyIds(
            state,
            createHarmonyPalette({
              seed,
              harmony: harmonyRule(mode),
              outputGamut: state.wheel.outputGamut,
              name: modeLabels[mode]
            })
          );

    const merged = mergeGeneratedPalette(state.palette, next);
    const seedColorId = merged.recipe?.seedColorId ?? merged.colors[0]?.id;
    controller.transaction(
      () => {
        controller.commands.replacePalette(merged, { action: "harmony" });
        controller.commands.setActive(seedColorId, { action: "selection" });
        controller.commands.setAnchor(seedColorId, { action: "selection" });
        controller.commands.setWheelOptions(
          { interaction: mode === "tonal" ? "free" : "linked" },
          { action: "harmony" }
        );
      },
      { action: "harmony", phase: "commit" }
    );
  }

  return (
    <label data-part="field" data-field="palette-mode">
      <span data-part="field-label">{label}</span>
      <select
        data-part="select"
        value={value}
        onChange={(event) => selectMode(event.currentTarget.value as BuiltInPaletteMode)}
      >
        {value === "custom" ? <option value="custom">Custom</option> : null}
        {displayedModes.map((mode) => (
          <option key={mode} value={mode}>
            {modeLabels[mode]}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ChannelControlProps {
  readonly channel: "h" | "s" | "v" | "c" | "l";
  readonly label: string;
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly unit?: string;
  readonly disabled?: boolean;
  readonly setColor: (value: number, interaction: PickerInteraction | null) => void;
}

function ChannelControl({
  channel,
  label,
  value,
  minimum,
  maximum,
  step,
  unit,
  disabled,
  setColor
}: ChannelControlProps) {
  const controller = usePickerController();
  const interaction = useRef<PickerInteraction | null>(null);

  useEffect(
    () => () => {
      const current = interaction.current;
      interaction.current = null;
      if (current !== null) current.commit();
    },
    [controller]
  );

  function beginPointer(): void {
    if (interaction.current !== null) return;
    interaction.current = controller.beginInteraction({
      action: "pointer",
      phase: "start"
    });
    interaction.current.start();
  }

  function update(event: ChangeEvent<HTMLInputElement>): void {
    const next = Number(event.currentTarget.value);
    setColor(next, interaction.current);
  }

  function endPointer(event: ReactPointerEvent<HTMLInputElement>): void {
    if (interaction.current === null) return;
    if (event.type === "pointercancel") interaction.current.cancel();
    else interaction.current.commit();
    interaction.current = null;
  }

  return (
    <label data-part="channel" data-channel={channel}>
      <span data-part="channel-label">{label}</span>
      <input
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={`${Math.round(value * 100) / 100}${unit ?? ""}`}
        onPointerDown={beginPointer}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onChange={update}
      />
      <output data-part="channel-value">
        {Math.round(value * 100) / 100}
        {unit}
      </output>
    </label>
  );
}

export interface ChannelControlsProps {
  readonly title?: ReactNode;
}

export function ChannelControls({ title = "Active color" }: ChannelControlsProps) {
  const state = usePickerSelector(selectState);
  const controller = usePickerController();
  const entry = state.palette.colors.find((color) => color.id === state.activeColorId);
  const editingColor = entry === undefined ? undefined : resolveWheelEditingColor(state, entry);
  const hsv = editingColor === undefined ? undefined : convertColor(editingColor, "hsv");
  const oklch = editingColor === undefined ? undefined : convertColor(editingColor, "oklch");
  const canEdit =
    entry !== undefined &&
    !entry.locked &&
    (state.wheel.interaction === "free" || entry.id === state.anchorColorId);

  function updateColor(
    channel: keyof Pick<HsvColor, "h" | "s" | "v">,
    raw: number,
    interaction: PickerInteraction | null
  ): void {
    if (entry === undefined || hsv === undefined) return;
    const value = channel === "h" ? raw : raw / 100;
    const action = {
      type: "set-color" as const,
      colorId: entry.id,
      color: { ...hsv, [channel]: value }
    };
    if (interaction !== null) {
      interaction.update(action);
    } else {
      controller.dispatch({
        ...action,
        change: { action: "keyboard", phase: "commit" }
      });
    }
  }

  function updateOklchColor(
    channel: "h" | "c" | "l",
    raw: number,
    interaction: PickerInteraction | null
  ): void {
    if (entry === undefined || oklch === undefined) return;
    const value = channel === "l" ? raw / 100 : raw;
    const action = {
      type: "set-color" as const,
      colorId: entry.id,
      color: { ...oklch, [channel]: value }
    };
    if (interaction !== null) {
      interaction.update(action);
    } else {
      controller.dispatch({
        ...action,
        change: { action: "keyboard", phase: "commit" }
      });
    }
  }

  return (
    <fieldset data-part="channels" disabled={entry === undefined}>
      <legend data-part="field-label">{title}</legend>
      {hsv === undefined || oklch === undefined ? (
        <p data-part="empty-state">Select or add a color to edit its channels.</p>
      ) : state.wheel.wheelModel === "oklch" ? (
        <>
          <ChannelControl
            channel="h"
            label="Hue"
            value={Math.round(oklch.h * 100) / 100}
            minimum={0}
            maximum={360}
            step={1}
            unit="°"
            disabled={!canEdit}
            setColor={(value, interaction) => updateOklchColor("h", value, interaction)}
          />
          <ChannelControl
            channel="c"
            label="Chroma"
            value={Math.round(oklch.c * 1000) / 1000}
            minimum={0}
            maximum={OKLCH_WHEEL_MAX_CHROMA}
            step={0.001}
            disabled={!canEdit}
            setColor={(value, interaction) => updateOklchColor("c", value, interaction)}
          />
          <ChannelControl
            channel="l"
            label="Lightness"
            value={Math.round(oklch.l * 10000) / 100}
            minimum={0}
            maximum={100}
            step={1}
            unit="%"
            disabled={!canEdit}
            setColor={(value, interaction) => updateOklchColor("l", value, interaction)}
          />
          {!canEdit && entry !== undefined ? (
            <p data-part="field-help">
              {entry.locked
                ? "Unlock this color to edit it."
                : "Choose free editing to change a non-anchor color."}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <ChannelControl
            channel="h"
            label="Hue"
            value={Math.round(hsv.h * 100) / 100}
            minimum={0}
            maximum={360}
            step={1}
            unit="°"
            disabled={!canEdit}
            setColor={(value, interaction) => updateColor("h", value, interaction)}
          />
          <ChannelControl
            channel="s"
            label="Saturation"
            value={Math.round(hsv.s * 10000) / 100}
            minimum={0}
            maximum={100}
            step={1}
            unit="%"
            disabled={!canEdit}
            setColor={(value, interaction) => updateColor("s", value, interaction)}
          />
          <ChannelControl
            channel="v"
            label="Value"
            value={Math.round(hsv.v * 10000) / 100}
            minimum={0}
            maximum={100}
            step={1}
            unit="%"
            disabled={!canEdit}
            setColor={(value, interaction) => updateColor("v", value, interaction)}
          />
          {!canEdit && entry !== undefined ? (
            <p data-part="field-help">
              {entry.locked
                ? "Unlock this color to edit it."
                : "Choose free editing to change a non-anchor color."}
            </p>
          ) : null}
        </>
      )}
    </fieldset>
  );
}

export interface EditingControlsProps {
  readonly showGamut?: boolean;
  readonly showWheelModel?: boolean;
}

export function EditingControls({ showGamut = true, showWheelModel = true }: EditingControlsProps) {
  const state = usePickerSelector(selectState);
  const controller = usePickerController();
  const canLink = state.palette.recipe?.type === "wheel";

  return (
    <div data-part="editing-controls">
      <label data-part="field">
        <span data-part="field-label">Editing behavior</span>
        <select
          data-part="select"
          value={state.wheel.interaction}
          onChange={(event) =>
            controller.commands.setWheelOptions(
              { interaction: event.currentTarget.value as "linked" | "free" },
              { action: "programmatic", phase: "commit" }
            )
          }
        >
          <option value="linked" disabled={!canLink}>
            Linked harmony
          </option>
          <option value="free">Free editing</option>
        </select>
      </label>
      {showWheelModel ? (
        <label data-part="field">
          <span data-part="field-label">Wheel model</span>
          <select
            data-part="select"
            value={state.wheel.wheelModel}
            onChange={(event) =>
              controller.commands.setWheelOptions(
                { wheelModel: event.currentTarget.value as "hsv" | "oklch" },
                { action: "programmatic", phase: "commit" }
              )
            }
          >
            <option value="hsv">HSV</option>
            <option value="oklch">OKLCH (experimental)</option>
          </select>
        </label>
      ) : null}
      {showGamut ? (
        <label data-part="field">
          <span data-part="field-label">Output gamut</span>
          <select
            data-part="select"
            value={state.wheel.outputGamut}
            onChange={(event) =>
              controller.commands.setWheelOptions(
                { outputGamut: event.currentTarget.value as "srgb" | "display-p3" },
                { action: "programmatic", phase: "commit" }
              )
            }
          >
            <option value="srgb">sRGB</option>
            <option value="display-p3">Display P3</option>
          </select>
        </label>
      ) : null}
    </div>
  );
}

export interface ControlsBlockProps {
  readonly title?: ReactNode;
  readonly modes?: readonly BuiltInPaletteMode[];
  readonly showChannels?: boolean;
  readonly showEditing?: boolean;
  readonly showGamut?: boolean;
  readonly showWheelModel?: boolean;
  readonly children?: ReactNode;
}

export function ControlsBlock({
  title = "Create",
  modes,
  showChannels = true,
  showEditing = true,
  showGamut = true,
  showWheelModel = true,
  children
}: ControlsBlockProps) {
  return (
    <section data-part="controls">
      <header data-part="block-header">
        <h2 data-part="block-title">{title}</h2>
      </header>
      <div data-part="controls-grid">
        <HarmonyControls modes={modes} />
        {showEditing ? (
          <EditingControls showGamut={showGamut} showWheelModel={showWheelModel} />
        ) : null}
      </div>
      {showChannels ? <ChannelControls /> : null}
      {children}
    </section>
  );
}

export function activeColorSummary(state: PickerState): string {
  const color = activeColor(state);
  return color === undefined
    ? "No active color"
    : formatColor(color, { format: "hex", alpha: "auto" });
}
