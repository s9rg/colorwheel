import { Fragment, useEffect, useId, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes,
  ComponentType,
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode
} from "react";
import { convertColor, formatColor } from "../core";
import type { JsonObject, PaletteColor } from "../core";
import {
  OKLCH_WHEEL_MAX_CHROMA,
  clientPointToWheelPoint,
  colorToWheelPoint,
  getSliderKeyboardValue,
  getWheelChannelValue,
  getPointerAccessibilityProps,
  getWheelAccessibilityProps,
  ringPointToWheelChannelValue,
  resolveWheelEditingColor,
  setWheelChannelValue,
  wheelChannelValueToRingPoint,
  wheelPointToColor
} from "../editor";
import type { PickerInteraction, PickerState, WheelPoint, WheelRingSide } from "../editor";
import { usePickerController, usePickerSelector } from "./context";

const selectState = <Metadata extends object>(
  state: PickerState<Metadata>
): PickerState<Metadata> => state;

interface ActiveDrag<Metadata extends object> {
  readonly pointerId: number;
  readonly colorId: string;
  readonly interaction: PickerInteraction<Metadata>;
}

type ActiveRingDrag<Metadata extends object> = ActiveDrag<Metadata>;

const RING_SIDE_HYSTERESIS = 0.04;

export interface WheelPointerRenderProps<Metadata extends object = JsonObject> {
  readonly entry: PaletteColor<Metadata>;
  readonly point: WheelPoint;
  readonly active: boolean;
  readonly anchor: boolean;
  readonly editable: boolean;
  readonly buttonProps: ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly type: "button";
    readonly "data-part": "pointer";
    readonly "data-color-id": string;
  };
}

export type WheelPointerProps<Metadata extends object = JsonObject> =
  WheelPointerRenderProps<Metadata>;

export function WheelPointer<Metadata extends object = JsonObject>({
  entry,
  point,
  active,
  anchor,
  editable,
  buttonProps
}: WheelPointerProps<Metadata>) {
  const cssColor = formatColor(entry.color, { format: "rgb", alpha: "auto" });
  const style = {
    "--colorwheel-pointer-x": `${point.x * 100}%`,
    "--colorwheel-pointer-y": `${point.y * 100}%`,
    "--colorwheel-pointer-color": cssColor
  } as CSSProperties;

  return (
    <button
      {...buttonProps}
      type="button"
      data-part="pointer"
      data-color-id={entry.id}
      data-editable={editable ? "" : undefined}
      data-active={active ? "true" : "false"}
      data-anchor={anchor ? "true" : "false"}
      style={{ ...style, ...buttonProps.style }}
    >
      <span data-part="pointer-color" aria-hidden="true" />
      {anchor ? <span data-part="pointer-anchor" aria-hidden="true" /> : null}
    </button>
  );
}

function entryById<Metadata extends object>(
  state: PickerState<Metadata>,
  id: string
): PaletteColor<Metadata> | undefined {
  return state.palette.colors.find((entry) => entry.id === id);
}

function canEdit<Metadata extends object>(
  state: PickerState<Metadata>,
  entry: PaletteColor<Metadata>
): boolean {
  return !entry.locked && (state.wheel.interaction === "free" || entry.id === state.anchorColorId);
}

