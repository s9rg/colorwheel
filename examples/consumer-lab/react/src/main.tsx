import { StrictMode, useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  createHarmonyPalette,
  formatColor,
  type BuiltInHarmonyRule,
  type ColorInput,
  type Palette
} from "@s9rg/colorwheel/core";
import { Picker, usePickerSelector, type PaletteSwatchProps } from "@s9rg/colorwheel/react";
import "@s9rg/colorwheel/styles.css";

import "./app.css";

interface LabMetadata {
  readonly usage: string;
}

interface RecipePreset {
  readonly id: "complementary" | "analogous" | "triadic";
  readonly label: string;
  readonly note: string;
  readonly seed: string;
  readonly harmony: BuiltInHarmonyRule;
}

interface EventItem {
  readonly id: number;
  readonly action: string;
  readonly detail: string;
}

interface MetaView {
  readonly action: string;
  readonly origin: string;
  readonly phase: string;
  readonly changedColorIds: readonly string[];
}

const recipePresets: readonly RecipePreset[] = [
  {
    id: "complementary",
    label: "Duo",
    note: "A direct brand and accent pair.",
    seed: "#6750ff",
    harmony: { type: "complementary" }
  },
  {
    id: "analogous",
    label: "Flow",
    note: "Five close hues for expressive surfaces.",
    seed: "#0f9f91",
    harmony: { type: "analogous", count: 5, spread: 24 }
  },
  {
    id: "triadic",
    label: "Signal",
    note: "Three separated accents for status UI.",
    seed: "#ed5b2a",
    harmony: { type: "triadic" }
  }
];

const roles = ["background", "foreground", "accent", "support", "highlight"] as const;

function createLabPalette(
  preset: RecipePreset,
  seed: ColorInput = preset.seed
): Palette<LabMetadata> {
  const generated = createHarmonyPalette({
    seed,
    harmony: preset.harmony,
    name: `${preset.label} product palette`
  });

  return {
    ...generated,
    metadata: { usage: preset.note },
    colors: generated.colors.map((entry, index) => ({
      ...entry,
      name: `${preset.label} ${index + 1}`,
      role: roles[index] ?? "accent",
      metadata: { usage: roles[index] ?? "accent" }
    }))
  };
}

function currentRecipeId(palette: Palette<LabMetadata>): RecipePreset["id"] | "custom" {
  const type = palette.recipe?.harmony?.type;
  return type === "complementary" || type === "analogous" || type === "triadic" ? type : "custom";
}

function LabSwatch({
  entry,
  index,
  active,
  anchor,
  editable,
  actionProps
}: PaletteSwatchProps<LabMetadata>) {
  const hex = formatColor(entry.color, { format: "hex", alpha: "auto" });

  return (
    <li
      className="lab-swatch"
      data-test={`react-swatch-${index}`}
      data-active={active ? "" : undefined}
      data-locked={entry.locked ? "" : undefined}
    >
      <button
        {...actionProps.select}
        className="lab-swatch__color"
        style={{ backgroundColor: hex }}
      >
        <span className="visually-hidden">Select {entry.name ?? `color ${index + 1}`}</span>
      </button>
      <span className="lab-swatch__copy">
        <strong>{entry.name ?? `Color ${index + 1}`}</strong>
        <code>{hex}</code>
        <small>{anchor ? "Recipe anchor" : (entry.metadata?.usage ?? "Palette color")}</small>
      </span>
      <span className="lab-swatch__actions">
        <button {...actionProps.lock} className="icon-action">
          {entry.locked ? "Unlock" : "Lock"}
        </button>
        <button
          {...actionProps.moveEarlier}
          className="icon-action"
          aria-label={`Move color ${index + 1} earlier`}
        >
          ↑
        </button>
        <button
          {...actionProps.moveLater}
          className="icon-action"
          aria-label={`Move color ${index + 1} later`}
        >
          ↓
        </button>
        <button {...actionProps.remove} className="icon-action icon-action--danger">
          Remove
        </button>
      </span>
      {!editable ? <span className="lab-swatch__state">Linked</span> : null}
    </li>
  );
}

function PaletteManifest() {
  const palette = usePickerSelector((state) => state.palette);
  const recipe = palette.recipe?.harmony?.type ?? "detached";

  return (
    <section className="manifest" aria-labelledby="manifest-title" data-test="react-custom-block">
      <div>
        <span className="eyebrow">Application-owned block</span>
        <h2 id="manifest-title">Palette manifest</h2>
      </div>
      <dl>
        <div>
          <dt>Recipe</dt>
          <dd>{recipe}</dd>
        </div>
        <div>
          <dt>Colors</dt>
          <dd>{palette.colors.length}</dd>
        </div>
        <div>
          <dt>Output</dt>
          <dd>sRGB</dd>
        </div>
      </dl>
    </section>
  );
}

