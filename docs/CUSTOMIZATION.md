# Customization guide

Colorwheel separates portable palette data, editor behavior, presentation, and
algorithms. “Customizable” does not mean one untyped options object; it means
each concern has an explicit replacement boundary.

## Customization scope

- React supports block omission, replacement, and composition, plus pointer and
  palette-swatch renderers.
- Vue supports controlled models, native palette/pointer/swatch/default slots,
  block configuration, a headless composable, context selectors, and a
  metadata-specialized component factory.
- Angular supports controlled inputs/outputs, configurable native blocks,
  projected wheel/palette templates, and a low-level palette renderer.
- React Native supports wheel/palette block replacement, custom layout,
  graphics, handles, swatches, empty content, and native style props.
- Vanilla supports the composed mount, unstyled mode, and replacement of the
  palette renderer. Replacing its wheel or controls is supported through the
  headless controller rather than a `renderWheel` option.

Built-in blocks expose selected title, description, empty-state, and diagnostic
props, but not every built-in string. There is no global localization object or
global number/color formatter; replace the relevant block when a product needs
complete control of those concerns.

## Palette data and palette UI are different

`palette` always means the serializable value:

```ts
interface Palette {
  colors: readonly PaletteColor[];
  kind: string;
  recipe?: PaletteRecipe;
  provenance: PaletteProvenance;
  name?: string;
  metadata?: object;
}
```

The palette **block** is optional presentation. It may be the default block, be
omitted, or be replaced. A custom block reads palette state and issues commands;
it is never stored inside the palette document.

This distinction makes all of these legitimate product shapes:

- a complete wheel and palette studio;
- a wheel with no palette UI;
- a palette editor with no wheel;
- a default wheel with application-owned palette markup;
- application-owned markup on the headless controller;
- a non-visual palette generator or analyzer.

## Choose one state owner

Every adapter accepts one ownership mode: a caller-owned controller, controlled
complete state, controlled portable palette data, or an uncontrolled default.
The exact controlled-state name follows the framework (`value`, Vue
`modelValue`, or Angular `value`).

Uncontrolled defaults:

```tsx
<Picker defaultPalette={initialPalette} />
```

Controlled portable data:

```tsx
<Picker
  palette={palette}
  onPaletteChange={(next, meta) => {
    setPalette(next);
    if (meta.phase === "commit") save(next);
  }}
/>
```

Controlled editor session:

```tsx
<Picker value={pickerState} onChange={setPickerState} />
```

Injected controller:

```tsx
<Picker controller={controller} />
```

These modes are mutually exclusive in TypeScript. External controlled updates
do not echo through callbacks as if they were user edits. In controlled modes,
the prop remains authoritative after every interaction; if an owner rejects an
edit by keeping the same prop, Colorwheel restores that value before the next
paint.

The vanilla adapter has the same exclusive source choices, but an imperative
mount has no reactive prop owner. `palette` and `state` are initial values;
later external synchronization uses `instance.setPalette(...)` or
`instance.setState(...)`:

```ts
mountColorwheel(host, { palette });
mountColorwheel(host, { state });
mountColorwheel(host, { controller });
```

Vue uses its standard model conventions:

```vue
<Colorwheel v-model="pickerState" />
<Colorwheel v-model:palette="palette" />
<Colorwheel :controller="controller" />
```

Angular supports paired inputs and outputs:

```html
<s9rg-colorwheel [(value)]="pickerState" />
<s9rg-colorwheel [(palette)]="palette" />
<s9rg-colorwheel [controller]="controller" />
```

React Native follows the React prop names:

```tsx
<Picker value={pickerState} onChange={setPickerState} />
<Picker palette={palette} onPaletteChange={setPalette} />
<Picker controller={controller} />
```

With an injected controller, React and React Native treat the controller as the
only callback owner, so root `onChange` props are intentionally unavailable.
Vanilla callback options and Vue/Angular component events may observe an
injected controller as adapter-level notifications. All adapters leave an
injected controller alive when their view is destroyed.

