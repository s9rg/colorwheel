# Version-one release checklist

This checklist is the source of truth for deciding whether Colorwheel may be
published. Browser emulation and automated accessibility rules are useful
signals; they do not replace testing with assistive technology and real touch
hardware.

Do not create a release tag or publish to npm until every mandatory item is
complete and its result is recorded below, unless the project owner records an
explicit release exception. The package publication guard may be removed only
after that approval and a green release candidate.

Release exception recorded 2026-08-24: the project owner approved version
1.0.0 for publication with the still-unavailable VoiceOver, TalkBack,
NVDA/JAWS, forced-colors, and physical-device gates left visibly open. Those
items are deferred verification work and are not represented as passed.

Patch-release exception recorded 2026-08-25: the project owner approved 1.0.1
with the same deferred manual gates. The patch corrects Angular package linking
and Vanilla focus targeting, and adds consumer acceptance coverage; it does not
claim new physical-device or assistive-technology certification.

Minor-release exception recorded 2026-09-04: the project owner approved 1.1.0
with the same deferred physical-device and assistive-technology gates left
visibly open. This release adds a demo-only theme-builder integration for 11
targets; Colorwheel's public package runtime and API are unchanged, and the
release does not claim new physical-device or assistive-technology
certification.

Patch-release approval recorded 2026-11-13: the project owner requested fixes
for all eight review findings, another independent review, and publication of
1.1.1 after the release gates pass. The existing physical-device and
assistive-technology deferrals remain visibly open; this patch does not claim
new manual certification.

## 1. API and scope freeze

- [x] Confirm the package name `@s9rg/colorwheel`.
- [x] Review every export from the root, core, editor, vanilla/DOM, React, Vue,
      Angular, and React Native entry points.
- [x] Confirm ordinary TypeScript interfaces work as palette metadata and
      strategy options.
- [x] Confirm palette-only, wheel-only, composed, and headless examples compile.
- [x] Confirm built-in strategies use the public strategy contracts.
- [x] Confirm JSON documents preserve unresolved strategy references and custom
      metadata.
- [x] Mark experimental or post-v1 work accurately; do not imply that
      qualitative, sequential, diverging, color-vision, custom-color-space, or
      OKLCH-wheel work is stable.

## 2. Automated local gates

Run from a clean checkout with the minimum supported Node version and again with
the current Node LTS:

```sh
npm ci
npm run check
npm run test:browser
npm run check:release
```

- [x] Formatting, lint, portable typecheck, and full typecheck pass.
- [x] Unit, property, controller, DOM, React, Vue, Angular, and React Native tests
      pass.
- [x] Coverage thresholds pass.
- [x] ESM, CommonJS, declaration, Angular partial-Ivy, stylesheet, and demo builds
      pass.
- [x] Bundle-size budgets pass.
- [x] `publint --strict` passes.
- [x] `@arethetypeswrong/cli` passes against the packed tarball.
- [x] Packed ESM, CommonJS, browser, React, Vue, Angular, React Native, and
      TypeScript consumer fixtures pass from temporary projects.
- [x] The tarball contains only intended files and no tests, credentials, local
      paths, legacy names, or unintended source maps.
- [x] `npm audit` reports no known production or development vulnerabilities,
      or each accepted exception is documented.

Local 1.0.1 patch evidence recorded 2026-08-25 with Node 22.14.0 and npm 10.9.2:
The integrated suite passes with 297 unit/property/adapter tests, all coverage
thresholds, all seven bundle budgets, 68 verified package files, and the packed
consumer matrix. The separate registry-backed lab passes eight development and
eight production Chromium cases plus Angular AOT, Vue template, React Native
type, contract, and Metro checks. `npm audit` reports zero vulnerabilities.
Clean-checkout Node 20.19, Node 22, and Node 24 checks are enforced by CI for
`main` and every pull request targeting it.

Local 1.1.0 evidence recorded 2026-09-04 with Node 22.14.0 and npm 10.9.2:
The integrated suite passes 315 unit/property/adapter/demo tests, all coverage
thresholds, all seven package bundle budgets, 68 verified package files, strict
package linting, and both type-resolution profiles. All 11 theme adapters
compile successfully, the Pages build verifies their third-party notices, and
`npm audit` reports zero vulnerabilities.

Local 1.1.1 evidence recorded 2026-11-13 with Node 22.14.0 and npm 10.9.2:
The integrated suite passes 336 unit/property/adapter/demo tests, all coverage
thresholds, formatting, lint, type checks, library/demo builds, and all seven
bundle budgets. Root and consumer-lab dependency audits report zero
vulnerabilities. Independent follow-up review covered the core boundaries,
adapter state/lifecycles, seed picker, dependencies, and release workflows;
additional findings were fixed with regressions before sign-off.
The packed candidate passes strict package linting, both type-resolution
profiles, and fresh package-consumer fixtures (68 intended files). The full
consumer lab runs against that same candidate and passes all framework type
checks, Angular CLI development/production linking, eight development and eight
production browser cases, native contracts, and a production Metro iOS bundle.

## 3. Automated production-browser gates

The suite must build the static demo and preview it at the exact GitHub Pages
subpath: `/colorwheel/`.

- [x] Desktop Chromium passes.
- [x] Desktop Firefox passes.
- [x] Desktop WebKit passes.
- [x] Pixel-class mobile Chromium profile passes.
- [x] iPhone-class mobile WebKit profile passes.
- [x] Tablet profile passes.
- [x] The explicit 320 px viewport has no horizontal overflow.
- [x] No failed assets, uncaught page errors, or unexpected console errors.
- [x] The primary harmony, wheel, palette edit, and export journey passes.
- [x] Keyboard editing and explicit channel controls work without dragging.
- [x] Framework install, code, and API tabs describe all shipped entry points.
- [x] Automated accessibility scan reports no violations at any impact level.
- [x] Screenshots have been inspected across every page section at desktop,
      phone, tablet, and 320 px widths—not merely generated.

