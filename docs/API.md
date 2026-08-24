# Public API reference

This document describes the public package surface. TypeScript declarations
remain authoritative for overloads and generic inference. Install one package
and import the core, editor, or framework adapter through a subpath:

```sh
npm install @s9rg/colorwheel
```

## Entry points

### `@s9rg/colorwheel`

Re-exports the complete framework-neutral core and editor. It has no UI
framework or DOM dependency and is safe to import in Node, workers, and
server-rendering code.

### `@s9rg/colorwheel/core`

Color values, conversion, gamut mapping, generation, analysis, versioned
documents, strategy registries, import, and export.

### `@s9rg/colorwheel/editor`

Picker state, reducer, controller, commands, selectors, interaction lifecycle,
wheel geometry, and accessibility prop data.

### `@s9rg/colorwheel/react`

React preset, compound components, primitives, and hooks. React and React DOM
are optional peers of the package.

### `@s9rg/colorwheel/vue`

Vue 3 component, headless composables, context composables, scoped slots, and a
metadata-specialized component factory. Vue is an optional peer.

### `@s9rg/colorwheel/angular`

Standalone Angular component and palette-template directive. Angular is an
optional peer.

### `@s9rg/colorwheel/react-native`

React Native preset, compound components, native blocks, hooks, and pure native
interaction helpers. React, React Native, and `react-native-svg` are optional
peers.

### `@s9rg/colorwheel/vanilla`

Vanilla browser mounting API. It uses core and editor directly and does not load
React.

### `@s9rg/colorwheel/dom`

Compatibility entry point for the same vanilla browser API. New examples use
`/vanilla`.

### `@s9rg/colorwheel/styles.css`

Optional default styles shared by the React, Vue, Angular, and vanilla web
adapters. React Native uses native style props instead.

## Core color API

All structured colors carry a `space` tag. RGB, saturation, lightness, value,
and alpha channels use `0..1`; hue uses degrees and is normalized; OKLCH
chroma is non-negative and accepts the documented v1 range.

`parseColor(input)`

: Parses the deliberate v1 CSS subset: 3/4/6/8-digit hex, modern or legacy
`rgb()`/`rgba()`, `hsl()`/`hsla()`, and `oklch()`. It rejects unknown
names, mixed RGB channel units, and out-of-range values with
`ColorParseError`. Named colors, `var()`, `currentColor`, `color()`, and
arbitrary browser CSS are not parsed in v1.

`formatColor(input, options)`

: Formats deterministic `hex`, `rgb`, `hsl`, `oklch`, or
`display-p3` CSS. Options control precision, alpha inclusion, and sRGB gamut
mapping.

`convertColor(input, space)`

: Converts to `srgb`, `display-p3`, `hsl`, `hsv`, or `oklch` and
returns the correctly narrowed tagged type.

`mapToGamut(input, gamut)`

: Returns the mapped color, target gamut, whether mapping occurred, OKLab
distance from the request, and mapping method.

`isInGamut(input, gamut)`

: Tests whether the requested color is representable in the target gamut.

`perceptualDistance(first, second)`

: Returns Euclidean OKLab distance. It is a useful signal, not a universal
perceptual threshold.

`relativeLuminance(input)`, `contrastRatio(foreground, background, canvas)`

: Implement the WCAG relative-luminance and contrast calculation after alpha
compositing over an opaque canvas. `canvas` defaults to white; pass the actual
opaque page color whenever transparency is involved. Inputs are mapped to sRGB
before this v1 calculation.

Low-level conversion functions and types for linear sRGB, XYZ D65, OKLab, HSL,
HSV, and Display-P3 are also exported for strategy authors and verification.

## Palette generation

```ts
const palette = createHarmonyPalette({
  seed: "#6750ff",
  harmony: { type: "analogous", count: 5, spread: 24 },
  outputGamut: "srgb",
  name: "Product accents"
});
```

`createHarmonyPalette(options)` supports:

- `single`;
- `complementary` with optional angle;
- `analogous` with count and adjacent spread;
- `triadic` with optional angle;
- `tetradic` with optional angle;
- `split-complementary` with optional spread;
- `monochromatic` with optional count.

Built-in rules keep their concise forms. A custom rule stored in a recipe uses
a non-overlapping discriminator and explicit strategy identity:

```ts
interface BrandOptions {
  offsets: readonly number[];
}

const rule: CustomHarmonyRule<BrandOptions> = {
  type: "custom",
  id: "com.example.harmony.brand",
  version: "1.0.0",
  options: { offsets: [0, 42, 180] }
};
```

