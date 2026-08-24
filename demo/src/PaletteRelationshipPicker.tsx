import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { PALETTE_RELATIONSHIPS } from "./palette-relationships";
import type { PaletteMode } from "./palette-relationships";
import "./palette-relationship-picker.css";

const WHEEL_POINTS: Readonly<
  Record<Exclude<PaletteMode, "tonal">, readonly (readonly [number, number])[]>
> = {
  single: [[18, 5]],
  complementary: [
    [18, 5],
    [18, 31]
  ],
  analogous: [
    [10, 8],
    [18, 5],
    [26, 8]
  ],
  triadic: [
    [18, 5],
    [30, 25],
    [6, 25]
  ],
  tetradic: [
    [18, 5],
    [31, 18],
    [18, 31],
    [5, 18]
  ],
  "split-complementary": [
    [18, 5],
    [29, 24],
    [7, 24]
  ],
  monochromatic: [
    [18, 7],
    [18, 12],
    [18, 18],
    [18, 24],
    [18, 29]
  ]
};

function RelationshipGlyph({ mode }: { readonly mode: PaletteMode }) {
  if (mode === "tonal") {
    return (
      <svg className="relationship-glyph" aria-hidden="true" viewBox="0 0 36 36">
        <circle className="relationship-glyph__ring" cx="18" cy="18" r="14" />
        {[8, 12, 16, 20, 24, 28].map((x, index) => (
          <rect
            key={x}
            className={
              index === 0
                ? "relationship-glyph__tone relationship-glyph__tone--base"
                : "relationship-glyph__tone"
            }
            x={x - 1.4}
            y={10 + index * 1.2}
            width="2.8"
            height={16 - index * 2.4}
            rx="1.4"
          />
        ))}
      </svg>
    );
  }

  return (
    <svg className="relationship-glyph" aria-hidden="true" viewBox="0 0 36 36">
      <circle className="relationship-glyph__ring" cx="18" cy="18" r="14" />
      {WHEEL_POINTS[mode].map(([x, y], index) => (
        <circle
          key={`${x}-${y}`}
          className={
            index === 0
              ? "relationship-glyph__dot relationship-glyph__dot--base"
              : "relationship-glyph__dot"
          }
          cx={x}
          cy={y}
          r={index === 0 ? 3.2 : 2.65}
        />
      ))}
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="m6 8 4 4 4-4" />
    </svg>
  );
}

function SelectedIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="m4.5 10.5 3.2 3.2 7.8-8" />
    </svg>
  );
}

export interface PaletteRelationshipPickerProps {
  readonly value: PaletteMode;
  readonly onChange: (mode: PaletteMode) => void;
}

