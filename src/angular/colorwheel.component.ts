import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChild,
  Directive,
  ElementRef,
  EmbeddedViewRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  PLATFORM_ID,
  Renderer2,
  SimpleChanges,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
  inject,
  signal
} from "@angular/core";
import { convertColor, createHarmonyPalette, formatColor, parseColor } from "../core";
import type { ColorValue, HsvColor, JsonObject, OklchColor, Palette, PaletteColor } from "../core";
import {
  OKLCH_WHEEL_MAX_CHROMA,
  clientPointToWheelPoint,
  colorToWheelPoint,
  createPickerController,
  createPickerState,
  getWheelChannelValue,
  resolveWheelEditingColor,
  ringPointToWheelChannelValue,
  setWheelChannelValue,
  wheelChannelValueToRingPoint,
  wheelPointToColor
} from "../editor";
import type {
  ChangeMeta,
  PickerAction,
  PickerController,
  PickerControllerOptions,
  PickerFocusTarget,
  PickerInteraction,
  PickerState,
  WheelEditorOptions,
  WheelRect,
  WheelRingSide
} from "../editor";
import {
  ColorwheelPaletteTemplateDirective,
  ColorwheelWheelTemplateDirective
} from "./palette-template.directive";
import type {
  ColorwheelPaletteTemplateContext,
  ColorwheelWheelTemplateContext
} from "./palette-template.directive";

type ControllerOptions<Metadata extends object> = Omit<
  PickerControllerOptions<Metadata>,
  "onChange" | "onPaletteChange"
>;

type SourceMode = "controller" | "value" | "palette" | "uncontrolled";
type DragRegion = "wheel" | "channel-ring";
type ChannelName = "hue" | "saturation" | "value" | "chroma" | "lightness";

// Angular has no public hydration-stable unique-ID primitive. Keep the native
// template IDREF-free so repeated SSR renders and client hydration stay deterministic.
const INVALID_COLOR_MESSAGE = "Enter a supported CSS color.";

/** Presentation options for the Angular-native wheel block. */
export interface ColorwheelWheelBlockProps {
  readonly title?: string;
  readonly description?: string;
  readonly showInstructions?: boolean;
  readonly showChannels?: boolean;
  readonly showChannelRing?: boolean;
}

/** Presentation options for the Angular-native palette block. */
export interface ColorwheelPaletteBlockProps {
  readonly title?: string;
  readonly description?: string;
  readonly showName?: boolean;
  readonly showActions?: boolean;
  readonly allowAdd?: boolean;
}

/** Configures the standard Angular blocks without replacing their behavior. */
export interface ColorwheelBlockProps {
  readonly wheel?: ColorwheelWheelBlockProps;
  readonly palette?: ColorwheelPaletteBlockProps;
}

/** Context passed to the backwards-compatible low-level palette renderer. */
export interface ColorwheelPaletteRenderContext<Metadata extends object = JsonObject> {
  readonly container: HTMLElement;
  readonly controller: PickerController<Metadata>;
  readonly state: PickerState<Metadata>;
  readonly renderDefault: () => HTMLElement;
}

export interface ColorwheelPaletteRenderHandle<Metadata extends object = JsonObject> {
  readonly node?: Node;
  readonly update?: (context: ColorwheelPaletteRenderContext<Metadata>) => void;
  readonly destroy?: () => void;
}

export type ColorwheelPaletteRenderResult<Metadata extends object = JsonObject> =
  Node | ColorwheelPaletteRenderHandle<Metadata> | null | undefined | void;

export type ColorwheelPaletteRenderer<Metadata extends object = JsonObject> = (
  context: ColorwheelPaletteRenderContext<Metadata>
) => ColorwheelPaletteRenderResult<Metadata>;

/** Detailed event emitted for every user- or extension-originated editor change. */
export interface ColorwheelChangeEvent<Metadata extends object = JsonObject> {
  readonly value: PickerState<Metadata>;
  readonly palette: Palette<Metadata>;
  readonly meta: ChangeMeta;
}

export interface ColorwheelAngularUpdateOptions<Metadata extends object = JsonObject> {
  readonly state?: PickerState<Metadata>;
  readonly palette?: Palette<Metadata>;
  readonly className?: string;
  readonly ariaLabel?: string;
  readonly unstyled?: boolean;
  readonly blockProps?: ColorwheelBlockProps;
  readonly renderPalette?: ColorwheelPaletteRenderer<Metadata> | false;
}

/** Compatibility facade exposed by `ColorwheelComponent.instance`. */
export interface ColorwheelAngularInstance<Metadata extends object = JsonObject> {
  readonly root: HTMLElement;
  readonly controller: PickerController<Metadata>;
  setState(state: PickerState<Metadata>): void;
  setPalette(palette: Palette<Metadata>): void;
  update(options: ColorwheelAngularUpdateOptions<Metadata>): void;
  focus(target?: PickerFocusTarget): void;
}

interface WheelPointView<Metadata extends object> {
  readonly entry: PaletteColor<Metadata>;
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly editable: boolean;
  readonly active: boolean;
  readonly anchor: boolean;
  readonly tabIndex: number;
  readonly ariaLabel: string;
}

interface WheelLineView {
  readonly key: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

interface RingView<Metadata extends object> {
  readonly entry: PaletteColor<Metadata>;
  readonly channel: "value" | "lightness";
  readonly editable: boolean;
  readonly label: string;
  readonly value: number;
  readonly valueText: string;
  readonly start: string;
  readonly middle: string;
  readonly end: string;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly color: string;
}

interface ChannelView {
  readonly name: ChannelName;
  readonly label: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly value: number;
  readonly display: string;
}

interface ColorDraft {
  readonly source: string;
  value: string;
  invalid: boolean;
}

interface DragSession<Metadata extends object> {
  readonly region: DragRegion;
  readonly pointerId: number;
  readonly colorId: string;
  readonly captureTarget: HTMLElement;
  readonly rect: WheelRect;
  readonly interaction: PickerInteraction<Metadata>;
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "nodeType" in value;
}

function isElement(value: unknown): value is HTMLElement {
  return isNode(value) && value.nodeType === 1 && "dataset" in value;
}

/** Angular-owned template outlet that does not add an @angular/common peer. */
@Directive({ selector: "[s9rgColorwheelOutlet]", standalone: true })
export class ɵColorwheelTemplateOutletDirective implements OnChanges, OnDestroy {
  @Input("s9rgColorwheelOutlet") template?: TemplateRef<unknown>;
  @Input() s9rgColorwheelOutletContext?: unknown;

  private readonly container = inject(ViewContainerRef);
  private view: EmbeddedViewRef<unknown> | undefined;
  private mountedTemplate: TemplateRef<unknown> | undefined;
  private mountedContext: unknown;

  ngOnChanges(): void {
    if (
      this.template === this.mountedTemplate &&
      this.s9rgColorwheelOutletContext === this.mountedContext
    ) {
      this.view?.markForCheck();
      return;
    }
    this.container.clear();
    this.view = undefined;
    this.mountedTemplate = this.template;
    this.mountedContext = this.s9rgColorwheelOutletContext;
    if (this.template !== undefined) {
      this.view = this.container.createEmbeddedView(
        this.template,
        this.s9rgColorwheelOutletContext
      );
    }
  }