## Rearrange or omit React blocks

The preset can switch whole blocks off:

```tsx
<Picker
  blocks={{
    palette: false,
    diagnostics: false,
    export: false
  }}
/>
```

It can replace a block with a component that implements the same block props:

```tsx
<Picker blocks={{ palette: ProductPaletteBlock }} />
```

Or compose the blocks explicitly:

```tsx
<Picker.Root palette={palette} onPaletteChange={setPalette}>
  <header>Brand colors</header>
  <Picker.Controls />
  <div className="workspace">
    <Picker.Wheel />
    <ProductPalette />
  </div>
  <Picker.Diagnostics schedule="manual" />
  <Picker.Export formats={["tokens"]} />
</Picker.Root>
```

Available built-in blocks are `Picker.Wheel`, `Picker.Palette`,
`Picker.Controls`, `Picker.Diagnostics`, and `Picker.Export`.

## Configure the outer channel ring

The React, Vue, Angular, and vanilla web wheels render a model-aware outer
channel ring by default. The inner surface maps hue and saturation for HSV or
hue and chroma for OKLCH. The ring edits the remaining channel in palette data:
HSV value or OKLCH lightness. It targets the harmony anchor in linked mode and
the active color in free mode.

Omit it from a composed React wheel when the product supplies another
value/lightness control:

```tsx
<Picker.Wheel showChannelRing={false} />
```

The equivalent Vue, Angular, and vanilla option is
`blockProps.wheel.showChannelRing: false`. Disabling the ring removes its
slider from the rendered and accessibility trees; numeric channel controls can
remain enabled independently where the adapter exposes them.

## Replace repeated primitives

The wheel accepts a custom `pointer` component or `renderPointer` function.
The palette accepts a custom `swatch` component or `renderSwatch` function.
The renderer receives normalized state and the default primitive, which supports
decoration as well as complete replacement.

If a primitive is replaced, apply its supplied interaction and accessibility
props to the corresponding interactive elements. A pointer that drops
`buttonProps`, for example, also drops focus, labels, keyboard behavior, and
state attributes. A complete pointer replacement must also keep
`data-part="pointer"` on its handle so wheel hit testing can identify it, and it
must position itself from `point`. A complete palette-swatch replacement owns
its part markup and must apply the supplied `actionProps` for each action it
renders. In particular, keep the `data-part="swatch"` and `data-color-id`
attributes supplied by `actionProps.select`; the palette uses them to restore
focus after removal. Prefer renderer functions that decorate the default
primitive when the default behavior and markup should remain intact.

## Build a block from hooks

```tsx
import { usePickerController, usePickerSelector } from "@s9rg/colorwheel/react";

export function ProductPalette() {
  const colors = usePickerSelector((state) => state.palette.colors);
  const activeId = usePickerSelector((state) => state.activeColorId);
  const controller = usePickerController();

  return (
    <div>
      {colors.map((entry) => (
        <button
          key={entry.id}
          aria-pressed={entry.id === activeId}
          onClick={() =>
            controller.commands.setActive(entry.id, {
              action: "selection",
              phase: "commit"
            })
          }
        >
          {entry.name ?? entry.id}
        </button>
      ))}
    </div>
  );
}
```

Use stable selectors outside render where practical. Controller subscriptions
compare selected results, so narrow selectors avoid unrelated updates. React
and React Native also use the supplied equality function to stabilize their
external-store snapshots; an allocating selector is safe when its equality
function accurately compares the selected fields.

## Replace the vanilla palette block

