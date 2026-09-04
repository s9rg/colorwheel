import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import {
  convertColor,
  createHarmonyPalette,
  createTonalPalette,
  exportPaletteCss,
  exportPaletteJson,
  exportPaletteTokens,
  formatColor
} from "../../src/core";
import type { BuiltInHarmonyRule, ExportArtifact, Palette } from "../../src/core";
import { mountColorwheel } from "../../src/dom";
import type { ColorwheelInstance } from "../../src/dom";
import { Picker } from "../../src/react";
import { AngularPreview, ReactNativePreview, VuePreview } from "./FrameworkPreviews";
import { PaletteRelationshipPicker } from "./PaletteRelationshipPicker";
import { SeedColorPicker } from "./SeedColorPicker";
import { PALETTE_RELATIONSHIPS } from "./palette-relationships";
import type { PaletteMode } from "./palette-relationships";
import { ThemeBuilderSection } from "./theme-builder/ThemeBuilderSection";

const REPOSITORY_URL = "https://github.com/s9rg/colorwheel";

const generatedInitialPalette = createHarmonyPalette({
  seed: "#00c4cc",
  harmony: { type: "complementary" },
  name: "Complementary"
});
const INITIAL_PALETTE: Palette = {
  ...generatedInitialPalette,
  colors: generatedInitialPalette.colors.map((entry, index) => ({
    ...entry,
    name: index === 0 ? "Base" : "Complement"
  }))
};

const ACCESSIBILITY_PALETTE: Palette = {
  name: "Accessibility test palette",
  kind: "custom",
  provenance: { origin: "manual" },
  colors: [
    {
      id: "at-background",
      name: "Background",
      role: "background",
      color: convertColor("#0f172a", "srgb")
    },
    {
      id: "at-text",
      name: "Text",
      role: "text",
      color: convertColor("#f8fafc", "srgb")
    },
    {
      id: "at-accent",
      name: "Accent",
      role: "accent",
      color: convertColor("#00c4cc", "srgb")
    }
  ]
};

