# RFC 0001: Product model and framework-neutral public API

Status: Implementation complete; release verification pending

This RFC records the product model and the implemented v1 architecture. The
umbrella project is named Colorwheel; framework adapters remain explicit package
subpath exports so the product is not named after its first UI framework. The
generated TypeScript declarations and [public API reference](./API.md) are
normative where an illustrative type in this architectural record omits detail.

## Product definition

The project is a research-informed toolkit for selecting and constructing color
palettes. It has two primary editors that can be used independently or together:

1. A color wheel for choosing a color and manipulating hue-based harmonies.
2. A palette editor for building, organizing, evaluating, and exporting a set of
   colors.

The intended experience is comparable to Canva's color wheel: choose a color,
choose a palette type, manipulate the result visually, and use or export the
result. The implementation and visual design are original.

The project is MIT licensed and implemented as an original clean-room codebase.
No legacy implementation, documentation, public API, or branding is retained.

## Research position

The project describes itself as **research-informed**, not as a machine that can
prove a palette is beautiful.

Traditional complementary, analogous, triadic, and tetradic rules describe
angular relationships between hues. They are useful design conventions, not
validated predictors of preference or harmony. Psychophysical studies of simple
two-color stimuli show effects involving hue, lightness, and chroma. Separate
experiments also support treating pair preference and perceived pair harmony as
different judgments. Neither result establishes a universal model for product
palettes.

The product model therefore separates four concerns:

- hue-geometry rules;
- perceptual palette construction;
- task-specific constraints such as text contrast or data ordering;
- diagnostics that explain tradeoffs without declaring taste objectively right
  or wrong.

## Architecture

The framework-independent core is the source of truth for color math, gamut
mapping, harmony rules, palette generation and analysis, versioned palette
documents, and strategy contracts. The headless editor owns picker state,
controller behavior, accessibility data, and wheel geometry. Neither layer
depends on a UI framework; the core also has no DOM dependency.

Adapters provide rendering and framework conventions:

- a browser adapter for vanilla JavaScript;
- a React adapter;
- a Vue adapter;
- an Angular adapter;
- a React Native adapter;

The adapters share the core and controller while owning their platform render
trees. Vanilla incrementally reconciles stable DOM nodes; React renders React;
Vue renders Vue VNodes; Angular renders Angular templates; React Native provides
native views, touch handling, accessibility actions, and SVG graphics. No
framework adapter mounts another adapter internally.

Customization is architectural, not an afterthought. The library exposes six
extension levels, with adapter-specific composition seams documented separately:

1. **Data:** provide any valid palette, colors, metadata, roles, locks, and
   ordering.
2. **Composition:** React exposes independent wheel, palette, controls,
   diagnostics, and export blocks; other adapters expose their documented native
   blocks, slots, templates, or render callbacks.
3. **Presentation:** replace the supported blocks and repeated primitives or
   style the defaults with documented tokens, classes, and part attributes.
4. **Behavior:** control state externally, dispatch actions through a headless
   controller, and supply the documented linked-update, regeneration, ID,
   transaction-ID, and focus callbacks.
5. **Algorithms:** supply harmony strategies, palette generators, validators,
   analyzers, gamut policies, exporters, and importers to an engine instance.
6. **Content:** replace exposed titles, descriptions, empty content, and
   diagnostic rendering; use block replacement for complete localization or
   custom number/color formatting. V1 has no global localization or formatter
   object.

The built-in composed picker is a convenience, not the only supported product
shape. An application may render only a wheel, only a custom palette block, or
its own interface on top of the controller.

The project is implemented in TypeScript so shared public contracts remain
explicit while package output is ordinary JavaScript. Consumers may use the
compiled packages from either JavaScript or TypeScript.

Customization has stable boundaries. Consumers may replace data, composition,
rendering, and strategies, but normalized channel ranges, unique color IDs,
non-mutating reducer transitions, event metadata, and accessibility requirements
are library invariants. This keeps separately authored blocks interoperable.

## Color model

