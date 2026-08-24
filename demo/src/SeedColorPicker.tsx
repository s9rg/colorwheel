import { useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import { convertColor, formatColor, parseColor } from "../../src/core";
import type { HsvColor } from "../../src/core";
import "./seed-color-picker.css";

export interface SeedColorPickerProps {
  readonly value: string;
  readonly onChange: (nextHex: string) => void;
  readonly label?: string;
}

interface ResolvedColor {
  readonly hex: string;
  readonly hsv: HsvColor;
}

type PickerStyle = CSSProperties & Record<`--seed-picker-${string}`, string>;

const FALLBACK_COLOR: HsvColor = {
  space: "hsv",
  h: 183,
  s: 1,
  v: 0.8
};

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeHue(value: number): number {
  return ((value % 360) + 360) % 360;
}

function toHex(color: HsvColor): string {
  return formatColor(color, {
    format: "hex",
    alpha: "never",
    mapToSrgb: true
  });
}

function resolveColor(value: string): ResolvedColor {
  try {
    const parsed = parseColor(value);
    return {
      hex: formatColor(parsed, {
        format: "hex",
        alpha: "never",
        mapToSrgb: true
      }),
      hsv: convertColor(parsed, "hsv")
    };
  } catch {
    return { hex: toHex(FALLBACK_COLOR), hsv: FALLBACK_COLOR };
  }
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  );
}

function ChevronIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="m6 8 4 4 4-4" />
    </svg>
  );
}

