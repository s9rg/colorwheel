# Colorwheel consumer lab

This directory is an intentionally separate consumer project. It installs the
public `@s9rg/colorwheel@1.0.0` package from npm rather than importing this
repository's source tree. Its lockfile is the reproducible record of the exact
published package and framework versions under test.

It contains real small applications for:

- React
- Vanilla DOM
- Vue
- Angular
- React Native

## Run

Use Node.js 20.19.4+, 22.12+, or 24+ (CI uses Node 24). From this directory:

```sh
npm ci
npx playwright install chromium
npm run check
npm run dev
```

`npm run check` formats and type-checks every consumer (including Vue templates
and the Angular AOT compiler), builds the Vite applications and an Angular CLI
production application, and runs the same eight Chromium acceptance scenarios
against both the development servers and the built production output. It also
runs the React Native contract assertion and creates a production iOS Metro
bundle. `npm run dev` starts the Vite and Angular CLI development servers; the
lab index links to the Vanilla, React, Vue, and Angular applications.

The registry Angular app imports `@angular/compiler` as a JIT fallback for a
partial-Ivy marker escaping defect in the historical 1.0.0 artifact. That
published baseline is separate from the required release-candidate gate.

CI overlays the packed current commit without changing this project's registry
lockfile, then runs **all five framework consumers** against that candidate:
browser development and production journeys, framework type checks, and the
React Native Metro bundle. The Angular candidate uses
`angular/src/main.candidate.ts` without a JIT fallback. An additional focused
Angular job retains explicit linker verification. To repeat the full gate after
installing a candidate tarball:

```sh
COLORWHEEL_CANDIDATE_VERSION=1.1.1 npm run check:candidate
```

Useful focused checks:

```sh
npm run typecheck:web
npm run build:web
COLORWHEEL_CANDIDATE_VERSION=1.1.1 npm run check:angular:candidate
npm run typecheck:native
npm run test:native-contract
npm run test:browser
npm run test:browser:production
npm run bundle:native
```

The React Native app deliberately has no generated `ios/` or `android/`
project. TypeScript and Metro therefore prove public-package resolution,
declarations, and transformation without requiring Xcode or Android Studio.
They do not prove application launch, native SVG rendering, touch gestures,
focus recovery, safe-area behavior, VoiceOver, or TalkBack; those checks still
require a native host and physical devices.

Generated web, native-bundle, browser-report, and dependency directories are
ignored and must not be committed.