External inputs may be CSS color strings or structured color values. Built-in
harmony and tonal generation use OKLCH and map every generated result
intentionally into a declared output gamut. Other operations use the color space
appropriate to their contract, such as sRGB for WCAG 2.x contrast calculation.

The familiar wheel interaction is still available: hue is angular, saturation or
chroma is radial, and lightness/value is adjusted separately. A wheel model is
explicit rather than silently mixing HSV/HSL geometry with OKLCH calculations.

```ts
type ColorSpace = "srgb" | "display-p3" | "hsl" | "hsv" | "oklch";

type ColorValue =
  | { space: "srgb"; r: number; g: number; b: number; alpha?: number }
  | { space: "display-p3"; r: number; g: number; b: number; alpha?: number }
  | { space: "hsl"; h: number; s: number; l: number; alpha?: number }
  | { space: "hsv"; h: number; s: number; v: number; alpha?: number }
  | { space: "oklch"; l: number; c: number; h: number; alpha?: number };

type ColorInput = string | ColorValue;
type OutputGamut = "srgb" | "display-p3";
```

Channel ranges and hue normalization are documented in the normative API
reference. Core functions never infer a color space from an untagged tuple.

State is JSON-serializable. Runtime functions and framework components are
provided separately and never embedded in a palette or wheel value.

```ts
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
interface JsonObject {
  readonly [key: string]: JsonValue;
}

interface StrategyReference<Options extends JsonObject = JsonObject> {
  id: string;
  version: string;
  options?: Options;
}
```

## Harmony rules

A harmony rule is a serializable object, not a closed string enum. Built-in
rules use concise discriminated objects; application-defined rules carry an ID,
version, and options, and their recipe records the matching strategy reference.
This leaves room for user-adjustable angles and application-defined rules
without closing the type to future strategies.

```ts
type BuiltInHarmonyRule =
  | { type: "single" }
  | { type: "complementary"; angle?: number }
  | { type: "analogous"; count?: number; spread?: number }
  | { type: "triadic"; angle?: number }
  | { type: "tetradic"; angle?: number }
  | { type: "split-complementary"; spread?: number }
  | { type: "monochromatic"; count?: number };

interface CustomHarmonyRule<Options extends object = JsonObject> {
  type: "custom";
  id: string;
  version: string;
  options: Options;
}

type HarmonyRule = BuiltInHarmonyRule | CustomHarmonyRule;
```

The `"custom"` discriminator is disjoint from every built-in convenience rule.
The `id` is the namespaced strategy identity used with the matching engine
registration; `version` and `options` make the stored rule explicit and
portable.

Built-in behavior is versioned, and resolved defaults are stored in recipe
strategy options. For example, complementary defaults to 180 degrees and
triadic defaults to 120-degree spacing. Monochromatic generation varies
lightness and chroma rather than duplicating a hue-angle rule.

## Palette model

A palette is the common value shared by the wheel and palette editors.

```ts
type BuiltInPaletteKind =
  "harmony" | "tonal" | "qualitative" | "sequential" | "diverging" | "semantic" | "custom";

type PaletteKind = BuiltInPaletteKind | (string & {});

interface PaletteColor<Metadata extends JsonObject = JsonObject> {
  id: string;
  color: ColorValue;
  name?: string;
  role?: string;
  locked?: boolean;
  metadata?: Metadata;
}

interface PaletteRecipe {
  type: "wheel" | "generated";
  seed?: ColorValue;
  seedColorId?: string;
  colorSlotIds?: readonly string[];
  harmony?: HarmonyRule;
  strategy?: StrategyReference;
}

interface PaletteProvenance {
  origin: "wheel" | "generated" | "manual" | "imported";
  strategy?: StrategyReference;
  seeds?: readonly ColorValue[];
}

interface Palette<Metadata extends JsonObject = JsonObject> {
  colors: readonly PaletteColor[];
  kind: PaletteKind | string;
  recipe?: PaletteRecipe;
  provenance: PaletteProvenance;
  name?: string;
  metadata?: Metadata;
}
```

Roles remain open strings so applications may use `background`, `surface`,
`text`, `primary`, `accent`, `success`, data-series names, or their own design
tokens without waiting for a library release.

