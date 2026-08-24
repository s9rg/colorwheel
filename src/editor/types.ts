import type { ColorValue, JsonObject, OutputGamut, Palette, PaletteColor } from "../core";

export type WheelModel = "hsv" | "oklch";
export type InteractionPolicy = "linked" | "free";

export interface WheelEditorOptions {
  readonly wheelModel: WheelModel;
  readonly interaction: InteractionPolicy;
  readonly outputGamut: OutputGamut;
}

/**
 * Serializable palette data plus editor-session state. Focus/hover/open UI state
 * belongs to adapters and is deliberately not stored here.
 */
export interface PickerState<Metadata extends object = JsonObject> {
  readonly palette: Palette<Metadata>;
  readonly activeColorId?: string;
  readonly anchorColorId?: string;
  /** Stable insertion order for wheel handles; palette reordering does not alter it. */
  readonly colorFocusOrder: readonly string[];
  readonly wheel: WheelEditorOptions;
}

export interface CreatePickerStateOptions<Metadata extends object = JsonObject> {
  readonly palette: Palette<Metadata>;
  readonly activeColorId?: string;
  readonly anchorColorId?: string;
  readonly colorFocusOrder?: readonly string[];
  readonly wheel?: Partial<WheelEditorOptions>;
}

export type BuiltInChangeAction =
  | "pointer"
  | "keyboard"
  | "text-input"
  | "harmony"
  | "reorder"
  | "remove"
  | "add"
  | "lock"
  | "selection"
  | "regenerate"
  | "programmatic";

export type ChangeOrigin = "user" | "external" | "extension";
export type ChangePhase = "start" | "update" | "commit";

export interface ChangeMeta {
  readonly action: BuiltInChangeAction | (string & {});
  readonly origin: ChangeOrigin;
  readonly phase: ChangePhase;
  readonly changedColorIds: readonly string[];
  readonly transactionId?: string;
}

export type ChangeOptions = Partial<Omit<ChangeMeta, "changedColorIds">>;

interface ActionBase {
  readonly change?: ChangeOptions;
}

export type PickerAction<Metadata extends object = JsonObject> =
  | ({
      readonly type: "replace-state";
      readonly state: PickerState<Metadata>;
    } & ActionBase)
  | ({
      readonly type: "replace-palette";
      readonly palette: Palette<Metadata>;
    } & ActionBase)
  | ({
      readonly type: "set-color";
      readonly colorId: string;
      readonly color: ColorValue;
      /** Required by the pure reducer while the editor is in linked mode. */
      readonly linkedPalette?: Palette<Metadata>;
    } & ActionBase)
  | ({
      readonly type: "add-color";
      readonly entry: PaletteColor<Metadata>;
      readonly index?: number;
    } & ActionBase)
  | ({ readonly type: "remove-color"; readonly colorId: string } & ActionBase)
  | ({
      readonly type: "reorder-color";
      readonly colorId: string;
      readonly toIndex: number;
    } & ActionBase)
  | ({
      readonly type: "set-color-locked";
      readonly colorId: string;
      readonly locked: boolean;
    } & ActionBase)
  | ({
      readonly type: "set-color-name";
      readonly colorId: string;
      readonly name?: string;
    } & ActionBase)
  | ({
      readonly type: "set-color-role";
      readonly colorId: string;
      readonly role?: string;
    } & ActionBase)
  | ({ readonly type: "set-active-color"; readonly colorId?: string } & ActionBase)
  | ({ readonly type: "set-anchor-color"; readonly colorId?: string } & ActionBase)
  | ({
      readonly type: "set-wheel-options";
      readonly options: Partial<WheelEditorOptions>;
    } & ActionBase)
  | ({
      readonly type: "regenerate";
      readonly palette: Palette<Metadata>;
    } & ActionBase);

export interface PickerReduction<Metadata extends object = JsonObject> {
  readonly state: PickerState<Metadata>;
  readonly changedColorIds: readonly string[];
}

export type PickerSelector<Result, Metadata extends object = JsonObject> = (
  state: PickerState<Metadata>
) => Result;

export type PickerSubscription<Result> = (next: Result, meta: ChangeMeta) => void;
export type PickerEquality<Result> = (previous: Result, next: Result) => boolean;