function harmonyRule(mode: Exclude<PaletteMode, "tonal">): BuiltInHarmonyRule {
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

function currentPaletteMode(palette: Palette): PaletteMode {
  if (palette.kind === "tonal") return "tonal";
  const type = palette.recipe?.harmony?.type;
  return PALETTE_RELATIONSHIPS.some((mode) => mode.id === type)
    ? (type as PaletteMode)
    : "complementary";
}

function generateDemoPalette(seed: string, mode: PaletteMode): Palette {
  const label =
    PALETTE_RELATIONSHIPS.find((candidate) => candidate.id === mode)?.label ?? "Palette";
  const generated =
    mode === "tonal"
      ? createTonalPalette({ seed, count: 7, name: label })
      : createHarmonyPalette({ seed, harmony: harmonyRule(mode), name: label });

  return {
    ...generated,
    colors: generated.colors.map((entry, index) => ({
      ...entry,
      name:
        entry.id === (generated.recipe?.seedColorId ?? generated.colors[0]?.id)
          ? "Base"
          : mode === "complementary"
            ? "Complement"
            : `${label} ${index + 1}`
    }))
  };
}

type FrameworkId = "vanilla" | "react" | "vue" | "angular" | "react-native";

interface ApiRow {
  readonly name: string;
  readonly type: string;
  readonly defaultValue: string;
  readonly description: string;
}

interface FrameworkDefinition {
  readonly id: FrameworkId;
  readonly label: string;
  readonly install: string;
  readonly importPath: string;
  readonly filename: string;
  readonly example: string;
  readonly apiName: string;
  readonly apiRows: readonly ApiRow[];
}

const SHARED_SOURCE_ROWS: readonly ApiRow[] = [
  {
    name: "palette",
    type: "Palette",
    defaultValue: "—",
    description: "Controlled portable palette data."
  },
  {
    name: "defaultPalette",
    type: "Palette",
    defaultValue: "Generated",
    description: "Initial palette for an adapter-owned controller."
  },
  {
    name: "defaultValue",
    type: "PickerState",
    defaultValue: "—",
    description: "Initial full state for an adapter-owned controller."
  },
  {
    name: "value",
    type: "PickerState",
    defaultValue: "—",
    description: "Controlled full editor state."
  },
  {
    name: "controller",
    type: "PickerController",
    defaultValue: "—",
    description: "Use a caller-owned headless controller."
  },
  {
    name: "wheel",
    type: "Partial<WheelEditorOptions>",
    defaultValue: "From recipe",
    description: "Configures model, interaction mode, and output gamut."
  }
];

const FRAMEWORKS: readonly FrameworkDefinition[] = [
  {
    id: "vanilla",
    label: "Vanilla",
    install: "npm install @s9rg/colorwheel",
    importPath: "@s9rg/colorwheel/vanilla",
    filename: "colorwheel.ts",
    example: `import { mountColorwheel } from "@s9rg/colorwheel/vanilla";
import "@s9rg/colorwheel/styles.css";

const host = document.querySelector<HTMLElement>("#picker");
if (!host) throw new Error("Missing #picker");

const colorwheel = mountColorwheel(host, {
  palette,
  wheel: { interaction: "linked" },
  blockProps: {
    wheel: {
      description: "Move a handle for hue and saturation, or use the outer value ring.",
      showChannelRing: true,
      showInstructions: false,
      showChannels: false
    },
    palette: {
      description: "Select a swatch or enter a color value.",
      showName: false,
      showActions: false,
      allowAdd: false
    }
  },
  onPaletteChange(next, meta) {
    palette = next;
    savePalette(palette, meta);
  }
});

// Call when the host is removed.
colorwheel.destroy();`,
    apiName: "mountColorwheel(container, options)",
    apiRows: [
      ...SHARED_SOURCE_ROWS.filter(
        (row) => row.name !== "defaultPalette" && row.name !== "defaultValue"
      ).map((row) =>
        row.name === "value"
          ? {
              ...row,
              name: "state",
              description: "Initial full editor state for the mounted instance."
            }
          : row
      ),
      {
        name: "onPaletteChange",
        type: "(palette, meta) => void",
        defaultValue: "—",
        description: "Receives user-driven palette updates."
      },
      {
        name: "blockProps",
        type: "ColorwheelBlockProps",
        defaultValue: "All visible",
        description: "Configures the built-in wheel and palette blocks."
      },
      {
        name: "renderPalette",
        type: "RenderPalette | false",
        defaultValue: "Built in",
        description: "Replaces or removes the palette block."
      },
      {
        name: "unstyled",
        type: "boolean",
        defaultValue: "false",
        description: "Keeps behavior and data hooks without package styling."
      }
    ]
  },
  {
    id: "react",
    label: "React",
    install: "npm install @s9rg/colorwheel react react-dom",
    importPath: "@s9rg/colorwheel/react",
    filename: "PaletteEditor.tsx",
    example: `import { useState } from "react";
import { HarmonyControls, Picker } from "@s9rg/colorwheel/react";
import "@s9rg/colorwheel/styles.css";

export function PaletteEditor() {
  const [palette, setPalette] = useState(initialPalette);

  return (
    <Picker.Root palette={palette} onPaletteChange={setPalette}>
      <Picker.Wheel showChannelRing showInstructions={false} />
      <HarmonyControls />
      <Picker.Palette showActions={false} />
    </Picker.Root>
  );
}`,
    apiName: "<Picker /> and <Picker.Root />",
    apiRows: [
      ...SHARED_SOURCE_ROWS,
      {
        name: "onChange",
        type: "(state, meta) => void",
        defaultValue: "—",
        description: "Receives full-state updates with interaction metadata."
      },
      {
        name: "onPaletteChange",
        type: "(palette, meta) => void",
        defaultValue: "—",
        description: "Receives palette-only updates."
      },
      {
        name: "blocks",
        type: "PickerBlocks",
        defaultValue: "All",
        description: "Replaces or disables any preset block."
      },
      {
        name: "blockProps",
        type: "PickerBlockProps",
        defaultValue: "—",
        description: "Configures the built-in blocks."
      },
      {
        name: "children",
        type: "ReactNode",
        defaultValue: "Preset layout",
        description: "Composes a product-owned layout around the same controller."
      },
      {
        name: "unstyled",
        type: "boolean",
        defaultValue: "false",
        description: "Keeps behavior and data hooks without package styling."
      }
    ]
  },
  {
    id: "vue",
    label: "Vue",
    install: "npm install @s9rg/colorwheel vue",
    importPath: "@s9rg/colorwheel/vue",
    filename: "PaletteEditor.vue",
    example: `<script setup lang="ts">
import { ref } from "vue";
import { Colorwheel } from "@s9rg/colorwheel/vue";
import "@s9rg/colorwheel/styles.css";

const palette = ref(initialPalette);
</script>

<template>
  <Colorwheel
    v-model:palette="palette"
    :wheel="{ interaction: 'linked' }"
    @palette-change="savePalette"
  />
</template>`,
    apiName: "<Colorwheel />",
    apiRows: [
      ...SHARED_SOURCE_ROWS.map((row) =>
        row.name === "value" ? { ...row, name: "modelValue" } : row
      ),
      {
        name: "update:palette",
        type: "(palette, meta) => void",
        defaultValue: "—",
        description: "Supports v-model:palette."
      },
      {
        name: "palette-change",
        type: "(palette, meta) => void",
        defaultValue: "—",
        description: "Detailed palette change event."
      },
      {
        name: "renderPalette",
        type: "RenderPalette | false",
        defaultValue: "Built in",
        description: "Low-level palette renderer; the palette slot takes precedence."
      },
      {
        name: "palette slot",
        type: "{ controller, state, palette }",
        defaultValue: "—",
        description: "Replaces the standard palette block with Vue content."
      }
    ]
  },
  {
    id: "angular",
    label: "Angular",
    install: "npm install @s9rg/colorwheel @angular/core rxjs",
    importPath: "@s9rg/colorwheel/angular",
    filename: "palette-editor.component.ts",
    example: `import { Component, signal } from "@angular/core";
import { ColorwheelComponent } from "@s9rg/colorwheel/angular";
import "@s9rg/colorwheel/styles.css";

@Component({
  standalone: true,
  imports: [ColorwheelComponent],
  template: \`
    <s9rg-colorwheel
      [palette]="palette()"
      [wheel]="{ interaction: 'linked' }"
      (paletteChange)="palette.set($event)"
    />
  \`
})
export class PaletteEditor {
  readonly palette = signal(initialPalette);
}`,
    apiName: "<s9rg-colorwheel />",
    apiRows: [
      ...SHARED_SOURCE_ROWS,
      {
        name: "paletteChange",
        type: "EventEmitter<Palette>",
        defaultValue: "—",
        description: "Pairs with palette for two-way binding."
      },
      {
        name: "colorwheelChange",
        type: "EventEmitter<ColorwheelChangeEvent>",
        defaultValue: "—",
        description: "Includes state, palette, and ChangeMeta."
      },
      {
        name: "renderPalette",
        type: "RenderPalette | false",
        defaultValue: "Built in",
        description: "Replaces or removes the standard palette block."
      },
      {
        name: "s9rgColorwheelPalette",
        type: "TemplateRef",
        defaultValue: "—",
        description: "Projects an Angular-owned palette template."
      }
    ]
  },
  {
    id: "react-native",
    label: "React Native",
    install: "npm install @s9rg/colorwheel react-native-svg",
    importPath: "@s9rg/colorwheel/react-native",
    filename: "PaletteEditor.tsx",
    example: `import { useState } from "react";
import { Picker } from "@s9rg/colorwheel/react-native";

export function PaletteEditor() {
  const [palette, setPalette] = useState(initialPalette);

  return (
    <Picker
      palette={palette}
      onPaletteChange={setPalette}
      wheel={{ interaction: "linked" }}
      blockProps={{
        wheel: { title: "Color wheel" },
        palette: { showActions: false }
      }}
    />
  );
}`,
    apiName: "<Picker />",
    apiRows: [
      ...SHARED_SOURCE_ROWS,
      {
        name: "onPaletteChange",
        type: "(palette, meta) => void",
        defaultValue: "—",
        description: "Receives portable palette updates."
      },
      {
        name: "blocks",
        type: "NativePickerBlocks",
        defaultValue: "Wheel + palette",
        description: "Replaces or disables native blocks."
      },
      {
        name: "blockProps",
        type: "NativePickerBlockProps",
        defaultValue: "—",
        description: "Configures native wheel and palette blocks."
      },
      {
        name: "renderLayout",
        type: "(layout) => ReactNode",
        defaultValue: "—",
        description: "Wraps or replaces the preset native layout."
      }
    ]
  }
] as const;

type ExportFormatId = "json" | "css" | "tokens";

const EXPORT_FORMATS = [
  {
    id: "json" as const,
    label: "JSON",
    create: (palette: Palette) => exportPaletteJson(palette)
  },
  {
    id: "css" as const,
    label: "CSS variables",
    create: (palette: Palette) => exportPaletteCss(palette)
  },
  {
    id: "tokens" as const,
    label: "Design tokens",
    create: (palette: Palette) => exportPaletteTokens(palette)
  }
] as const;

function LogoMark() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <span />
    </span>
  );
}