Call a registered custom harmony implementation through `ColorEngine` with the
matching `StrategyReference`; the direct `createHarmonyPalette` helper is for
built-in rules.

`createTonalPalette(options)` holds hue approximately stable while generating
an ordered lightness scale. Count, output gamut, lightness range, chroma scale,
name, and deterministic ID factory are configurable.

Generated palettes record both a live `recipe` and historical `provenance`.
Free manual edits detach a recipe when the result no longer satisfies it;
provenance remains historical rather than pretending the palette is still
generated.

A live wheel recipe also records `seedColorId`, the stable ID of the palette
entry that owns its `seed`. The ID survives palette reordering, document
round-trips, and caller-provided ID factories. The field is additive: older
documents without it remain valid, and the editor infers a legacy owner only
when exactly one stored color represents the saved seed.

New built-in recipes also record `colorSlotIds`, the ordered color IDs assigned
to strategy output slots. This is semantic recipe data, distinct from swatch or
keyboard focus order: rearranging the visible palette does not change which ID
receives each relationship when the recipe is regenerated. Older recipes may
omit it and use their stored palette order as a compatibility fallback. The
array lists strategy-owned slots only; retained manual or locked extras may be
present in `palette.colors` without appearing in `colorSlotIds`.

## Palette documents

`Palette` is the live data value. `PaletteDocument` is its portable envelope:

```ts
{
  schema: "color-palette",
  schemaVersion: 1,
  palette
}
```

Use:

- `validatePalette(value, limits)` for a non-throwing result;
- `assertPalette(value, limits)` for a typed assertion;
- `createPaletteDocument(palette)`;
- `validatePaletteDocument(value, limits)`;
- `assertPaletteDocument(value, limits)`;
- `serializePaletteDocument(paletteOrDocument, indentation)`;
- `parsePaletteDocument(json, limits)`;
- `migratePaletteDocument(value)`;
- `assignPaletteColorIds(colors, prefix)`.

`assignPaletteColorIds` preserves the first occurrence of each supplied ID and
assigns deterministic `${prefix}-${number}` IDs to missing or duplicate IDs.
The prefix defaults to `"color"`.

Validation requires finite JSON values, supported tagged color shapes, unique
IDs, a recognized envelope, and configured resource limits. Unknown
application metadata and strategy references are preserved. A document never
causes code loading or evaluation.

## Analysis

```ts
const analysis = analyzePalette(palette, {
  outputGamut: "srgb",
  includeGamut: true,
  includePerceptualDistance: true,
  minimumPerceptualDistance: 0.03,
  contrastPairs: [
    {
      foregroundId: "text",
      backgroundId: "surface",
      usage: "normal-text",
      level: "AA",
      canvas: "#ffffff"
    }
  ]
});
```

`analyzePalette` returns one open `diagnostics` array. Each diagnostic has a
namespaced rule ID, severity, message key and JSON parameters, affected color
IDs or path, and optional data. It does not return a single palette score.

The framework-neutral analyzer runs contrast only for explicit pairs. Gamut and
pairwise distance checks may be enabled independently. The React
`DiagnosticsBlock` schedules analysis on commits by default and can infer one
normal-text pair from the first `foreground`, `text`, or `on-background` entry
and the first `background`, `surface`, or `canvas` entry (case-insensitive);
other adapters do not currently ship a diagnostics block. Supply a custom React
`analyze` function with explicit pairs and canvas for application accessibility
decisions.

## Import and export

Direct helpers:

- `exportPaletteJson(palette, options)`;
- `exportPaletteCss(palette, options)`;
- `exportPaletteTokens(palette, options)`.

Each returns an `ExportArtifact` containing platform-neutral files with a
name, media type, and `string | Uint8Array` content. Filenames, CSS selectors,
token names, and output options are validated and sanitized.

The token helper emits the final Design Tokens Community Group 2025.10 color
shape (`colorSpace`, `components`, optional `alpha`, and a hex fallback) with
the preferred `application/design-tokens+json` media type. It creates a flat
palette group; aliases, themes, and resolver documents are outside v1.

The built-in engine also registers JSON import and JSON, CSS, and design-token
export under the IDs exposed by `BUILT_IN_IMPORTER_IDS` and
`BUILT_IN_EXPORTER_IDS`.

## Strategy engine

`createColorEngine(options)` creates an isolated registry. Options can add:

- harmony strategies;
- palette generators;
- validators;
- analyzers;
- gamut-mapping policies;
- exporters;
- importers.