Custom metadata is preserved across compatible state transitions. The core does
not interpret unknown metadata; applications are responsible for namespacing
metadata written by extensions. A palette supplied by the consumer is therefore
a first-class value, not merely an initialization hint.

`recipe` is the optional live rule used to regenerate a palette. `provenance` is
the historical description of how the current palette originated. Manual edits
that no longer satisfy a recipe detach that recipe while preserving provenance;
the API never stores the same live harmony rule in two authoritative locations.
When a recipe seed belongs to a palette entry, `seedColorId` records that stable
ownership explicitly rather than relying on array position. Older documents may
omit it; inference is allowed only when a single stored entry represents the
seed. `colorSlotIds` records the stable IDs assigned to ordered strategy-output
slots, so palette presentation order and editor focus order can change without
changing relationship ownership during regeneration. It is an ordered subset:
manual or locked palette entries retained outside generation are not required
to appear in it.

Portable persistence uses a versioned envelope rather than serializing arbitrary
in-memory objects directly:

```ts
interface PaletteDocument {
  schema: "color-palette";
  schemaVersion: 1;
  palette: Palette;
}
```

Documents contain finite JSON values only—no functions, `undefined`, `NaN`, or
infinities. Import validates unique IDs, channel ranges, metadata size, and
palette-size limits. Migrations are explicit, and unresolved strategy references
are preserved without automatically importing or evaluating code.

## Editor state

The portable palette document is separate from transient editor state. Layout,
focus, open popovers, and hover state never become part of a saved palette.

```ts
interface WheelEditorOptions {
  wheelModel: "hsv" | "oklch";
  interaction: "linked" | "free";
  outputGamut: OutputGamut;
}

interface PickerState {
  palette: Palette;
  activeColorId?: string;
  wheel: WheelEditorOptions;
}

type BuiltInAction =
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

interface ChangeMeta {
  action: BuiltInAction | string;
  origin: "user" | "external" | "extension";
  phase: "start" | "update" | "commit";
  changedColorIds: readonly string[];
  transactionId?: string;
}
```

In linked interaction, moving the anchor regenerates a supported live harmony
recipe. In free interaction, a color moves independently and the reducer detaches
the live recipe. Applications can supply linked-update and regeneration callbacks
for custom behavior; v1 does not synthesize a custom harmony rule implicitly.

High-frequency `update` events update visuals without forcing expensive analysis
or persistence on every pointer frame. A `commit` event marks a completed edit.
Controllers batch related mutations under one transaction and use structural
sharing so adapters can subscribe to narrow selectors.

Externally supplied prop or store updates synchronize the UI without being
echoed back as user change callbacks. Action identifiers from extensions are
namespaced. Empty palettes and duplicate color values are valid; color IDs remain
unique and stable until their entries are explicitly removed.

## Core operations

The release candidate exports the following direct operations; exact overloads
and option types are documented in [the API reference](./API.md).

```ts
parseColor(input: string): ColorValue
formatColor(color: ColorValue, options?: FormatOptions): string
convertColor(color: ColorInput, space: ColorSpace): ColorValue
mapToGamut(color: ColorInput, gamut: OutputGamut): GamutResult

createHarmonyPalette(options: HarmonyOptions): Palette
createTonalPalette(options: TonalOptions): Palette

analyzePalette(palette: Palette, options?: AnalysisOptions): PaletteAnalysis
exportPaletteJson(palette: Palette, options?: JsonExportOptions): ExportArtifact
exportPaletteCss(palette: Palette, options?: CssExportOptions): ExportArtifact
exportPaletteTokens(palette: Palette, options?: DesignTokenExportOptions): ExportArtifact
```

Harmony and tonal options include seed colors, resolved counts or angles,
output gamut, and the documented lightness/chroma controls. Direct generation
does not accept task constraints or locked colors. The editor passes its locked
entries to an application-supplied `regenerate` callback; the default built-in
wheel regeneration preserves manual entries outside the recipe's owned slots.
Qualitative, sequential, and diverging generators and color-vision simulation
are roadmap work, not v1 exports.

