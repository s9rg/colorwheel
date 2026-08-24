# Research ledger

This ledger connects product behavior to sources, assumptions, limitations, and
testable implementation decisions. It is not evidence that aesthetic preference
is universal. Sources and links were reviewed for the v1 release candidate on
2026-08-24.

## Evidence policy

Colorwheel uses three different kinds of guidance and does not present them as
equivalent:

1. Standards and specifications define color spaces, serialization, contrast
   calculations, and accessibility requirements. CSS Color 4 is still a W3C
   Candidate Recommendation Draft; DTCG 2025.10 is a stable Final Community
   Group Report, not a W3C Standard.
2. Peer-reviewed color and visualization research informs models, task
   categories, and cautions.
3. Widely recognized design-tool conventions inform learnable interaction, but
   are not treated as scientific proof of harmony.

Every stable strategy must document its source, resolved defaults, algorithm
version, output gamut, assumptions, limitations, and deterministic fixtures.
Correctness is tested with published/reference vectors where available,
round-trip tolerances, malformed input, and bounded property tests. Subjective
claims require user research; no formula is relabeled as user preference.

## Color representation

### CSS Color Module Level 4

Source: <https://www.w3.org/TR/css-color-4/>

Use:

- Definitions and conversion guidance for sRGB, linear-light sRGB, XYZ, OKLab,
  OKLCH, and Display-P3.
- Color-difference and gamut-mapping considerations.

V1 decision:

- Structured colors always carry an explicit space tag.
- Conversion uses D65 matrices and OKLab/OKLCH equations with reference-vector
  and round-trip tests.
- Out-of-gamut RGB results are normally mapped by preserving OKLCH lightness and
  hue while binary-searching chroma; a named channel-clipping fallback covers
  numerical edge cases. `GamutResult` reports whether mapping occurred, the
  method, and the resulting Euclidean OKLab distance.
- The parser supports a documented standalone subset rather than delegating to a
  browser and producing environment-dependent results.

Limitations:

- The initial parser intentionally supports a documented subset of CSS color
  syntax. Context-dependent values such as `currentColor` and variables are not
  standalone colors.
- An OKLCH wheel is not a geometrically uniform in-gamut disc because available
  chroma varies by hue and lightness. It remains experimental until that behavior
  is designed and tested clearly.
- The v1 chroma-reduction mapper is deterministic and understandable, but it is
  not the CSS Color 4 local-MINDE algorithm and `parseColor` is not a conforming
  implementation of the full CSS `<color>` grammar.
- Euclidean OKLab distance is a useful engineering signal; the default `0.02`
  pair warning is a configurable heuristic, not a universal just-noticeable
  difference.

### CIE colorimetry

Source: <https://www.cie.co.at/publications/colorimetry-4th-edition>

Use:

- Colorimetric foundations, reference white assumptions, and color-difference
  interpretation.

### Design Tokens Community Group 2025.10

Sources:

- <https://www.designtokens.org/TR/2025.10/format/>
- <https://www.designtokens.org/TR/2025.10/color/>

Use:

- The stable Final Community Group Report's file format, preferred
  `application/design-tokens+json` media type, and `.tokens.json` extension.
- Typed color values with `colorSpace`, numeric `components`, optional `alpha`,
  and an optional six-digit sRGB `hex` fallback.

V1 decision:

- Design-token export emits the stable 2025.10 color-value shape and inherits
  `$type: "color"` from the palette group.
- Token names are deterministically normalized and de-duplicated without
  treating prototype-like names as object internals.

Limitation:

- V1 exports flat palette groups. It does not create aliases, themes, or
  resolver documents and does not imply compatibility with every vendor's
  proprietary token extensions.

## Harmony

### Ou and Luo two-color harmony model

Source: <https://doi.org/10.1002/col.20208>

Use:

- Evidence from a constrained psychophysical experiment that two-color harmony
  ratings varied with hue, lightness, and chroma-related factors.
- Evidence that systematically selecting colors from an ordered color space did
  not necessarily produce positive harmony ratings in that experiment.

Limitations:

- A model derived from controlled two-color experiments is not treated as a
  universal score for arbitrary multi-color product palettes.
- The paper adopts a definition linking harmony to pleasantness and explicitly
  describes that link as a hypothesis requiring further verification. It does
  not support claiming that the two are distinct judgments.
- Colorwheel does not implement the Ou–Luo model as a generator or score.

### Schloss and Palmer pair preference and harmony study

Source: <https://doi.org/10.3758/s13414-010-0027-0>

Use:

- Empirical support, for simple two-color figure/ground stimuli, for treating
  preference for a pair and perceived harmony of that pair as different
  judgments.

Limitation:

- This distinction does not predict an individual's preference, generalize by
  itself to arbitrary multi-color layouts, or turn hue geometry into an
  aesthetic score.

### Geometric harmony conventions

Product reference: <https://www.canva.com/colors/color-wheel/>

Use:

- Familiar complementary, monochromatic, analogous, triadic, and tetradic
  workflows.

V1 decision:

- The wheel implements single, complementary, analogous, triadic, tetradic,
  split-complementary, and monochromatic relationships.
- Angles, count, spread, and output gamut resolve to explicit, versioned recipe
  options. Built-ins using the default ID factory produce deterministic palettes
  for fixed inputs; an application-supplied ID factory is application behavior.
- Monochromatic generation changes lightness/chroma instead of creating
  duplicate hue-only entries.
- The web wheel keeps its third channel separate from the two-dimensional
  surface: an outer ring edits HSV value or OKLCH lightness as real palette
  data.

Limitation:

- Angular relationships are exposed as useful design conventions, not proof of
  aesthetic quality.