The 1.0.1 production-path matrix contained 168 cases across six projects: 161
passed and seven were intentionally skipped where pointer dragging or the
explicit 320 px check would duplicate the relevant engine coverage.

The local 1.1.0 production-path matrix contains 198 cases across Chromium,
Firefox, WebKit, phone, and tablet projects: 186 passed and 12 were
intentionally skipped where the all-adapter matrix, pointer dragging, or the
explicit 320 px check would duplicate the relevant engine coverage. These
results are emulated browser/device evidence, not physical-device sign-off.

The local 1.1.1 production-path matrix passes 192 cases across the same six
projects, with 12 intentional duplicate-coverage skips. Axe 4.14 reports no
violations in the dialogs, web adapters, theme builder, or manual test surface.
Playwright is pinned to 1.62.1 because the newer Firefox runtime crashed during
otherwise unchanged accessibility scans; all assertions and rules remain enabled.

## 4. Manual desktop and assistive-technology gates

Record tester, device or VM, operating-system version, browser version, date,
and notes in the release issue.

- [ ] macOS Safari with VoiceOver: landmarks, wheel description, handles,
      channel alternatives, palette editing, errors, reorder, and focus recovery.
- [ ] Windows Chrome with NVDA: the same end-to-end journey.
- [ ] Windows Firefox with NVDA: the same end-to-end journey.
- [ ] Keyboard-only Chrome, Firefox, and Safari: visible focus, logical order,
      no traps, and every operation available without pointer input.
- [ ] Windows forced-colors/high-contrast mode: controls, handles, selections,
      warnings, and focus remain perceivable.
- [ ] 200% and 400% zoom/reflow: content remains usable without two-dimensional
      scrolling.
- [ ] Reduced-motion preference: no required information depends on animation.
- [ ] RTL smoke test: labels and reading order remain coherent.

Manual evidence recorded 2026-08-24: a complete keyboard journey was exercised
in the live Chromium page, including tablists, the relationship combobox, seed
dialog, wheel handles, channel ring, invalid text entry, and focus retention.
The same journey still requires manual repetition in Firefox and Safari. A
macOS 15.5 VoiceOver attempt reached the in-app browser only as an empty system
dialog, so it is not counted as Safari/VoiceOver sign-off. No Windows AT or
physical Android test environment was available; those gates remain open.

## 5. Physical mobile gates

These are mandatory. Simulator or Playwright device profiles do not count.

- [ ] Physical iPhone Safari with touch.
- [ ] Physical iPhone Safari with VoiceOver and touch exploration.
- [ ] Physical Android Chrome with touch.
- [ ] Physical Android Chrome with TalkBack.
- [ ] Portrait and landscape layouts on both platforms.
- [ ] Wheel tap/drag, explicit channel controls, text entry, locking, reorder,
      add/remove, diagnostics, and export all work.
- [ ] Interactive targets are reliably operable with coarse pointer input and
      the page does not move accidentally during wheel manipulation.

## 6. Documentation and project hygiene

- [x] README install, vanilla/DOM, React, Vue, Angular, React Native, headless,
      customization, limitations, and support examples match the packed
      package.
- [x] API RFC and research ledger have been re-reviewed against final stable v1
      behavior and claims.
- [x] Changelog lists every user-visible v1 capability and limitation.
- [x] Contribution guide, code of conduct, security policy, license, issue
      templates, and pull-request template are present.
- [x] Repository search finds no legacy project name, implementation, copied
      documentation, or prohibited dependency/reference.
- [x] Demo contains working links, correct metadata, and no claims that exceed
      the evidence.

## 7. GitHub repository and Pages

- [x] Create the public repository `s9rg/colorwheel` only after the local
      release candidate is green.
- [x] Push `main` and confirm required CI checks pass on GitHub.
- [x] Enable GitHub Pages through Actions.
- [x] Confirm <https://s9rg.github.io/colorwheel/> returns the deployed commit.
- [x] Repeat the production smoke journey against the public URL.
- [x] Check direct asset requests, cache behavior, social metadata, and the
      GitHub link.

## 8. npm publication ceremony

- [x] Replace `0.0.0` with the approved v1 version and move changelog entries
      from Unreleased.
- [x] Remove `private: true` in the release commit only.
- [ ] Re-run `npm ci && npm run check:release && npm run test:browser` from
      that exact commit.
- [ ] Inspect `npm pack --dry-run` and the generated tarball manually.
- [ ] Confirm npm authentication, organization scope, provenance/trusted
      publishing setup, and public access.
- [ ] Publish together with the project owner; never publish automatically from
      an unreviewed local state.
- [ ] Install the registry package into fresh ESM, CommonJS, vanilla, React,
      Vue, Angular, and React Native smoke projects.
- [ ] Verify `npm view @s9rg/colorwheel` metadata, files, exports, license,
      provenance, README, repository, and homepage.
- [ ] Tag the exact published commit, create the GitHub release, and attach or
      link the release notes.

## Sign-off

- Release candidate commit:
- Proposed version: 1.1.1
- Automated gates completed by/date:
- Desktop accessibility completed by/date:
- iPhone testing completed by/date:
- Android testing completed by/date:
- GitHub Pages public smoke completed by/date:
- npm publication approved by/date: project owner / 2026-11-13, conditional on green release gates
- Published package and integrity:
