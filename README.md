# Colorwheel

A customizable color wheel and palette editor with a portable core, headless
controller, and adapters for vanilla JavaScript, React, Vue, Angular, and React
Native.

Colorwheel treats the palette as data. The same `Palette` value can be generated,
edited, analyzed, serialized, exported, or rendered by any adapter. The color
engine and editor do not depend on a browser or UI framework.

Each client renders natively for its platform over that shared controller:
stable DOM for Vanilla, framework-owned trees for React, Vue, and Angular, and
native views for React Native. The framework adapters do not embed one another.

[Try the live demo](https://s9rg.github.io/colorwheel/) to edit a Colorwheel
palette, preview light and dark themes, inspect generated code, and download a
theme for 11 popular targets. Theme generation uses `@s9rg/theme-compiler`
0.6.0 and its adapters in the demo only; they are not Colorwheel runtime
dependencies.

## Features

- Single, complementary, analogous, triadic, tetradic,
  split-complementary, monochromatic, tonal, and manual palettes.
- Tagged sRGB, Display-P3, HSL, HSV, and OKLCH values with explicit gamut
  mapping.
- Editable names, roles, locks, order, active color, and harmony anchor.
- Linked harmony editing or independent color editing.
- A model-aware outer channel ring for HSV value or OKLCH lightness around the
  inner hue/radius surface.
- Pointer, touch, keyboard, text, and numeric interaction paths.
- Versioned palette documents and JSON, CSS custom-property, and design-token
  export.
- Context-aware contrast, gamut, and perceptual-distance diagnostics.
- Replaceable blocks, slots, renderers, theme tokens, and a headless controller.

## Install

Colorwheel is one package. Framework clients are package subpath exports, not
separate packages:

```sh
npm install @s9rg/colorwheel
```

Use the subpath for your application:

```ts
import { mountColorwheel } from "@s9rg/colorwheel/vanilla";
import { Picker } from "@s9rg/colorwheel/react";
import { Colorwheel } from "@s9rg/colorwheel/vue";
import { ColorwheelComponent } from "@s9rg/colorwheel/angular";
import { Picker as NativePicker } from "@s9rg/colorwheel/react-native";
```

The framework adapters use optional peer dependencies. Install the framework
you use in the normal way. React Native's default wheel also uses
`react-native-svg`:

```sh
npm install react-native-svg
```

## React

```tsx
import { useState } from "react";
import { createHarmonyPalette } from "@s9rg/colorwheel/core";
import { Picker } from "@s9rg/colorwheel/react";
import "@s9rg/colorwheel/styles.css";

const initial = createHarmonyPalette({
  seed: "#1ecbe1",
  harmony: { type: "complementary" }
});

export function PaletteEditor() {
  const [palette, setPalette] = useState(initial);

  return (
    <Picker
      palette={palette}
      onPaletteChange={setPalette}
      blocks={{ diagnostics: false }}
      aria-label="Brand palette editor"
    />
  );
}
```

Use `Picker.Root`, `Picker.Wheel`, `Picker.Palette`, `Picker.Controls`,
`Picker.Diagnostics`, and `Picker.Export` to compose a different layout. Hooks
provide the same controller and selected state to application-owned blocks.
The web wheel includes its outer value/lightness ring by default; pass
`showChannelRing={false}` to `Picker.Wheel` or through `blockProps.wheel` to
omit it.

## Vanilla JavaScript

```ts
import { mountColorwheel } from "@s9rg/colorwheel/vanilla";
import "@s9rg/colorwheel/styles.css";

const host = document.querySelector<HTMLElement>("#colorwheel");
if (!host) throw new Error("Missing Colorwheel host");

const colorwheel = mountColorwheel(host, {
  ariaLabel: "Brand palette editor",
  onPaletteChange(palette, meta) {
    if (meta.phase === "commit") savePalette(palette);
  }
});

// Call when the host is removed.
colorwheel.destroy();
```

`@s9rg/colorwheel/dom` remains an alias-compatible entry point for existing
browser-adapter imports. New examples use `/vanilla`. Use `blockProps.wheel`
and `blockProps.palette` to configure the built-in blocks without replacing
their behavior. The vanilla wheel also enables the outer channel ring by
default; set `blockProps.wheel.showChannelRing` to `false` to omit it.

## Vue 3

```vue
<script setup lang="ts">
import { ref } from "vue";
import { createHarmonyPalette } from "@s9rg/colorwheel/core";
import { Colorwheel } from "@s9rg/colorwheel/vue";
import "@s9rg/colorwheel/styles.css";

const palette = ref(
  createHarmonyPalette({
    seed: "#1ecbe1",
    harmony: { type: "complementary" }
  })
);
</script>

<template>
  <Colorwheel v-model:palette="palette" aria-label="Brand palette editor" />
</template>
```

The Vue adapter renders Vue-owned VNodes and also exports `useColorwheel`,
context composables, native `palette`, `pointer`, and `swatch` slots, and
`createColorwheelComponent<Metadata>()` for typed metadata.

## Angular

Import the standalone component and add the default stylesheet to the
application's global styles.

```ts
import { Component } from "@angular/core";
import { createHarmonyPalette } from "@s9rg/colorwheel/core";
import { ColorwheelComponent } from "@s9rg/colorwheel/angular";

@Component({
  selector: "app-palette-editor",
  standalone: true,
  imports: [ColorwheelComponent],
  template: `
    <s9rg-colorwheel
      [palette]="palette"
      (paletteChange)="palette = $event"
      ariaLabel="Brand palette editor"
    />
  `
})
export class PaletteEditorComponent {
  palette = createHarmonyPalette({
    seed: "#1ecbe1",
    harmony: { type: "complementary" }
  });
}
```

```css
@import "@s9rg/colorwheel/styles.css";
```

Use `[(palette)]`, `[(value)]`, or an injected controller for other ownership
modes. `ColorwheelPaletteTemplateDirective` and
`ColorwheelWheelTemplateDirective` replace the corresponding Angular-native
blocks with stable projected templates. The component also renders
deterministic wheel and palette markup during server rendering.

## React Native

```tsx
import { createHarmonyPalette } from "@s9rg/colorwheel/core";
import { Picker } from "@s9rg/colorwheel/react-native";

const palette = createHarmonyPalette({
  seed: "#1ecbe1",
  harmony: { type: "complementary" }
});

export function NativePaletteEditor() {
  return (
    <Picker
      defaultPalette={palette}
      blockProps={{ wheel: { size: 280 }, palette: { showActions: true } }}
    />
  );
}
```

The native adapter renders React Native views and an SVG wheel; it does not use
the DOM or the web stylesheet. Compose `Picker.Root`, `Picker.Wheel`, and
`Picker.Palette`, or replace their graphics, handles, swatches, and layout.

## Core and headless editor

```ts
import { analyzePalette, createHarmonyPalette, exportPaletteCss } from "@s9rg/colorwheel/core";
import { createPickerController, createPickerState } from "@s9rg/colorwheel/editor";

const palette = createHarmonyPalette({
  seed: { space: "oklch", l: 0.7, c: 0.18, h: 285 },
  harmony: { type: "split-complementary", spread: 60 }
});

const controller = createPickerController(createPickerState({ palette }));
controller.commands.setLocked(palette.colors[0]!.id, true);

const diagnostics = analyzePalette(controller.getPalette(), {
  includeGamut: true,
  includePerceptualDistance: true
});
const css = exportPaletteCss(controller.getPalette());
```

External `setPalette` and `setState` operations synchronize state without
echoing through user-change callbacks. User interactions include `start`,
`update`, and `commit` phases so applications can defer analysis and persistence
until a commit. The `cancel()` method closes an interaction with a final
`commit` lifecycle event; `cancel` is not a separate `ChangePhase`.

## Package entry points

- `@s9rg/colorwheel` — framework-neutral core and editor exports.
- `@s9rg/colorwheel/core` — color math, palette data, generation, analysis,
  documents, import, and export.
- `@s9rg/colorwheel/editor` — state, controller, commands, selectors, geometry,
  and accessibility bindings.
- `@s9rg/colorwheel/vanilla` — imperative browser adapter.
- `@s9rg/colorwheel/dom` — compatibility alias for the vanilla adapter.
- `@s9rg/colorwheel/react` — React web components and hooks.
- `@s9rg/colorwheel/vue` — Vue 3 component and composables.
- `@s9rg/colorwheel/angular` — standalone Angular component and template
  directive.
- `@s9rg/colorwheel/react-native` — React Native components and hooks.
- `@s9rg/colorwheel/styles.css` — optional styles for the web adapters.

## Research and limitations

Colorwheel is **research-informed**. It does not claim that hue geometry can
prove a palette is beautiful or accessible in every context. Perception also
depends on lightness, chroma, surrounding colors, display conditions, task, and
the viewer. The core evaluates contrast only for declared color-ID pairs; the
React diagnostics default may infer one convenience pair from recognized role
names and is not a conformance claim.

The [research ledger](./docs/RESEARCH.md) records sources, implementation
choices, assumptions, and limitations. It includes CSS Color 4, CIE
colorimetry, WCAG 2.2, WAI-ARIA interaction guidance, empirical color-harmony
work, ColorBrewer, and research on perceptually organized data palettes.

## Documentation

- [Public API reference](./docs/API.md)
- [Customization guide](./docs/CUSTOMIZATION.md)
- [Research ledger](./docs/RESEARCH.md)
- [Public API RFC](./docs/RFC-0001-public-api.md)
- [Delivery plan](./docs/PLAN.md)
- [Contributing guide](./CONTRIBUTING.md)
- [Security policy](./SECURITY.md)
- [Code of conduct](./CODE_OF_CONDUCT.md)

## Development

Requirements: Node.js 20.19 or newer and npm.

```sh
npm install
npm run dev
```

Before proposing a change, run the relevant focused tests and then:

```sh
npm run check
npm run test:browser
npm run test:package
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for adapter and research expectations.

## License

MIT © Sergii Petryk