Built-ins are included by default and implement the same interfaces. Set
`includeBuiltIns: false` for an empty engine. Duplicate `id@version`
registrations throw unless `overrideStrategies` is explicitly enabled.
`validationLimits` applies to palette and document boundaries.

`ColorEngine` methods:

- `createHarmony(reference, seed)`;
- `generate(reference)`;
- `validate(palette, references)`;
- `analyze(palette, references)`;
- `map(color, gamut, policy)`;
- `export(palette, reference)`;
- `import(content, reference)`;
- `hasStrategy(category, reference)`;
- `listStrategies(category)`.

An unavailable analyzer or validator becomes a diagnostic where data can still
be preserved. Operations that require an unavailable generator, harmony,
gamut, exporter, or importer throw `MissingStrategyError`.

Registered strategies are trusted, synchronous application code in v1—not
sandboxed remote plugins. Inputs and outputs are validated, but cancellation
cannot interrupt non-cooperative synchronous code.

## Editor state and controller

`createPickerState({ palette, activeColorId, anchorColorId, colorFocusOrder,
wheel })` normalizes a serializable picker state. Wheel options are:

- `wheelModel: "hsv" | "oklch"`;
- `interaction: "linked" | "free"`;
- `outputGamut: "srgb" | "display-p3"`.

State construction, replacement, controller commands, and public reducer
actions validate untyped JavaScript inputs before they enter stored state.
Colors must have finite in-range channels, palette metadata must be finite JSON,
and action/state envelopes reject malformed or unsupported fields.

The stable v1 default UI uses the HSV wheel. The OKLCH geometry is exported for
research and custom UI work but is not presented as a polished stable wheel.

`createPickerController(initialState, options)` exposes:

- `getState()`, `setState()`, `getPalette()`, and `setPalette()`;
- `dispatch(action)`;
- `commands` for replace, edit, add, remove, reorder, lock, name, role, active,
  anchor, wheel options, and regenerate;
- `select(selector)` and narrow `subscribe(selector, listener, equality)`;
- `transaction(run, change)`;
- `beginInteraction(change)`;
- `focus(target)`;
- `destroy()`.

`setState` and `setPalette` are external synchronization and do not emit
controlled callbacks. Commands and dispatch do. Every emitted change includes
action, origin, phase, changed color IDs, and an optional transaction ID.

Selectors include palette, colors, wheel, active and anchor entries or IDs,
focus order, color-by-ID, indices, locked/active/anchor state, editability, and
next-focus order.

`resolveWheelEditingColor(state, entry)` returns the model-space basis for an
edit. It normally returns the stored palette color. For the declared
seed-owning anchor of a linked live recipe, it returns the recipe seed so hue,
saturation, or chroma remain recoverable when a gamut-mapped endpoint is
achromatic, such as HSV value zero.

## Geometry and accessibility data

Geometry helpers convert among colors, normalized wheel points, hue/radius
pairs, and client rectangles without using the DOM. They include:

- `colorToWheelPoint` and `wheelPointToColor`;
- `clientPointToWheelPoint` and `wheelPointToClientPoint`;
- `constrainWheelPoint`;
- `hueRadiusToWheelPoint` and `wheelPointToHueRadius`;
- `getWheelChannelValue(color, options)` reads HSV value or OKLCH lightness,
  according to `options.model`;
- `setWheelChannelValue(template, value, options)` replaces that normalized
  channel while preserving the model's other channels and alpha;
- `wheelChannelValueToRingPoint(value, options)` maps a normalized channel
  value to the right semicircle by default; pass `{ side: "left" }` to mirror
  it; and
- `ringPointToWheelChannelValue(point)` projects a normalized pointer point
  onto the ring and returns a value from `0` to `1`.

Channel helper options default to the HSV model. Channel inputs are clamped to
the normalized `0`–`1` range and non-finite inputs are rejected. The ring-point
helpers are framework-neutral geometry: they do not read layout, handle pointer
events, or mutate picker state.

Ring values use a uniform semicircular arc: `0` is at the bottom, `0.5` is at
the side, and `1` is at the top. Pointer input from either half resolves to the
same channel value, while the web adapters retain the side the user is
dragging so the thumb does not jump across the wheel.

Accessibility helpers return framework-neutral property data for the wheel,
handles, swatches, lock, remove, move, and channel controls.
`getSliderKeyboardValue` implements standard fine, normal, coarse, Home, End,
Page Up, Page Down, and RTL-aware scalar behavior.
`createPickerAccessibilityBindings(controller, labels)` binds those getters to
live state.

## React adapter

