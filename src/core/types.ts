export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type ColorSpace = "srgb" | "display-p3" | "hsl" | "hsv" | "oklch";

export type OutputGamut = "srgb" | "display-p3";

export interface SrgbColor {
  readonly space: "srgb";
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha?: number;
}

export interface DisplayP3Color {
  readonly space: "display-p3";
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha?: number;
}

export interface HslColor {
  readonly space: "hsl";
  readonly h: number;
  readonly s: number;
  readonly l: number;
  readonly alpha?: number;
}

export interface HsvColor {
  readonly space: "hsv";
  readonly h: number;
  readonly s: number;
  readonly v: number;
  readonly alpha?: number;
}

export interface OklchColor {
  readonly space: "oklch";
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly alpha?: number;
}

export type ColorValue = SrgbColor | DisplayP3Color | HslColor | HsvColor | OklchColor;

export type ColorInput = string | ColorValue;

/** Linear-light sRGB channels. Values can be outside 0..1 during conversion. */
export interface LinearSrgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha?: number;
}

/** CIE XYZ using the D65 white point, normalized so reference white Y is 1. */
export interface XyzD65Color {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly alpha?: number;
}

export interface OklabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
  readonly alpha?: number;
}

export interface StrategyReference<Options extends object = JsonObject> {
  readonly id: string;
  readonly version: string;
  readonly options?: Options;
}

export type BuiltInHarmonyRule =
  | { readonly type: "single" }
  | { readonly type: "complementary"; readonly angle?: number }
  | {
      readonly type: "analogous";
      readonly count?: number;
      /** Angular distance in degrees between adjacent colors. */
      readonly spread?: number;
    }
  | { readonly type: "triadic"; readonly angle?: number }
  | { readonly type: "tetradic"; readonly angle?: number }
  | { readonly type: "split-complementary"; readonly spread?: number }
  | { readonly type: "monochromatic"; readonly count?: number };

export interface CustomHarmonyRule<Options extends object = JsonObject> {
  /** Discriminates application-defined rules from every built-in rule. */
  readonly type: "custom";
  /** Namespaced strategy identity, for example `com.example.harmony.brand`. */
  readonly id: string;
  readonly version: string;
  readonly options: Options;
}

export type HarmonyRule = BuiltInHarmonyRule | CustomHarmonyRule<object>;

export type BuiltInPaletteKind =
  "harmony" | "tonal" | "qualitative" | "sequential" | "diverging" | "semantic" | "custom";

/** Built-ins plus namespaced application-defined kinds, without closing the union. */
export type PaletteKind = BuiltInPaletteKind | (string & { readonly __paletteKind?: never });

export interface PaletteColor<Metadata extends object = JsonObject> {
  readonly id: string;
  readonly color: ColorValue;
  readonly name?: string;
  readonly role?: string;
  readonly locked?: boolean;
  readonly metadata?: Metadata;
}

export interface PaletteRecipe {
  readonly type: "wheel" | "generated";
  readonly seed?: ColorValue;
  /**
   * Palette entry that semantically owns `seed`.
   *
   * This is an ID rather than an array index so the relationship survives
   * palette reordering and document round-trips. Older v1 documents may omit
   * it; newly generated live wheel recipes always include it.
   */
  readonly seedColorId?: string;
  /**
   * Strategy-output slot order, expressed as stable palette color IDs.
   * Unlike editor focus order, this is semantic recipe data and survives
   * swatch reordering and document round-trips.
   */
  readonly colorSlotIds?: readonly string[];
  readonly harmony?: HarmonyRule;
  readonly strategy?: StrategyReference<object>;
}

export interface PaletteProvenance {
  readonly origin: "wheel" | "generated" | "manual" | "imported";
  readonly strategy?: StrategyReference<object>;
  readonly seeds?: readonly ColorValue[];
}

