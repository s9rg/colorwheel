import type { JsonObject, Palette } from "../core";
import type {
  ChangeMeta,
  PickerController,
  PickerControllerOptions,
  PickerFocusTarget,
  PickerState,
  WheelEditorOptions
} from "../editor";

export interface PaletteRenderContext<Metadata extends object = JsonObject> {
  readonly container: HTMLElement;
  readonly controller: PickerController<Metadata>;
  /** The current controller state; this getter stays live for the renderer's mounted lifetime. */
  readonly state: PickerState<Metadata>;
  /** Build the adapter's standard palette block without mounting it. */
  readonly renderDefault: () => HTMLElement;
}

export interface PaletteRenderHandle {
  readonly node?: Node;
  /** Called after state or presentation changes; read current values from the original live context. */
  readonly update?: () => void;
  readonly destroy?: () => void;
}

export type PaletteRenderResult = Node | PaletteRenderHandle | null | undefined | void;

/**
 * A palette renderer can return a node, append directly to `container`, and/or
 * return a cleanup callback for listeners it owns.
 */
export type RenderPalette<Metadata extends object = JsonObject> = (
  context: PaletteRenderContext<Metadata>
) => PaletteRenderResult;

export interface ColorwheelCallbacks<Metadata extends object = JsonObject> {
  readonly onChange?: (state: PickerState<Metadata>, meta: ChangeMeta) => void;
  readonly onPaletteChange?: (palette: Palette<Metadata>, meta: ChangeMeta) => void;
}

/** Presentation options for the vanilla adapter's built-in wheel block. */
export interface ColorwheelWheelBlockProps {
  readonly title?: string;
  readonly description?: string;
  readonly showInstructions?: boolean;
  readonly showChannels?: boolean;
  /** Show the model's third channel around the polar wheel: HSV value or OKLCH lightness. */
  readonly showChannelRing?: boolean;
}

/** Presentation options for the vanilla adapter's built-in palette block. */
export interface ColorwheelPaletteBlockProps {
  readonly title?: string;
  readonly description?: string;
  readonly showName?: boolean;
  readonly showActions?: boolean;
  readonly allowAdd?: boolean;
}

/** Configures the vanilla adapter's built-in blocks without replacing their behavior. */
export interface ColorwheelBlockProps {
  readonly wheel?: ColorwheelWheelBlockProps;
  readonly palette?: ColorwheelPaletteBlockProps;
}

export interface ColorwheelPresentationOptions<
  Metadata extends object = JsonObject
> extends ColorwheelCallbacks<Metadata> {
  readonly className?: string;
  readonly ariaLabel?: string;
  readonly unstyled?: boolean;
  readonly blockProps?: ColorwheelBlockProps;
  /** Set to `false` to omit the palette block completely. */
  readonly renderPalette?: RenderPalette<Metadata> | false;
}

interface InjectedControllerMountOptions<Metadata extends object> {
  /** Use an existing controller. It remains owned by the caller after destroy. */
  readonly controller: PickerController<Metadata>;
  readonly state?: never;
  readonly palette?: never;
  readonly wheel?: never;
  readonly controllerOptions?: never;
}

interface StateMountOptions<Metadata extends object> {
  readonly controller?: never;
  /** Initial state for an adapter-owned controller. */
  readonly state: PickerState<Metadata>;
  readonly palette?: never;
  readonly wheel?: never;
  readonly controllerOptions?: Omit<
    PickerControllerOptions<Metadata>,
    "onChange" | "onPaletteChange"
  >;
}

interface PaletteMountOptions<Metadata extends object> {
  readonly controller?: never;
  readonly state?: never;
  /** Initial palette for an adapter-owned controller. */
  readonly palette: Palette<Metadata>;
  readonly wheel?: Partial<WheelEditorOptions>;
  readonly controllerOptions?: Omit<
    PickerControllerOptions<Metadata>,
    "onChange" | "onPaletteChange"
  >;
}

interface DefaultMountOptions<Metadata extends object> {
  readonly controller?: never;
  readonly state?: never;
  readonly palette?: never;
  readonly wheel?: Partial<WheelEditorOptions>;
  readonly controllerOptions?: Omit<
    PickerControllerOptions<Metadata>,
    "onChange" | "onPaletteChange"
  >;
}

export type ColorwheelMountOptions<Metadata extends object = JsonObject> =
  ColorwheelPresentationOptions<Metadata> &
    (
      | InjectedControllerMountOptions<Metadata>
      | StateMountOptions<Metadata>
      | PaletteMountOptions<Metadata>
      | DefaultMountOptions<Metadata>
    );

interface StateUpdateOptions<Metadata extends object> {
  /** External state updates render without echoing through change callbacks. */
  readonly state: PickerState<Metadata>;
  readonly palette?: never;
}

interface PaletteUpdateOptions<Metadata extends object> {
  readonly state?: never;
  /** External palette updates render without echoing through change callbacks. */
  readonly palette: Palette<Metadata>;
}

interface PresentationUpdateOptions {
  readonly state?: never;
  readonly palette?: never;
}

export type ColorwheelUpdateOptions<Metadata extends object = JsonObject> =
  ColorwheelPresentationOptions<Metadata> &
    (StateUpdateOptions<Metadata> | PaletteUpdateOptions<Metadata> | PresentationUpdateOptions);

export interface ColorwheelInstance<Metadata extends object = JsonObject> {
  readonly root: HTMLElement;
  readonly controller: PickerController<Metadata>;
  setState(state: PickerState<Metadata>): void;
  setPalette(palette: Palette<Metadata>): void;
  update(options: ColorwheelUpdateOptions<Metadata>): void;
  focus(target?: PickerFocusTarget): void;
  destroy(): void;
}