```ts
const instance = mountColorwheel(host, {
  palette,
  renderPalette(context) {
    const list = document.createElement("ul");
    function update() {
      list.replaceChildren(
        ...context.state.palette.colors.map((entry) => {
          const item = document.createElement("li");
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.colorId = entry.id;
          button.textContent = entry.name ?? entry.id;
          item.append(button);
          return item;
        })
      );
    }
    function select(event: Event) {
      const button = (event.target as Element).closest<HTMLButtonElement>("[data-color-id]");
      if (button?.dataset.colorId) context.controller.commands.setActive(button.dataset.colorId);
    }
    list.addEventListener("click", select);
    update();
    return {
      node: list,
      update,
      destroy() {
        list.removeEventListener("click", select);
      }
    };
  }
});
```

A renderer may instead append directly. It mounts once for a given renderer
identity; the context's `state` getter stays current, and an optional returned
`update()` is called after controller or presentation changes. Keep renderer
work local to the supplied container and release owned listeners in
`destroy()`.

Import `mountColorwheel` from `@s9rg/colorwheel/vanilla`. The
`@s9rg/colorwheel/dom` subpath exposes the same compatibility API.

## Configure the built-in vanilla blocks

Use `blockProps` when the standard behavior is correct but a smaller
composition is needed:

```ts
const instance = mountColorwheel(host, {
  palette,
  blockProps: {
    wheel: {
      description: "Move a handle or use the outer value ring.",
      showInstructions: false,
      showChannels: false,
      showChannelRing: true
    },
    palette: {
      description: "Select a swatch or enter a color value.",
      showName: false,
      showActions: false,
      allowAdd: false
    }
  }
});
```

The default palette still exposes swatches and color-value inputs in this
compact configuration. Use `renderPalette` only when the block markup itself
must be replaced.

## Customize Vue-native blocks

The scoped `palette` slot replaces only the standard palette UI. It receives
the live controller, state, and palette while the standard wheel remains
mounted:

```vue
<Colorwheel v-model:palette="palette">
  <template #palette="{ palette: current, controller }">
    <ul aria-label="Product palette">
      <li v-for="entry in current.colors" :key="entry.id">
        <button type="button" @click="controller.commands.setActive(entry.id)">
          {{ entry.name ?? entry.id }}
        </button>
      </li>
    </ul>
  </template>
</Colorwheel>
```

The default slot appends a custom block after the standard editor and receives
the same scope. For headless Vue composition, `useColorwheel(options)` returns
`controller`, readonly `state`, computed `palette`, and `destroy`. Inside the
component tree, use `useColorwheelController()` and
`useColorwheelSelector(selector, equality)`.

Use `createColorwheelComponent<Metadata>()` when palette metadata is richer than
the default JSON object and should remain typed through props, events, slots,
and the exposed API.

Use `blockProps` to configure the standard Vue-owned wheel and palette. The
`pointer` and `swatch` slots receive `buttonProps` or `actionProps` plus the
default VNode; forwarding those bindings preserves keyboard, focus, state, and
accessibility behavior.

## Customize Angular-native blocks

Import the standalone component and template directive, then mark a projected
template with `s9rgColorwheelPalette`:

```ts
@Component({
  standalone: true,
  imports: [ColorwheelComponent, ColorwheelPaletteTemplateDirective],
  template: `
    <s9rg-colorwheel [(palette)]="palette">
      <ng-template s9rgColorwheelPalette let-current let-controller="controller">
        @for (entry of current.colors; track entry.id) {
          <button type="button" (click)="controller.commands.setActive(entry.id)">
            {{ entry.name ?? entry.id }}
          </button>
        }
      </ng-template>
    </s9rg-colorwheel>
  `
})
export class ProductPaletteEditor {
  palette = initialPalette;
}
```

The palette template context exposes `$implicit`, `palette`, `state`, and
`controller`. `ColorwheelWheelTemplateDirective` similarly marks an
`s9rgColorwheelWheel` template whose `$implicit` value is the live picker state.
Both projected views remain mounted across controller updates. Use `blockProps`
to configure the standard Angular-owned blocks. For a non-template integration,
pass `renderPalette`; that input takes precedence over the projected palette
template. Use `colorwheelChange` when action, origin, and phase metadata is
needed in addition to `valueChange` and `paletteChange`.