function ArrowIcon() {
  return <span aria-hidden="true">&#8599;</span>;
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <rect x="6.5" y="6.5" width="9" height="9" rx="1.5" />
      <path d="M13.5 6.5V5A1.5 1.5 0 0 0 12 3.5H5A1.5 1.5 0 0 0 3.5 5v7A1.5 1.5 0 0 0 5 13.5h1.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="m4.5 10.5 3.3 3.3 7.7-8" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M10 3.5v8M6.75 8.5 10 11.75l3.25-3.25M4 15.5h12" />
    </svg>
  );
}

interface SectionIntroProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly titleId: string;
  readonly children: ReactNode;
}

function SectionIntro({ eyebrow, title, titleId, children }: SectionIntroProps) {
  return (
    <div className="section-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={titleId}>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

function CopyButton({
  text,
  label = "Copy",
  iconOnly = false
}: {
  text: string;
  label?: string;
  iconOnly?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  const statusLabel = status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : label;

  if (iconOnly) {
    return (
      <>
        <button
          type="button"
          className="editor-icon-button"
          aria-label={label}
          title={statusLabel}
          data-status={status}
          onClick={() => void copy()}
        >
          {status === "copied" ? <CheckIcon /> : <CopyIcon />}
        </button>
        <span className="visually-hidden" role="status">
          {status === "idle" ? "" : statusLabel}
        </span>
      </>
    );
  }

  return (
    <button type="button" className="copy-button" onClick={() => void copy()}>
      <span aria-live="polite">{statusLabel}</span>
    </button>
  );
}

function AppHeader() {
  return (
    <header className="site-header">
      <nav className="site-nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Colorwheel home">
          <LogoMark />
          <span>Colorwheel</span>
        </a>
        <div className="nav-links">
          <a href="#installation">Install</a>
          <a href="#examples">Examples</a>
          <a href="#themes">Themes</a>
          <a href="#api">API</a>
          <a href="#export">Export</a>
          <a className="github-link" href={REPOSITORY_URL}>
            GitHub <ArrowIcon />
          </a>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="eyebrow">
          <span /> Open-source color wheel
        </p>
        <h1 id="hero-title">
          A color wheel that treats the <em>palette</em> as data.
        </h1>
        <p className="hero-lede">
          A customizable color wheel and palette editor for web applications.
        </p>
        <div className="hero-actions">
          <a className="primary-action" href="#installation">
            Install <span aria-hidden="true">&#8595;</span>
          </a>
          <a className="secondary-action" href="#examples">
            View examples
          </a>
        </div>
        <ul className="hero-points" aria-label="Project highlights">
          <li>
            <span aria-hidden="true">01</span> Palette-first state
          </li>
          <li>
            <span aria-hidden="true">02</span> Keyboard and pointer input
          </li>
          <li>
            <span aria-hidden="true">03</span> Customizable UI
          </li>
        </ul>
      </div>

      <div className="hero-orbit" aria-hidden="true">
        <div className="orbit-glow" />
        <div className="orbit-wheel">
          <span className="orbit-center" />
          <i className="orbit-node orbit-node-a" />
          <i className="orbit-node orbit-node-b" />
          <i className="orbit-node orbit-node-c" />
        </div>
        <p>
          <strong>360°</strong>
          <span>continuous hue</span>
        </p>
        <p>
          <strong>2 paths</strong>
          <span>wheel + palette</span>
        </p>
      </div>
    </section>
  );
}

interface FrameworkTabsProps {
  readonly groupId: string;
  readonly label: string;
  readonly value: FrameworkId;
  readonly onChange: (value: FrameworkId) => void;
}

function FrameworkTabs({ groupId, label, value, onChange }: FrameworkTabsProps) {
  const selectedIndex = FRAMEWORKS.findIndex((framework) => framework.id === value);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex: number;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % FRAMEWORKS.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + FRAMEWORKS.length) % FRAMEWORKS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = FRAMEWORKS.length - 1;
    else return;

    event.preventDefault();
    const next = FRAMEWORKS[nextIndex];
    if (next === undefined) return;
    onChange(next.id);
    const tabs =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[nextIndex]?.focus();
  }

  return (
    <div className="framework-tabs" role="tablist" aria-label={label}>
      {FRAMEWORKS.map((framework, index) => {
        const selected = framework.id === value;
        return (
          <button
            key={framework.id}
            id={`${groupId}-tab-${framework.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${groupId}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(framework.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span>{framework.label}</span>
          </button>
        );
      })}
      <span
        className="framework-tab-indicator"
        style={{ "--framework-index": selectedIndex } as CSSProperties}
        aria-hidden="true"
      />
    </div>
  );
}

function InstallationSection({
  frameworkId,
  onFrameworkChange
}: {
  frameworkId: FrameworkId;
  onFrameworkChange: (value: FrameworkId) => void;
}) {
  const framework = FRAMEWORKS.find((candidate) => candidate.id === frameworkId) ?? FRAMEWORKS[1];
  const command = framework.install;

  return (
    <section
      id="installation"
      className="content-section doc-section installation-section"
      aria-labelledby="installation-title"
    >
      <SectionIntro
        eyebrow="Installation"
        title="Install for your framework."
        titleId="installation-title"
      >
        Install Colorwheel with the peer dependencies for your framework, then import its adapter
        entry point. Every adapter uses the same palette data model.
      </SectionIntro>

      <FrameworkTabs
        groupId="installation"
        label="Installation framework"
        value={frameworkId}
        onChange={onFrameworkChange}
      />
      <div
        key={framework.id}
        id="installation-panel"
        className="install-panel"
        role="tabpanel"
        aria-labelledby={`installation-tab-${framework.id}`}
      >
        <div>
          <span className="terminal-prompt" aria-hidden="true">
            $
          </span>
          <code data-testid="install-command">{command}</code>
        </div>
        <CopyButton text={command} />
      </div>
      <p className="entry-point">
        Import from <code>{framework.importPath}</code>
      </p>
    </section>
  );
}

function CompactReactPicker({
  palette,
  onPaletteChange,
  label,
  testId
}: {
  palette: Palette;
  onPaletteChange: (palette: Palette) => void;
  label: string;
  testId?: string;
}) {
  return (
    <div className="framework-preview" data-testid={testId}>
      <Picker.Root
        key={currentPaletteMode(palette)}
        className="demo-picker compact-picker"
        palette={palette}
        onPaletteChange={onPaletteChange}
        wheel={{ interaction: palette.kind === "tonal" ? "free" : "linked" }}
        aria-label={label}
      >
        <div className="compact-picker-layout">
          <Picker.Wheel
            title="Color wheel"
            description="Move a handle for hue and saturation, or use the outer value ring."
            showChannelRing
            showInstructions={false}
          />
          <Picker.Palette
            title="Palette"
            description="Select a swatch or enter a color value."
            showName={false}
            showActions={false}
            allowAdd={false}
          />
        </div>
      </Picker.Root>
    </div>
  );
}

function VanillaPreview({
  palette,
  onPaletteChange
}: {
  palette: Palette;
  onPaletteChange: (palette: Palette) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const instance = useRef<ColorwheelInstance | null>(null);
  const initialPalette = useRef(palette);

  useEffect(() => {
    const container = host.current;
    if (container === null) return;
    const mounted = mountColorwheel(container, {
      palette: initialPalette.current,
      wheel: { interaction: initialPalette.current.kind === "tonal" ? "free" : "linked" },
      className: "demo-picker compact-picker dom-picker",
      ariaLabel: "Vanilla Colorwheel example",
      blockProps: {
        wheel: {
          description: "Move a handle for hue and saturation, or use the outer value ring.",
          showChannelRing: true,
          showInstructions: false,
          showChannels: false
        },
        palette: {
          description: "Select a swatch or enter a color value.",
          showName: false,
          showActions: false,
          allowAdd: false
        }
      },
      onPaletteChange(next) {
        onPaletteChange(next);
      }
    });
    instance.current = mounted;
    return () => {
      instance.current = null;
      mounted.destroy();
    };
  }, [onPaletteChange]);

  useEffect(() => {
    instance.current?.setPalette(palette);
    instance.current?.controller.commands.setWheelOptions({
      interaction: palette.kind === "tonal" ? "free" : "linked"
    });
  }, [palette]);

  return (
    <div className="framework-preview" data-testid="dom-studio">
      <div ref={host} />
    </div>
  );
}

function FrameworkPreview({
  framework,
  palette,
  onPaletteChange
}: {
  framework: FrameworkDefinition;
  palette: Palette;
  onPaletteChange: (palette: Palette) => void;
}) {
  if (framework.id === "vanilla") {
    return <VanillaPreview palette={palette} onPaletteChange={onPaletteChange} />;
  }

  if (framework.id === "vue") {
    return <VuePreview palette={palette} onPaletteChange={onPaletteChange} />;
  }

  if (framework.id === "angular") {
    return <AngularPreview palette={palette} onPaletteChange={onPaletteChange} />;
  }

  if (framework.id === "react-native") {
    return <ReactNativePreview />;
  }

  return (
    <CompactReactPicker
      palette={palette}
      onPaletteChange={onPaletteChange}
      label="React Colorwheel example"
      testId="default-studio"
    />
  );
}

function ExamplesSection({
  frameworkId,
  onFrameworkChange,
  palette,
  onPaletteChange
}: {
  frameworkId: FrameworkId;
  onFrameworkChange: (value: FrameworkId) => void;
  palette: Palette;
  onPaletteChange: (palette: Palette) => void;
}) {
  const [mode, setMode] = useState<"preview" | "code">("preview");
  const framework = FRAMEWORKS.find((candidate) => candidate.id === frameworkId) ?? FRAMEWORKS[1];
  const seed = palette.recipe?.seed ?? palette.provenance.seeds?.[0] ?? palette.colors[0]?.color;
  const seedHex =
    seed === undefined
      ? "#00c4cc"
      : formatColor(seed, { format: "hex", alpha: "never", mapToSrgb: true });
  const paletteMode = currentPaletteMode(palette);

  function updateSeed(nextHex: string): void {
    onPaletteChange(generateDemoPalette(nextHex, paletteMode));
  }

  function updatePaletteMode(nextMode: PaletteMode): void {
    onPaletteChange(generateDemoPalette(seedHex, nextMode));
  }

  return (
    <section
      id="examples"
      className="content-section doc-section examples-section"
      aria-labelledby="examples-title"
    >
      <SectionIntro
        eyebrow="Examples"
        title="See it working, then view the code."
        titleId="examples-title"
      >
        Choose a framework. The preview and code stay in the same example window.
      </SectionIntro>

      <FrameworkTabs
        groupId="examples"
        label="Example framework"
        value={frameworkId}
        onChange={onFrameworkChange}
      />
      <div
        id="examples-panel"
        className="example-window"
        role="tabpanel"
        aria-labelledby={`examples-tab-${framework.id}`}
        data-framework={framework.id}
      >
        <div className="example-toolbar">
          <div>
            <i /> {framework.label} example
          </div>
          <div className="example-toolbar-actions">
            {mode === "preview" ? (
              <>
                <div className="example-seed-control">
                  <SeedColorPicker label="Base color" value={seedHex} onChange={updateSeed} />
                </div>
                <PaletteRelationshipPicker value={paletteMode} onChange={updatePaletteMode} />
              </>
            ) : null}
            <div className="mode-switch" role="group" aria-label="Example display">
              <button
                type="button"
                aria-pressed={mode === "preview"}
                onClick={() => setMode("preview")}
              >
                Preview
              </button>
              <button type="button" aria-pressed={mode === "code"} onClick={() => setMode("code")}>
                Code
              </button>
            </div>
          </div>
        </div>

        {mode === "preview" ? (
          <FrameworkPreview
            framework={framework}
            palette={palette}
            onPaletteChange={onPaletteChange}
          />
        ) : (
          <div className="example-code" data-testid="example-code">
            <div>
              <span>{framework.filename}</span>
              <CopyButton text={framework.example} />
            </div>
            <pre tabIndex={0}>
              <code>{framework.example}</code>
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}

function ApiSection({
  frameworkId,
  onFrameworkChange
}: {
  frameworkId: FrameworkId;
  onFrameworkChange: (value: FrameworkId) => void;
}) {
  const framework = FRAMEWORKS.find((candidate) => candidate.id === frameworkId) ?? FRAMEWORKS[1];

  return (
    <section
      id="api"
      className="content-section doc-section api-section"
      aria-labelledby="api-title"
    >
      <SectionIntro
        eyebrow="Public API"
        title="State sources, callbacks, and customization."
        titleId="api-title"
      >
        Choose one controlled, uncontrolled, or caller-owned state source. Every adapter exposes the
        same portable palette and controller concepts.
      </SectionIntro>

      <FrameworkTabs
        groupId="api"
        label="API framework"
        value={frameworkId}
        onChange={onFrameworkChange}
      />
      <div className="api-signature">
        <code>
          {framework.apiName} · {framework.importPath}
        </code>
        <a href={`${REPOSITORY_URL}/blob/main/docs/API.md`}>
          Full API reference <ArrowIcon />
        </a>
      </div>

      <div
        id="api-panel"
        className="api-table-scroll"
        role="tabpanel"
        aria-labelledby={`api-tab-${framework.id}`}
        tabIndex={0}
      >
        <table data-testid="api-props-table">
          <caption>{framework.label} public options and props</caption>
          <thead>
            <tr>
              <th scope="col">Prop / option</th>
              <th scope="col">Type</th>
              <th scope="col">Default</th>
              <th scope="col">Description</th>
            </tr>
          </thead>
          <tbody>
            {framework.apiRows.map((row) => (
              <tr key={row.name}>
                <th scope="row">
                  <code>{row.name}</code>
                </th>
                <td>
                  <code>{row.type}</code>
                </td>
                <td>{row.defaultValue}</td>
                <td>{row.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function artifactText(artifact: ExportArtifact): string {
  const file = artifact.files[0];
  if (file === undefined) return "";
  return typeof file.content === "string"
    ? file.content
    : new TextDecoder("utf-8", { fatal: true }).decode(file.content);
}

function downloadArtifact(artifact: ExportArtifact): void {
  const file = artifact.files[0];
  if (file === undefined) return;
  let content: BlobPart;
  if (typeof file.content === "string") {
    content = file.content;
  } else {
    const bytes = new ArrayBuffer(file.content.byteLength);
    new Uint8Array(bytes).set(file.content);
    content = bytes;
  }
  const blob = new Blob([content], { type: file.mediaType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}

function ExportSection({ palette }: { palette: Palette }) {
  const [formatId, setFormatId] = useState<ExportFormatId>("css");
  const format = EXPORT_FORMATS.find((candidate) => candidate.id === formatId) ?? EXPORT_FORMATS[1];
  const artifact = useMemo(() => format.create(palette), [format, palette]);
  const content = artifactText(artifact);
  const file = artifact.files[0];

  function handleFormatKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex: number;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % EXPORT_FORMATS.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + EXPORT_FORMATS.length) % EXPORT_FORMATS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = EXPORT_FORMATS.length - 1;
    else return;

    event.preventDefault();
    const next = EXPORT_FORMATS[nextIndex];
    if (next === undefined) return;
    setFormatId(next.id);
    const tabs =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[nextIndex]?.focus();
  }

  return (
    <section
      id="export"
      className="content-section doc-section export-section"
      aria-labelledby="export-title"
    >
      <SectionIntro
        eyebrow="Export"
        title="Use the palette outside the picker."
        titleId="export-title"
      >
        Generate a versioned JSON document, CSS custom properties, or design tokens from the current
        example palette.
      </SectionIntro>

      <div className="export-format-switch" role="tablist" aria-label="Export format">
        {EXPORT_FORMATS.map((candidate, index) => (
          <button
            key={candidate.id}
            id={`export-tab-${candidate.id}`}
            type="button"
            role="tab"
            aria-selected={candidate.id === formatId}
            aria-controls="export-panel"
            tabIndex={candidate.id === formatId ? 0 : -1}
            onClick={() => setFormatId(candidate.id)}
            onKeyDown={(event) => handleFormatKeyDown(event, index)}
          >
            {candidate.label}
          </button>
        ))}
      </div>

      <div
        id="export-panel"
        className="export-panel"
        role="tabpanel"
        aria-labelledby={`export-tab-${formatId}`}
      >
        <div className="export-summary">
          <div>
            <span>Palette</span>
            <strong>{palette.name ?? "Untitled palette"}</strong>
          </div>
          <div className="export-swatches" aria-label={`${palette.colors.length} palette colors`}>
            {palette.colors.map((entry) => (
              <span
                key={entry.id}
                style={
                  {
                    "--export-color": formatColor(convertColor(entry.color, "srgb"), {
                      format: "rgb",
                      alpha: "auto"
                    })
                  } as CSSProperties
                }
                title={entry.name ?? entry.id}
              />
            ))}
          </div>
          <dl>
            <div>
              <dt>File</dt>
              <dd data-testid="export-filename">{file?.name ?? "No file"}</dd>
            </div>
            <div>
              <dt>Media type</dt>
              <dd>{file?.mediaType ?? "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="export-code">
          <div className="export-code-toolbar">
            <span className="export-code-filename">{file?.name ?? format.label}</span>
            <div className="editor-actions" role="group" aria-label="Export actions">
              <CopyButton key={formatId} text={content} label="Copy output" iconOnly />
              <button
                type="button"
                className="editor-icon-button"
                aria-label="Download"
                title="Download"
                onClick={() => downloadArtifact(artifact)}
              >
                <DownloadIcon />
              </button>
            </div>
          </div>
          <pre tabIndex={0}>
            <code data-testid="export-output">{content}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <a className="brand" href="#top">
          <LogoMark />
          <span>Colorwheel</span>
        </a>
        <p>Colorwheel packages by s9rg</p>
      </div>
      <nav aria-label="Footer navigation">
        <a href="#installation">Install</a>
        <a href="#examples">Examples</a>
        <a href="#themes">Themes</a>
        <a href="#api">API</a>
        <a href="#export">Export</a>
        <a href="THIRD_PARTY_NOTICES.txt">Notices</a>
        <a href={REPOSITORY_URL}>GitHub</a>
      </nav>
      <p>MIT © Sergii Petryk</p>
    </footer>
  );
}

function AccessibilityFixture() {
  const [lastChange, setLastChange] = useState("No edits yet.");

  return (
    <div id="top" className="site-shell accessibility-fixture">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <main id="main-content" className="accessibility-fixture__main">
        <header className="accessibility-fixture__header">
          <p className="section-kicker">Manual QA fixture</p>
          <h1>Colorwheel accessibility test surface</h1>
          <p>
            This route exposes the complete editor for keyboard and assistive-technology release
            checks without changing the compact public examples.
          </p>
          <a href="./">Return to the showcase</a>
        </header>
        <p className="accessibility-fixture__status" role="status" aria-live="polite">
          {lastChange}
        </p>
        <Picker
          defaultPalette={ACCESSIBILITY_PALETTE}
          wheel={{ interaction: "free" }}
          aria-label="Colorwheel accessibility test picker"
          onChange={(state, meta) => {
            setLastChange(
              `${meta.action}, ${meta.phase}. ${state.palette.colors.length} colors; active ${state.activeColorId ?? "none"}.`
            );
          }}
          blockProps={{
            wheel: {
              description:
                "Edit hue and saturation on the wheel, then use the value ring or numeric channels."
            },
            palette: {
              description: "Edit, name, lock, reorder, add, and remove palette colors."
            },
            controls: {
              showChannels: true,
              showEditing: true,
              showGamut: true,
              showWheelModel: true
            }
          }}
        />
      </main>
    </div>
  );
}

export function App() {
  const [installationFrameworkId, setInstallationFrameworkId] = useState<FrameworkId>("react");
  const [exampleFrameworkId, setExampleFrameworkId] = useState<FrameworkId>("react");
  const [apiFrameworkId, setApiFrameworkId] = useState<FrameworkId>("react");
  const [palette, setPalette] = useState<Palette>(INITIAL_PALETTE);

  if (new URLSearchParams(window.location.search).has("accessibility")) {
    return <AccessibilityFixture />;
  }

  return (
    <div id="top" className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AppHeader />
      <main id="main-content">
        <Hero />
        <InstallationSection
          frameworkId={installationFrameworkId}
          onFrameworkChange={setInstallationFrameworkId}
        />
        <ExamplesSection
          frameworkId={exampleFrameworkId}
          onFrameworkChange={setExampleFrameworkId}
          palette={palette}
          onPaletteChange={setPalette}
        />
        <ThemeBuilderSection palette={palette} />
        <ApiSection frameworkId={apiFrameworkId} onFrameworkChange={setApiFrameworkId} />
        <ExportSection palette={palette} />
      </main>
      <Footer />
    </div>
  );
}