- The Canva page is a design-workflow reference only, not an implementation
  dependency or scientific source. Its published copy describes choosing a base
  color and palette type and adjusting saturation and luminance, but does not
  normatively define the interactive control's data model. Colorwheel independently
  uses HSV value or OKLCH lightness for its outer ring; no Canva code or assets
  are used.

## Tonal palettes

Color-space source: <https://www.w3.org/TR/css-color-4/#ok-lab>

Model rationale:

- OKLCH provides an interpretable lightness axis for constructing an ordered UI
  scale.

V1 decision:

- A tonal recipe records its seed, count, exact resolved lightness range, chroma
  scale, output gamut, strategy ID, and behavior version.
- The default scale is ordered from light to dark and preserves hue
  approximately subject to target-gamut constraints.
- A project-defined smooth envelope reduces requested chroma near the lightness
  extremes before gamut mapping. This is an engineering heuristic, not a result
  attributed to the cited harmony or visualization studies.

Limitations:

- A tonal scale is not automatically an accessible text system. Actual
  foreground/background combinations still require declared contrast checks.
- Ambient conditions, adjacent colors, font metrics, and display capability are
  outside the generator.
- The default lightness range, chroma envelope, and chroma scale have not been
  validated by user preference research and do not optimize WCAG contrast.

## Palette categories

### ColorBrewer

Source:
<https://www.cs.rpi.edu/~cutler/classes/visualization/S18/papers/colorbrewer.pdf>

Use:

- Separating qualitative, sequential, and diverging palettes by data task.
- Treating lightness ordering and meaningful midpoints as functional properties.

V1 decision:

- These categories are valid open palette kinds and shape the research roadmap,
  but generators are not included in the v1 release candidate.
- Sequential work must verify monotonic lightness; diverging work must define a
  meaningful midpoint and monotonic sides; qualitative work must avoid implying
  order and evaluate differentiation.

### Escaping RGBland

Source:
<https://www.zeileis.org/papers/Zeileis%2BHornik%2BMurrell-2009.pdf>

Use:

- Constructing data palettes along perceptually organized dimensions rather than
  arbitrary RGB channel paths.

Limitations:

- A general-purpose generator cannot infer the number of categories, map
  semantics, background, display conditions, or accessibility context.
- Color-vision-deficiency simulation and task-specific differentiation need
  separately validated models and are not claimed as stable v1 behavior.

## Accessibility

### WCAG 2.2

Sources:

- <https://www.w3.org/TR/WCAG22/>
- <https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html>
- <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>

Use:

- WCAG 2.x relative-luminance and contrast-ratio thresholds for declared usage
  pairs.
- Non-color cues, non-drag alternatives, and usable target sizing.
- Text/numeric and click/tap alternatives for wheel manipulation.

V1 decision:

- The framework-neutral analyzer runs contrast only for explicit color-ID pairs.
  `contrastRatio` composites alpha over an opaque canvas and currently defaults
  that canvas to white when one is not supplied; the canvas choice is project
  context, not something inferred by WCAG.
- Defaults use WCAG 2.x ratios: 4.5:1 for normal AA text, 3:1 for large AA text
  and non-text boundaries, 7:1 for normal AAA text, and 4.5:1 for large AAA
  text. Callers may supply an explicit ratio.
- The React diagnostics block schedules analysis on committed edits by default.
  As a convenience, it may infer one normal-text pair from the first
  `foreground`, `text`, or `on-background` entry and the first `background`,
  `surface`, or `canvas` entry (case-insensitive). Other adapters do not
  currently ship a diagnostics block.
- A visible web wheel handle has button semantics for selection and documented
  two-axis keyboard behavior. Separate scalar range controls provide the
  explicit hue/radial/value alternative.

Limitations:

- A palette alone cannot establish WCAG conformance. Contrast depends on actual
  foreground/background pairing, alpha compositing, text properties, and UI
  boundaries.
- Contrast inputs are mapped to sRGB before the WCAG 2.x calculation; v1 does
  not claim a separate wide-gamut contrast model.
- React's role-name inference is a component-default convenience, not proof of
  actual usage; applications making accessibility decisions should pass their
  own analysis function and explicit pairs/canvas.
- Passing an automated accessibility scan does not validate screen-reader touch
  interaction. The release checklist requires physical iPhone/VoiceOver and
  Android/TalkBack testing.

### WAI-ARIA slider guidance

Source: <https://www.w3.org/WAI/ARIA/apg/patterns/slider-multithumb/>

Use:

- Its guidance to keep multiple slider thumbs in a stable tab order.
- Its warning to test slider widgets with touch-based assistive technologies.

Limitation:

- The wheel is not a conforming instance of the multi-thumb slider pattern: its
  two-dimensional handles use button semantics, while separate native scalar
  controls expose hue/radius/value changes. This is Colorwheel's chosen
  accessibility model and still requires platform assistive-technology testing.

## Research-to-release gate

A research-informed feature is stable only when all of the following exist:

- a primary or authoritative source in this ledger;
- an implementation note separating facts, conventions, and project choices;
- deterministic provenance and versioned defaults;
- reference, boundary, malformed-input, and property tests appropriate to the
  algorithm;
- an API explanation of what the output optimizes;
- an explicit limitations section;
- a showcase example that does not overstate the evidence;
- accessibility and device verification appropriate to its UI.

Hue harmonies, tonal generation, explicit gamut mapping, WCAG 2.x ratio
calculation, and Euclidean OKLab distance are implemented in the v1 release
candidate. This ledger does not by itself mark the release gate complete; manual
accessibility, assistive-technology, physical-device, and visual checks are
tracked in [the release checklist](./RELEASE_CHECKLIST.md). Qualitative,
sequential, diverging, color-vision-simulation, arbitrary color-profile, and
polished OKLCH-wheel work remain post-v1.