## Strategy and extension contracts

Built-in operations and user-defined algorithms implement the same small,
framework-neutral contracts. The interfaces below summarize the implemented
surface; package declarations remain authoritative for exact generic signatures.

```ts
interface StrategyIdentity {
  id: string;
  version: string;
}

interface StrategyContext {
  convert(color: ColorInput, space: ColorSpace): ColorValue;
  mapToGamut(color: ColorInput, gamut: OutputGamut): GamutResult;
}

interface HarmonyStrategy<Options extends JsonObject = JsonObject>
  extends StrategyIdentity {
  create(seed: ColorValue, options: Options, context: StrategyContext): Palette;
}

interface PaletteGenerator<Options extends JsonObject = JsonObject>
  extends StrategyIdentity {
  generate(options: Options, context: StrategyContext): Palette;
}

interface PaletteAnalyzer<Options extends JsonObject = JsonObject>
  extends StrategyIdentity {
  analyze(palette: Palette, options: Options, context: StrategyContext): PaletteAnalysis;
}

interface PaletteValidator<Options extends JsonObject = JsonObject>
  extends StrategyIdentity {
  validate(palette: Palette, options: Options, context: StrategyContext): readonly PaletteDiagnostic[];
}

interface GamutMappingStrategy<Options extends JsonObject = JsonObject>
  extends StrategyIdentity {
  map(color: ColorValue, gamut: OutputGamut, options: Options, context: StrategyContext): GamutResult;
}

interface ExportArtifact {
  files: readonly {
    name: string;
    mediaType: string;
    content: string | Uint8Array;
  }[];
}

interface PaletteExporter<Options extends JsonObject = JsonObject>
  extends StrategyIdentity {
  export(palette: Palette, options: Options): ExportArtifact;
}

interface PaletteImporter<Options extends JsonObject = JsonObject>
  extends StrategyIdentity {
  import(content: string | Uint8Array, options: Options): PaletteDocument;
}

interface EngineOptions {
  harmonies?: readonly HarmonyStrategy[];
  generators?: readonly PaletteGenerator[];
  validators?: readonly PaletteValidator[];
  analyzers?: readonly PaletteAnalyzer[];
  gamutPolicies?: readonly GamutMappingStrategy[];
  exporters?: readonly PaletteExporter[];
  importers?: readonly PaletteImporter[];
}

interface ColorEngine {
  createHarmony(reference: StrategyReference, seed: ColorInput): Palette;
  generate(reference: StrategyReference): Palette;
  analyze(palette: Palette, analyzers?: readonly StrategyReference[]): PaletteAnalysis;
  validate(palette: Palette, validators?: readonly StrategyReference[]): readonly PaletteDiagnostic[];
  map(color: ColorInput, gamut: OutputGamut, policy?: StrategyReference): GamutResult;
  export(palette: Palette, exporter: StrategyReference): ExportArtifact;
  import(content: string | Uint8Array, importer: StrategyReference): PaletteDocument;
  hasStrategy(category: StrategyCategory, reference: StrategyReference): boolean;
  listStrategies(category: StrategyCategory): readonly StrategyIdentity[];
}

createColorEngine(options?: EngineOptions): ColorEngine
```

Registries are instance-scoped rather than global. This prevents collisions
between applications and supports server rendering. Strategy contracts are
synchronous in v1, but registered implementations are trusted application code;
the engine cannot make them pure, cancel non-cooperative work, or sandbox side
effects. Image analysis, remote generation, and other asynchronous providers can
produce a `Palette` outside the engine and supply it through the same value API.

Serialized state stores only strategy IDs, versions, and JSON options. If an
implementation is unavailable, the palette remains readable and editable.
Missing analyzers and validators produce diagnostics; operations that require a
missing harmony, generator, gamut policy, exporter, or importer throw
`MissingStrategyError`. No missing reference causes code to be loaded or run.

Plugins are trusted application code, not a sandbox. Serialized references never
auto-install, dynamically import, fetch, or evaluate an implementation. Engine
boundaries validate strategy options and outputs, reject registry collisions
unless explicitly overridden, and enforce configured palette and metadata size
limits. Built-in strategies use these same contracts; this is a release gate for
the extension API rather than a parallel privileged implementation.

## Analysis API

Analysis reports measurable properties and actionable warnings. It does not
collapse them into a single universal quality score. Results use one open,
normalized diagnostic shape so custom analyzers do not require new top-level
fields.

```ts
interface PaletteDiagnostic<Data extends JsonValue = JsonValue> {
  ruleId: string;
  severity: "info" | "warning" | "error";
  messageKey: string;
  messageParameters?: JsonObject;
  colorIds?: readonly string[];
  path?: readonly (string | number)[];
  data?: Data;
}

interface PaletteAnalysis {
  diagnostics: readonly PaletteDiagnostic[];
}
```

Built-in v1 analysis emits gamut, explicit-pair contrast, and Euclidean OKLab
distance diagnostics. Schema validation failures are separate from advisory
analysis: invalid channel values or duplicate IDs reject a document, while a
low-contrast pair produces a diagnostic. There is no built-in color-vision or
ordering analyzer in v1.

Post-v1 diagnostic research covers:

- additional gamut policies and color profiles beyond built-in sRGB and
  Display-P3 mapping;
- richer WCAG 2.2 text and non-text usage contexts beyond explicit v1 color-ID
  pairs;
- pairwise perceptual distance under typical vision and supported color-vision
  deficiency simulations;
- monotonic lightness for sequential palettes;
- a meaningful neutral midpoint and monotonic sides for diverging palettes;
- insufficient differentiation in qualitative palettes;
- color being the only means of conveying information.

The React `DiagnosticsBlock` exposes `live`, `commit`, and `manual` scheduling and
defaults to `commit`; the framework-neutral analyzer itself is synchronous and
has no scheduler or cache. Other adapters do not currently ship a diagnostics
block.

## UI and composition contracts

The UI architecture has four layers:

1. A headless controller with actions, selectors, and subscriptions.
2. Independent wheel, palette, control, diagnostic, and export blocks.
3. Adapter-native replacement seams where the adapter declares them.
4. A composed picker preset for consumers who want a complete default UI.

The palette is a first-class controlled prop on composed adapter roots. A
headless controller plus adapter blocks or application markup supports
palette-only and wheel-only products. Full `PickerState` control is available
when an application also needs active-color and wheel settings. Ownership modes
are mutually exclusive so there is never more than one source of truth.

Conceptually, adapters support both convenience and composition:

```tsx
// Palette supplied as data; the default composed UI renders it.
<Picker palette={palette} onPaletteChange={setPalette} />

// Palette UI replaced as a slot/block while the default wheel remains.
<Picker
  palette={palette}
  onPaletteChange={setPalette}
  blocks={{ palette: MyPaletteBlock }}
/>

// Fully composed from independent blocks sharing one controller.
<PickerRoot value={state} onChange={setState}>
  <WheelBlock />
  <MyPaletteBlock />
  <DiagnosticsBlock />
</PickerRoot>
```

The names above are illustrative. React v1 exposes all five blocks plus pointer
and palette-swatch renderers. The DOM v1 mount exposes a custom palette renderer;
applications replace its wheel or controls by rendering on the headless
controller. Vue exposes native primitive/block slots and headless composables;
Angular exposes native wheel and palette template directives; React Native
exposes native blocks, render callbacks, and styles. All adapters consume the
same controller capabilities and palette values; framework component functions
never enter core state.

Replacement blocks receive the documented controller/state context and do not
mutate internal objects directly. Primitive replacement seams supply the native
behavior and accessibility attributes that adapter supports. A custom pointer,
swatch, or input must apply those keyboard, focus, label, and event properties
to retain library-owned behavior. V1 does not inspect or certify
application-owned markup.

The vanilla browser adapter follows the same contract through a controller:

```ts
interface PickerController {
  readonly commands: PickerCommands;
  getState(): PickerState;
  setState(next: PickerState, meta?: Partial<ChangeMeta>): void;
  getPalette(): Palette;
  setPalette(next: Palette, meta?: Partial<ChangeMeta>): void;
  dispatch(action: PickerAction): void;
  select<Result>(selector: PickerSelector<Result>): Result;
  subscribe<Result>(
    selector: PickerSelector<Result>,
    listener: (next: Result, meta: ChangeMeta) => void,
    equality?: (previous: Result, next: Result) => boolean
  ): () => void;
  transaction<Result>(run: () => Result, change?: ChangeOptions): Result;
  beginInteraction(change?: ChangeOptions): PickerInteraction;
  focus(target?: PickerFocusTarget): void;
  destroy(): void;
}
```

The action and selector contracts are stable extension seams. Built-in blocks
use them too, ensuring the headless surface is sufficient for real interfaces.

## Styling and theming contract

The default browser UI ships as an optional stylesheet. Consumers may use it,
override documented design tokens, or render the library unstyled.

- The normative `data-part` names and state attributes are listed in the
  customization guide; observed but unlisted markup is not public API.
- The documented CSS custom properties control theme colors, typography,
  radii, and elevation. Pointer geometry and per-color properties are internal.
- Adapter root styling props and block-specific styling seams are listed in the
  customization guide. Finer web styling uses the documented parts.
- The library does not inject global CSS at runtime.

Structure is customized with blocks and slots rather than brittle descendant
selectors. A future Web Component adapter must expose equivalent `part` names
if it uses Shadow DOM.

## Accessibility contract

Accessibility is part of the public behavior, not an optional demo feature.
The following are implementation requirements, not a WCAG conformance claim;
assistive-technology and physical-device results remain release-checklist gates.

- The visual two-dimensional wheel has equivalent explicit hue,
  saturation/chroma, and lightness/value controls. A two-axis handle is not
  represented misleadingly as one scalar ARIA slider.
- Handles have a stable focus order even when they cross or colors are reordered.
- Arrow-key changes have documented increments; modified keys provide coarse and
  fine increments.
- Pointer identity, selection, warnings, and ordering do not depend on color
  alone.
- Clicking/tapping the wheel and text or numeric controls provide alternatives to
  dragging. Locking and reordering also have non-drag commands.
- The default stylesheet includes focus-visible, reduced-motion, and
  forced-colors treatment and is designed around non-text contrast and target
  size/spacing guidance. Final contrast, target-size, zoom, and reflow behavior
  depends on consumer styling and integration.
- Default blocks provide keyboard and touch paths, invalid-input feedback, and
  focus requests after remove or reorder operations. The framework-neutral
  scalar keyboard helper accepts an explicit RTL direction, but complete RTL
  adapter behavior is not certified in v1.
- Framework adapters expose selected titles, descriptions, and labels. V1 has no
  global localization or formatting object; complete localization requires
  replacement blocks or primitives.
- Touch and pointer interactions use the same state transitions as keyboard and
  programmatic changes.
- The framework-neutral palette analysis API evaluates only pairs supplied in
  `AnalysisOptions`. The React diagnostics convenience block can infer one
  normal-text pair from a documented small set of role names. That inference is
  not semantic proof and must not be used as a conformance claim.

Custom content slots retain library-owned interaction wrappers. Full primitive
replacement receives accessibility prop getters and documented obligations.
Neither defaults nor custom markup can be certified outside the consuming
application's content, styles, target platforms, and assistive-technology matrix.

## Palette categories and guidance

Harmony palettes arrange colors around a hue relationship. They are appropriate
for exploration and general design, with explicit lightness/chroma controls.

Tonal palettes hold hue relatively stable while varying lightness and chroma.
They are useful for UI scales and monochromatic designs.

Qualitative palettes encode categories. Colors should be distinguishable without
implying an order; their evaluation should include perceptual distance and
color-vision-deficiency checks.

Sequential palettes encode ordered magnitude. Lightness must progress
monotonically, with optional hue/chroma movement.

Diverging palettes encode deviation around a meaningful midpoint. Each side must
progress monotonically away from a neutral center.

