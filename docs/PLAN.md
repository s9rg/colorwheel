# Delivery plan

This plan turns Colorwheel into a focused coding library and a small technical
showcase. The product reference is the workflow of Canva's color-wheel tool: a
useful wheel, an explicit seed color, a harmony choice, and an immediately
readable generated palette. The implementation and visual design remain
original.

The public architecture follows
[`RFC-0001-public-api.md`](./RFC-0001-public-api.md). Research claims and
limitations are tracked in [`RESEARCH.md`](./RESEARCH.md).

## Product definition

Colorwheel is one package, `@s9rg/colorwheel`, with three layers:

1. A portable color/palette core and versioned data model.
2. A headless editor controller with framework-neutral interaction behavior.
3. Native adapters for vanilla JavaScript, React, Vue, Angular, and React
   Native.

“Native adapter” is an implementation boundary, not a second product version.
Version one keeps one portable controller contract while every client owns its
platform render tree: Vanilla reconciles stable DOM nodes, React renders React,
Vue renders Vue VNodes, Angular renders Angular templates, and React Native
renders native views. No framework adapter mounts another adapter internally.

The primary UI is a color wheel and linked harmony palette editor. A palette is
always portable data; a rendered palette is an optional block, slot, template,
or application-owned component.

Customization is part of the product definition:

- state may be controlled as complete editor state or palette-only data;
- a caller may inject and own the controller;
- visual regions may be omitted, rearranged, decorated, or replaced;
- web adapters may use default styles, theme tokens, or unstyled mode;
- React Native uses native styles and renderers;
- algorithms, analysis, import, and export have typed extension points;
- documents, state validity, and accessibility remain explicit invariants.

## What the codebase contains

### Portable core

- Tagged color values, parsing, formatting, conversion, and gamut mapping.
- Palette data, recipes, provenance, validation, documents, and migration.
- Built-in harmony and tonal generation.
- Context-specific contrast, gamut, and perceptual-distance diagnostics.
- JSON import and JSON, CSS, and design-token export.
- Instance-local strategy registries for application-defined algorithms.

### Headless editor

- Immutable state, reducer, controller, commands, selectors, and transactions.
- Linked and free editing, locks, stable IDs, focus order, and anchor state.
- Start/update/commit interaction phases; `cancel()` closes with a final commit
  lifecycle event.
- Pure wheel geometry and accessibility binding data.

### Framework adapters

- Vanilla: imperative `mountColorwheel`, stable keyed DOM reconciliation,
  lifecycle cleanup, and a replaceable palette renderer. `/vanilla` is the
  documented path; `/dom` remains compatible.
- React: a preset, compound blocks, hooks, custom pointers/swatches, and web
  theme hooks.
- Vue: a Vue-owned component tree, controlled models, native slots,
  composables, context selectors, and typed component factory.
- Angular: Angular-owned templates, a standalone component, paired
  inputs/outputs, and stable projected wheel/palette templates.
- React Native: native wheel/palette blocks, gestures, accessibility actions,
  SVG rendering, hooks, and native customization props.

### Project material

- A GitHub Pages-compatible technical demo.
- API, customization, research, contribution, security, conduct, and changelog
  documents.
- Unit, type, adapter, package-consumer, size, and browser test infrastructure.

## Work to finish

### 1. Refine the default tool

- Start with a bright, useful seed and a linked complementary palette.
- Keep seed input, harmony selection, wheel, palette strip, and export actions
  visible as one workflow.
- Fix remaining pointer/touch edge cases, including capture loss, cancellation,
  and dragging near wheel boundaries.
- Make linked and free editing understandable without exposing internal editor
  terminology.
- Verify that locked, active, and anchor states remain clear.

Exit criteria: the default tool is useful without configuration, every drag has
a non-drag alternative, and its initial state demonstrates the intended color
workflow.

### 2. Finish the technical showcase

- Lead with the working tool and a restrained description.
- Provide installation tabs for vanilla, React, Vue, Angular, and React Native;
  every tab installs the same package and changes only the import/example.
- Pair each framework preview with concise, copyable code.
- Include an API table for ownership, presentation, callbacks, composition, and
  export.
- Remove editorial copy, duplicate examples, progress panels, and claims that
  are not supported by the library.
- Keep the footer and source/research links concise.

Exit criteria: the page reads as documentation for a coding library, the live
example is the main visual element, and every shown import matches a package
export.

### 3. Verify framework contracts

- Run framework-specific unit and type tests for React, Vue, Angular, and React
  Native.
- Verify controlled-value rejection/reconciliation and callback metadata.
- Verify injected controllers are not destroyed by adapters.
- Verify owned controllers clean up on unmount and development lifecycle
  replays.
- Verify Vue and Angular server rendering does not mount browser DOM.
- Verify React Native uses no DOM or web CSS dependency.

Exit criteria: all adapters preserve the same state transitions and ownership
rules while rendering through their platform's native composition mechanism.

### 4. Browser, device, and accessibility QA

- Test Chromium, Firefox, and WebKit at desktop, tablet, phone, and 320 px
  widths.
- Exercise mouse, touch/coarse pointer, keyboard, and text/numeric controls.
- Check responsive layout, orientation, zoom/reflow, reduced motion, forced
  colors, RTL, and multiple instances.
- Run automated accessibility checks and manual keyboard review.
- Complete physical VoiceOver, NVDA, TalkBack, iPhone, and Android smoke checks
  recorded in [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md).

Exit criteria: no broken asset or route, no horizontal page overflow, complete
keyboard reachability, and recorded results for the manual matrix.

### 5. Package and documentation verification

- Build every public subpath from the single package.
- Verify ESM/CJS declarations where supported and Angular's package format.
- Verify optional peers do not leak into core/editor consumers.
- Check tarball contents, package metadata, exports, tree shaking, and size
  budgets.
- Compile public examples and check links, terminology, limitations, and
  changelog entries.
- Ensure the research ledger distinguishes implemented guidance from future
  research.

Exit criteria: a clean consumer can import every documented adapter, portable
entry points load without UI peers, and documentation matches declarations.

### 6. Publish in order

1. Create `s9rg/colorwheel` with the MIT license and project history.
2. Push the reviewed source and enable GitHub Pages at `/colorwheel/`.
3. Smoke-test the deployed page, assets, routes, examples, and mobile layout.
4. Choose the package version and review the npm tarball with the project owner.
5. Publish `@s9rg/colorwheel`, verify each public subpath from a clean install,
   then create the matching GitHub release.

Publication is an owner-reviewed action; local implementation and verification
do not perform it implicitly.

## Architecture rules

- Core and editor code do not import a framework, React Native, or the DOM.
- Adapters reuse the controller; they do not duplicate color or generation
  algorithms.
- The root package is framework-neutral. UI dependencies remain optional peers.
- Serialized documents contain data and strategy references, never executable
  implementations.
- Custom strategy implementations are trusted local code and their output is
  validated.
- Default accessibility claims apply only to default primitives; replacements
  must preserve supplied semantic and interaction props.
- Hue relationships are guidance, not a universal beauty or accessibility
  score.

## Scope control

Qualitative, sequential, and diverging data-palette generation,
color-vision-deficiency simulation, and additional color-space research should
stabilize only with sources, limitations, fixtures, and an explicit public API.
They should not delay a coherent wheel-and-palette library.
