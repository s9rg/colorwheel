import { builtInPaletteAnalyzers } from "./analysis";
import { convertColor, resolveColor } from "./convert";
import { assertPalette, assertPaletteDocument, assertPaletteDocumentContentSize } from "./document";
import type { ValidationLimits } from "./document";
import { builtInPaletteExporters, builtInPaletteImporters } from "./exporters";
import { mapToGamut } from "./gamut";
import { builtInHarmonyStrategies, builtInPaletteGenerators } from "./generation";
import { inspectJsonContainer, isPlainJsonObject } from "./json";
import type {
  ColorInput,
  ExportArtifact,
  GamutMappingStrategy,
  GamutResult,
  HarmonyStrategy,
  JsonObject,
  JsonValue,
  OutputGamut,
  Palette,
  PaletteAnalysis,
  PaletteAnalyzer,
  PaletteDiagnostic,
  PaletteDocument,
  PaletteExporter,
  PaletteGenerator,
  PaletteImporter,
  PaletteValidator,
  StrategyContext,
  StrategyIdentity,
  StrategyReference
} from "./types";

export type StrategyCategory =
  "harmony" | "generator" | "validator" | "analyzer" | "gamut" | "exporter" | "importer";

export class StrategyRegistrationError extends Error {
  constructor(category: StrategyCategory, strategy: StrategyIdentity) {
    super(
      `A ${category} strategy with identity ${strategy.id}@${strategy.version} is already registered`
    );
    this.name = "StrategyRegistrationError";
  }
}

export class MissingStrategyError extends Error {
  readonly category: StrategyCategory;
  readonly reference: StrategyReference<object>;

  constructor(category: StrategyCategory, reference: StrategyReference<object>) {
    super(`No ${category} strategy is registered for ${reference.id}@${reference.version}`);
    this.name = "MissingStrategyError";
    this.category = category;
    this.reference = reference;
  }
}

export class InvalidStrategyOutputError extends TypeError {
  readonly strategy: StrategyReference<object>;

  constructor(strategy: StrategyReference<object>, reason: string) {
    super(`Strategy ${strategy.id}@${strategy.version} returned invalid output: ${reason}`);
    this.name = "InvalidStrategyOutputError";
    this.strategy = strategy;
  }
}

class Registry<Implementation extends StrategyIdentity> {
  readonly #category: StrategyCategory;
  readonly #items = new Map<string, Map<string, Implementation>>();

  constructor(category: StrategyCategory) {
    this.#category = category;
  }