function EventLog({ events }: { readonly events: readonly EventItem[] }) {
  return (
    <section className="event-log" aria-labelledby="event-log-title" data-test="react-event-log">
      <div className="event-log__header">
        <div>
          <span className="eyebrow">ChangeMeta</span>
          <h2 id="event-log-title">Latest events</h2>
        </div>
        <output aria-live="polite">{events.length} shown</output>
      </div>
      {events.length === 0 ? (
        <p>Move a handle, edit a value, or change a recipe.</p>
      ) : (
        <ol>
          {events.map((event) => (
            <li key={event.id}>
              <strong>{event.action}</strong>
              <span>{event.detail}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ReactConsumerLab() {
  const [palette, setPalette] = useState<Palette<LabMetadata>>(() =>
    createLabPalette(recipePresets[0])
  );
  const [events, setEvents] = useState<readonly EventItem[]>([]);
  const [exportStatus, setExportStatus] = useState("Nothing exported yet.");
  const sequence = useRef(0);
  const selectedRecipe = currentRecipeId(palette);

  const addEvent = useCallback((action: string, detail: string) => {
    sequence.current += 1;
    const item: EventItem = { id: sequence.current, action, detail };
    setEvents((current) => [item, ...current].slice(0, 6));
  }, []);

  const recordMeta = useCallback(
    (meta: MetaView) => {
      const colors =
        meta.changedColorIds.length === 0 ? "no palette IDs" : meta.changedColorIds.join(", ");
      addEvent(meta.action, `${meta.origin} · ${meta.phase} · ${colors}`);
    },
    [addEvent]
  );

  function chooseRecipe(preset: RecipePreset): void {
    const nextSeed = palette.recipe?.seed ?? preset.seed;
    setPalette(createLabPalette(preset, nextSeed));
    addEvent("recipe", `external · commit · ${preset.id}`);
  }

  return (
    <div className="react-lab" data-test="react-consumer-lab">
      <header className="page-header">
        <a href="../" className="back-link">
          Consumer lab
        </a>
        <div className="page-header__copy">
          <div>
            <span className="eyebrow">React · controlled palette</span>
            <h1>Product color studio</h1>
          </div>
          <p>
            A compound editor with an application-owned summary, customized swatches, event
            telemetry, and downloadable production tokens.
          </p>
        </div>
      </header>

      <nav className="recipe-switch" aria-label="Palette recipe" data-test="react-recipe-switch">
        {recipePresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={selectedRecipe === preset.id}
            data-active={selectedRecipe === preset.id ? "" : undefined}
            data-test={`react-recipe-${preset.id}`}
            onClick={() => chooseRecipe(preset)}
          >
            <strong>{preset.label}</strong>
            <span>{preset.note}</span>
          </button>
        ))}
      </nav>

      <Picker.Root<LabMetadata>
        palette={palette}
        onPaletteChange={setPalette}
        onChange={(_state, meta) => recordMeta(meta)}
        aria-label="Product color palette editor"
        className="react-picker"
      >
        <PaletteManifest />
        <div className="editor-grid">
          <Picker.Wheel
            title="Tune the relationship"
            description="The anchor keeps generated colors linked while you explore hue, saturation, and value."
          />
          <Picker.Palette<LabMetadata>
            title="Working palette"
            description="Names and roles belong to the controlled palette value."
            swatch={LabSwatch}
            allowAdd
          />
        </div>
        <div className="support-grid">
          <Picker.Controls
            title="Recipe and channels"
            modes={["complementary", "analogous", "triadic"]}
            showWheelModel={false}
          />
          <Picker.Diagnostics<LabMetadata> title="Contrast and gamut signals" schedule="commit" />
          <Picker.Export<LabMetadata>
            title="Export for implementation"
            formats={["css", "tokens"]}
            onExport={(option, artifact) => {
              const filenames = artifact.files.map((file) => file.name).join(", ");
              setExportStatus(`Prepared ${option.id}: ${filenames}`);
              addEvent("export", `application · commit · ${option.id}`);
            }}
          />
        </div>
      </Picker.Root>

      <div className="activity-grid">
        <EventLog events={events} />
        <section className="export-status" aria-labelledby="export-status-title">
          <span className="eyebrow">Export callback</span>
          <h2 id="export-status-title">Delivery status</h2>
          <output aria-live="polite" data-test="react-export-status">
            {exportStatus}
          </output>
        </section>
      </div>
    </div>
  );
}

const root = document.querySelector<HTMLElement>("#root");
if (root === null) throw new Error("Missing React consumer-lab root");

createRoot(root).render(
  <StrictMode>
    <ReactConsumerLab />
  </StrictMode>
);
