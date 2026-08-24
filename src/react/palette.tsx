import { Fragment, useEffect, useId, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ComponentType, CSSProperties, ReactNode } from "react";
import { convertColor, formatColor, parseColor } from "../core";
import type { JsonObject, PaletteColor } from "../core";
import type { PickerInteraction, PickerState } from "../editor";
import { usePickerController, usePickerSelector } from "./context";

const selectState = <Metadata extends object>(
  state: PickerState<Metadata>
): PickerState<Metadata> => state;

export type PaletteActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly type: "button";
};

export interface PaletteSwatchRenderProps<Metadata extends object = JsonObject> {
  readonly entry: PaletteColor<Metadata>;
  readonly index: number;
  readonly count: number;
  readonly active: boolean;
  readonly anchor: boolean;
  readonly editable: boolean;
  readonly actionProps: {
    readonly select: PaletteActionButtonProps & {
      readonly "data-part": "swatch";
      readonly "data-color-id": string;
    };
    readonly lock: PaletteActionButtonProps;
    readonly moveEarlier: PaletteActionButtonProps;
    readonly moveLater: PaletteActionButtonProps;
    readonly remove: PaletteActionButtonProps;
  };
}

export interface PaletteSwatchProps<
  Metadata extends object = JsonObject
> extends PaletteSwatchRenderProps<Metadata> {
  readonly showName?: boolean;
  readonly showActions?: boolean;
}

function colorLabel<Metadata extends object>(entry: PaletteColor<Metadata>, index: number): string {
  return entry.name?.trim() || `Color ${index + 1}`;
}

function toHex<Metadata extends object>(entry: PaletteColor<Metadata>): string {
  return formatColor(entry.color, { format: "hex", alpha: "auto" });
}