  ngOnDestroy(): void {
    this.container.clear();
    this.view = undefined;
  }
}

/** Isolates the legacy imperative palette hook from the Angular-native tree. */
@Directive({ selector: "[s9rgColorwheelPaletteRenderer]", standalone: true })
export class ɵColorwheelPaletteRendererDirective<Metadata extends object = JsonObject>
  implements OnChanges, OnDestroy
{
  @Input() s9rgColorwheelPaletteRenderer?: ColorwheelPaletteRenderer<Metadata>;
  @Input() s9rgColorwheelRendererController?: PickerController<Metadata>;
  @Input() s9rgColorwheelRendererState?: PickerState<Metadata>;
  @Input() s9rgColorwheelDefaultPalette?: TemplateRef<unknown>;
  @Input() s9rgColorwheelDefaultContext?: unknown;

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private renderer: ColorwheelPaletteRenderer<Metadata> | undefined;
  private controller: PickerController<Metadata> | undefined;
  private handle: ColorwheelPaletteRenderHandle<Metadata> | undefined;
  private defaultView: EmbeddedViewRef<unknown> | undefined;

  ngOnChanges(): void {
    const nextRenderer = this.s9rgColorwheelPaletteRenderer;
    const nextController = this.s9rgColorwheelRendererController;
    const state = this.s9rgColorwheelRendererState;
    if (nextRenderer === undefined || nextController === undefined || state === undefined) {
      this.clear();
      return;
    }
    const context = this.context(nextController, state);
    if (this.renderer === nextRenderer && this.controller === nextController) {
      this.defaultView?.detectChanges();
      this.handle?.update?.(context);
      return;
    }
    this.clear();
    this.renderer = nextRenderer;
    this.controller = nextController;
    const result = nextRenderer(context);
    const node = isNode(result)
      ? result
      : typeof result === "object" && result !== null && "node" in result && isNode(result.node)
        ? result.node
        : undefined;
    this.handle =
      typeof result === "object" && result !== null && !isNode(result) ? result : undefined;
    if (node !== undefined && node.parentNode !== this.element.nativeElement) {
      this.element.nativeElement.append(node);
    }
  }

  ngOnDestroy(): void {
    this.clear();
  }

  private context(
    controller: PickerController<Metadata>,
    state: PickerState<Metadata>
  ): ColorwheelPaletteRenderContext<Metadata> {
    return {
      container: this.element.nativeElement,
      controller,
      state,
      renderDefault: () => this.renderDefault()
    };
  }

  private renderDefault(): HTMLElement {
    if (this.defaultView === undefined) {
      const template = this.s9rgColorwheelDefaultPalette;
      if (template === undefined) {
        throw new Error("Missing default Angular palette template");
      }
      this.defaultView = template.createEmbeddedView(this.s9rgColorwheelDefaultContext);
      this.defaultView.detectChanges();
    }
    const root = this.defaultView.rootNodes.find(isElement);
    if (root === undefined) {
      throw new Error("Default Angular palette has no element");
    }
    return root;
  }

  private clear(): void {
    const destroy = this.handle?.destroy;
    this.handle = undefined;
    this.renderer = undefined;
    this.controller = undefined;
    try {
      destroy?.();
    } finally {
      this.defaultView?.destroy();
      this.defaultView = undefined;
      this.element.nativeElement.replaceChildren();
    }
  }
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function defaultPalette(): Palette {
  return createHarmonyPalette({
    seed: { space: "hsv", h: 258, s: 0.72, v: 0.96 },
    harmony: { type: "complementary" },
    name: "Complementary violet"
  });
}

function canEditColor<Metadata extends object>(
  state: PickerState<Metadata>,
  entry: PaletteColor<Metadata>
): boolean {
  return !entry.locked && (state.wheel.interaction === "free" || entry.id === state.anchorColorId);
}

function colorName(entry: PaletteColor<object>, index: number): string {
  return entry.name?.trim() || `Color ${index + 1}`;
}

function cssColor(color: ColorValue, alpha: "auto" | "never" = "auto"): string {
  return formatColor(color, { format: "rgb", alpha });
}

function hexColor(color: ColorValue): string {
  return formatColor(color, { format: "hex", alpha: "auto" });
}

function ringKeyboardValue(current: number, event: KeyboardEvent): number | undefined {
  if (event.ctrlKey || event.metaKey) return undefined;
  if (event.key === "Home") return 0;
  if (event.key === "End") return 100;
  let delta: number;
  if (event.key === "PageUp") delta = 10;
  else if (event.key === "PageDown") delta = -10;
  else if (event.key === "ArrowUp" || event.key === "ArrowRight") delta = 1;
  else if (event.key === "ArrowDown" || event.key === "ArrowLeft") delta = -1;
  else return undefined;
  if (event.shiftKey) delta = Math.sign(delta) * 10;
  else if (event.altKey) delta /= 10;
  return clamp(current + delta, 0, 100);
}

function keyboardColor<Metadata extends object>(
  state: PickerState<Metadata>,
  entry: PaletteColor<Metadata>,
  key: string,
  largeStep: boolean
): ColorValue | undefined {
  const hueStep = largeStep ? 10 : 1;
  const radialStep = largeStep ? 0.1 : 0.01;
  const editingColor = resolveWheelEditingColor(state, entry);
  if (state.wheel.wheelModel === "oklch") {
    const color = convertColor(editingColor, "oklch");
    const chromaStep = radialStep * OKLCH_WHEEL_MAX_CHROMA;
    if (key === "ArrowLeft") return { ...color, h: (color.h - hueStep + 360) % 360 };
    if (key === "ArrowRight") return { ...color, h: (color.h + hueStep) % 360 };
    if (key === "PageDown") return { ...color, h: (color.h - 10 + 360) % 360 };
    if (key === "PageUp") return { ...color, h: (color.h + 10) % 360 };
    if (key === "ArrowDown") {
      return { ...color, c: clamp(color.c - chromaStep, 0, OKLCH_WHEEL_MAX_CHROMA) };
    }
    if (key === "ArrowUp") {
      return { ...color, c: clamp(color.c + chromaStep, 0, OKLCH_WHEEL_MAX_CHROMA) };
    }
    if (key === "Home") return { ...color, c: 0 };
    if (key === "End") return { ...color, c: OKLCH_WHEEL_MAX_CHROMA };
    return undefined;
  }
  const color = convertColor(editingColor, "hsv");
  if (key === "ArrowLeft") return { ...color, h: (color.h - hueStep + 360) % 360 };
  if (key === "ArrowRight") return { ...color, h: (color.h + hueStep) % 360 };
  if (key === "PageDown") return { ...color, h: (color.h - 10 + 360) % 360 };
  if (key === "PageUp") return { ...color, h: (color.h + 10) % 360 };
  if (key === "ArrowDown") return { ...color, s: clamp(color.s - radialStep) };
  if (key === "ArrowUp") return { ...color, s: clamp(color.s + radialStep) };
  if (key === "Home") return { ...color, s: 0 };
  if (key === "End") return { ...color, s: 1 };
  return undefined;
}

@Component({
  selector: "s9rg-colorwheel",
  standalone: true,
  imports: [ɵColorwheelTemplateOutletDirective, ɵColorwheelPaletteRendererDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "data-colorwheel-angular": "" },
  template: `
    <div
      #root
      data-colorwheel=""
      data-part="root"
      role="group"
      tabindex="-1"
      [class]="rootClass"
      [attr.aria-label]="ariaLabel"
      [attr.data-unstyled]="unstyled ? '' : null"
    >
      @if (currentState(); as state) {
        <ng-template #defaultWheelTemplate>
          <section
            data-part="wheel-block"
            class="colorwheel-wheel"
            [attr.aria-label]="wheelTitle"
            [attr.aria-description]="wheelDescription ?? null"
          >
            <header data-part="block-header">
              <div>
                <h2 data-part="block-title">{{ wheelTitle }}</h2>
                @if (wheelDescription) {
                  <div data-part="block-description">{{ wheelDescription }}</div>
                }
              </div>
              <output data-part="active-color" aria-live="polite">{{ activeColorText }}</output>
            </header>

            <div
              data-part="wheel-frame"
              [attr.data-ring]="ring && showChannelRing ? 'true' : 'false'"
              [attr.data-model]="state.wheel.wheelModel"
              [style.--colorwheel-channel-start]="ring?.start"
              [style.--colorwheel-channel-mid]="ring?.middle"
              [style.--colorwheel-channel-end]="ring?.end"
              [style.--colorwheel-channel-ring-x.%]="ring?.x"
              [style.--colorwheel-channel-ring-y.%]="ring?.y"
              [style.--colorwheel-channel-ring-angle.rad]="ring?.angle"
              [style.--colorwheel-channel-color]="ring?.color"
            >
              @if (ring && showChannelRing) {
                <div
                  data-part="channel-ring"
                  role="slider"
                  [attr.data-color-id]="ring.entry.id"
                  [attr.data-channel]="ring.channel"
                  [attr.data-model]="state.wheel.wheelModel"
                  [attr.data-side]="ringSide"
                  [attr.aria-label]="ring.label"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  [attr.aria-valuenow]="ring.value"
                  [attr.aria-valuetext]="ring.valueText"
                  aria-orientation="vertical"
                  [attr.aria-disabled]="ring.editable ? null : 'true'"
                  [tabIndex]="ring.editable ? 0 : -1"
                  (keydown)="onRingKeydown($event, ring)"
                  (pointerdown)="startPointer($event, 'channel-ring')"
                  (lostpointercapture)="lostPointerCapture($event)"
                >
                  <span data-part="channel-ring-track" aria-hidden="true"></span>
                  <span data-part="channel-ring-thumb" aria-hidden="true"></span>
                </div>
              }

              <div
                data-part="wheel"
                class="colorwheel-wheel-surface"
                role="group"
                aria-label="Color wheel"
                [attr.aria-description]="wheelSurfaceDescription"
                [attr.data-model]="state.wheel.wheelModel"
                [style.--colorwheel-value]="surfaceValue"
                [style.--colorwheel-lightness.%]="surfaceLightness"
                (pointerdown)="startPointer($event, 'wheel')"
                (lostpointercapture)="lostPointerCapture($event)"
              >
                <div data-part="wheel-color" aria-hidden="true"></div>
                @if (lines.length > 0) {
                  <svg data-part="harmony-lines" viewBox="0 0 100 100" aria-hidden="true">
                    @for (line of lines; track line.key) {
                      <line
                        [attr.x1]="line.x1"
                        [attr.y1]="line.y1"
                        [attr.x2]="line.x2"
                        [attr.y2]="line.y2"
                      ></line>
                    }
                  </svg>
                }
                @for (point of points; track point.entry.id) {
                  <button
                    type="button"
                    data-part="pointer"
                    [attr.data-color-id]="point.entry.id"
                    [attr.data-editable]="point.editable ? '' : null"
                    [attr.data-active]="point.active ? 'true' : 'false'"
                    [attr.data-anchor]="point.anchor ? 'true' : 'false'"
                    [attr.data-locked]="point.entry.locked ? 'true' : 'false'"
                    [attr.aria-label]="point.ariaLabel"
                    [attr.aria-pressed]="point.active"
                    [attr.aria-disabled]="point.editable ? null : 'true'"
                    [disabled]="!point.editable"
                    [tabIndex]="point.tabIndex"
                    [style.--colorwheel-pointer-x.%]="point.x"
                    [style.--colorwheel-pointer-y.%]="point.y"
                    [style.--colorwheel-pointer-color]="point.color"
                    (focus)="selectColor(point.entry.id)"
                    (keydown)="onPointerKeydown($event, point.entry)"
                  >
                    <span data-part="pointer-color" aria-hidden="true"></span>
                    @if (point.anchor) {
                      <span data-part="pointer-anchor" aria-hidden="true"></span>
                    }
                  </button>
                }
              </div>
            </div>

            @if (showInstructions) {
              <p data-part="wheel-instructions">{{ wheelInstructions }}</p>
            }

            @if (showChannels && activeEntry) {
              <fieldset data-part="channels" [attr.data-color-id]="activeEntry.id">
                <legend data-part="field-label">Active color</legend>
                @for (channel of channels; track channel.name) {
                  <label data-part="channel" [attr.data-channel]="channel.name">
                    <span data-part="channel-label">{{ channel.label }}</span>
                    <input
                      type="range"
                      data-part="channel-input"
                      [attr.data-channel]="channel.name"
                      [attr.data-color-id]="activeEntry.id"
                      [attr.aria-label]="colorLabel(activeEntry, 0) + ' ' + channel.name"
                      [min]="channel.minimum"
                      [max]="channel.maximum"
                      [step]="channel.step"
                      [value]="channel.value"
                      [disabled]="!canEdit(activeEntry)"
                      (input)="onChannelInput($event, activeEntry, channel.name)"
                    />
                    <output data-part="channel-value">{{ channel.display }}</output>
                  </label>
                }
              </fieldset>
            }
          </section>
        </ng-template>

        <ng-template #defaultPaletteTemplate>
          <section
            data-part="palette"
            class="colorwheel-palette"
            tabindex="-1"
            [attr.aria-label]="paletteTitle"
            [attr.aria-description]="paletteDescription ?? null"
          >
            <header data-part="block-header">
              <div>
                <h2 data-part="block-title">{{ paletteTitle }}</h2>
                @if (paletteDescription) {
                  <div data-part="block-description">{{ paletteDescription }}</div>
                }
              </div>
              <span data-part="palette-count">{{ paletteCountText }}</span>
            </header>

            @if (state.palette.colors.length === 0) {
              <p data-part="empty-state">This palette is empty. Add a color to begin.</p>
            } @else {
              <ol data-part="palette-list">
                @for (entry of state.palette.colors; track entry.id; let index = $index) {
                  <li
                    data-part="palette-item"
                    [attr.data-color-id]="entry.id"
                    [attr.data-active]="entry.id === state.activeColorId ? '' : null"
                    [attr.data-anchor]="entry.id === state.anchorColorId ? '' : null"
                    [attr.data-locked]="entry.locked ? '' : null"
                  >
                    <button
                      type="button"
                      data-part="swatch"
                      [attr.data-color-id]="entry.id"
                      [attr.aria-label]="swatchLabel(entry, index)"
                      [attr.aria-pressed]="entry.id === state.activeColorId"
                      [style.--colorwheel-swatch-color]="colorCss(entry.color)"
                      (click)="selectColor(entry.id)"
                    >
                      <span data-part="swatch-color" aria-hidden="true"></span>
                      @if (entry.id === state.anchorColorId) {
                        <span data-part="anchor-mark" aria-hidden="true">Anchor</span>
                      }
                    </button>

                    <div data-part="palette-item-fields">
                      @if (showPaletteName) {
                        <label data-part="field">
                          <span class="colorwheel-visually-hidden">
                            {{ colorLabel(entry, index) }} name
                          </span>
                          <input
                            data-part="name-input"
                            [attr.data-color-id]="entry.id"
                            [value]="entry.name ?? ''"
                            [placeholder]="colorLabel(entry, index)"
                            (focus)="beginNameInteraction(entry.id)"
                            (input)="updateName($event, entry.id)"
                            (blur)="commitNameInteraction(entry.id)"
                          />
                        </label>
                      }
                      <label data-part="field">
                        <span class="colorwheel-visually-hidden">
                          {{ colorLabel(entry, index) }} value
                        </span>
                        <input
                          data-part="color-input"
                          [attr.data-color-id]="entry.id"
                          [value]="draftFor(entry).value"
                          [disabled]="!canEdit(entry)"
                          [attr.aria-invalid]="draftFor(entry).invalid ? 'true' : null"
                          [attr.aria-description]="
                            draftFor(entry).invalid ? invalidColorMessage : null
                          "
                          spellcheck="false"
                          autocapitalize="none"
                          (input)="updateColorDraft($event, entry)"
                          (change)="commitColor(entry)"
                          (blur)="commitColor(entry)"
                          (keydown)="onColorKeydown($event, entry)"
                        />
                      </label>
                      @if (draftFor(entry).invalid) {
                        <span data-part="field-error" role="alert">{{ invalidColorMessage }}</span>
                      }
                    </div>

                    @if (showPaletteActions) {
                      <div data-part="palette-item-actions">
                        <button
                          type="button"
                          data-part="icon-button"
                          [attr.aria-label]="
                            (entry.locked ? 'Unlock ' : 'Lock ') + colorLabel(entry, index)
                          "
                          [attr.aria-pressed]="!!entry.locked"
                          (click)="toggleLock(entry)"
                        >
                          {{ entry.locked ? "Locked" : "Lock" }}
                        </button>
                        <button
                          type="button"
                          data-part="icon-button"
                          [attr.aria-label]="'Move ' + colorLabel(entry, index) + ' earlier'"
                          [disabled]="index === 0"
                          (click)="moveColor(entry.id, index - 1)"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          data-part="icon-button"
                          [attr.aria-label]="'Move ' + colorLabel(entry, index) + ' later'"
                          [disabled]="index === state.palette.colors.length - 1"
                          (click)="moveColor(entry.id, index + 1)"
                        >
                          →
                        </button>
                        <button
                          type="button"
                          data-part="icon-button"
                          [attr.aria-label]="'Remove ' + colorLabel(entry, index)"
                          (click)="removeColor(entry.id, index)"
                        >
                          Remove
                        </button>
                      </div>
                    }
                  </li>
                }
              </ol>
            }
            @if (allowAdd) {
              <button type="button" data-part="add-color" (click)="addColor()">Add color</button>
            }
          </section>
        </ng-template>

        <div data-part="picker-layout">
          <div data-part="wheel-slot">
            @if (projectedWheel; as customWheel) {
              <ng-container
                [s9rgColorwheelOutlet]="customWheel.templateRef"
                [s9rgColorwheelOutletContext]="wheelTemplateContext"
              ></ng-container>
            } @else {
              <ng-container
                [s9rgColorwheelOutlet]="defaultWheelTemplate"
                [s9rgColorwheelOutletContext]="wheelTemplateContext"
              ></ng-container>
            }
          </div>

          <div data-part="palette-slot" [hidden]="renderPalette === false">
            @if (renderPalette !== false) {
              @if (imperativeRenderer; as renderer) {
                <div
                  data-part="palette-renderer"
                  [s9rgColorwheelPaletteRenderer]="browser ? renderer : undefined"
                  [s9rgColorwheelRendererController]="editorController"
                  [s9rgColorwheelRendererState]="state"
                  [s9rgColorwheelDefaultPalette]="defaultPaletteTemplate"
                  [s9rgColorwheelDefaultContext]="paletteTemplateContext"
                ></div>
              } @else if (projectedPalette; as customPalette) {
                <ng-container
                  [s9rgColorwheelOutlet]="customPalette.templateRef"
                  [s9rgColorwheelOutletContext]="paletteTemplateContext"
                ></ng-container>
              } @else {
                <ng-container
                  [s9rgColorwheelOutlet]="defaultPaletteTemplate"
                  [s9rgColorwheelOutletContext]="paletteTemplateContext"
                ></ng-container>
              }
            }
          </div>
        </div>
      }
    </div>
  `
})
export class ColorwheelComponent<Metadata extends object = JsonObject>
  implements OnChanges, OnInit, OnDestroy
{
  @Input() controller?: PickerController<Metadata>;
  @Input() value?: PickerState<Metadata>;
  @Input() palette?: Palette<Metadata>;
  @Input() defaultValue?: PickerState<Metadata>;
  @Input() defaultPalette?: Palette<Metadata>;
  @Input() wheel?: Partial<WheelEditorOptions>;
  @Input() controllerOptions?: ControllerOptions<Metadata>;
  @Input() className?: string;
  @Input() ariaLabel = "Color wheel and palette editor";
  @Input() unstyled = false;
  @Input() blockProps?: ColorwheelBlockProps;
  @Input() renderPalette?: ColorwheelPaletteRenderer<Metadata> | false;

  @Output() readonly valueChange = new EventEmitter<PickerState<Metadata>>();
  @Output() readonly paletteChange = new EventEmitter<Palette<Metadata>>();
  @Output() readonly colorwheelChange = new EventEmitter<ColorwheelChangeEvent<Metadata>>();

  @ContentChild(ColorwheelPaletteTemplateDirective)
  protected projectedPalette?: ColorwheelPaletteTemplateDirective<Metadata>;

  @ContentChild(ColorwheelWheelTemplateDirective)
  protected projectedWheel?: ColorwheelWheelTemplateDirective<Metadata>;

  @ViewChild("root", { read: ElementRef }) private rootElement?: ElementRef<HTMLElement>;

  protected readonly browser = (inject(PLATFORM_ID) as unknown) === "browser";
  protected readonly invalidColorMessage = INVALID_COLOR_MESSAGE;
  protected readonly currentState = signal<PickerState<Metadata> | undefined>(undefined);
  protected points: readonly WheelPointView<Metadata>[] = [];
  protected lines: readonly WheelLineView[] = [];
  protected ring: RingView<Metadata> | undefined;
  protected channels: readonly ChannelView[] = [];
  protected activeEntry: PaletteColor<Metadata> | undefined;
  protected activeColorText = "No color";
  protected surfaceValue = 1;
  protected surfaceLightness = 70;
  protected ringSide: WheelRingSide = "right";
  protected wheelTemplateContext?: ColorwheelWheelTemplateContext<Metadata>;
  protected paletteTemplateContext?: ColorwheelPaletteTemplateContext<Metadata>;

  private readonly renderer = inject(Renderer2);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private liveController: PickerController<Metadata> | undefined;
  private unsubscribe: (() => void) | undefined;
  private ownedController = false;
  private initialized = false;
  private destroyed = false;
  private mountedMode: SourceMode | undefined;
  private previousPalette: Palette<Metadata> | undefined;
  private generation = 0;
  private reconciliationQueued = false;
  private drag: DragSession<Metadata> | undefined;
  private dragListeners: readonly (() => void)[] = [];
  private readonly nameInteractions = new Map<string, PickerInteraction<Metadata>>();
  private readonly colorDrafts = new Map<string, ColorDraft>();
  private instanceFacade: ColorwheelAngularInstance<Metadata> | undefined;

  get instance(): ColorwheelAngularInstance<Metadata> | undefined {
    if (!this.browser || this.destroyed || this.rootElement === undefined || !this.initialized) {
      return undefined;
    }
    this.instanceFacade ??= this.createInstanceFacade(this.rootElement.nativeElement);
    return this.instanceFacade;
  }

  get editorController(): PickerController<Metadata> | undefined {
    return this.liveController;
  }

  protected get rootClass(): string {
    return ["colorwheel", this.className].filter(Boolean).join(" ");
  }

  protected get wheelTitle(): string {
    return this.blockProps?.wheel?.title ?? "Color wheel";
  }

  protected get wheelDescription(): string | undefined {
    return this.blockProps?.wheel?.description;
  }

  protected get showInstructions(): boolean {
    return this.blockProps?.wheel?.showInstructions ?? true;
  }

  protected get showChannels(): boolean {
    return this.blockProps?.wheel?.showChannels ?? true;
  }

  protected get showChannelRing(): boolean {
    return this.blockProps?.wheel?.showChannelRing ?? true;
  }

  protected get paletteTitle(): string {
    return this.blockProps?.palette?.title ?? "Palette";
  }

  protected get paletteDescription(): string | undefined {
    return this.blockProps?.palette?.description;
  }

  protected get showPaletteName(): boolean {
    return this.blockProps?.palette?.showName ?? true;
  }

  protected get showPaletteActions(): boolean {
    return this.blockProps?.palette?.showActions ?? true;
  }

  protected get allowAdd(): boolean {
    return this.blockProps?.palette?.allowAdd ?? true;
  }

  protected get paletteCountText(): string {
    const count = this.currentState()?.palette.colors.length ?? 0;
    return `${count} ${count === 1 ? "color" : "colors"}`;
  }

  protected get wheelInstructions(): string {
    const ring = this.showChannelRing && this.ring !== undefined;
    const ringText = ring
      ? ` Drag the outer ring to adjust ${this.currentState()?.wheel.wheelModel === "oklch" ? "lightness" : "value"}.`
      : "";
    const target = ring ? "a handle or ring" : "a handle";
    return `Drag or tap the wheel.${ringText} Use arrow keys on ${target}${this.showChannels ? ", or use the numeric channel controls" : ""}.`;
  }

  protected get wheelSurfaceDescription(): string | null {
    const descriptions = [
      this.wheelDescription,
      this.showInstructions ? this.wheelInstructions : undefined
    ].filter((description): description is string => description !== undefined);
    return descriptions.length === 0 ? null : descriptions.join(" ");
  }

  protected get imperativeRenderer(): ColorwheelPaletteRenderer<Metadata> | undefined {
    return typeof this.renderPalette === "function" ? this.renderPalette : undefined;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.destroyed) return;
    this.assertValidInputs();
    if (!this.initialized) {
      this.initialize();
      return;
    }
    const mode = this.sourceMode();
    if (mode !== this.mountedMode) {
      throw new TypeError("ColorwheelComponent cannot switch source modes");
    }
    if ("controller" in changes && mode === "controller") {
      const next = this.controller;
      if (next !== undefined && next !== this.liveController) this.bindController(next, false);
      return;
    }
    const controller = this.requireController();
    if ("value" in changes && mode === "value") {
      const next = this.value;
      if (next !== undefined && controller.getState() !== next) controller.setState(next);
    }
    if ("palette" in changes && mode === "palette") {
      const next = this.palette;
      if (next !== undefined && controller.getPalette() !== next) controller.setPalette(next);
    }
    if ("wheel" in changes && (mode === "palette" || mode === "uncontrolled")) {
      if (this.wheel !== undefined) {
        controller.commands.setWheelOptions(this.wheel, {
          action: "programmatic",
          origin: "external",
          phase: "commit"
        });
      }
    }
  }

  ngOnInit(): void {
    if (!this.initialized) {
      this.assertValidInputs();
      this.initialize();
    }
  }

  ngOnDestroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    this.reconciliationQueued = false;
    this.finishDrag(true, undefined, true);
    this.finishNameInteractions(true);
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (this.ownedController) this.liveController?.destroy();
    this.liveController = undefined;
    this.initialized = false;
    this.instanceFacade = undefined;
  }