The convenience `Picker` and `PickerPreset` render all default blocks.
`Picker` also exposes compound components:

- `Picker.Root`;
- `Picker.Wheel`;
- `Picker.Palette`;
- `Picker.Controls`;
- `Picker.Diagnostics`;
- `Picker.Export`.

`Picker.Root` accepts exactly one ownership mode: injected `controller`,
controlled `value`, controlled `palette`, or uncontrolled
`defaultValue`/`defaultPalette`. The optional `wheel` initializer is valid only
with palette-owned modes (`palette` or `defaultPalette`); complete state and
injected controllers already own their wheel settings. The root also accepts
callbacks, class, style, ID, label, and unstyled mode.

The preset accepts `blocks` to replace or omit whole blocks, `blockProps` to
configure them, or `children` to replace only the layout while retaining the
configured root.

`Picker.Wheel` renders the two-dimensional hue/saturation surface for HSV or
hue/chroma surface for OKLCH. By default, a separate outer slider ring edits
the channel not represented by that surface: HSV value or OKLCH lightness. In
linked mode the ring edits the harmony anchor; in free mode it edits the active
color. Set `showChannelRing={false}` to remove the ring from both the rendered
and accessibility trees.

The wheel supports custom pointer primitives and render functions. The palette
supports custom swatches and render functions. Hooks are
`usePickerController()` and `usePickerSelector(selector, equality)`.

The selector hook applies `equality` both to controller notifications and to
the React external-store snapshot. A selector may therefore allocate an object
while retaining a stable result identity when the selected fields are equal.

See [the customization guide](./CUSTOMIZATION.md) for complete patterns and
accessibility responsibilities.

## Vue adapter

`Colorwheel` renders a Vue-owned web editor over the shared controller. Its
state sources are mutually exclusive:

- `controller` injects a caller-owned `PickerController`;
- `modelValue` is controlled complete `PickerState` and supports `v-model`;
- `palette` is controlled portable palette data and supports
  `v-model:palette`;
- `defaultValue` initializes adapter-owned complete state;
- `defaultPalette` initializes an adapter-owned palette; or
- no source uses the deterministic default palette.

Adapter-owned modes accept `controllerOptions`. Only `palette` and
`defaultPalette` accept `wheel`; complete state and injected controllers
already own their wheel settings.
Presentation props are `className`, `ariaLabel`, `unstyled`, `blockProps`, and
the backwards-compatible `renderPalette` escape hatch. `blockProps` configures
the native wheel and palette without replacing them. The `palette` scoped slot
takes precedence over `renderPalette`; it receives
`{ controller, state, palette }` and replaces the standard palette block. The
`pointer` and `swatch` slots replace repeated native primitives while receiving
the standard behavior and accessibility bindings. The default slot receives
the component scope and appends application-owned content after the standard
editor.

Events are:

- `update:modelValue(state, meta)` and `change(state, meta)`;
- `update:palette(palette, meta)` and `palette-change(palette, meta)`.

The exposed component API contains `controller`, `root`, `state`,
`focus(target?)`, `setState(state)`, and `setPalette(palette)`.

`createColorwheelComponent<Metadata>()` retains application-specific metadata
types. `useColorwheel(options)` provides an SSR-safe headless controller plus
readonly `state`, computed `palette`, and idempotent `destroy`. It accepts the
same ownership modes, using `value` rather than `modelValue` for controlled
state. `useColorwheelContext`, `useColorwheelController`, and
`useColorwheelSelector` are for blocks rendered inside `<Colorwheel>`.

## Angular adapter

`ColorwheelComponent` is a standalone component with selector
`s9rg-colorwheel`. It renders Angular-owned wheel and palette templates over the
shared controller and accepts one of
`controller`, `value`, `palette`, `defaultValue`, or `defaultPalette`. With no
source it creates the default state. `wheel` is accepted only with `palette`
or `defaultPalette`, and `controllerOptions` applies only to adapter-owned
controllers.

Presentation inputs are `className`, `ariaLabel`, `unstyled`, `blockProps`, and
the backwards-compatible `renderPalette` escape hatch. `blockProps.wheel`
configures title, description, instructions, numeric channels, and the outer
channel ring; `blockProps.palette` configures title, description, names,
actions, and adding. Outputs are:

- `valueChange: PickerState`, for `[(value)]`;
- `paletteChange: Palette`, for `[(palette)]`; and
- `colorwheelChange: { value, palette, meta }`, for action, origin, and phase
  details.