function wheelColorAtClientPoint<Metadata extends object>(
  state: PickerState<Metadata>,
  entry: PaletteColor<Metadata>,
  event: Pick<ReactPointerEvent<HTMLElement>, "clientX" | "clientY" | "currentTarget">
) {
  const rect = event.currentTarget.getBoundingClientRect();
  const point = clientPointToWheelPoint(
    { x: event.clientX, y: event.clientY },
    { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  );
  return wheelPointToColor(point, resolveWheelEditingColor(state, entry), {
    model: state.wheel.wheelModel
  });
}

function ringColorAtClientPoint<Metadata extends object>(
  state: PickerState<Metadata>,
  entry: PaletteColor<Metadata>,
  event: Pick<ReactPointerEvent<HTMLElement>, "clientX" | "clientY" | "currentTarget">,
  previousSide: WheelRingSide
): { readonly color: ReturnType<typeof setWheelChannelValue>; readonly side: WheelRingSide } {
  const rect = event.currentTarget.getBoundingClientRect();
  const size = Math.min(rect.width, rect.height);
  const centerX = rect.left + rect.width / 2;
  const hysteresis = size * RING_SIDE_HYSTERESIS;
  let side = previousSide;
  if (event.clientX < centerX - hysteresis) side = "left";
  else if (event.clientX > centerX + hysteresis) side = "right";
  const point = clientPointToWheelPoint(
    { x: event.clientX, y: event.clientY },
    { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  );
  return {
    color: setWheelChannelValue(
      resolveWheelEditingColor(state, entry),
      ringPointToWheelChannelValue(point),
      {
        model: state.wheel.wheelModel
      }
    ),
    side
  };
}

export interface WheelBlockProps<Metadata extends object = JsonObject> {
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly pointer?: ComponentType<WheelPointerProps<Metadata>>;
  readonly renderPointer?: (
    props: WheelPointerRenderProps<Metadata>,
    defaultPointer: ReactNode
  ) => ReactNode;
  readonly className?: string;
  readonly showInstructions?: boolean;
  /** Show the model's third channel around the polar wheel: HSV value or OKLCH lightness. */
  readonly showChannelRing?: boolean;
}

export function WheelBlock<Metadata extends object = JsonObject>({
  title = "Color wheel",
  description,
  pointer,
  renderPointer,
  className,
  showInstructions = true,
  showChannelRing = true
}: WheelBlockProps<Metadata>) {
  const state = usePickerSelector<PickerState<Metadata>, Metadata>(selectState);
  const controller = usePickerController<Metadata>();
  const Pointer = pointer ?? (WheelPointer as ComponentType<WheelPointerProps<Metadata>>);
  const surface = useRef<HTMLDivElement | null>(null);
  const drag = useRef<ActiveDrag<Metadata> | null>(null);
  const ringDrag = useRef<ActiveRingDrag<Metadata> | null>(null);
  const ringSideRef = useRef<WheelRingSide>("right");
  const [ringSide, setRingSide] = useState<WheelRingSide>("right");
  const instructionsId = useId();

  useEffect(
    () => () => {
      const current = drag.current;
      const currentRing = ringDrag.current;
      drag.current = null;
      ringDrag.current = null;
      if (current !== null) current.interaction.commit();
      if (currentRing !== null) currentRing.interaction.commit();
    },
    [controller]
  );
  const activeEntry =
    (state.activeColorId === undefined ? undefined : entryById(state, state.activeColorId)) ??
    state.palette.colors[0];
  const activeEditingColor =
    activeEntry === undefined ? undefined : resolveWheelEditingColor(state, activeEntry);
  const activeHsv =
    activeEditingColor === undefined ? undefined : convertColor(activeEditingColor, "hsv");
  const anchorEntry =
    state.anchorColorId === undefined ? undefined : entryById(state, state.anchorColorId);
  const ringEntry = state.wheel.interaction === "linked" ? anchorEntry : activeEntry;
  const ringEditingColor =
    ringEntry === undefined ? undefined : resolveWheelEditingColor(state, ringEntry);
  const ringEditable = ringEntry !== undefined && canEdit(state, ringEntry);
  const ringChannel = state.wheel.wheelModel === "oklch" ? "lightness" : "value";
  const ringValue =
    ringEditingColor === undefined
      ? 0.5
      : getWheelChannelValue(ringEditingColor, { model: state.wheel.wheelModel });
  const ringPoint = wheelChannelValueToRingPoint(ringValue, { side: ringSide });
  const ringEntryIndex =
    ringEntry === undefined
      ? -1
      : state.palette.colors.findIndex((entry) => entry.id === ringEntry.id);
  const ringEntryLabel =
    ringEntry?.name?.trim() ||
    (ringEntryIndex >= 0 ? `Color ${ringEntryIndex + 1}` : "Active color");
  const orderedEntries = state.colorFocusOrder
    .map((id) => entryById(state, id))
    .filter((entry): entry is PaletteColor<Metadata> => entry !== undefined);
  const points = orderedEntries.map((entry) => ({
    entry,
    point: colorToWheelPoint(resolveWheelEditingColor(state, entry), {
      model: state.wheel.wheelModel
    })
  }));

  function resolvePointerColorId(event: ReactPointerEvent<HTMLDivElement>): string | undefined {
    const target = event.target;
    const ElementConstructor = event.currentTarget.ownerDocument.defaultView?.Element;
    const handle =
      ElementConstructor !== undefined && target instanceof ElementConstructor
        ? target.closest<HTMLElement>("[data-part='pointer']")
        : null;
    const requested = handle?.dataset.colorId;
    if (requested !== undefined) return requested;
    if (state.wheel.interaction === "linked") return state.anchorColorId;
    return state.activeColorId ?? state.palette.colors[0]?.id;
  }

  function applyPointer(
    colorId: string,
    event: ReactPointerEvent<HTMLDivElement>,
    interaction: PickerInteraction<Metadata>
  ): void {
    const currentState = controller.getState();
    const entry = entryById(currentState, colorId);
    if (entry === undefined || !canEdit(currentState, entry)) return;
    interaction.update({
      type: "set-color",
      colorId,
      color: wheelColorAtClientPoint(currentState, entry, event)
    });
  }

  function startPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      drag.current !== null ||
      ringDrag.current !== null
    )
      return;
    const colorId = resolvePointerColorId(event);
    if (colorId === undefined) return;
    controller.commands.setActive(colorId, {
      action: "selection",
      phase: "commit"
    });
    const entry = entryById(controller.getState(), colorId);
    if (entry === undefined || !canEdit(controller.getState(), entry)) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const interaction = controller.beginInteraction({ action: "pointer" });
    drag.current = { pointerId: event.pointerId, colorId, interaction };
    applyPointer(colorId, event, interaction);
    event.preventDefault();
  }

  function applyRingPointer(
    colorId: string,
    event: ReactPointerEvent<HTMLDivElement>,
    interaction: PickerInteraction<Metadata>
  ): void {
    const currentState = controller.getState();
    const entry = entryById(currentState, colorId);
    if (entry === undefined || !canEdit(currentState, entry)) return;
    const result = ringColorAtClientPoint(currentState, entry, event, ringSideRef.current);
    // Keep the transient presentation side current before the controller update
    // causes React to render the new channel value.
    if (result.side !== ringSideRef.current) {
      ringSideRef.current = result.side;
      setRingSide(result.side);
    }
    interaction.update({
      type: "set-color",
      colorId,
      color: result.color
    });
  }

  function startRingPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      drag.current !== null ||
      ringDrag.current !== null
    )
      return;
    const currentState = controller.getState();
    const colorId =
      (currentState.wheel.interaction === "linked"
        ? currentState.anchorColorId
        : currentState.activeColorId) ?? currentState.palette.colors[0]?.id;
    if (colorId === undefined) return;
    const entry = entryById(currentState, colorId);
    if (entry === undefined || !canEdit(currentState, entry)) return;

    controller.commands.setActive(colorId, { action: "selection", phase: "commit" });
    event.currentTarget.setPointerCapture(event.pointerId);
    const interaction = controller.beginInteraction({ action: "pointer" });
    ringDrag.current = { pointerId: event.pointerId, colorId, interaction };
    applyRingPointer(colorId, event, interaction);
    event.preventDefault();
  }

  function moveRingPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    const current = ringDrag.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    applyRingPointer(current.colorId, event, current.interaction);
    event.preventDefault();
  }

  function endRingPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    const current = ringDrag.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    ringDrag.current = null;
    if (event.type === "pointercancel") {
      current.interaction.cancel();
    } else {
      applyRingPointer(current.colorId, event, current.interaction);
      current.interaction.commit();
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleRingKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (ringEntry === undefined || !ringEditable) return;
    const next = getSliderKeyboardValue(ringValue, event, {
      minimum: 0,
      maximum: 1,
      step: 0.01,
      coarseStep: 0.1,
      fineStep: 0.001
    });
    if (next === undefined) return;
    event.preventDefault();
    controller.commands.setActive(ringEntry.id, {
      action: "selection",
      phase: "commit"
    });
    controller.commands.setColor(
      ringEntry.id,
      setWheelChannelValue(resolveWheelEditingColor(state, ringEntry), next, {
        model: state.wheel.wheelModel
      }),
      { action: "keyboard", phase: "commit" }
    );
  }

  function movePointer(event: ReactPointerEvent<HTMLDivElement>): void {
    const current = drag.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    applyPointer(current.colorId, event, current.interaction);
    event.preventDefault();
  }

  function endPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    const current = drag.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    // Clear the ref before releasing capture. Some engines dispatch
    // lostpointercapture synchronously; leaving the committed interaction in
    // the ref lets that event try to cancel an interaction that already ended.
    drag.current = null;
    if (event.type === "pointercancel") {
      current.interaction.cancel();
    } else {
      applyPointer(current.colorId, event, current.interaction);
      current.interaction.commit();
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(
    entry: PaletteColor<Metadata>,
    event: React.KeyboardEvent<HTMLButtonElement>
  ): void {
    if (event.key === "Enter" || event.key === " ") {
      controller.commands.setActive(entry.id, {
        action: "selection",
        phase: "commit"
      });
      return;
    }
    if (!canEdit(state, entry)) return;
    const hueStep = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
    const radiusStep = event.shiftKey ? 0.1 : event.altKey ? 0.001 : 0.01;
    const modelColor =
      state.wheel.wheelModel === "oklch"
        ? convertColor(resolveWheelEditingColor(state, entry), "oklch")
        : convertColor(resolveWheelEditingColor(state, entry), "hsv");
    let next: typeof modelColor | undefined;
    if (event.key === "ArrowLeft" || event.key === "PageDown") {
      next = {
        ...modelColor,
        h: modelColor.h - (event.key === "PageDown" ? 10 : hueStep)
      };
    } else if (event.key === "ArrowRight" || event.key === "PageUp") {
      next = {
        ...modelColor,
        h: modelColor.h + (event.key === "PageUp" ? 10 : hueStep)
      };
    } else if (modelColor.space === "oklch") {
      if (event.key === "ArrowUp") {
        next = {
          ...modelColor,
          c: Math.min(OKLCH_WHEEL_MAX_CHROMA, modelColor.c + radiusStep * OKLCH_WHEEL_MAX_CHROMA)
        };
      } else if (event.key === "ArrowDown") {
        next = {
          ...modelColor,
          c: Math.max(0, modelColor.c - radiusStep * OKLCH_WHEEL_MAX_CHROMA)
        };
      } else if (event.key === "Home") next = { ...modelColor, c: 0 };
      else if (event.key === "End") next = { ...modelColor, c: OKLCH_WHEEL_MAX_CHROMA };
    } else {
      if (event.key === "ArrowUp") {
        next = { ...modelColor, s: Math.min(1, modelColor.s + radiusStep) };
      } else if (event.key === "ArrowDown") {
        next = { ...modelColor, s: Math.max(0, modelColor.s - radiusStep) };
      } else if (event.key === "Home") next = { ...modelColor, s: 0 };
      else if (event.key === "End") next = { ...modelColor, s: 1 };
    }
    if (next === undefined) return;

    event.preventDefault();
    controller.commands.setActive(entry.id, {
      action: "selection",
      phase: "commit"
    });
    controller.commands.setColor(entry.id, next, {
      action: "keyboard",
      phase: "commit"
    });
  }

  const surfaceStyle = {
    "--colorwheel-value": activeHsv?.v ?? 1,
    "--colorwheel-lightness": `${
      activeEditingColor === undefined ? 70 : convertColor(activeEditingColor, "oklch").l * 100
    }%`,
    ...(ringEntry === undefined || ringEditingColor === undefined
      ? {}
      : {
          "--colorwheel-channel-start": formatColor(
            setWheelChannelValue(ringEditingColor, 0, { model: state.wheel.wheelModel }),
            { format: "rgb", alpha: "never" }
          ),
          "--colorwheel-channel-mid": formatColor(
            setWheelChannelValue(ringEditingColor, 0.5, { model: state.wheel.wheelModel }),
            { format: "rgb", alpha: "never" }
          ),
          "--colorwheel-channel-end": formatColor(
            setWheelChannelValue(ringEditingColor, 1, { model: state.wheel.wheelModel }),
            { format: "rgb", alpha: "never" }
          ),
          "--colorwheel-channel-ring-x": `${ringPoint.x * 100}%`,
          "--colorwheel-channel-ring-y": `${ringPoint.y * 100}%`,
          "--colorwheel-channel-ring-angle": `${Math.atan2(
            ringPoint.y - 0.5,
            ringPoint.x - 0.5
          )}rad`,
          "--colorwheel-channel-color": formatColor(ringEditingColor, {
            format: "rgb",
            alpha: "never"
          })
        })
  } as CSSProperties;
  const wheelA11y = getWheelAccessibilityProps();

  return (
    <section data-part="wheel-block" className={className}>
      <header data-part="block-header">
        <div>
          <h2 data-part="block-title">{title}</h2>
          {description ? <div data-part="block-description">{description}</div> : null}
        </div>
        <output data-part="active-color" aria-live="polite">
          {activeEntry === undefined
            ? "No color"
            : formatColor(activeEntry.color, { format: "hex", alpha: "auto" })}
        </output>
      </header>

      <div
        data-part="wheel-frame"
        data-ring={showChannelRing && ringEntry !== undefined ? "true" : "false"}
        data-model={state.wheel.wheelModel}
        style={surfaceStyle}
      >
        {showChannelRing && ringEntry !== undefined ? (
          <div
            role="slider"
            data-part="channel-ring"
            data-color-id={ringEntry.id}
            data-channel={ringChannel}
            data-model={state.wheel.wheelModel}
            data-side={ringSide}
            tabIndex={ringEditable ? 0 : -1}
            aria-label={`${ringEntryLabel} ${ringChannel} ring`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ringValue * 1000) / 10}
            aria-valuetext={`${Math.round(ringValue * 100)} percent`}
            aria-orientation="vertical"
            aria-disabled={!ringEditable || undefined}
            onKeyDown={handleRingKeyDown}
            onPointerDown={startRingPointer}
            onPointerMove={moveRingPointer}
            onPointerUp={endRingPointer}
            onPointerCancel={endRingPointer}
            onLostPointerCapture={(event) => {
              const current = ringDrag.current;
              if (current !== null && current.pointerId === event.pointerId) {
                current.interaction.cancel();
                ringDrag.current = null;
              }
            }}
          >
            <span data-part="channel-ring-track" aria-hidden="true" />
            <span data-part="channel-ring-thumb" aria-hidden="true" />
          </div>
        ) : null}

        <div
          {...wheelA11y}
          ref={surface}
          data-part="wheel"
          data-model={state.wheel.wheelModel}
          aria-describedby={showInstructions ? instructionsId : undefined}
          onPointerDown={startPointer}
          onPointerMove={movePointer}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onLostPointerCapture={(event) => {
            const current = drag.current;
            if (current !== null && current.pointerId === event.pointerId) {
              current.interaction.cancel();
              drag.current = null;
            }
          }}
        >
          <div data-part="wheel-color" aria-hidden="true" />
          {points.length > 1 ? (
            <svg data-part="harmony-lines" viewBox="0 0 100 100" aria-hidden="true">
              {points.map(({ point }, index) => {
                const next = points[(index + 1) % points.length]?.point;
                return next === undefined ? null : (
                  <line
                    key={`${index}-${(index + 1) % points.length}`}
                    x1={point.x * 100}
                    y1={point.y * 100}
                    x2={next.x * 100}
                    y2={next.y * 100}
                  />
                );
              })}
            </svg>
          ) : null}
          {points.map(({ entry, point }) => {
            const pointerProps: WheelPointerProps<Metadata> = {
              entry,
              point,
              active: entry.id === state.activeColorId,
              anchor: entry.id === state.anchorColorId,
              editable: canEdit(state, entry),
              buttonProps: {
                ...getPointerAccessibilityProps(state, entry.id),
                type: "button",
                "data-part": "pointer",
                "data-color-id": entry.id,
                disabled: !canEdit(state, entry),
                "aria-disabled": !canEdit(state, entry) || undefined,
                onFocus: () =>
                  controller.commands.setActive(entry.id, {
                    action: "selection",
                    phase: "commit"
                  }),
                onKeyDown: (event) => handleKeyDown(entry, event)
              }
            };
            const defaultPointer = <Pointer key={entry.id} {...pointerProps} />;
            return (
              <Fragment key={entry.id}>
                {renderPointer?.(pointerProps, defaultPointer) ?? defaultPointer}
              </Fragment>
            );
          })}
        </div>
      </div>

      {showInstructions ? (
        <p id={instructionsId} data-part="wheel-instructions">
          Drag or tap the wheel to set{" "}
          {state.wheel.wheelModel === "oklch" ? "hue and chroma" : "hue and saturation"}.
          {showChannelRing ? ` Use the outer ring to set ${ringChannel}.` : ""} Use arrow keys on a
          handle, or use the numeric channel controls.
        </p>
      ) : null}
    </section>
  );
}
