import { convertColor, resolveColor } from "./convert";
import { assertPalette } from "./document";
import { mapToGamut as importMapToGamut } from "./gamut";
import { clamp, lerp, normalizeHue } from "./math";
import type {
  BuiltInHarmonyRule,
  ColorInput,
  ColorValue,
  HarmonyRule,
  JsonObject,
  JsonValue,
  OklchColor,
  OutputGamut,
  Palette,
  PaletteColor,
  StrategyContext,
  StrategyIdentity,
  StrategyReference
} from "./types";

interface BuiltInHarmonyStrategy extends StrategyIdentity {
  create(seed: ColorValue, options: JsonObject, context: StrategyContext): Palette;
}

interface BuiltInPaletteGenerator extends StrategyIdentity {
  generate(options: JsonObject, context: StrategyContext): Palette;
}

export const BUILT_IN_STRATEGY_VERSION = "1.0.0";

export const BUILT_IN_HARMONY_IDS = {
  single: "harmony.single",
  complementary: "harmony.complementary",
  analogous: "harmony.analogous",
  triadic: "harmony.triadic",
  tetradic: "harmony.tetradic",
  "split-complementary": "harmony.split-complementary",
  monochromatic: "harmony.monochromatic"
} as const;

export const BUILT_IN_GENERATOR_IDS = {
  tonal: "generator.tonal"
} as const;

export interface HarmonyOptions {
  readonly seed: ColorInput;
  readonly harmony: HarmonyRule;
  readonly outputGamut?: OutputGamut;
  readonly name?: string;
  readonly idFactory?: (index: number, color: ColorValue) => string;
}

export interface TonalOptions {
  readonly seed: ColorInput;
  readonly count?: number;
  readonly outputGamut?: OutputGamut;
  /** Ordered start/end lightness values. Defaults to 0.97 -> 0.18. */
  readonly lightnessRange?: readonly [number, number];
  /** Multiplier applied to the seed chroma before gamut mapping. */
  readonly chromaScale?: number;
  readonly name?: string;
  readonly idFactory?: (index: number, color: ColorValue) => string;
}

export class UnknownHarmonyRuleError extends Error {
  readonly ruleType: string;

  constructor(ruleType: string) {
    super(
      `No built-in harmony strategy exists for ${JSON.stringify(ruleType)}; use a ColorEngine with a registered custom strategy`
    );
    this.name = "UnknownHarmonyRuleError";
    this.ruleType = ruleType;
  }
}

function numberOption(
  options: JsonObject,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const value = options[name] ?? fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be a finite number between ${minimum} and ${maximum}`);
  }
  return value;
}

function integerOption(
  options: JsonObject,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const value = numberOption(options, name, fallback, minimum, maximum);
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be an integer`);
  return value;
}