  focus(target: PickerFocusTarget = { type: "root" }): void {
    const root = this.rootElement?.nativeElement;
    if (root === undefined) return;
    if (target.type === "root") {
      root.focus();
      return;
    }
    const part =
      target.type === "pointer"
        ? "pointer"
        : target.type === "swatch"
          ? "swatch"
          : target.type === "wheel"
            ? "pointer"
            : target.type === "palette"
              ? "palette"
              : "channel-input";
    const candidates = [...root.querySelectorAll<HTMLElement>(`[data-part="${part}"]`)];
    const match = candidates.find((element) => {
      if (target.type === "pointer" || target.type === "swatch") {
        return element.dataset.colorId === target.colorId;
      }
      if (target.type === "channel") {
        return (
          element.dataset.colorId === target.colorId && element.dataset.channel === target.channel
        );
      }
      return !element.hasAttribute("disabled");
    });
    match?.focus();
  }

  protected colorLabel(entry: PaletteColor<Metadata>, index: number): string {
    return colorName(entry, index);
  }

  protected colorCss(color: ColorValue): string {
    return cssColor(color);
  }

  protected swatchLabel(entry: PaletteColor<Metadata>, index: number): string {
    return `Select ${colorName(entry, index)}, ${hexColor(entry.color)}`;
  }