export function PaletteSwatch<Metadata extends object = JsonObject>({
  entry,
  index,
  active,
  anchor,
  editable,
  showName = true,
  showActions = true,
  actionProps
}: PaletteSwatchProps<Metadata>) {
  const controller = usePickerController<Metadata>();
  const source = toHex(entry);
  const [edit, setEdit] = useState(() => ({
    source,
    value: source,
    invalid: false
  }));
  const nameInteraction = useRef<PickerInteraction<Metadata> | null>(null);
  const removedExternally = useRef(false);
  const inputId = useId();
  const draft = edit.source === source ? edit.value : source;
  const invalid = edit.source === source && edit.invalid;

  useEffect(() => {
    const unsubscribe = controller.subscribe(
      (state) => state.palette.colors.some((candidate) => candidate.id === entry.id),
      (exists, meta) => {
        if (!exists) removedExternally.current = meta.origin === "external";
      }
    );
    return () => {
      unsubscribe();
      const current = nameInteraction.current;
      nameInteraction.current = null;
      if (current !== null && !removedExternally.current) current.commit();
    };
  }, [controller, entry.id]);

  function commitColor(): void {
    if (edit.source !== source) {
      setEdit({ source, value: source, invalid: false });
      return;
    }
    if (!invalid && draft === source) return;
    try {
      const next = parseColor(draft);
      controller.commands.setColor(entry.id, next, {
        action: "text-input",
        phase: "commit"
      });
      const value = formatColor(next, { format: "hex", alpha: "auto" });
      setEdit({ source: value, value, invalid: false });
    } catch {
      setEdit({ source, value: draft, invalid: true });
    }
  }

  function beginNameInteraction(): PickerInteraction<Metadata> {
    const existing = nameInteraction.current;
    if (existing !== null) return existing;
    const created = controller.beginInteraction({ action: "text-input" });
    nameInteraction.current = created;
    created.start();
    return created;
  }

  function commitNameInteraction(): void {
    nameInteraction.current?.commit();
    nameInteraction.current = null;
  }

  const label = colorLabel(entry, index);
  const cssColor = formatColor(convertColor(entry.color, "srgb"), {
    format: "rgb",
    alpha: "auto"
  });

  return (
    <li
      data-part="palette-item"
      data-color-id={entry.id}
      data-active={active ? "" : undefined}
      data-anchor={anchor ? "" : undefined}
      data-locked={entry.locked ? "" : undefined}
    >
      <button
        {...actionProps.select}
        type="button"
        data-part="swatch"
        style={
          {
            "--colorwheel-swatch-color": cssColor,
            ...actionProps.select.style
          } as CSSProperties
        }
      >
        <span data-part="swatch-color" aria-hidden="true" />
        {anchor ? <span data-part="anchor-mark">Anchor</span> : null}
      </button>

      <div data-part="palette-item-fields">
        {showName ? (
          <label data-part="field">
            <span className="colorwheel-visually-hidden">{label} name</span>
            <input
              data-part="name-input"
              value={entry.name ?? ""}
              placeholder={label}
              onFocus={beginNameInteraction}
              onChange={(event) =>
                beginNameInteraction().update({
                  type: "set-color-name",
                  colorId: entry.id,
                  name: event.currentTarget.value || undefined
                })
              }
              onBlur={commitNameInteraction}
            />
          </label>
        ) : null}
        <label data-part="field" htmlFor={inputId}>
          <span className="colorwheel-visually-hidden">{label} value</span>
          <input
            id={inputId}
            data-part="color-input"
            value={draft}
            disabled={!editable || Boolean(entry.locked)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${inputId}-error` : undefined}
            spellCheck={false}
            autoCapitalize="none"
            onChange={(event) => {
              setEdit({
                source,
                value: event.currentTarget.value,
                invalid: false
              });
            }}
            onBlur={commitColor}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitColor();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setEdit({ source, value: source, invalid: false });
              }
            }}
          />
        </label>
        {invalid ? (
          <span id={`${inputId}-error`} data-part="field-error" role="alert">
            Enter a supported CSS color.
          </span>
        ) : null}
      </div>

      {showActions ? (
        <div data-part="palette-item-actions">
          <button {...actionProps.lock} type="button" data-part="icon-button">
            {entry.locked ? "Locked" : "Lock"}
          </button>
          <button {...actionProps.moveEarlier} type="button" data-part="icon-button">
            ←
          </button>
          <button {...actionProps.moveLater} type="button" data-part="icon-button">
            →
          </button>
          <button {...actionProps.remove} type="button" data-part="icon-button">
            Remove
          </button>
        </div>
      ) : null}
    </li>
  );
}

export interface PaletteBlockProps<Metadata extends object = JsonObject> {
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly swatch?: ComponentType<PaletteSwatchProps<Metadata>>;
  readonly renderSwatch?: (
    props: PaletteSwatchRenderProps<Metadata>,
    defaultSwatch: ReactNode
  ) => ReactNode;
  readonly showName?: boolean;
  readonly showActions?: boolean;
  readonly allowAdd?: boolean;
  readonly className?: string;
}

export function PaletteBlock<Metadata extends object = JsonObject>({
  title = "Palette",
  description,
  swatch,
  renderSwatch,
  showName = true,
  showActions = true,
  allowAdd = true,
  className
}: PaletteBlockProps<Metadata>) {
  const state = usePickerSelector<PickerState<Metadata>, Metadata>(selectState);
  const controller = usePickerController<Metadata>();
  const Swatch = swatch ?? (PaletteSwatch as ComponentType<PaletteSwatchProps<Metadata>>);
  const titleId = useId();
  const section = useRef<HTMLElement | null>(null);
  const [focusAfterRemoval, setFocusAfterRemoval] = useState<{
    readonly colorId: string | null;
  } | null>(null);
  const active = state.palette.colors.find((entry) => entry.id === state.activeColorId);

  useEffect(() => {
    if (focusAfterRemoval === null) return;
    const root = section.current;
    const matchingSwatch = [
      ...(root?.querySelectorAll<HTMLElement>("[data-part='swatch']") ?? [])
    ].find((candidate) => candidate.dataset.colorId === focusAfterRemoval.colorId);
    const item = [
      ...(root?.querySelectorAll<HTMLElement>("[data-part='palette-item']") ?? [])
    ].find((candidate) => candidate.dataset.colorId === focusAfterRemoval.colorId);
    const target =
      matchingSwatch ??
      item?.querySelector<HTMLElement>("[data-part='swatch']") ??
      root?.querySelector<HTMLElement>("[data-part='add-color']") ??
      root;
    target?.focus();
  }, [focusAfterRemoval]);

  function addColor(): void {
    const id = controller.commands.addColor(
      {
        color: active?.color ?? { space: "hsv", h: 0, s: 0, v: 0.5 },
        name: "New color"
      },
      undefined,
      { action: "add", phase: "commit" }
    );
    controller.commands.setActive(id, {
      action: "selection",
      phase: "commit"
    });
  }

  function removeColorAndRestoreFocus(entry: PaletteColor<Metadata>, index: number): void {
    setFocusAfterRemoval({
      colorId: state.palette.colors[index + 1]?.id ?? state.palette.colors[index - 1]?.id ?? null
    });
    controller.commands.removeColor(entry.id, {
      action: "remove",
      phase: "commit"
    });
  }

  return (
    <section
      ref={section}
      data-part="palette"
      className={className}
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <header data-part="block-header">
        <div>
          <h2 id={titleId} data-part="block-title">
            {title}
          </h2>
          {description ? <div data-part="block-description">{description}</div> : null}
        </div>
        <span data-part="palette-count">
          {state.palette.colors.length} {state.palette.colors.length === 1 ? "color" : "colors"}
        </span>
      </header>

      {state.palette.colors.length === 0 ? (
        <p data-part="empty-state">This palette is empty. Add a color to begin.</p>
      ) : (
        <ol data-part="palette-list">
          {state.palette.colors.map((entry, index) => {
            const editable =
              !entry.locked &&
              (state.wheel.interaction === "free" || entry.id === state.anchorColorId);
            const swatchProps: PaletteSwatchProps<Metadata> = {
              entry,
              index,
              count: state.palette.colors.length,
              active: entry.id === state.activeColorId,
              anchor: entry.id === state.anchorColorId,
              editable,
              showName,
              showActions,
              actionProps: {
                select: {
                  type: "button",
                  "data-part": "swatch",
                  "data-color-id": entry.id,
                  "aria-label": `Select ${colorLabel(entry, index)}, ${toHex(entry)}`,
                  "aria-pressed": entry.id === state.activeColorId,
                  onClick: () =>
                    controller.commands.setActive(entry.id, {
                      action: "selection",
                      phase: "commit"
                    })
                },
                lock: {
                  type: "button",
                  "aria-label": `${entry.locked ? "Unlock" : "Lock"} ${colorLabel(entry, index)}`,
                  "aria-pressed": Boolean(entry.locked),
                  onClick: () =>
                    controller.commands.setLocked(entry.id, !entry.locked, {
                      action: "lock",
                      phase: "commit"
                    })
                },
                moveEarlier: {
                  type: "button",
                  "aria-label": `Move ${colorLabel(entry, index)} earlier`,
                  disabled: index === 0,
                  onClick: () =>
                    controller.commands.reorderColor(entry.id, index - 1, {
                      action: "reorder",
                      phase: "commit"
                    })
                },
                moveLater: {
                  type: "button",
                  "aria-label": `Move ${colorLabel(entry, index)} later`,
                  disabled: index === state.palette.colors.length - 1,
                  onClick: () =>
                    controller.commands.reorderColor(entry.id, index + 1, {
                      action: "reorder",
                      phase: "commit"
                    })
                },
                remove: {
                  type: "button",
                  "aria-label": `Remove ${colorLabel(entry, index)}`,
                  onClick: () => removeColorAndRestoreFocus(entry, index)
                }
              }
            };
            const defaultSwatch = <Swatch key={entry.id} {...swatchProps} />;
            return (
              <Fragment key={entry.id}>
                {renderSwatch?.(swatchProps, defaultSwatch) ?? defaultSwatch}
              </Fragment>
            );
          })}
        </ol>
      )}

      {allowAdd ? (
        <button type="button" data-part="add-color" onClick={addColor}>
          Add color
        </button>
      ) : null}
    </section>
  );
}