Semantic palettes assign functional roles and evaluate the combinations in which
those roles are actually used, especially foreground/background contrast.

## Versioning and extensibility

- All state and rule objects are serializable.
- Algorithms have stable identifiers so generated palettes can record their
  provenance.
- New opt-in strategies are minor releases. Stable defaults and algorithm output
  do not change in a patch release except for documented correctness fixes, and
  behavior-changing defaults require a major release.
- Export formats are adapters over the palette model, not fields stored in UI
  state.
- Experimental research models are labeled experimental until their behavior and
  limitations are documented.

## Version-one release-candidate scope

The implemented release candidate is narrower than the full research roadmap.
Automated examples and tests cover the items below, but stable publication still
depends on the manual accessibility, assistive-technology, physical-device,
visual, and release checks in [the release checklist](./RELEASE_CHECKLIST.md):

- framework-neutral tagged sRGB, Display-P3, HSL, HSV, and OKLCH conversion with
  explicit sRGB and Display-P3 gamut mapping;
- one familiar HSV-style wheel interaction;
- single, complementary, analogous, triadic, tetradic, split-complementary, and
  monochromatic harmony strategies;
- tonal palette generation and manual/custom palettes;
- palette editing, color locking, reordering, roles, metadata, and text entry;
- context-aware WCAG contrast, gamut, and perceptual-distance diagnostics;
- the headless controller, instance-scoped strategy engine, composable blocks,
  replacement slots, unstyled mode, and design tokens;
- vanilla browser, React, Vue, Angular, and React Native adapters;
- JSON, CSS, and design-token export;
- original documentation, composition recipes, research notes, changelog,
  contribution guide, an MIT license, and the showcase site.

OKLCH wheel geometry is available for research and custom UI work but is not
presented as a polished stable wheel. Custom color-space profiles,
color-vision simulations, and qualitative, sequential, and diverging generators
are roadmap work and are not v1 exports. Their names remain accepted as open
palette `kind` values, which does not imply generation or analysis support.
Custom color spaces are not a stable version-one extension point.

Vanilla, React, Vue, and Angular share web styling hooks but own independent
renderers and framework-native lifecycles. React Native reuses algorithms,
state, and geometry while providing its own renderer, touch handling, and
accessibility implementation.

## Sources informing this RFC

- [Canva Color Wheel](https://www.canva.com/colors/color-wheel/) for the product
  interaction reference and its five displayed palette types.
- [CSS Color Module Level 4](https://www.w3.org/TR/css-color-4/) for specified
  color spaces, conversions, interpolation considerations, and gamut mapping.
- [CIE Colorimetry, 4th Edition](https://www.cie.co.at/publications/colorimetry-4th-edition)
  for the colorimetric foundation.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) for use of color, text contrast, and
  non-text contrast requirements.
- [WCAG 2.2 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)
  for non-drag pointer alternatives, including its color-wheel examples.
- [WAI-ARIA Multi-Thumb Slider Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider-multithumb/)
  for stable focus order and touch-assistive-technology cautions.
- Ou and Luo, [A colour harmony model for two-colour combinations](https://doi.org/10.1002/col.20208),
  for a constrained psychophysical two-color model involving hue, lightness, and
  chroma, and for its explicit limits.
- Schloss and Palmer,
  [Aesthetic response to color combinations: preference, harmony, and similarity](https://doi.org/10.3758/s13414-010-0027-0),
  for empirical support for distinguishing pair preference from perceived pair
  harmony in simple two-color stimuli.
- Zeileis, Hornik, and Murrell,
  [Escaping RGBland: Selecting Colors for Statistical Graphics](https://www.zeileis.org/papers/Zeileis%2BHornik%2BMurrell-2009.pdf),
  for perceptually organized qualitative, sequential, and diverging palettes.
- Brewer, Hatchard, and Harrower,
  [ColorBrewer.org: An Online Tool for Selecting Colour Schemes for Maps](https://www.cs.rpi.edu/~cutler/classes/visualization/S18/papers/colorbrewer.pdf),
  for task-oriented palette categories and practical scheme guidance.