  protected canEdit(entry: PaletteColor<Metadata>): boolean {
    const state = this.currentState();
    return state !== undefined && canEditColor(state, entry);
  }

  protected draftFor(entry: PaletteColor<Metadata>): ColorDraft {
    const source = hexColor(entry.color);
    const existing = this.colorDrafts.get(entry.id);
    if (existing !== undefined && existing.source === source) return existing;
    const draft: ColorDraft = { source, value: source, invalid: false };
    this.colorDrafts.set(entry.id, draft);
    return draft;
  }

  protected selectColor(colorId: string): void {
    if (this.currentState()?.activeColorId === colorId) return;
    this.requireController().commands.setActive(colorId, {
      action: "selection",
      phase: "commit"
    });
  }

  protected toggleLock(entry: PaletteColor<Metadata>): void {
    this.requireController().commands.setLocked(entry.id, !entry.locked, {
      action: "lock",
      phase: "commit"
    });
  }

  protected moveColor(colorId: string, index: number): void {
    this.requireController().commands.reorderColor(colorId, index, {
      action: "reorder",
      phase: "commit"
    });
  }

  protected removeColor(colorId: string, index: number): void {
    const state = this.requireController().getState();
    const focusId = state.palette.colors[index + 1]?.id ?? state.palette.colors[index - 1]?.id;
    this.requireController().commands.removeColor(colorId, {
      action: "remove",
      phase: "commit"
    });
    queueMicrotask(() => {
      if (focusId === undefined) this.focus({ type: "palette" });
      else this.focus({ type: "swatch", colorId: focusId });
    });
  }