  add(implementation: Implementation, override: boolean): void {
    if (
      typeof implementation.id !== "string" ||
      implementation.id.length === 0 ||
      typeof implementation.version !== "string" ||
      implementation.version.length === 0
    ) {
      throw new TypeError("Strategy IDs and versions must be non-empty strings");
    }
    let versions = this.#items.get(implementation.id);
    if (!versions) {
      versions = new Map();
      this.#items.set(implementation.id, versions);
    }
    if (versions.has(implementation.version) && !override) {
      throw new StrategyRegistrationError(this.#category, implementation);
    }
    versions.set(implementation.version, implementation);
  }

  get(reference: StrategyReference<object>): Implementation | undefined {
    if (typeof reference.id !== "string" || typeof reference.version !== "string") {
      return undefined;
    }
    return this.#items.get(reference.id)?.get(reference.version);
  }

  list(): readonly StrategyIdentity[] {
    return [...this.#items.values()].flatMap((versions) =>
      [...versions.values()].map(({ id, version }) => ({ id, version }))
    );
  }
}

const builtInGamutStrategies: readonly GamutMappingStrategy[] = [
  {
    id: "gamut.oklch-chroma-reduction",
    version: "1.0.0",
    map(color, gamut) {
      return mapToGamut(color, gamut);
    }
  }
];

function assertJsonValue(
  value: unknown,
  label: string,
  ancestors = new Set<object>(),
  depth = 0
): asserts value is JsonValue {
  if (depth > 32) throw new TypeError(`${label} exceeds the maximum JSON depth`);
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${label} contains a non-finite number`);
    return;
  }
  if (typeof value !== "object" || value === undefined) {
    throw new TypeError(`${label} must contain only JSON values`);
  }
  if (ancestors.has(value)) throw new TypeError(`${label} cannot be circular`);
  if (!Array.isArray(value) && !isPlainJsonObject(value)) {
    throw new TypeError(`${label} must contain only plain objects and arrays`);
  }
  const containerIssue = inspectJsonContainer(value);
  if (containerIssue !== undefined) throw new TypeError(`${label}: ${containerIssue.message}`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        throw new TypeError(`${label} cannot contain sparse arrays`);
      }
      const entry: unknown = value[index];
      assertJsonValue(entry, label, ancestors, depth + 1);
    }
  } else {
    Object.values(value).forEach((entry) => {
      assertJsonValue(entry, label, ancestors, depth + 1);
    });
  }
  ancestors.delete(value);
}

function strategyOptions(reference: StrategyReference<object>): JsonObject {
  if (
    typeof reference.id !== "string" ||
    reference.id.length === 0 ||
    typeof reference.version !== "string" ||
    reference.version.length === 0
  ) {
    throw new TypeError("Strategy references require non-empty id and version strings");
  }
  const options = reference.options ?? {};
  assertJsonValue(options, "Strategy options");
  if (!isRecord(options)) {
    throw new TypeError("Strategy options must be a JSON object");
  }
  return options;
}

function missingDiagnostic(
  category: StrategyCategory,
  reference: StrategyReference<object>
): PaletteDiagnostic {
  return {
    ruleId: "strategy.missing",
    severity: "error",
    messageKey: "palette.strategy.missing",
    messageParameters: {
      category,
      id: reference.id,
      version: reference.version
    },
    data: { category, id: reference.id, version: reference.version }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertDenseArray(value: unknown, label: string): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw new TypeError(`${label} cannot be sparse`);
    }
  }
}

function isDenseStringArray(value: unknown): value is readonly string[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index) || typeof value[index] !== "string") return false;
  }
  return true;
}

function assertDiagnostics(
  value: unknown,
  reference: StrategyReference<object>
): asserts value is readonly PaletteDiagnostic[] {
  if (!Array.isArray(value)) {
    throw new InvalidStrategyOutputError(reference, "diagnostics must be an array");
  }
  for (const entry of value) {
    const diagnostic: unknown = entry;
    if (
      !isRecord(diagnostic) ||
      typeof diagnostic.ruleId !== "string" ||
      diagnostic.ruleId.length === 0 ||
      typeof diagnostic.messageKey !== "string" ||
      diagnostic.messageKey.length === 0 ||
      !["info", "warning", "error"].includes(String(diagnostic.severity))
    ) {
      throw new InvalidStrategyOutputError(reference, "a diagnostic has an invalid shape");
    }
    if (diagnostic.colorIds !== undefined && !isDenseStringArray(diagnostic.colorIds)) {
      throw new InvalidStrategyOutputError(reference, "diagnostic colorIds must be strings");
    }
    if (
      diagnostic.path !== undefined &&
      (!Array.isArray(diagnostic.path) ||
        !diagnostic.path.every(
          (segment: unknown, index) =>
            Object.hasOwn(diagnostic.path as readonly unknown[], index) &&
            (typeof segment === "string" ||
              (typeof segment === "number" && Number.isFinite(segment)))
        ))
    ) {
      throw new InvalidStrategyOutputError(
        reference,
        "diagnostic path must contain strings or numbers"
      );
    }
    if (diagnostic.messageParameters !== undefined && !isRecord(diagnostic.messageParameters)) {
      throw new InvalidStrategyOutputError(
        reference,
        "diagnostic messageParameters must be an object"
      );
    }
  }
  try {
    assertJsonValue(value, "Diagnostic output");
  } catch (error) {
    throw new InvalidStrategyOutputError(
      reference,
      error instanceof Error ? error.message : "diagnostics are not serializable"
    );
  }
}

function assertAnalysis(analysis: PaletteAnalysis, reference: StrategyReference<object>): void {
  if (!analysis || typeof analysis !== "object") {
    throw new InvalidStrategyOutputError(reference, "analysis.diagnostics must be an array");
  }
  assertDiagnostics(analysis.diagnostics, reference);
}

function assertArtifact(artifact: ExportArtifact, reference: StrategyReference<object>): void {
  if (!artifact || !Array.isArray(artifact.files)) {
    throw new InvalidStrategyOutputError(reference, "artifact.files must be an array");
  }
  for (const file of artifact.files) {
    if (
      !isRecord(file) ||
      typeof file.name !== "string" ||
      file.name.length === 0 ||
      typeof file.mediaType !== "string" ||
      file.mediaType.length === 0 ||
      (typeof file.content !== "string" && !(file.content instanceof Uint8Array))
    ) {
      throw new InvalidStrategyOutputError(reference, "artifact contains an invalid file");
    }
  }
}

function assertGamutResult(
  value: unknown,
  gamut: OutputGamut,
  reference: StrategyReference<object>
): asserts value is GamutResult {
  if (!isRecord(value) || !isRecord(value.color)) {
    throw new InvalidStrategyOutputError(reference, "gamut result and color must be objects");
  }
  if (value.gamut !== gamut || value.color.space !== gamut) {
    throw new InvalidStrategyOutputError(reference, "gamut result must use the requested gamut");
  }
  if (
    ![value.color.r, value.color.g, value.color.b].every(
      (channel) =>
        typeof channel === "number" && Number.isFinite(channel) && channel >= 0 && channel <= 1
    ) ||
    (value.color.alpha !== undefined &&
      (typeof value.color.alpha !== "number" ||
        !Number.isFinite(value.color.alpha) ||
        value.color.alpha < 0 ||
        value.color.alpha > 1))
  ) {
    throw new InvalidStrategyOutputError(
      reference,
      "gamut color channels must be finite and bounded"
    );
  }
  if (typeof value.mapped !== "boolean") {
    throw new InvalidStrategyOutputError(reference, "mapped must be a boolean");
  }
  if (typeof value.deltaE !== "number" || !Number.isFinite(value.deltaE) || value.deltaE < 0) {
    throw new InvalidStrategyOutputError(reference, "deltaE must be a finite non-negative number");
  }
  if (typeof value.method !== "string" || value.method.length === 0) {
    throw new InvalidStrategyOutputError(reference, "method must be a non-empty string");
  }
}

export interface EngineOptions {
  readonly harmonies?: readonly HarmonyStrategy<object>[];
  readonly generators?: readonly PaletteGenerator<object>[];
  readonly validators?: readonly PaletteValidator<object>[];
  readonly analyzers?: readonly PaletteAnalyzer<object>[];
  readonly gamutPolicies?: readonly GamutMappingStrategy<object>[];
  readonly exporters?: readonly PaletteExporter<object>[];
  readonly importers?: readonly PaletteImporter<object>[];
  readonly includeBuiltIns?: boolean;
  readonly overrideStrategies?: boolean;
  readonly validationLimits?: ValidationLimits;
}

export interface ColorEngine {
  createHarmony(reference: StrategyReference<object>, seed: ColorInput): Palette<object>;
  generate(reference: StrategyReference<object>): Palette<object>;
  analyze(
    palette: Palette<object>,
    analyzers?: readonly StrategyReference<object>[]
  ): PaletteAnalysis;
  export(palette: Palette<object>, exporter: StrategyReference<object>): ExportArtifact;
  import(content: string | Uint8Array, importer: StrategyReference<object>): PaletteDocument;
  validate(
    palette: Palette<object>,
    validators?: readonly StrategyReference<object>[]
  ): readonly PaletteDiagnostic[];
  map(
    color: ColorInput,
    gamut: OutputGamut,
    policy?: StrategyReference<object>
  ): ReturnType<typeof mapToGamut>;
  hasStrategy(category: StrategyCategory, reference: StrategyReference<object>): boolean;
  listStrategies(category: StrategyCategory): readonly StrategyIdentity[];
}

export function createColorEngine(options: EngineOptions = {}): ColorEngine {
  const includeBuiltIns = options.includeBuiltIns ?? true;
  const harmonies = new Registry<HarmonyStrategy<object>>("harmony");
  const generators = new Registry<PaletteGenerator<object>>("generator");
  const validators = new Registry<PaletteValidator<object>>("validator");
  const analyzers = new Registry<PaletteAnalyzer<object>>("analyzer");
  const gamutPolicies = new Registry<GamutMappingStrategy<object>>("gamut");
  const exporters = new Registry<PaletteExporter<object>>("exporter");
  const importers = new Registry<PaletteImporter<object>>("importer");
  const registries = {
    harmony: harmonies,
    generator: generators,
    validator: validators,
    analyzer: analyzers,
    gamut: gamutPolicies,
    exporter: exporters,
    importer: importers
  };
  const override = options.overrideStrategies ?? false;
  const validationLimits = options.validationLimits ?? {};
  const addAll = <Implementation extends StrategyIdentity>(
    registry: Registry<Implementation>,
    implementations: readonly Implementation[],
    allowOverride: boolean
  ): void => {
    assertDenseArray(implementations, "Strategy registrations");
    for (const implementation of implementations) {
      registry.add(implementation, allowOverride);
    }
  };

  if (includeBuiltIns) {
    addAll(harmonies, builtInHarmonyStrategies, false);
    addAll(generators, builtInPaletteGenerators, false);
    addAll(analyzers, builtInPaletteAnalyzers, false);
    addAll(gamutPolicies, builtInGamutStrategies, false);
    addAll(exporters, builtInPaletteExporters, false);
    addAll(importers, builtInPaletteImporters, false);
  }
  addAll(harmonies, options.harmonies ?? [], override);
  addAll(generators, options.generators ?? [], override);
  addAll(validators, options.validators ?? [], override);
  addAll(analyzers, options.analyzers ?? [], override);
  addAll(gamutPolicies, options.gamutPolicies ?? [], override);
  addAll(exporters, options.exporters ?? [], override);
  addAll(importers, options.importers ?? [], override);

  const context: StrategyContext = {
    convert: convertColor,
    mapToGamut
  };

  const requireStrategy = <Implementation extends StrategyIdentity>(
    category: StrategyCategory,
    registry: Registry<Implementation>,
    reference: StrategyReference<object>
  ): Implementation => {
    strategyOptions(reference);
    const implementation = registry.get(reference);
    if (!implementation) throw new MissingStrategyError(category, reference);
    return implementation;
  };

  return {
    createHarmony(reference, seedInput) {
      const implementation = requireStrategy("harmony", harmonies, reference);
      const palette = implementation.create(
        resolveColor(seedInput),
        strategyOptions(reference),
        context
      );
      assertPalette(palette, validationLimits);
      return palette;
    },
    generate(reference) {
      const implementation = requireStrategy("generator", generators, reference);
      const palette = implementation.generate(strategyOptions(reference), context);
      assertPalette(palette, validationLimits);
      return palette;
    },
    validate(palette, references = []) {
      assertPalette(palette, validationLimits);
      assertDenseArray(references, "Validator references");
      const diagnostics: PaletteDiagnostic[] = [];
      for (const reference of references) {
        const referenceOptions = strategyOptions(reference);
        const implementation = validators.get(reference);
        if (!implementation) {
          diagnostics.push(missingDiagnostic("validator", reference));
          continue;
        }
        const output = implementation.validate(palette, referenceOptions, context);
        assertDiagnostics(output, reference);
        diagnostics.push(...output);
      }
      return diagnostics;
    },
    analyze(palette, references) {
      assertPalette(palette, validationLimits);
      const requested =
        references ??
        (includeBuiltIns
          ? builtInPaletteAnalyzers.map(({ id, version }) => ({ id, version }))
          : []);
      assertDenseArray(requested, "Analyzer references");
      const diagnostics: PaletteDiagnostic[] = [];
      for (const reference of requested) {
        const referenceOptions = strategyOptions(reference);
        const implementation = analyzers.get(reference);
        if (!implementation) {
          diagnostics.push(missingDiagnostic("analyzer", reference));
          continue;
        }
        const analysis = implementation.analyze(palette, referenceOptions, context);
        assertAnalysis(analysis, reference);
        diagnostics.push(...analysis.diagnostics);
      }
      return { diagnostics };
    },
    map(colorInput, gamut, policy) {
      if (gamut !== "srgb" && gamut !== "display-p3") {
        throw new TypeError("gamut must be srgb or display-p3");
      }
      if (!policy) return mapToGamut(colorInput, gamut);
      const implementation = requireStrategy("gamut", gamutPolicies, policy);
      const result: unknown = implementation.map(
        resolveColor(colorInput),
        gamut,
        strategyOptions(policy),
        context
      );
      assertGamutResult(result, gamut, policy);
      return result;
    },
    export(palette, reference) {
      assertPalette(palette, validationLimits);
      const implementation = requireStrategy("exporter", exporters, reference);
      const artifact = implementation.export(palette, strategyOptions(reference));
      assertArtifact(artifact, reference);
      return artifact;
    },
    import(content, reference) {
      assertPaletteDocumentContentSize(content, validationLimits);
      const implementation = requireStrategy("importer", importers, reference);
      const document: PaletteDocument = implementation.import(content, strategyOptions(reference));
      assertPaletteDocument(document, validationLimits);
      return document;
    },
    hasStrategy(category, reference) {
      return registries[category].get(reference) !== undefined;
    },
    listStrategies(category) {
      return registries[category].list();
    }
  };
}
