# Contributing

Thank you for helping improve the project.

## Before opening a change

- Search existing issues and discussions.
- For public API changes, start with a proposal or RFC update before
  implementation.
- For color algorithms, include the source, assumptions, limitations, reference
  fixtures, and intended stability level.
- Keep framework-specific code out of the core and editor layers. Add an adapter
  through its existing `@s9rg/colorwheel/<framework>` subpath rather than a new
  package.

## Local setup

Use Node.js 20.19 or newer and npm:

```sh
npm install
npm run dev
```

Before requesting review, run:

```sh
npm run check
npm run test:browser
npm run check:release
```

Web-adapter changes should be checked with keyboard, touch or coarse-pointer
emulation, narrow and wide layouts, and Chromium, Firefox, and WebKit. React
Native changes should cover native gestures, accessibility actions, hardware-
reachable adjustment controls, and cleanup on unmount.

## Code expectations

- Add tests for behavior and regression fixes.
- Preserve stable IDs, immutable state transitions, and serialized data.
- Use built-in extension contracts for built-in strategies and blocks.
- Keep ownership behavior consistent across adapters: one controller, complete
  state, palette, or uncontrolled default source.
- Render through the target framework's native composition mechanism. Do not
  wrap the React web adapter in Vue, Angular, or React Native.
- Keep UI framework imports out of the root, `/core`, `/editor`, and other
  unrelated adapter entry points.
- Do not hide accessibility semantics inside visual-only implementations.
- Avoid subjective universal quality scores for palettes.
- Update the API, customization guide, examples, and changelog when a public
  adapter contract changes. Document breaking changes and migrations.

## Commit and pull-request guidance

Keep changes focused. Describe the user-visible outcome, testing performed,
accessibility impact, and any research or compatibility tradeoffs.

By contributing, you agree that your contribution is licensed under this
project's MIT license.