  protected addColor(): void {
    const controller = this.requireController();
    const state = controller.getState();
    const active = state.palette.colors.find((entry) => entry.id === state.activeColorId);
    const id = controller.commands.addColor(
      {
        color: active?.color ?? { space: "hsv", h: 0, s: 0, v: 0.5 },
        name: "New color"
      },
      undefined,
      { action: "add", phase: "commit" }
    );
    controller.commands.setActive(id, { action: "selection", phase: "commit" });
  }

  protected beginNameInteraction(colorId: string): void {
    if (this.nameInteractions.has(colorId)) return;
    const interaction = this.requireController().beginInteraction({ action: "text-input" });
    interaction.start();
    this.nameInteractions.set(colorId, interaction);
  }

  protected updateName(event: Event, colorId: string): void {
    this.beginNameInteraction(colorId);
    this.nameInteractions.get(colorId)?.update({
      type: "set-color-name",
      colorId,
      name: this.inputValue(event) || undefined
    });
  }

  protected commitNameInteraction(colorId: string): void {
    const interaction = this.nameInteractions.get(colorId);
    if (interaction === undefined) return;
    this.nameInteractions.delete(colorId);
    interaction.commit();
  }

  protected updateColorDraft(event: Event, entry: PaletteColor<Metadata>): void {
    const draft = this.draftFor(entry);
    draft.value = this.inputValue(event);
    draft.invalid = false;
  }