export interface Palette<Metadata extends object = JsonObject> {
  readonly colors: readonly PaletteColor<Metadata>[];
  readonly kind: PaletteKind;
  readonly recipe?: PaletteRecipe;
  readonly provenance: PaletteProvenance;
  readonly name?: string;
  readonly metadata?: Metadata;
}

export interface PaletteDocument<Metadata extends object = JsonObject> {
  readonly schema: "color-palette";
  readonly schemaVersion: 1;
  readonly palette: Palette<Metadata>;
}

export interface PaletteDiagnostic<Data extends JsonValue = JsonValue> {
  readonly ruleId: string;
  readonly severity: "info" | "warning" | "error";
  readonly messageKey: string;
  readonly messageParameters?: JsonObject;
  readonly colorIds?: readonly string[];
  readonly path?: readonly (string | number)[];
  readonly data?: Data;
}

export interface PaletteAnalysis {
  readonly diagnostics: readonly PaletteDiagnostic[];
}

export interface GamutResult<
  GamutColor extends SrgbColor | DisplayP3Color = SrgbColor | DisplayP3Color
> {
  readonly color: GamutColor;
  readonly gamut: OutputGamut;
  readonly mapped: boolean;
  /** Euclidean distance in OKLab between the requested and mapped color. */
  readonly deltaE: number;
  /** Built-in method names plus namespaced application-defined mapping methods. */
  readonly method:
    | "none"
    | "oklch-chroma-reduction"
    | "channel-clipping"
    | (string & { readonly __gamutMappingMethod?: never });
}

export interface ExportFile {
  readonly name: string;
  readonly mediaType: string;
  readonly content: string | Uint8Array;
}

export interface ExportArtifact {
  readonly files: readonly ExportFile[];
}

export interface StrategyIdentity {
  readonly id: string;
  readonly version: string;
}

export interface StrategyContext {
  convert<Space extends ColorSpace>(color: ColorInput, space: Space): ColorBySpace<Space>;
  mapToGamut<Gamut extends OutputGamut>(
    color: ColorInput,
    gamut: Gamut
  ): GamutResult<ColorByGamut<Gamut>>;
}

export interface HarmonyStrategy<Options extends object = JsonObject> extends StrategyIdentity {
  create(seed: ColorValue, options: Options, context: StrategyContext): Palette<object>;
}

export interface PaletteGenerator<Options extends object = JsonObject> extends StrategyIdentity {
  generate(options: Options, context: StrategyContext): Palette<object>;
}

export interface PaletteAnalyzer<Options extends object = JsonObject> extends StrategyIdentity {
  analyze(palette: Palette<object>, options: Options, context: StrategyContext): PaletteAnalysis;
}

export interface PaletteValidator<Options extends object = JsonObject> extends StrategyIdentity {
  validate(
    palette: Palette<object>,
    options: Options,
    context: StrategyContext
  ): readonly PaletteDiagnostic[];
}

export interface GamutMappingStrategy<
  Options extends object = JsonObject
> extends StrategyIdentity {
  map(
    color: ColorValue,
    gamut: OutputGamut,
    options: Options,
    context: StrategyContext
  ): GamutResult;
}

export interface PaletteExporter<Options extends object = JsonObject> extends StrategyIdentity {
  export(palette: Palette<object>, options: Options): ExportArtifact;
}

export interface PaletteImporter<Options extends object = JsonObject> extends StrategyIdentity {
  import(content: string | Uint8Array, options: Options): PaletteDocument;
}

export type ColorBySpace<Space extends ColorSpace> = Space extends "srgb"
  ? SrgbColor
  : Space extends "display-p3"
    ? DisplayP3Color
    : Space extends "hsl"
      ? HslColor
      : Space extends "hsv"
        ? HsvColor
        : OklchColor;

export type ColorByGamut<Gamut extends OutputGamut> = Gamut extends "srgb"
  ? SrgbColor
  : DisplayP3Color;