export interface LinkedColorUpdateRequest<Metadata extends object = JsonObject> {
  readonly state: PickerState<Metadata>;
  readonly colorId: string;
  readonly color: ColorValue;
}

export type LinkedColorUpdate<Metadata extends object = JsonObject> = (
  request: LinkedColorUpdateRequest<Metadata>
) => Palette<Metadata>;

export interface RegenerateRequest<Metadata extends object = JsonObject> {
  readonly state: PickerState<Metadata>;
  readonly lockedColors: readonly PaletteColor<Metadata>[];
}

export type PaletteRegenerator<Metadata extends object = JsonObject> = (
  request: RegenerateRequest<Metadata>
) => Palette<Metadata>;

export type PickerFocusTarget =
  | { readonly type: "root" }
  | { readonly type: "wheel" }
  | { readonly type: "palette" }
  | { readonly type: "pointer"; readonly colorId: string }
  | { readonly type: "swatch"; readonly colorId: string }
  | {
      readonly type: "channel";
      readonly colorId: string;
      readonly channel: "hue" | "saturation" | "value" | "lightness" | "chroma" | "alpha";
    };

export interface NewPaletteColor<Metadata extends object = JsonObject> extends Omit<
  PaletteColor<Metadata>,
  "id"
> {
  readonly id?: string;
}

export interface PickerCommands<Metadata extends object = JsonObject> {
  replacePalette(palette: Palette<Metadata>, change?: ChangeOptions): void;
  setColor(colorId: string, color: ColorValue, change?: ChangeOptions): void;
  addColor(entry: NewPaletteColor<Metadata>, index?: number, change?: ChangeOptions): string;
  removeColor(colorId: string, change?: ChangeOptions): void;
  reorderColor(colorId: string, toIndex: number, change?: ChangeOptions): void;
  setLocked(colorId: string, locked: boolean, change?: ChangeOptions): void;
  setName(colorId: string, name: string | undefined, change?: ChangeOptions): void;
  setRole(colorId: string, role: string | undefined, change?: ChangeOptions): void;
  setActive(colorId: string | undefined, change?: ChangeOptions): void;
  setAnchor(colorId: string | undefined, change?: ChangeOptions): void;
  setWheelOptions(options: Partial<WheelEditorOptions>, change?: ChangeOptions): void;
  regenerate(change?: ChangeOptions): void;
}

export interface PickerInteraction<Metadata extends object = JsonObject> {
  readonly transactionId: string;
  start(action?: PickerAction<Metadata>): void;
  update(action: PickerAction<Metadata>): void;
  commit(action?: PickerAction<Metadata>): void;
  cancel(): void;
}

export interface PickerControllerOptions<Metadata extends object = JsonObject> {
  readonly onChange?: (state: PickerState<Metadata>, meta: ChangeMeta) => void;
  readonly onPaletteChange?: (palette: Palette<Metadata>, meta: ChangeMeta) => void;
  readonly resolveLinkedColorUpdate?: LinkedColorUpdate<Metadata>;
  readonly regenerate?: PaletteRegenerator<Metadata>;
  readonly createColorId?: (state: PickerState<Metadata>) => string;
  readonly createTransactionId?: () => string;
  readonly onFocusRequest?: (target: PickerFocusTarget) => void;
}

export interface PickerController<Metadata extends object = JsonObject> {
  readonly commands: PickerCommands<Metadata>;
  getState(): PickerState<Metadata>;
  setState(next: PickerState<Metadata>, meta?: Partial<ChangeMeta>): void;
  getPalette(): Palette<Metadata>;
  setPalette(next: Palette<Metadata>, meta?: Partial<ChangeMeta>): void;
  dispatch(action: PickerAction<Metadata>): void;
  select<Result>(selector: PickerSelector<Result, Metadata>): Result;
  subscribe<Result>(
    selector: PickerSelector<Result, Metadata>,
    listener: PickerSubscription<Result>,
    equality?: PickerEquality<Result>
  ): () => void;
  transaction<Result>(run: () => Result, change?: ChangeOptions): Result;
  beginInteraction(change?: ChangeOptions): PickerInteraction<Metadata>;
  focus(target?: PickerFocusTarget): void;
  destroy(): void;
}