  protected commitColor(entry: PaletteColor<Metadata>): void {
    const draft = this.draftFor(entry);
    try {
      const color = parseColor(draft.value);
      const value = hexColor(color);
      draft.value = value;
      draft.invalid = false;
      this.requireController().commands.setColor(entry.id, color, {
        action: "text-input",
        phase: "commit"
      });
    } catch {
      draft.invalid = true;
    }
  }

  protected onColorKeydown(event: KeyboardEvent, entry: PaletteColor<Metadata>): void {
    const input = event.currentTarget as HTMLInputElement;
    if (event.key === "Enter") {
      event.preventDefault();
      this.commitColor(entry);
    } else if (event.key === "Escape") {
      event.preventDefault();
      const draft = this.draftFor(entry);
      draft.value = draft.source;
      draft.invalid = false;
      input.value = draft.source;
    }
  }

  protected onChannelInput(
    event: Event,
    entry: PaletteColor<Metadata>,
    channel: ChannelName
  ): void {
    const next = this.channelColor(entry, channel, this.inputValue(event));
    if (next !== undefined) {
      this.requireController().commands.setColor(entry.id, next, {
        action: "text-input",
        phase: "commit"
      });
    }
  }

  protected onPointerKeydown(event: KeyboardEvent, entry: PaletteColor<Metadata>): void {
    const state = this.requireController().getState();
    if (!canEditColor(state, entry)) return;
    const next = keyboardColor(
      state,
      entry,
      event.key,
      event.shiftKey || event.key.startsWith("Page")
    );
    if (next === undefined) return;
    event.preventDefault();
    this.requireController().commands.setActive(entry.id, {
      action: "selection",
      phase: "commit"
    });
    this.requireController().commands.setColor(entry.id, next, {
      action: "keyboard",
      phase: "commit"
    });
    this.focus({ type: "pointer", colorId: entry.id });
  }

  protected onRingKeydown(event: KeyboardEvent, ring: RingView<Metadata>): void {
    if (!ring.editable) return;
    const next = ringKeyboardValue(ring.value, event);
    if (next === undefined) return;
    event.preventDefault();
    const controller = this.requireController();
    const state = controller.getState();
    controller.commands.setActive(ring.entry.id, {
      action: "selection",
      phase: "commit"
    });
    controller.commands.setColor(
      ring.entry.id,
      setWheelChannelValue(resolveWheelEditingColor(state, ring.entry), next / 100, {
        model: state.wheel.wheelModel
      }),
      { action: "keyboard", phase: "commit" }
    );
  }

  protected startPointer(event: PointerEvent, region: DragRegion): void {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    const target = event.currentTarget;
    if (!isElement(target)) return;
    const controller = this.requireController();
    const state = controller.getState();
    const pointer = region === "wheel" ? this.closestPart(event.target, "pointer") : undefined;
    const colorId =
      (region === "channel-ring" ? target.dataset.colorId : pointer?.dataset.colorId) ??
      (state.wheel.interaction === "linked" ? state.anchorColorId : state.activeColorId) ??
      state.palette.colors.find((entry) => !entry.locked)?.id;
    if (colorId === undefined) return;
    const entry = state.palette.colors.find((candidate) => candidate.id === colorId);
    if (entry === undefined || !canEditColor(state, entry)) return;
    const bounds = target.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    event.preventDefault();
    this.finishDrag(true);
    const rect: WheelRect = {
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height
    };
    if (region === "channel-ring") this.updateRingSide(event.clientX, rect);
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch {
      // Document listeners retain continuity when capture is unavailable.
    }
    controller.commands.setActive(colorId, { action: "selection", phase: "commit" });
    const interaction = controller.beginInteraction({ action: "pointer", origin: "user" });
    const session: DragSession<Metadata> = {
      region,
      pointerId: event.pointerId,
      colorId,
      captureTarget: target,
      rect,
      interaction
    };
    this.drag = session;
    this.listenForDrag(target.ownerDocument);
    const action = this.dragAction(session, event.clientX, event.clientY);
    if (action !== undefined) interaction.update(action);
  }

  protected lostPointerCapture(event: PointerEvent): void {
    if (this.drag?.pointerId === event.pointerId) this.finishDrag(true);
  }

  private initialize(): void {
    const mode = this.sourceMode();
    this.mountedMode = mode;
    this.initialized = true;
    let created: PickerController<Metadata> | undefined;
    try {
      if (this.controller !== undefined) {
        this.bindController(this.controller, false);
        return;
      }
      const palette =
        this.palette ?? this.defaultPalette ?? (defaultPalette() as Palette<Metadata>);
      const initialState =
        this.value ??
        this.defaultValue ??
        createPickerState({
          palette,
          wheel: {
            ...this.wheel,
            interaction:
              this.wheel?.interaction ?? (palette.recipe?.type === "wheel" ? "linked" : "free")
          }
        });
      created = createPickerController(initialState, this.controllerOptions);
      this.bindController(created, true);
    } catch (error) {
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      created?.destroy();
      this.liveController = undefined;
      this.ownedController = false;
      this.initialized = false;
      this.mountedMode = undefined;
      this.currentState.set(undefined);
      throw error;
    }
  }

  private bindController(controller: PickerController<Metadata>, owned: boolean): void {
    this.generation += 1;
    this.reconciliationQueued = false;
    this.finishDrag(true, undefined, true);
    this.finishNameInteractions(true);
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (this.ownedController && this.liveController !== controller) this.liveController?.destroy();
    this.liveController = controller;
    this.ownedController = owned;
    const state = controller.getState();
    this.previousPalette = state.palette;
    this.refreshState(state);
    this.unsubscribe = controller.subscribe(
      (value) => value,
      (next, meta) => this.controllerChanged(next, meta)
    );
  }