## Compose React Native blocks

React Native has its own blocks and native style props; it does not use the web
DOM or stylesheet:

```tsx
import { Picker } from "@s9rg/colorwheel/react-native";

export function CompactNativePicker() {
  return (
    <Picker.Root defaultPalette={initialPalette}>
      <Picker.Wheel
        size={280}
        title="Brand colors"
        showAdjustments={false}
        styles={{ heading: { color: "#17233c" } }}
      />
      <Picker.Palette showActions={false} allowReorder={false} />
    </Picker.Root>
  );
}
```

The preset accepts `blocks`, `blockProps`, `children`, `layoutStyle`, and
`renderLayout`. `Picker.Wheel` can replace or decorate its SVG graphic and each
handle. `Picker.Palette` can replace or decorate each swatch and the empty
state. Renderer props include the native interaction and accessibility props;
forward them when replacing an interactive primitive.

The default native wheel adjustment row covers hue, saturation/chroma radius,
and the third model channel (HSV value or OKLCH lightness). `hueStep`,
`radiusStep`, and `channelStep` configure those increments. Disabling a handle
also removes its press and accessibility actions; custom handles should forward
the supplied disabled state and action props unchanged.

Native hooks are available as `usePickerController`/`usePickerSelector` and
`useNativePickerController`/`useNativePickerSelector`. For fully custom native
composition, use `NativePickerProvider` with a caller-owned controller.

## Use the headless controller

The controller is the lowest stable behavior layer:

```ts
const controller = createPickerController(createPickerState({ palette }));

const unsubscribe = controller.subscribe(
  (state) => state.palette.colors,
  (colors, meta) => {
    renderColors(colors);
    if (meta.phase === "commit") persist(colors);
  }
);

controller.commands.setColor("primary", parseColor("#6d5dfc"));
controller.commands.reorderColor("primary", 0);
controller.commands.setLocked("primary", true);

unsubscribe();
controller.destroy();
```

Commands cover palette replacement, color edit/add/remove/reorder, lock, name,
role, active color, anchor color, wheel options, and regeneration. Transactions
group related operations under one change record. Pointer interactions expose
`start`, `update`, and `commit` phases. Calling `cancel()` ends the interaction
with a final `commit` event rather than introducing a fourth phase.
Pointer gestures use the same phase contract in every adapter: an empty
`start`, one or more color-bearing `update` records for press, movement, and
release coordinates, then a final `commit` carrying the aggregate changed
color IDs. Selecting a previously inactive handle is a separate one-shot
`selection` commit outside the pointer transaction.

Accessibility bindings provide semantic labels and state for wheel handles,
swatches, locks, remove/move actions, and scalar channels. A custom UI still
owns its DOM or native interaction implementation.

## Style defaults or start unstyled

Import the default stylesheet:

```ts
import "@s9rg/colorwheel/styles.css";
```

Override tokens on the root:

```css
.brand-picker {
  --colorwheel-accent: #0066ff;
  --colorwheel-surface: #0f1220;
  --colorwheel-text: #f7f8ff;
  --colorwheel-text-muted: #b7bdd3;
  --colorwheel-border: #363c52;
  --colorwheel-radius: 0.5rem;
  --colorwheel-ring-width: 0.875rem;
  --colorwheel-ring-gap: 0.625rem;
  --colorwheel-ring-thumb-size: 1.125rem;
  --colorwheel-min-visible-value: 0.4;
  --colorwheel-font: "IBM Plex Sans", sans-serif;
}
```

### Normative web styling contract

Only the names listed in this section are public styling API. Their semantic
meaning follows semantic versioning; HTML tag names, nesting, generated IDs,
classes, and unlisted attributes or custom properties are implementation
details.

Parts shared by every web adapter (React, Vue, Angular, and vanilla):

