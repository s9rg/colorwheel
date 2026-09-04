# Changelog

This file records user-visible changes. Dates use the ISO `YYYY-MM-DD` format.

## 1.1.0 - 2026-09-04

### Added

- Added a live theme builder to the GitHub Pages demo. The current Colorwheel
  palette can now compile into previewable, inspectable, and downloadable theme
  files for DTCG, CSS custom properties, Tailwind CSS, MUI, Ant Design,
  shadcn/ui, daisyUI, Vuetify, Angular Material, Ionic, and React Native Paper
  through `@s9rg/theme-compiler` 0.6.0.
- Added deterministic third-party notices for the demo's theme compiler and
  adapters.

### Changed

- Kept the theme-builder integration demo-only. Version 1.1.0 does not change
  Colorwheel's public package runtime, API, exports, or runtime dependencies.

## 1.0.1 - 2026-08-25

### Added

- Added a registry-backed consumer lab for React, Vanilla, Vue, Angular, and
  React Native, including AOT/template checks, development and production
  browser journeys, responsive assertions, and a Metro production bundle.

### Fixed

- Preserved literal Angular partial-Ivy declaration markers so Angular CLI can
  run its linker in development builds without loading the JIT compiler.
- Made Vanilla `focus({ type: "wheel" })` target the editable roving wheel
  handle and fall back to the picker root when no handle can receive focus.

## 1.0.0 - 2026-08-24

### Added

- Added a framework-neutral color core with tagged sRGB, Display-P3, HSL, HSV,
  and OKLCH values; CSS-subset parsing and formatting; conversion through XYZ
  D65 and OKLab; explicit gamut mapping; contrast; and perceptual distance.
- Added versioned palette documents with JSON validation, migrations, resource
  limits, stable IDs, live-recipe/provenance separation, and metadata
  preservation.
- Added single, complementary, analogous, triadic, tetradic,
  split-complementary, monochromatic, and tonal palette generation.
- Added an instance-scoped strategy engine for custom harmonies, generators,
  validators, analyzers, gamut policies, importers, and exporters. Built-ins use
  the same contracts.
- Added context-aware gamut, WCAG contrast, and pairwise perceptual-distance
  diagnostics without a universal palette score.
- Added JSON import and JSON, CSS custom-property, and design-token export.
- Added a framework-neutral picker reducer and controller with commands,
  selectors, transactions, subscriptions, linked/free editing, stable focus
  order, interaction phases, geometry, and accessibility bindings.
- Added stable recipe seed ownership by palette color ID, including reorder and
  document round-trip preservation, stable strategy-slot ID mappings, safe
  legacy inference, and achromatic endpoint recovery without transferring
  hidden hue or chroma to another color.
- Tightened runtime validation, serialization, and reentrant notification
  invariants while keeping the core size budget unchanged; raised the editor
  and affected adapter Brotli budgets by 1 kB to account for those correctness
  boundaries.
- Added a clean-room, model-aware outer channel ring to the React and vanilla
  web wheels. It edits HSV value or OKLCH lightness and is backed by exported,
  framework-neutral channel and ring-geometry helpers.
- Refined the outer ring with uniform arc geometry, retained left/right drag
  placement, coherent vertical keyboard direction, stable vanilla pointer
  capture, complete thumb outlines, a seam-free conic track, and linked hue or
  chroma recovery through achromatic endpoints.
- Added a composable React adapter with controlled palette or state modes,
  independent wheel/palette/control/diagnostic/export blocks, custom pointers
  and swatches, hooks, block replacement, unstyled mode, and an optional
  complete preset.
- Added a vanilla DOM adapter with isolated or injected controllers, stable
  keyed reconciliation, mount-once custom palette renderers, external updates
  without callback echo, pointer/touch, keyboard, text/numeric alternatives,
  deterministic cleanup, configurable blocks, and harmony relationship lines.
- Added a Vue 3 adapter with a Vue-owned render tree, controlled state and
  palette models, native pointer/swatch/block slots, a headless composable,
  context selectors, metadata-specialized components, native SSR markup, and
  deterministic cleanup.
- Added a standalone Angular adapter with Angular-owned wheel and palette
  templates, controlled inputs and paired outputs, detailed change metadata,
  configurable native blocks, stable projected templates, deterministic SSR
  markup, and caller-owned controller support.
- Added a React Native adapter with native wheel and palette blocks, gestures,
  model-aware third-channel controls, accessibility actions and adjustment
  buttons, memoized SVG rendering, hooks, native style props, and replaceable
  graphics, handles, swatches, and layouts.
- Added `@s9rg/colorwheel/vanilla` as the documented browser-adapter subpath
  while retaining `@s9rg/colorwheel/dom` as a compatibility entry point.
- Added a GitHub Pages-compatible technical demo with a live wheel and harmony
  palette, framework installation/code examples, API documentation, and export
  examples.
- Added a dependency-free seed-color popover with an HSV field, accessible
  scalar controls, hex editing, and compact Copy/Download actions over the
  export editor.
- Added unit, property, controller, adapter, package-consumer, bundle-size, and
  production-browser coverage across Chromium, Firefox, WebKit, phone, tablet,
  and 320 px profiles.
- Added the public API RFC, research ledger, API and customization guides,
  release checklist, contribution guide, code of conduct, security policy,
  GitHub templates, CI, and Pages deployment workflow.

### Changed

- Kept the HSV wheel surface legible for near-black colors while preserving the
  exact selected color and exposed the presentation floor as a CSS token.
- Renamed the framework-neutral project to Colorwheel, with the intended
  repository `s9rg/colorwheel`, npm package `@s9rg/colorwheel`, and Pages
  base path `/colorwheel/`.
- Rebuilt the public API around portable palette data, a headless editor,
  composable blocks, and framework adapters.
- Kept the renderer rewrite inside version one: Vanilla now reconciles stable
  DOM nodes, while React, Vue, Angular, and React Native each own a native
  framework render tree over the same portable controller. No framework client
  mounts another adapter internally.
- Raised the editor, React, Vanilla, Vue, and React Native Brotli budgets by
  1 kB, and Angular by 2 kB, for serialized notifications, native renderer
  lifecycles, stable nodes, and accessibility guarantees; the measured v1
  entries remain below those explicit caps.
- Kept framework clients in one `@s9rg/colorwheel` package with `/vanilla`,
  `/react`, `/vue`, `/angular`, and `/react-native` subpath exports.
- Declared UI frameworks and native rendering dependencies as optional peers so
  core and editor consumers do not install or load an adapter framework.
- Made custom harmony recipes unambiguously discriminated with
  `type: "custom"`, a namespaced strategy ID, version, and options while keeping
  concise built-in harmony rules.
- Limited the optional React peer range to tested React 18 and 19 majors and
  included the API, customization, research, contribution, conduct, and
  security documentation in the npm artifact.

### Removed

- Removed the incomplete legacy implementation, copied assets, obsolete build
  system, stale branding, and dependencies. Version one is an original
  clean-room implementation.

### Security

- Added strict finite-JSON validation, palette and metadata limits, strategy
  output validation, collision-safe instance registries, and sanitized export
  filenames/selectors/token names.
- Added runtime validation and canonicalization at editor state, command, and
  public reducer boundaries so malformed untyped JavaScript actions cannot put
  non-finite colors or non-JSON metadata into picker state.
- Palette documents never auto-install, fetch, import, or evaluate strategy
  implementations.