  private controllerChanged(state: PickerState<Metadata>, meta: ChangeMeta): void {
    if (this.destroyed) return;
    const paletteChanged = this.previousPalette !== state.palette;
    this.previousPalette = state.palette;
    this.refreshState(state, meta);
    if (meta.origin === "external") return;
    this.valueChange.emit(state);
    this.colorwheelChange.emit({ value: state, palette: state.palette, meta });
    if (paletteChanged) this.paletteChange.emit(state.palette);
    if (this.mountedMode === "value") this.scheduleControlledReconciliation("value");
    else if (paletteChanged && this.mountedMode === "palette") {
      this.scheduleControlledReconciliation("palette");
    }
  }

  private refreshState(state: PickerState<Metadata>, meta?: ChangeMeta): void {
    const existingIds = new Set(state.palette.colors.map((entry) => entry.id));
    for (const id of this.colorDrafts.keys()) {
      if (!existingIds.has(id)) this.colorDrafts.delete(id);
    }
    for (const [id, interaction] of this.nameInteractions) {
      if (existingIds.has(id)) continue;
      this.nameInteractions.delete(id);
      if (meta?.origin !== "external") interaction.commit();
    }
    const active = state.palette.colors.find((entry) => entry.id === state.activeColorId);
    this.activeEntry = active;
    this.activeColorText = active === undefined ? "No color" : hexColor(active.color);
    const activeEditing =
      active === undefined ? undefined : resolveWheelEditingColor(state, active);
    this.surfaceValue = activeEditing === undefined ? 1 : convertColor(activeEditing, "hsv").v;
    this.surfaceLightness =
      activeEditing === undefined ? 70 : convertColor(activeEditing, "oklch").l * 100;

    const ordered = state.colorFocusOrder
      .map((id) => state.palette.colors.find((entry) => entry.id === id))
      .filter((entry): entry is PaletteColor<Metadata> => entry !== undefined);
    this.points = ordered.map((entry) => {
      const point = colorToWheelPoint(resolveWheelEditingColor(state, entry), {
        model: state.wheel.wheelModel,
        maxChroma: OKLCH_WHEEL_MAX_CHROMA
      });
      const index = state.palette.colors.indexOf(entry);
      const label = colorName(entry, Math.max(0, index));
      return {
        entry,
        x: point.x * 100,
        y: point.y * 100,
        color: cssColor(entry.color),
        editable: canEditColor(state, entry),
        active: entry.id === state.activeColorId,
        anchor: entry.id === state.anchorColorId,
        tabIndex: canEditColor(state, entry) ? 0 : -1,
        ariaLabel: `${label} wheel handle${entry.id === state.anchorColorId ? ", anchor" : ""}${entry.locked ? ", locked" : ""}`
      };
    });
    this.lines =
      this.points.length < 2
        ? []
        : this.points.map((point, index) => {
            const next = this.points[(index + 1) % this.points.length];
            return {
              key: `${point.entry.id}-${next.entry.id}`,
              x1: point.x,
              y1: point.y,
              x2: next.x,
              y2: next.y
            };
          });
    this.ring = this.createRingView(state, active);
    this.channels = active === undefined ? [] : this.createChannels(state, active);

    if (this.wheelTemplateContext === undefined) {
      this.wheelTemplateContext = {
        $implicit: state,
        state,
        palette: state.palette,
        controller: this.requireController()
      };
      this.paletteTemplateContext = {
        $implicit: state.palette,
        state,
        palette: state.palette,
        controller: this.requireController()
      };
    } else {
      Object.assign(this.wheelTemplateContext, {
        $implicit: state,
        state,
        palette: state.palette,
        controller: this.requireController()
      });
      Object.assign(this.paletteTemplateContext as object, {
        $implicit: state.palette,
        state,
        palette: state.palette,
        controller: this.requireController()
      });
    }
    this.currentState.set(state);
    this.changeDetector.markForCheck();
  }

  private createRingView(
    state: PickerState<Metadata>,
    active: PaletteColor<Metadata> | undefined
  ): RingView<Metadata> | undefined {
    const anchor = state.palette.colors.find((entry) => entry.id === state.anchorColorId);
    const entry =
      state.wheel.interaction === "linked" ? anchor : (active ?? state.palette.colors[0]);
    if (entry === undefined) return undefined;
    const editing = resolveWheelEditingColor(state, entry);
    const value = getWheelChannelValue(editing, { model: state.wheel.wheelModel });
    const point = wheelChannelValueToRingPoint(value, { side: this.ringSide });
    const index = Math.max(
      0,
      state.palette.colors.findIndex((candidate) => candidate.id === entry.id)
    );
    const channel = state.wheel.wheelModel === "oklch" ? "lightness" : "value";
    return {
      entry,
      channel,
      editable: canEditColor(state, entry),
      label: `${colorName(entry, index)} ${channel} ring`,
      value: Math.round(value * 1000) / 10,
      valueText: `${Math.round(value * 100)} percent`,
      start: cssColor(setWheelChannelValue(editing, 0, { model: state.wheel.wheelModel }), "never"),
      middle: cssColor(
        setWheelChannelValue(editing, 0.5, { model: state.wheel.wheelModel }),
        "never"
      ),
      end: cssColor(setWheelChannelValue(editing, 1, { model: state.wheel.wheelModel }), "never"),
      x: point.x * 100,
      y: point.y * 100,
      angle: Math.atan2(point.y - 0.5, point.x - 0.5),
      color: cssColor(editing, "never")
    };
  }

  private createChannels(
    state: PickerState<Metadata>,
    active: PaletteColor<Metadata>
  ): readonly ChannelView[] {
    const editing = resolveWheelEditingColor(state, active);
    if (state.wheel.wheelModel === "oklch") {
      const color = convertColor(editing, "oklch");
      return [
        this.channelView("hue", color.h, 0, 359, 1, "°"),
        this.channelView("chroma", color.c, 0, OKLCH_WHEEL_MAX_CHROMA, 0.001, ""),
        this.channelView("lightness", color.l * 100, 0, 100, 1, "%")
      ];
    }
    const color = convertColor(editing, "hsv");
    return [
      this.channelView("hue", color.h, 0, 359, 1, "°"),
      this.channelView("saturation", color.s * 100, 0, 100, 1, "%"),
      this.channelView("value", color.v * 100, 0, 100, 1, "%")
    ];
  }

  private channelView(
    name: ChannelName,
    raw: number,
    minimum: number,
    maximum: number,
    step: number,
    unit: string
  ): ChannelView {
    const value = step < 1 ? Math.round(raw * 1000) / 1000 : Math.round(raw);
    return {
      name,
      label: `${name[0]?.toUpperCase()}${name.slice(1)}`,
      minimum,
      maximum,
      step,
      value,
      display: `${value}${unit}`
    };
  }