export function SeedColorPicker({
  value,
  onChange,
  label = "Seed color"
}: SeedColorPickerProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [hexError, setHexError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const hexInputRef = useRef<HTMLInputElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const dialogId = useId();
  const titleId = useId();
  const planeHelpId = useId();
  const hexErrorId = useId();
  const resolved = useMemo(() => resolveColor(value), [value]);
  const { hsv } = resolved;
  const displayHex = resolved.hex.toUpperCase();

  useEffect(() => {
    const input = hexInputRef.current;
    if (input !== null && input.ownerDocument.activeElement !== input && hexError === null) {
      input.value = displayHex;
    }
  }, [displayHex, hexError]);

  const componentStyle: PickerStyle = {
    "--seed-picker-current": resolved.hex,
    "--seed-picker-hue": `hsl(${hsv.h} 100% 50%)`,
    "--seed-picker-saturation-start": toHex({ ...hsv, s: 0 }),
    "--seed-picker-saturation-end": toHex({ ...hsv, s: 1 }),
    "--seed-picker-value-start": "#000000",
    "--seed-picker-value-end": toHex({ ...hsv, v: 1 })
  };

  useEffect(() => {
    if (!isOpen) return;

    const ownerDocument = rootRef.current?.ownerDocument ?? document;
    const ownerWindow = ownerDocument.defaultView ?? window;

    const frame = ownerWindow.requestAnimationFrame(() => {
      const activeElement = ownerDocument.activeElement;
      const root = rootRef.current;

      // Do not steal focus when the user has already moved into another
      // control before the scheduled initial-focus frame runs.
      if (
        root === null ||
        activeElement === null ||
        activeElement === ownerDocument.body ||
        activeElement === triggerRef.current ||
        !root.contains(activeElement)
      ) {
        planeRef.current?.focus();
      }
    });

    const handleOutsideInteraction = (event: Event): void => {
      const root = rootRef.current;
      if (root !== null && !event.composedPath().includes(root)) setIsOpen(false);
    };

    const handleDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    ownerDocument.addEventListener("pointerdown", handleOutsideInteraction, true);
    ownerDocument.addEventListener("click", handleOutsideInteraction, true);
    ownerDocument.addEventListener("focusin", handleOutsideInteraction, true);
    ownerDocument.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      ownerWindow.cancelAnimationFrame(frame);
      ownerDocument.removeEventListener("pointerdown", handleOutsideInteraction, true);
      ownerDocument.removeEventListener("click", handleOutsideInteraction, true);
      ownerDocument.removeEventListener("focusin", handleOutsideInteraction, true);
      ownerDocument.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [isOpen]);

  const emitHsv = (next: HsvColor): void => {
    onChange(
      toHex({
        ...next,
        h: normalizeHue(next.h),
        s: clamp(next.s),
        v: clamp(next.v)
      })
    );
  };

  const updateFromPlane = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    emitHsv({
      ...hsv,
      s: clamp((event.clientX - bounds.left) / bounds.width),
      v: 1 - clamp((event.clientY - bounds.top) / bounds.height)
    });
  };

  const handlePlanePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!event.isPrimary || event.button !== 0) return;
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPlane(event);
  };

  const handlePlanePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (activePointerIdRef.current !== event.pointerId) return;
    updateFromPlane(event);
  };

  const finishPlanePointer = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (activePointerIdRef.current !== event.pointerId) return;
    if (event.type === "pointerup") updateFromPlane(event);
    activePointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePlaneKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 0.1 : 0.01;
    let nextSaturation = hsv.s;
    let nextValue = hsv.v;

    switch (event.key) {
      case "ArrowLeft":
        nextSaturation -= step;
        break;
      case "ArrowRight":
        nextSaturation += step;
        break;
      case "ArrowUp":
        nextValue += step;
        break;
      case "ArrowDown":
        nextValue -= step;
        break;
      default:
        return;
    }

    event.preventDefault();
    emitHsv({ ...hsv, s: nextSaturation, v: nextValue });
  };

  const commitHex = (draft: string): string | null => {
    const trimmed = draft.trim();
    const candidate = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;

    if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(candidate)) {
      setHexError("Enter a 3- or 6-digit hex color.");
      return null;
    }

    try {
      const nextHex = formatColor(parseColor(candidate), {
        format: "hex",
        alpha: "never",
        mapToSrgb: true
      });
      setHexError(null);
      onChange(nextHex);
      return nextHex;
    } catch {
      setHexError("Enter a valid hex color.");
      return null;
    }
  };

  const close = (): void => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="seed-color-picker" style={componentStyle}>
      <button
        ref={triggerRef}
        type="button"
        className="seed-color-picker__trigger"
        aria-label={`${label}: ${displayHex}. Open color picker`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? dialogId : undefined}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="seed-color-picker__trigger-swatch" aria-hidden="true" />
        <span className="seed-color-picker__trigger-value">{displayHex}</span>
        <span className="seed-color-picker__chevron">
          <ChevronIcon />
        </span>
      </button>

      {isOpen ? (
        <div
          id={dialogId}
          className="seed-color-picker__popover"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
        >
          <div className="seed-color-picker__header">
            <div>
              <p className="seed-color-picker__eyebrow">Color</p>
              <h3 id={titleId}>{label}</h3>
            </div>
            <button
              type="button"
              className="seed-color-picker__close"
              aria-label="Close color picker"
              onClick={close}
            >
              <CloseIcon />
            </button>
          </div>

          <p id={planeHelpId} className="seed-color-picker__sr-only">
            Two-dimensional color field. Left and right change saturation. Up and down change
            brightness. Hold Shift for larger steps.
          </p>
          <div
            ref={planeRef}
            className="seed-color-picker__plane"
            role="group"
            aria-label={`Saturation and brightness field. Saturation ${Math.round(hsv.s * 100)} percent, brightness ${Math.round(hsv.v * 100)} percent.`}
            aria-describedby={planeHelpId}
            tabIndex={0}
            onKeyDown={handlePlaneKeyDown}
            onPointerDown={handlePlanePointerDown}
            onPointerMove={handlePlanePointerMove}
            onPointerUp={finishPlanePointer}
            onPointerCancel={finishPlanePointer}
            onLostPointerCapture={() => {
              activePointerIdRef.current = null;
            }}
          >
            <span
              className="seed-color-picker__plane-thumb"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
              aria-hidden="true"
            />
          </div>

          <label className="seed-color-picker__range seed-color-picker__range--hue">
            <span>
              Hue <output>{Math.round(hsv.h)}°</output>
            </span>
            <input
              type="range"
              aria-label="Hue"
              min="0"
              max="360"
              step="1"
              value={Math.round(hsv.h)}
              onChange={(event) => emitHsv({ ...hsv, h: Number(event.currentTarget.value) })}
            />
          </label>

          <div className="seed-color-picker__channels">
            <label className="seed-color-picker__range seed-color-picker__range--saturation">
              <span>
                Saturation <output>{Math.round(hsv.s * 100)}%</output>
              </span>
              <input
                type="range"
                aria-label="Saturation"
                min="0"
                max="100"
                step="1"
                value={Math.round(hsv.s * 100)}
                onChange={(event) =>
                  emitHsv({ ...hsv, s: Number(event.currentTarget.value) / 100 })
                }
              />
            </label>
            <label className="seed-color-picker__range seed-color-picker__range--value">
              <span>
                Brightness <output>{Math.round(hsv.v * 100)}%</output>
              </span>
              <input
                type="range"
                aria-label="Brightness"
                min="0"
                max="100"
                step="1"
                value={Math.round(hsv.v * 100)}
                onChange={(event) =>
                  emitHsv({ ...hsv, v: Number(event.currentTarget.value) / 100 })
                }
              />
            </label>
          </div>

          <div className="seed-color-picker__hex-row">
            <span className="seed-color-picker__current-swatch" aria-hidden="true" />
            <label className="seed-color-picker__hex-field">
              <span>Hex</span>
              <input
                ref={hexInputRef}
                type="text"
                defaultValue={displayHex}
                maxLength={7}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={hexError === null ? undefined : true}
                aria-describedby={hexError === null ? undefined : hexErrorId}
                onChange={() => {
                  setHexError(null);
                }}
                onBlur={(event) => {
                  const nextHex = commitHex(event.currentTarget.value);
                  if (nextHex !== null) {
                    event.currentTarget.value = nextHex.toUpperCase();
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const nextHex = commitHex(event.currentTarget.value);
                    if (nextHex !== null) event.currentTarget.value = nextHex.toUpperCase();
                  }
                }}
              />
            </label>
          </div>
          {hexError === null ? null : (
            <p id={hexErrorId} className="seed-color-picker__error" role="alert">
              {hexError}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
