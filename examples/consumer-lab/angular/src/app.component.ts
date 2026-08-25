import { ChangeDetectionStrategy, Component } from "@angular/core";

import {
  createHarmonyPalette,
  formatColor,
  type ColorInput,
  type Palette
} from "@s9rg/colorwheel/core";
import type { PickerController } from "@s9rg/colorwheel/editor";
import {
  ColorwheelComponent,
  ColorwheelPaletteTemplateDirective,
  type ColorwheelBlockProps,
  type ColorwheelChangeEvent
} from "@s9rg/colorwheel/angular";

interface EventEntry {
  readonly id: number;
  readonly action: string;
  readonly detail: string;
}

type Preset = "violet" | "green";

function createPreset(preset: Preset): Palette {
  return preset === "violet"
    ? createHarmonyPalette({
        seed: "#7C5CFC",
        harmony: { type: "triadic" },
        name: "Angular product triad"
      })
    : createHarmonyPalette({
        seed: "#22A06B",
        harmony: { type: "complementary" },
        name: "Angular growth pair"
      });
}

@Component({
  selector: "consumer-angular-app",
  standalone: true,
  imports: [ColorwheelComponent, ColorwheelPaletteTemplateDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="consumer-shell" data-test="angular-app">
      <header class="consumer-hero">
        <p class="consumer-eyebrow">Published package · Angular 21</p>
        <h1>Standalone Angular palette</h1>
        <p>
          This page bootstraps a real standalone component, keeps palette data in the parent, and
          projects an Angular template into the published adapter.
        </p>
      </header>

      <section class="consumer-controls" aria-labelledby="angular-presets-title">
        <div>
          <h2 id="angular-presets-title">Controlled palette input</h2>
          <p>Each preset replaces the parent field; paletteChange writes editor updates back.</p>
        </div>
        <div
          class="consumer-button-group"
          role="group"
          aria-label="Choose an Angular palette preset"
        >
          <button
            type="button"
            [attr.aria-pressed]="selectedPreset === 'violet'"
            data-test="angular-preset-violet"
            (click)="loadPreset('violet')"
          >
            Violet triad
          </button>
          <button
            type="button"
            [attr.aria-pressed]="selectedPreset === 'green'"
            data-test="angular-preset-green"
            (click)="loadPreset('green')"
          >
            Green pair
          </button>
        </div>
      </section>

      <section class="consumer-editor" aria-label="Angular Colorwheel consumer">
        <s9rg-colorwheel
          [palette]="palette"
          (paletteChange)="onPaletteChange($event)"
          (colorwheelChange)="onColorwheelChange($event)"
          [blockProps]="blockProps"
          ariaLabel="Angular-controlled product palette editor"
          className="angular-consumer-colorwheel"
          data-test="angular-colorwheel"
        >
          <ng-template
            s9rgColorwheelPalette
            let-livePalette
            let-state="state"
            let-controller="controller"
          >
            <section
              class="angular-palette-template"
              aria-labelledby="angular-custom-palette-title"
              data-test="angular-palette-template"
            >
              <div>
                <p class="template-kicker">Angular projected template</p>
                <h2 id="angular-custom-palette-title">Application swatches</h2>
              </div>
              <ul class="angular-swatch-list">
                @for (entry of livePalette.colors; track entry.id; let index = $index) {
                  <li>
                    <button
                      type="button"
                      [attr.aria-label]="
                        'Select ' + (entry.name ?? 'color ' + (index + 1)) + ', ' + hex(entry.color)
                      "
                      [attr.aria-pressed]="state.activeColorId === entry.id"
                      [attr.data-test]="'angular-swatch-' + index"
                      (click)="activate(controller, entry.id)"
                    >
                      <span
                        class="angular-swatch-color"
                        [style.background]="hex(entry.color)"
                        aria-hidden="true"
                      ></span>
                      <span>{{ entry.name ?? "Color " + (index + 1) }}</span>
                      <code>{{ hex(entry.color) }}</code>
                    </button>
                  </li>
                }
              </ul>
            </section>
          </ng-template>
        </s9rg-colorwheel>
      </section>

      <section class="consumer-observability" aria-labelledby="angular-events-title">
        <div class="consumer-summary">
          <h2 id="angular-events-title">Output metadata</h2>
          <output data-test="angular-palette-summary" aria-live="polite">{{
            paletteSummary
          }}</output>
        </div>
        <ol class="consumer-event-list" data-test="angular-event-log">
          @for (entry of eventLog; track entry.id) {
            <li>
              <code>{{ entry.action }}</code>
              <span>{{ entry.detail }}</span>
            </li>
          }
        </ol>
      </section>
    </main>
  `
})
export class AppComponent {
  palette: Palette = createPreset("violet");
  selectedPreset: Preset = "violet";
  eventLog: readonly EventEntry[] = [
    { id: 0, action: "ready", detail: "Controlled palette mounted with three colors." }
  ];

  readonly blockProps = {
    wheel: {
      title: "Angular interaction wheel",
      description: "Native Angular markup drives a palette owned by this application.",
      showInstructions: true,
      showChannels: true,
      showChannelRing: true
    },
    palette: {
      title: "Projected application palette",
      description: "This standard block is replaced by the Angular template below.",
      showName: false,
      showActions: false,
      allowAdd: false
    }
  } satisfies ColorwheelBlockProps;

  private nextEventId = 1;

  get paletteSummary(): string {
    return this.palette.colors
      .map((entry) => formatColor(entry.color, { format: "hex" }))
      .join(" · ");
  }

  hex(color: ColorInput): string {
    return formatColor(color, { format: "hex" });
  }

  loadPreset(preset: Preset): void {
    this.selectedPreset = preset;
    this.palette = createPreset(preset);
    this.prependEvent("external", `${preset === "violet" ? "Violet triad" : "Green pair"} loaded.`);
  }

  onPaletteChange(palette: Palette): void {
    this.palette = palette;
  }

  onColorwheelChange(event: ColorwheelChangeEvent): void {
    const changed =
      event.meta.changedColorIds.length > 0 ? event.meta.changedColorIds.join(", ") : "none";
    this.prependEvent(
      `${event.meta.action}:${event.meta.phase}`,
      `${event.meta.origin}; ${event.palette.colors.length} colors; changed ${changed}`
    );
  }

  activate(controller: PickerController, colorId: string): void {
    controller.commands.setActive(colorId, {
      action: "selection",
      origin: "user",
      phase: "commit"
    });
  }

  private prependEvent(action: string, detail: string): void {
    this.eventLog = [{ id: this.nextEventId++, action, detail }, ...this.eventLog].slice(0, 6);
  }
}