- structure: `root`, `picker-layout`, `block-header`, `block-title`;
- wheel: `wheel-block`, `active-color`, `wheel-frame`, `channel-ring`,
  `channel-ring-track`, `channel-ring-thumb`, `wheel`, `wheel-color`,
  `harmony-lines`, `pointer`, `pointer-color`, `pointer-anchor`,
  `wheel-instructions`;
- palette: `palette`, `palette-count`, `palette-list`, `palette-item`, `swatch`,
  `swatch-color`, `anchor-mark`, `palette-item-fields`, `palette-item-actions`,
  `add-color`;
- fields and actions: `field`, `name-input`, `color-input`, `field-error`,
  `icon-button`;
- optional block copy: `block-description`.

Additional React parts:

- `empty-state`, `secondary-button`;
- `controls`, `controls-grid`, `editing-controls`, `select`, `field-help`;
- `field-label`, `channels`, `channel`, `channel-label`, `channel-value`;
- `diagnostics`, `diagnostic-list`, `diagnostic`, `diagnostic-severity`,
  `diagnostic-colors`, `diagnostic-empty`;
- `export`, `export-actions`.

Additional vanilla parts:

- `wheel-slot`, `palette-slot`;
- `field-label`, `channels`, `channel`, `channel-label`, `channel-input`,
  `channel-value`.

Additional Vue parts:

- `empty-state`;
- `palette-slot` for the legacy imperative palette-renderer host.

Additional Angular parts:

- `empty-state`, `wheel-slot`, `palette-slot`;
- `field-label`, `channels`, `channel`, `channel-label`, `channel-input`,
  `channel-value`.

The Vue preset deliberately does not render the optional numeric channel block.
Consumers that need that interface can compose it from the controller and
editor selectors, or replace the relevant block with Vue-native content. A
part listed for one adapter is not implied to exist in another adapter unless
it also appears in the shared list above.

The supported state and identity attributes are `data-colorwheel`,
`data-unstyled`, `data-color-id`, `data-active`, `data-anchor`, `data-locked`,
`data-editable`, `data-model`, and `data-channel`. React additionally exposes
`data-focus-order` on default pointers, `data-field` on classified fields, and
`data-severity` and `data-rule-id` on diagnostics. Palette rows represent false
state by omitting `data-active`, `data-anchor`, or `data-locked`; accessibility
bound controls may use the strings `"true"` and `"false"`.

The supported consumer CSS custom properties are:

- colors: `--colorwheel-accent`, `--colorwheel-surface`,
  `--colorwheel-surface-muted`, `--colorwheel-text`,
  `--colorwheel-text-muted`, `--colorwheel-border`, `--colorwheel-focus`, and
  `--colorwheel-danger`;
- shape and elevation: `--colorwheel-radius`, `--colorwheel-radius-small`, and
  `--colorwheel-shadow`;
- outer channel ring geometry: `--colorwheel-ring-width` (default `0.875rem`),
  `--colorwheel-ring-gap` (default `0.625rem`), and
  `--colorwheel-ring-thumb-size` (default `1.125rem`);
- HSV wheel presentation: `--colorwheel-min-visible-value`, a unitless number
  from `0` to `1` (default `0.5`) that keeps very dark colors from obscuring the
  hue and saturation surface without changing palette data. Set it to `0` for
  literal HSV darkness or `1` for a full-brightness surface;
- typography: `--colorwheel-font`.

The ring geometry tokens affect layout and presentation only. Moving the ring
changes the real HSV value or OKLCH lightness stored in palette data. In the
other direction, `--colorwheel-min-visible-value` is presentation-only: it
keeps the inner HSV surface legible near black and never clamps or rewrites the
stored value selected by the ring or another input.