export function PaletteRelationshipPicker({ value, onChange }: PaletteRelationshipPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      PALETTE_RELATIONSHIPS.findIndex((relationship) => relationship.id === value)
    )
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const typeaheadRef = useRef({ value: "", at: 0 });
  const shouldScrollActiveOptionRef = useRef(false);
  const listboxId = useId();
  const selected =
    PALETTE_RELATIONSHIPS.find((relationship) => relationship.id === value) ??
    PALETTE_RELATIONSHIPS[0];

  const activateOption = (index: number, scrollIntoView = false): void => {
    const normalized = (index + PALETTE_RELATIONSHIPS.length) % PALETTE_RELATIONSHIPS.length;
    shouldScrollActiveOptionRef.current = scrollIntoView;
    setActiveIndex(normalized);
  };

  const openAt = (index: number, scrollIntoView = false): void => {
    shouldScrollActiveOptionRef.current = scrollIntoView;
    setActiveIndex(index);
    setIsOpen(true);
  };

  const close = (restoreFocus = false): void => {
    shouldScrollActiveOptionRef.current = false;
    setIsOpen(false);
    typeaheadRef.current = { value: "", at: 0 };
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const choose = (mode: PaletteMode): void => {
    if (mode !== value) onChange(mode);
    close(true);
  };

  useEffect(() => {
    if (!isOpen) return;
    const ownerDocument = rootRef.current?.ownerDocument ?? document;

    const handleOutsideInteraction = (event: Event): void => {
      const root = rootRef.current;
      if (root !== null && !event.composedPath().includes(root)) close();
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(true);
    };

    ownerDocument.addEventListener("pointerdown", handleOutsideInteraction, true);
    ownerDocument.addEventListener("click", handleOutsideInteraction, true);
    ownerDocument.addEventListener("focusin", handleOutsideInteraction, true);
    ownerDocument.addEventListener("keydown", handleEscape);
    return () => {
      ownerDocument.removeEventListener("pointerdown", handleOutsideInteraction, true);
      ownerDocument.removeEventListener("click", handleOutsideInteraction, true);
      ownerDocument.removeEventListener("focusin", handleOutsideInteraction, true);
      ownerDocument.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !shouldScrollActiveOptionRef.current) return;
    shouldScrollActiveOptionRef.current = false;
    const activeOption = rootRef.current?.querySelector<HTMLElement>(
      ".relationship-picker__option[data-active]"
    );
    activeOption?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeIndex, isOpen]);

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    const selectedIndex = PALETTE_RELATIONSHIPS.findIndex(
      (relationship) => relationship.id === value
    );
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (isOpen) activateOption(activeIndex + 1, true);
      else openAt(selectedIndex < 0 ? 0 : selectedIndex, true);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (isOpen) activateOption(activeIndex - 1, true);
      else openAt(selectedIndex < 0 ? PALETTE_RELATIONSHIPS.length - 1 : selectedIndex, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      if (isOpen) activateOption(0, true);
      else openAt(0, true);
    } else if (event.key === "End") {
      event.preventDefault();
      if (isOpen) activateOption(PALETTE_RELATIONSHIPS.length - 1, true);
      else openAt(PALETTE_RELATIONSHIPS.length - 1, true);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isOpen) {
        const active = PALETTE_RELATIONSHIPS[activeIndex];
        if (active !== undefined) choose(active.id);
      } else {
        openAt(selectedIndex < 0 ? 0 : selectedIndex, true);
      }
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab" && isOpen) {
      close();
    } else if (
      event.key.length === 1 &&
      event.key !== " " &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      const character = event.key.toLocaleLowerCase();
      const now = Date.now();
      const previous = typeaheadRef.current;
      let query = now - previous.at <= 700 ? `${previous.value}${character}` : character;
      const startIndex = isOpen ? activeIndex : Math.max(-1, selectedIndex);
      const findMatch = (candidate: string): number => {
        for (let offset = 1; offset <= PALETTE_RELATIONSHIPS.length; offset += 1) {
          const index = (startIndex + offset) % PALETTE_RELATIONSHIPS.length;
          if (PALETTE_RELATIONSHIPS[index]?.label.toLocaleLowerCase().startsWith(candidate)) {
            return index;
          }
        }
        return -1;
      };

      let match = findMatch(query);
      if (match < 0 && query.length > 1 && [...query].every((entry) => entry === character)) {
        query = character;
        match = findMatch(query);
      }
      if (match >= 0) {
        event.preventDefault();
        typeaheadRef.current = { value: query, at: now };
        if (isOpen) activateOption(match, true);
        else openAt(match, true);
      }
    }
  };

  return (
    <div ref={rootRef} className="relationship-picker" data-open={isOpen ? "" : undefined}>
      <button
        ref={triggerRef}
        type="button"
        className="relationship-picker__trigger"
        role="combobox"
        aria-label="Palette relationship"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={
          isOpen ? `${listboxId}-option-${PALETTE_RELATIONSHIPS[activeIndex]?.id}` : undefined
        }
        onClick={() => {
          if (isOpen) close();
          else openAt(Math.max(0, PALETTE_RELATIONSHIPS.indexOf(selected)));
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <RelationshipGlyph mode={selected.id} />
        <span className="relationship-picker__trigger-copy">
          <small>Relationship</small>
          <strong>{selected.label}</strong>
        </span>
        <span className="relationship-picker__chevron">
          <ChevronIcon />
        </span>
      </button>

      {isOpen ? (
        <div className="relationship-picker__popover">
          <div className="relationship-picker__header">
            <strong>Palette relationship</strong>
            <span>Choose how colors are arranged around the wheel.</span>
          </div>
          <div
            id={listboxId}
            className="relationship-picker__list"
            role="listbox"
            aria-label="Palette relationship options"
          >
            {PALETTE_RELATIONSHIPS.map((relationship, index) => {
              const isSelected = relationship.id === value;
              return (
                <button
                  key={relationship.id}
                  id={`${listboxId}-option-${relationship.id}`}
                  type="button"
                  className="relationship-picker__option"
                  role="option"
                  aria-selected={isSelected}
                  data-active={index === activeIndex ? "" : undefined}
                  tabIndex={-1}
                  onClick={() => choose(relationship.id)}
                  onPointerMove={() => activateOption(index)}
                >
                  <RelationshipGlyph mode={relationship.id} />
                  <span className="relationship-picker__option-copy">
                    <strong>{relationship.label}</strong>
                    <small>{relationship.description}</small>
                  </span>
                  <span className="relationship-picker__selected" aria-hidden="true">
                    {isSelected ? <SelectedIcon /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