  private channelColor(
    entry: PaletteColor<Metadata>,
    channel: ChannelName,
    rawValue: string
  ): ColorValue | undefined {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return undefined;
    const state = this.requireController().getState();
    const editing = resolveWheelEditingColor(state, entry);
    if (state.wheel.wheelModel === "oklch") {
      const color: OklchColor = convertColor(editing, "oklch");
      if (channel === "hue") return { ...color, h: ((parsed % 360) + 360) % 360 };
      if (channel === "chroma") {
        return { ...color, c: clamp(parsed, 0, OKLCH_WHEEL_MAX_CHROMA) };
      }
      if (channel === "lightness") return { ...color, l: clamp(parsed / 100) };
      return undefined;
    }
    const color: HsvColor = convertColor(editing, "hsv");
    if (channel === "hue") return { ...color, h: ((parsed % 360) + 360) % 360 };
    if (channel === "saturation") return { ...color, s: clamp(parsed / 100) };
    if (channel === "value") return { ...color, v: clamp(parsed / 100) };
    return undefined;
  }

  private dragAction(
    session: DragSession<Metadata>,
    clientX: number,
    clientY: number
  ): PickerAction<Metadata> | undefined {
    const state = this.requireController().getState();
    const entry = state.palette.colors.find((candidate) => candidate.id === session.colorId);
    if (entry === undefined || !canEditColor(state, entry)) return undefined;
    if (session.region === "channel-ring") this.updateRingSide(clientX, session.rect);
    const point = clientPointToWheelPoint({ x: clientX, y: clientY }, session.rect);
    const editing = resolveWheelEditingColor(state, entry);
    const color =
      session.region === "channel-ring"
        ? setWheelChannelValue(editing, ringPointToWheelChannelValue(point), {
            model: state.wheel.wheelModel
          })
        : wheelPointToColor(point, editing, {
            model: state.wheel.wheelModel,
            maxChroma: OKLCH_WHEEL_MAX_CHROMA
          });
    return { type: "set-color", colorId: entry.id, color };
  }

  private listenForDrag(document: Document): void {
    this.removeDragListeners();
    this.dragListeners = [
      this.renderer.listen(document, "pointermove", (event: PointerEvent) => {
        const session = this.drag;
        if (session === undefined || session.pointerId !== event.pointerId) return;
        const action = this.dragAction(session, event.clientX, event.clientY);
        if (action !== undefined) session.interaction.update(action);
      }),
      this.renderer.listen(document, "pointerup", (event: PointerEvent) => {
        const session = this.drag;
        if (session === undefined || session.pointerId !== event.pointerId) return;
        this.finishDrag(false, this.dragAction(session, event.clientX, event.clientY));
      }),
      this.renderer.listen(document, "pointercancel", (event: PointerEvent) => {
        if (this.drag?.pointerId === event.pointerId) this.finishDrag(true);
      })
    ];
  }

  private finishDrag(
    cancelled: boolean,
    finalAction?: PickerAction<Metadata>,
    suppressErrors = false
  ): void {
    const session = this.drag;
    this.drag = undefined;
    this.removeDragListeners();
    if (session === undefined) return;
    try {
      if (session.captureTarget.hasPointerCapture?.(session.pointerId)) {
        session.captureTarget.releasePointerCapture(session.pointerId);
      }
    } catch {
      // The browser may have released capture before Angular sees the event.
    }
    try {
      if (cancelled) session.interaction.cancel();
      else {
        if (finalAction !== undefined) session.interaction.update(finalAction);
        session.interaction.commit();
      }
    } catch (error) {
      if (!suppressErrors) throw error;
    }
  }

  private removeDragListeners(): void {
    const listeners = this.dragListeners;
    this.dragListeners = [];
    for (const remove of listeners) remove();
  }

  private updateRingSide(clientX: number, rect: WheelRect): void {
    const center = rect.left + rect.width / 2;
    const hysteresis = Math.min(rect.width, rect.height) * 0.04;
    const side =
      clientX < center - hysteresis
        ? "left"
        : clientX > center + hysteresis
          ? "right"
          : this.ringSide;
    if (side === this.ringSide) return;
    this.ringSide = side;
    this.refreshState(this.requireController().getState());
  }

  private closestPart(target: EventTarget | null, part: string): HTMLElement | undefined {
    if (!isElement(target)) return undefined;
    const closest = target.closest<HTMLElement>(`[data-part="${part}"]`);
    return closest ?? undefined;
  }

  private inputValue(event: Event): string {
    const target = event.target;
    return isElement(target) && "value" in target && typeof target.value === "string"
      ? target.value
      : "";
  }

  private finishNameInteractions(suppressErrors = false): void {
    const interactions = [...this.nameInteractions.values()];
    this.nameInteractions.clear();
    for (const interaction of interactions) {
      try {
        interaction.commit();
      } catch (error) {
        if (!suppressErrors) throw error;
      }
    }
  }

  private sourceMode(): SourceMode {
    if (this.controller !== undefined) return "controller";
    if (this.value !== undefined) return "value";
    if (this.palette !== undefined) return "palette";
    return "uncontrolled";
  }

  private assertValidInputs(): void {
    const sources = [
      this.controller,
      this.value,
      this.palette,
      this.defaultValue,
      this.defaultPalette
    ].filter((source) => source !== undefined);
    if (sources.length > 1) {
      throw new TypeError("ColorwheelComponent accepts exactly one source");
    }
    if (this.controller !== undefined && this.controllerOptions !== undefined) {
      throw new TypeError("controllerOptions cannot be used with controller");
    }
    if (
      this.wheel !== undefined &&
      (this.controller !== undefined || this.value !== undefined || this.defaultValue !== undefined)
    ) {
      throw new TypeError("wheel cannot be used with controller or full state");
    }
  }

  private requireController(): PickerController<Metadata> {
    const controller = this.liveController;
    if (controller === undefined) throw new Error("ColorwheelComponent is not active");
    return controller;
  }

  private scheduleControlledReconciliation(mode: "value" | "palette"): void {
    if (this.reconciliationQueued) return;
    this.reconciliationQueued = true;
    const generation = this.generation;
    queueMicrotask(() => {
      this.reconciliationQueued = false;
      if (this.destroyed || generation !== this.generation || mode !== this.mountedMode) return;
      const controller = this.liveController;
      if (controller === undefined) return;
      if (mode === "value") {
        const expected = this.value;
        if (expected !== undefined && controller.getState() !== expected)
          controller.setState(expected);
      } else {
        const expected = this.palette;
        if (expected !== undefined && controller.getPalette() !== expected) {
          controller.setPalette(expected);
        }
      }
    });
  }

  private createInstanceFacade(root: HTMLElement): ColorwheelAngularInstance<Metadata> {
    const getController = () => this.requireController();
    return {
      root,
      get controller() {
        return getController();
      },
      setState: (state) => getController().setState(state),
      setPalette: (palette) => getController().setPalette(palette),
      update: (options) => {
        if (options.state !== undefined && options.palette !== undefined) {
          throw new TypeError("state and palette are alternatives");
        }
        if (options.className !== undefined) this.className = options.className;
        if (options.ariaLabel !== undefined) this.ariaLabel = options.ariaLabel;
        if (options.unstyled !== undefined) this.unstyled = options.unstyled;
        if (options.blockProps !== undefined) this.blockProps = options.blockProps;
        if (options.renderPalette !== undefined) this.renderPalette = options.renderPalette;
        if (options.state !== undefined) getController().setState(options.state);
        else if (options.palette !== undefined) getController().setPalette(options.palette);
        this.changeDetector.markForCheck();
      },
      focus: (target) => this.focus(target)
    };
  }
}