The built-in track places the minimum channel value at the bottom and the
maximum at the top. Equal channel steps move equal distances along either
semicircle. The adapters retain the last dragged side through the center zone,
so a left-side drag remains on the left instead of teleporting the thumb.
For a linked recipe's declared seed owner, the adapters use the live recipe seed
as the editing basis; moving through black therefore retains the intended hue
and saturation when the value is raised again. The owner is stored as a stable
color ID, so palette reordering does not transfer that hidden editing basis to a
different swatch. Built-in recipes likewise persist `colorSlotIds`, keeping the
mapping from generated relationship slots to stable IDs independent of visual
swatch order and editor focus order.

Properties used internally to position pointers, render swatches, or transfer
the current wheel value are not theme tokens even when they are visible in the
rendered style attribute or stylesheet.

Set `unstyled` on the React root/preset or Vue component, `[unstyled]="true"`
on the Angular component, or `unstyled: true` in the vanilla adapter to retain
structure and behavior without applying the default theme selector.

React Native accepts `styles` objects on its wheel, palette, and swatch blocks,
plus standard React Native `style` props. Its styling contract is typed in
`NativeWheelStyles` and `NativePaletteStyles`; CSS variables and `data-part`
selectors do not apply.

## Customize diagnostics and export

`Picker.Diagnostics` accepts:

- `schedule="live" | "commit" | "manual"`;
- a supplied `analysis`;
- a custom `analyze(palette)` function;
- a `renderDiagnostic` function;
- custom title and empty content.

`Picker.Export` accepts built-in formats, arbitrary export options, and an
`onExport` interception callback. Return `false` from `onExport` to prevent
the default download and send the artifact to an application-owned destination.

Core exporters return platform-neutral `string | Uint8Array` files; they do
not touch the DOM.

## Register algorithms per engine

```ts
import { createColorEngine } from "@s9rg/colorwheel/core";
import type { HarmonyStrategy, StrategyReference } from "@s9rg/colorwheel/core";

interface OffsetOptions {
  offsets: readonly number[];
}

const brandHarmony: HarmonyStrategy<OffsetOptions> = {
  id: "com.example.harmony.brand",
  version: "1.0.0",
  create(seed, options, context) {
    const reference: StrategyReference<OffsetOptions> = {
      id: this.id,
      version: this.version,
      options
    };
    const base = context.convert(seed, "oklch");
    const colors = options.offsets.map((offset, index) => ({
      id: `brand-${index + 1}`,
      color: context.mapToGamut({ ...base, h: (base.h + offset + 360) % 360 }, "srgb").color
    }));

    return {
      colors,
      kind: "harmony",
      recipe: {
        type: "wheel",
        seed,
        harmony: {
          type: "custom",
          id: reference.id,
          version: reference.version,
          options
        },
        strategy: reference
      },
      provenance: {
        origin: "wheel",
        strategy: reference,
        seeds: [seed]
      }
    };
  }
};

const engine = createColorEngine({ harmonies: [brandHarmony] });
const palette = engine.createHarmony(
  {
    id: brandHarmony.id,
    version: brandHarmony.version,
    options: { offsets: [0, 42, 180] }
  },
  "#7857ff"
);
```

Registries are instance-local. Duplicate identities fail unless explicit
override is enabled. Strategy references are serializable; implementations are
trusted local code. Loading a palette never fetches, imports, installs, or
evaluates a strategy.

Options and strategy outputs are validated at runtime as finite JSON and valid
palette data. Keep IDs namespaced and version behavior when output changes.

## Invariants that are not customizable

Customization stops at interoperability and safety boundaries:

- colors are tagged with a supported space and finite channels;
- palette color IDs are unique and stable;
- portable documents contain JSON data, not functions or components;
- there is one live recipe and separate historical provenance;
- external updates do not masquerade as user events;
- strategy IDs and versions resolve deterministically inside an engine;
- plugin output is validated and bounded;
- default accessibility is claimed only for the default primitives;
- a two-dimensional control always has non-drag, scalar alternatives.

These constraints are what let independently authored blocks, frameworks, and
algorithms work with the same palette.