function stringOption(options: JsonObject, name: string): string | undefined {
  const value = options[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new TypeError(`${name} must be a string`);
  return value;
}

function gamutOption(options: JsonObject): OutputGamut {
  const value = options.outputGamut ?? "srgb";
  if (value !== "srgb" && value !== "display-p3") {
    throw new TypeError("outputGamut must be srgb or display-p3");
  }
  return value;
}

function paletteColors(
  candidates: readonly OklchColor[],
  gamut: OutputGamut,
  context: StrategyContext
): readonly PaletteColor[] {
  return candidates.map((candidate, index) => ({
    id: `color-${index + 1}`,
    color: context.mapToGamut(candidate, gamut).color
  }));
}

function harmonyPalette(
  strategy: StrategyReference,
  seed: ColorValue,
  rule: BuiltInHarmonyRule,
  candidates: readonly OklchColor[],
  seedIndex: number,
  options: JsonObject,
  context: StrategyContext
): Palette {
  const colors = paletteColors(candidates, gamutOption(options), context);
  const seedColorId = colors[seedIndex]?.id;
  const palette: Palette = {
    colors,
    kind: "harmony",
    recipe: {
      type: "wheel",
      seed,
      ...(seedColorId === undefined ? {} : { seedColorId }),
      colorSlotIds: colors.map((entry) => entry.id),
      harmony: rule,
      strategy
    },
    provenance: { origin: "wheel", strategy, seeds: [seed] },
    ...(() => {
      const name = stringOption(options, "name");
      return name === undefined ? {} : { name };
    })()
  };
  assertPalette(palette);
  return palette;
}

function hueCandidates(seed: ColorValue, offsets: readonly number[]): readonly OklchColor[] {
  const base = convertColor(seed, "oklch");
  return offsets.map((offset) => ({
    space: "oklch",
    l: clamp(base.l),
    c: clamp(base.c, 0, 0.5),
    h: normalizeHue(base.h + offset),
    ...(base.alpha === undefined ? {} : { alpha: base.alpha })
  }));
}

function tonalCandidates(
  seed: ColorValue,
  count: number,
  start: number,
  end: number,
  chromaScale: number
): readonly OklchColor[] {
  const base = convertColor(seed, "oklch");
  return Array.from({ length: count }, (_, index) => {
    const amount = count === 1 ? 0.5 : index / (count - 1);
    const l = lerp(start, end, amount);
    // Available chroma naturally falls near white and black. This smooth envelope
    // avoids asking gamut mapping to flatten all extreme tones to the same edge.
    const envelope = 0.28 + 0.72 * Math.sin(Math.PI * clamp(l));
    return {
      space: "oklch",
      l,
      c: clamp(base.c * chromaScale * envelope, 0, 0.5),
      h: base.h,
      ...(base.alpha === undefined ? {} : { alpha: base.alpha })
    };
  });
}

function strategy(
  type: keyof typeof BUILT_IN_HARMONY_IDS,
  createRule: (options: JsonObject) => BuiltInHarmonyRule,
  offsets: (options: JsonObject) => readonly number[],
  resolveSeedIndex?: (options: JsonObject, offsets: readonly number[]) => number
): BuiltInHarmonyStrategy {
  const id = BUILT_IN_HARMONY_IDS[type];
  return {
    id,
    version: BUILT_IN_STRATEGY_VERSION,
    create(seed, options, context) {
      const rule = createRule(options);
      const reference: StrategyReference = { id, version: BUILT_IN_STRATEGY_VERSION, options };
      const candidateOffsets = offsets(options);
      const seedIndex =
        resolveSeedIndex?.(options, candidateOffsets) ??
        candidateOffsets.findIndex((offset) => offset === 0);
      if (seedIndex < 0)
        throw new Error(`Built-in strategy ${id} did not produce a seed candidate`);
      return harmonyPalette(
        reference,
        seed,
        rule,
        hueCandidates(seed, candidateOffsets),
        seedIndex,
        options,
        context
      );
    }
  };
}

const singleStrategy = strategy(
  "single",
  () => ({ type: "single" }),
  () => [0]
);

const complementaryStrategy = strategy(
  "complementary",
  (options) => ({
    type: "complementary",
    angle: numberOption(options, "angle", 180, 0, 360)
  }),
  (options) => [0, numberOption(options, "angle", 180, 0, 360)]
);

const analogousStrategy = strategy(
  "analogous",
  (options) => ({
    type: "analogous",
    count: integerOption(options, "count", 3, 1, 12),
    spread: numberOption(options, "spread", 30, 0, 180)
  }),
  (options) => {
    const count = integerOption(options, "count", 3, 1, 12);
    const spread = numberOption(options, "spread", 30, 0, 180);
    // Keep adjacent swatches `spread` degrees apart while guaranteeing that
    // even-sized palettes contain a real seed entry instead of a virtual
    // midpoint between two colors.
    const seedIndex = Math.floor((count - 1) / 2);
    return Array.from({ length: count }, (_, index) => (index - seedIndex) * spread);
  },
  (options) => Math.floor((integerOption(options, "count", 3, 1, 12) - 1) / 2)
);

const triadicStrategy = strategy(
  "triadic",
  (options) => ({
    type: "triadic",
    angle: numberOption(options, "angle", 120, 0, 180)
  }),
  (options) => {
    const angle = numberOption(options, "angle", 120, 0, 180);
    return [0, angle, angle * 2];
  }
);

const tetradicStrategy = strategy(
  "tetradic",
  (options) => ({
    type: "tetradic",
    angle: numberOption(options, "angle", 90, 0, 180)
  }),
  (options) => {
    const angle = numberOption(options, "angle", 90, 0, 180);
    return [0, angle, 180, 180 + angle];
  }
);

const splitComplementaryStrategy = strategy(
  "split-complementary",
  (options) => ({
    type: "split-complementary",
    spread: numberOption(options, "spread", 60, 0, 180)
  }),
  (options) => {
    const halfSpread = numberOption(options, "spread", 60, 0, 180) / 2;
    return [0, 180 - halfSpread, 180 + halfSpread];
  }
);

const monochromaticStrategy: BuiltInHarmonyStrategy = {
  id: BUILT_IN_HARMONY_IDS.monochromatic,
  version: BUILT_IN_STRATEGY_VERSION,
  create(seed, options, context) {
    const count = integerOption(options, "count", 5, 1, 16);
    const rule: BuiltInHarmonyRule = { type: "monochromatic", count };
    const reference: StrategyReference = {
      id: BUILT_IN_HARMONY_IDS.monochromatic,
      version: BUILT_IN_STRATEGY_VERSION,
      options
    };
    const tones = tonalCandidates(seed, count, 0.92, 0.24, 1);
    const seedLightness = convertColor(seed, "oklch").l;
    let closestIndex = 0;
    for (let index = 1; index < tones.length; index += 1) {
      if (
        Math.abs((tones[index]?.l ?? 0) - seedLightness) <
        Math.abs((tones[closestIndex]?.l ?? 0) - seedLightness)
      ) {
        closestIndex = index;
      }
    }
    const candidates = tones.slice();
    candidates[closestIndex] = convertColor(seed, "oklch");
    return harmonyPalette(reference, seed, rule, candidates, closestIndex, options, context);
  }
};

export const builtInHarmonyStrategies: readonly BuiltInHarmonyStrategy[] = [
  singleStrategy,
  complementaryStrategy,
  analogousStrategy,
  triadicStrategy,
  tetradicStrategy,
  splitComplementaryStrategy,
  monochromaticStrategy
];

const tonalGenerator: BuiltInPaletteGenerator = {
  id: BUILT_IN_GENERATOR_IDS.tonal,
  version: BUILT_IN_STRATEGY_VERSION,
  generate(options, context) {
    const seedInput = options.seed;
    if (typeof seedInput !== "object" || seedInput === null || Array.isArray(seedInput)) {
      throw new TypeError("tonal generator requires a structured seed color");
    }
    const seed = resolveColor(seedInput as unknown as ColorValue);
    const count = integerOption(options, "count", 9, 1, 32);
    const start = numberOption(options, "lightnessStart", 0.97, 0, 1);
    const end = numberOption(options, "lightnessEnd", 0.18, 0, 1);
    const chromaScale = numberOption(options, "chromaScale", 1, 0, 4);
    const reference: StrategyReference = {
      id: BUILT_IN_GENERATOR_IDS.tonal,
      version: BUILT_IN_STRATEGY_VERSION,
      options
    };
    const colors = paletteColors(
      tonalCandidates(seed, count, start, end, chromaScale),
      gamutOption(options),
      context
    );
    const palette: Palette = {
      colors,
      kind: "tonal",
      recipe: {
        type: "generated",
        seed,
        colorSlotIds: colors.map((entry) => entry.id),
        strategy: reference
      },
      provenance: { origin: "generated", strategy: reference, seeds: [seed] },
      ...(() => {
        const name = stringOption(options, "name");
        return name === undefined ? {} : { name };
      })()
    };
    assertPalette(palette);
    return palette;
  }
};

export const builtInPaletteGenerators: readonly BuiltInPaletteGenerator[] = [tonalGenerator];

const directContext: StrategyContext = {
  convert: convertColor,
  mapToGamut(color, gamut) {
    // Kept here to avoid hiding a privileged generation path; direct helpers use
    // exactly the same public context contract as registered custom strategies.
    return importMapToGamut(color, gamut);
  }
};

function optionsForRule(rule: HarmonyRule, outputGamut: OutputGamut, name?: string): JsonObject {
  const base: Record<string, JsonValue> = { outputGamut };
  if (name !== undefined) base.name = name;
  switch (rule.type) {
    case "single":
      break;
    case "complementary":
    case "triadic":
    case "tetradic":
      if ("angle" in rule && typeof rule.angle === "number") base.angle = rule.angle;
      break;
    case "analogous":
      if ("count" in rule && typeof rule.count === "number") base.count = rule.count;
      if ("spread" in rule && typeof rule.spread === "number") base.spread = rule.spread;
      break;
    case "split-complementary":
      if ("spread" in rule && typeof rule.spread === "number") base.spread = rule.spread;
      break;
    case "monochromatic":
      if ("count" in rule && typeof rule.count === "number") base.count = rule.count;
      break;
    default:
      if ("options" in rule) Object.assign(base, rule.options);
  }
  return base;
}

function remapIds(
  palette: Palette,
  factory: HarmonyOptions["idFactory"] | TonalOptions["idFactory"]
): Palette {
  if (factory === undefined) return palette;
  const ids = new Map<string, string>();
  const colors = palette.colors.map((entry, index) => {
    const id = factory(index, entry.color);
    ids.set(entry.id, id);
    return { ...entry, id };
  });
  const seedColorId = palette.recipe?.seedColorId;
  const colorSlotIds = palette.recipe?.colorSlotIds;
  const result: Palette = {
    ...palette,
    colors,
    ...(palette.recipe === undefined
      ? {}
      : {
          recipe: {
            ...palette.recipe,
            ...(seedColorId === undefined
              ? {}
              : { seedColorId: ids.get(seedColorId) ?? seedColorId }),
            ...(colorSlotIds === undefined
              ? {}
              : {
                  colorSlotIds: colorSlotIds.map((id) => ids.get(id) ?? id)
                })
          }
        })
  };
  assertPalette(result);
  return result;
}

export function createHarmonyPalette(options: HarmonyOptions): Palette {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError("options must be an object");
  }
  if (
    typeof options.harmony !== "object" ||
    options.harmony === null ||
    typeof options.harmony.type !== "string"
  ) {
    throw new TypeError("harmony must be an object with a string type");
  }
  if (options.idFactory !== undefined && typeof options.idFactory !== "function") {
    throw new TypeError("idFactory must be a function");
  }
  const seed = resolveColor(options.seed);
  const id = BUILT_IN_HARMONY_IDS[options.harmony.type as keyof typeof BUILT_IN_HARMONY_IDS];
  if (id === undefined) {
    throw new UnknownHarmonyRuleError(
      options.harmony.type === "custom" ? options.harmony.id : options.harmony.type
    );
  }
  const implementation = builtInHarmonyStrategies.find((candidate) => candidate.id === id);
  if (!implementation) throw new UnknownHarmonyRuleError(options.harmony.type);
  const strategyOptions = optionsForRule(
    options.harmony,
    options.outputGamut ?? "srgb",
    options.name
  );
  return remapIds(implementation.create(seed, strategyOptions, directContext), options.idFactory);
}

export function createTonalPalette(options: TonalOptions): Palette {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError("options must be an object");
  }
  if (options.idFactory !== undefined && typeof options.idFactory !== "function") {
    throw new TypeError("idFactory must be a function");
  }
  if (
    options.lightnessRange !== undefined &&
    (!Array.isArray(options.lightnessRange) ||
      options.lightnessRange.length !== 2 ||
      !Object.hasOwn(options.lightnessRange, 0) ||
      !Object.hasOwn(options.lightnessRange, 1))
  ) {
    throw new TypeError("lightnessRange must be a dense two-number tuple");
  }
  const seed = resolveColor(options.seed);
  const [start, end] = options.lightnessRange ?? [0.97, 0.18];
  const strategyOptions: Record<string, JsonValue> = {
    seed: seed as unknown as JsonObject,
    count: options.count ?? 9,
    outputGamut: options.outputGamut ?? "srgb",
    lightnessStart: start,
    lightnessEnd: end,
    chromaScale: options.chromaScale ?? 1
  };
  if (options.name !== undefined) strategyOptions.name = options.name;
  return remapIds(tonalGenerator.generate(strategyOptions, directContext), options.idFactory);
}