The component exposes the browser `instance`, the `editorController`, and
`focus(target?)`. Server rendering emits deterministic Angular-native wheel and
palette markup without creating a browser instance or installing listeners.

`ColorwheelPaletteTemplateDirective` and `ColorwheelWheelTemplateDirective`
mark projected templates that replace their respective native blocks. The
palette context exposes the palette as both `$implicit` and `palette`, plus
`state` and `controller`; the wheel context exposes state as `$implicit`, plus
`palette` and `controller`. Projected views keep their identity across state
updates. A supplied `renderPalette` input takes precedence over the projected
palette template.

## React Native adapter

`Picker`, `NativePickerPreset`, and the descriptive `Colorwheel` alias render a
native wheel and palette. `Picker` also exposes:

- `Picker.Root` (`NativePickerRoot`);
- `Picker.Wheel` (`NativeWheelBlock`); and
- `Picker.Palette` (`NativePaletteBlock`).

`Picker.Root` uses the same mutually exclusive ownership modes as React:
`controller`, controlled `value`, controlled `palette`, `defaultValue`, or
`defaultPalette`. Owned modes accept `onChange`, `onPaletteChange`, and
`controllerOptions`; only `palette` and `defaultPalette` also accept `wheel`.
Remaining props are passed to the root React Native `View`.

The preset accepts `blocks` to replace or omit the wheel and palette,
`blockProps` to configure them, `children` to replace the default layout,
`layoutStyle`, and `renderLayout(defaultLayout)`.

`NativeWheelBlock` supports a custom `graphic`, `renderGraphic`, and
`renderHandle`, plus `title`, `description`, `size`, disabled state, optional
adjustment buttons, hue/radius/third-channel steps, native styles, and standard
`View` props. The adjustment row and handle accessibility actions can edit HSV
value or OKLCH lightness as well as the two spatial wheel channels. The default
`NativeSvgWheel` is separately exported.

`NativePaletteBlock` supports a custom `swatch`, `renderSwatch`, and
`renderEmpty`, plus title/description, name and action visibility, add/remove/
reorder permissions, disabled state, native styles, and standard `View` props.
`NativePaletteSwatch` is separately exported.

Hooks are exported as both `useNativePickerController`/
`useNativePickerSelector` and the shorter `usePickerController`/
`usePickerSelector` aliases. `NativePickerProvider` supports custom native
composition around a caller-owned controller. `adjustNativeWheelColor` is a
pure helper for hue, radius, and value/lightness changes used by screen-reader
and hardware-input alternatives.

The native adapter renders React Native views and SVG, not DOM elements, and it
does not use `styles.css`.

## Vanilla DOM adapter

`mountColorwheel(container, options)` accepts exactly one initial source:
`palette`, `state`, an injected `controller`, or defaults. Presentation
options include callbacks, class name, accessible label, unstyled mode, and
`renderPalette`. The optional `wheel` initializer is valid only with `palette`
or the default palette; `state` and injected controllers already own wheel
settings. `blockProps` configures the built-in blocks:

- `wheel`: `title`, `description`, `showInstructions`, `showChannels`, and
  `showChannelRing`;
- `palette`: `title`, `description`, `showName`, `showActions`, and `allowAdd`.

All visibility flags default to `true`. These options remove omitted controls
from the rendered and accessibility trees; they do not merely hide them with
CSS. The vanilla outer ring follows the same model-aware behavior as the React
wheel: HSV value or OKLCH lightness, targeting the anchor in linked mode and the
active color in free mode. `renderPalette` remains the complete
palette-replacement seam.

The returned instance exposes:

- `root` and `controller`;
- `setState(state)` and `setPalette(palette)`;
- `update(options)`;
- `focus(target)`;
- idempotent `destroy()`.

Injected controllers remain owned by the caller. Adapter-owned controllers are
destroyed with the instance. A custom palette renderer is mounted once per
renderer identity and receives a context whose `state` getter remains live. It
may return a node or `{ node, update, destroy }`; `update()` runs after state or
presentation changes, and `destroy()` runs on replacement or teardown. Import
this API from `@s9rg/colorwheel/vanilla`; the `@s9rg/colorwheel/dom` path remains
compatible.

## Versioning promises

- Document schema versions are independent of package versions.
- Stable strategy output and defaults do not change in a patch except for a
  documented correctness fix.
- New opt-in strategies are minor changes; making one a default is not.
- The normative part and CSS-token names listed in the
  [customization contract](./CUSTOMIZATION.md), event meaning, and serialized
  fields follow semantic versioning.
- Experimental research APIs must be clearly named and documented before they
  can enter the stable surface.
