import { resolveColor } from "./convert";
import { inspectJsonContainer, isPlainJsonObject } from "./json";
import type {
  ColorInput,
  ColorValue,
  JsonObject,
  Palette,
  PaletteColor,
  PaletteDocument
} from "./types";

export interface ValidationLimits {
  readonly maxColors?: number;
  readonly maxMetadataBytes?: number;
  readonly maxDocumentBytes?: number;
  readonly maxStringLength?: number;
  readonly maxDepth?: number;
}

interface ResolvedValidationLimits {
  readonly maxColors: number;
  readonly maxMetadataBytes: number;
  readonly maxDocumentBytes: number;
  readonly maxStringLength: number;
  readonly maxDepth: number;
}

export interface DocumentValidationIssue {
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export type ValidationResult<Value> =
  | {
      readonly valid: true;
      readonly value: Value;
      readonly issues: readonly [];
    }
  | {
      readonly valid: false;
      readonly issues: readonly DocumentValidationIssue[];
    };

export class PaletteDocumentValidationError extends TypeError {
  readonly issues: readonly DocumentValidationIssue[];

  constructor(issues: readonly DocumentValidationIssue[]) {
    super(
      issues.length === 0
        ? "Palette document is invalid"
        : `Palette document is invalid: ${issues[0]?.message ?? "unknown error"}`
    );
    this.name = "PaletteDocumentValidationError";
    this.issues = issues;
  }
}

export interface PaletteColorInput<Metadata extends object = JsonObject> {
  readonly id?: string;
  readonly color: ColorInput;
  readonly name?: string;
  readonly role?: string;
  readonly locked?: boolean;
  readonly metadata?: Metadata;
}

const DEFAULT_LIMITS: ResolvedValidationLimits = {
  maxColors: 256,
  maxMetadataBytes: 65_536,
  maxDocumentBytes: 1_048_576,
  maxStringLength: 16_384,
  maxDepth: 32
};

function limit(value: number | undefined, fallback: number, name: keyof ValidationLimits): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
  return resolved;
}

function limits(options: ValidationLimits): ResolvedValidationLimits {
  return {
    maxColors: limit(options.maxColors, DEFAULT_LIMITS.maxColors, "maxColors"),
    maxMetadataBytes: limit(
      options.maxMetadataBytes,
      DEFAULT_LIMITS.maxMetadataBytes,
      "maxMetadataBytes"
    ),
    maxDocumentBytes: limit(
      options.maxDocumentBytes,
      DEFAULT_LIMITS.maxDocumentBytes,
      "maxDocumentBytes"
    ),
    maxStringLength: limit(
      options.maxStringLength,
      DEFAULT_LIMITS.maxStringLength,
      "maxStringLength"
    ),
    maxDepth: limit(options.maxDepth, DEFAULT_LIMITS.maxDepth, "maxDepth")
  };
}

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

export function assertPaletteDocumentContentSize(
  content: string | Uint8Array,
  options: ValidationLimits = {}
): void {
  const resolved = limits(options);
  const bytes = typeof content === "string" ? utf8ByteLength(content) : content.byteLength;
  if (bytes > resolved.maxDocumentBytes) {
    throw new PaletteDocumentValidationError([
      {
        code: "document.size",
        path: [],
        message: `Document exceeds ${resolved.maxDocumentBytes} bytes`
      }
    ]);
  }
}

function issue(
  issues: DocumentValidationIssue[],
  code: string,
  path: readonly (string | number)[],
  message: string
): void {
  issues.push({ code, path, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRuntimeArray(value: unknown): boolean {
  return Array.isArray(value);
}

function validateJsonValue(
  value: unknown,
  path: readonly (string | number)[],
  issues: DocumentValidationIssue[],
  resolved: ResolvedValidationLimits,
  ancestors: Set<object>,
  depth: number
): boolean {
  if (depth > resolved.maxDepth) {
    issue(issues, "json.depth", path, `JSON nesting exceeds ${resolved.maxDepth}`);
    return false;
  }
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      issue(issues, "json.finite", path, "Numbers must be finite");
      return false;
    }
    return true;
  }
  if (typeof value === "string") {
    if (value.length > resolved.maxStringLength) {
      issue(
        issues,
        "json.string-size",
        path,
        `String exceeds ${resolved.maxStringLength} characters`
      );
      return false;
    }
    return true;
  }
  if (typeof value !== "object" || value === undefined) {
    issue(issues, "json.type", path, "Value must be JSON-serializable");
    return false;
  }
  if (ancestors.has(value)) {
    issue(issues, "json.circular", path, "Circular values are not supported");
    return false;
  }
  if (!Array.isArray(value) && !isPlainJsonObject(value)) {
    issue(issues, "json.prototype", path, "Only plain JSON objects are supported");
    return false;
  }
  const containerIssue = inspectJsonContainer(value);
  if (containerIssue !== undefined) {
    issue(
      issues,
      containerIssue.code,
      containerIssue.key === undefined ? path : [...path, containerIssue.key],
      containerIssue.message
    );
    return false;
  }

  ancestors.add(value);
  let valid = true;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        issue(
          issues,
          "json.sparse-array",
          [...path, index],
          "Sparse JSON arrays are not supported"
        );
        valid = false;
        continue;
      }
      const item: unknown = value[index];
      valid =
        validateJsonValue(item, [...path, index], issues, resolved, ancestors, depth + 1) && valid;
    }
  } else {
    Object.entries(value).forEach(([key, item]) => {
      if (key.length > resolved.maxStringLength) {
        issue(issues, "json.key-size", [...path, key], "Object key is too long");
        valid = false;
      }
      valid =
        validateJsonValue(item, [...path, key], issues, resolved, ancestors, depth + 1) && valid;
    });
  }
  ancestors.delete(value);
  return valid;
}

function stringField(
  value: unknown,
  path: readonly (string | number)[],
  issues: DocumentValidationIssue[],
  required = true
): value is string {
  if (value === undefined && !required) return false;
  if (typeof value !== "string" || (required && value.length === 0)) {
    issue(issues, "schema.string", path, "Expected a non-empty string");
    return false;
  }
  return true;
}

function finiteInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  path: readonly (string | number)[],
  issues: DocumentValidationIssue[],
  maximumExclusive = false
): boolean {
  const outside =
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    (maximumExclusive ? value >= maximum : value > maximum);
  if (outside) {
    issue(
      issues,
      "color.channel-range",
      path,
      `Expected a finite number between ${minimum} and ${maximum}${maximumExclusive ? " (exclusive)" : ""}`
    );
    return false;
  }
  return true;
}

function integerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  path: readonly (string | number)[],
  issues: DocumentValidationIssue[]
): boolean {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    issue(issues, "schema.integer", path, "Expected an integer");
    return false;
  }
  return finiteInRange(value, minimum, maximum, path, issues);
}

function validateColorValue(
  value: unknown,
  path: readonly (string | number)[],
  issues: DocumentValidationIssue[]
): value is ColorValue {
  if (!isRecord(value)) {
    issue(issues, "color.type", path, "Color must be an object");
    return false;
  }
  const alphaValid =
    value.alpha === undefined || finiteInRange(value.alpha, 0, 1, [...path, "alpha"], issues);
  switch (value.space) {
    case "srgb":
    case "display-p3":
      return (
        finiteInRange(value.r, 0, 1, [...path, "r"], issues) &&
        finiteInRange(value.g, 0, 1, [...path, "g"], issues) &&
        finiteInRange(value.b, 0, 1, [...path, "b"], issues) &&
        alphaValid
      );
    case "hsl":
      return (
        finiteInRange(value.h, 0, 360, [...path, "h"], issues, true) &&
        finiteInRange(value.s, 0, 1, [...path, "s"], issues) &&
        finiteInRange(value.l, 0, 1, [...path, "l"], issues) &&
        alphaValid
      );
    case "hsv":
      return (
        finiteInRange(value.h, 0, 360, [...path, "h"], issues, true) &&
        finiteInRange(value.s, 0, 1, [...path, "s"], issues) &&
        finiteInRange(value.v, 0, 1, [...path, "v"], issues) &&
        alphaValid
      );
    case "oklch":
      return (
        finiteInRange(value.l, 0, 1, [...path, "l"], issues) &&
        finiteInRange(value.c, 0, 0.5, [...path, "c"], issues) &&
        finiteInRange(value.h, 0, 360, [...path, "h"], issues, true) &&
        alphaValid
      );
    default:
      issue(issues, "color.space", [...path, "space"], "Unsupported color space");
      return false;
  }
}

function validateStrategyReference(
  value: unknown,
  path: readonly (string | number)[],
  issues: DocumentValidationIssue[]
): boolean {
  if (!isRecord(value)) {
    issue(issues, "strategy.type", path, "Strategy reference must be an object");
    return false;
  }
  const identityValid =
    stringField(value.id, [...path, "id"], issues) &&
    stringField(value.version, [...path, "version"], issues);
  if (value.options !== undefined && !isRecord(value.options)) {
    issue(
      issues,
      "strategy.options",
      [...path, "options"],
      "Strategy options must be a JSON object"
    );
    return false;
  }
  return identityValid;
}

function validateHarmonyRule(
  value: unknown,
  path: readonly (string | number)[],
  issues: DocumentValidationIssue[]
): boolean {
  if (!isRecord(value) || !stringField(value.type, [...path, "type"], issues)) {
    issue(issues, "harmony.type", path, "Harmony rule must be an object with a type");
    return false;
  }

  const allowedFields = (...fields: readonly string[]): boolean => {
    const allowed = new Set(["type", ...fields]);
    let valid = true;
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) {
        issue(
          issues,
          "harmony.field",
          [...path, key],
          `Harmony rule ${String(value.type)} does not support field ${key}`
        );
        valid = false;
      }
    }
    return valid;
  };
  const optionalInteger = (field: string, minimum: number, maximum: number): boolean =>
    value[field] === undefined ||
    integerInRange(value[field], minimum, maximum, [...path, field], issues);
  const optionalNumber = (field: string, minimum: number, maximum: number): boolean =>
    value[field] === undefined ||
    finiteInRange(value[field], minimum, maximum, [...path, field], issues);

  if (value.type === "custom") {
    const fieldsValid = allowedFields("id", "version", "options");
    const customValid =
      stringField(value.id, [...path, "id"], issues) &&
      stringField(value.version, [...path, "version"], issues);
    if (!isRecord(value.options)) {
      issue(
        issues,
        "harmony.options",
        [...path, "options"],
        "Custom harmony rules require an options object"
      );
      return false;
    }
    return fieldsValid && customValid;
  }

  switch (value.type) {
    case "single":
      return allowedFields();
    case "complementary":
      return allowedFields("angle") && optionalNumber("angle", 0, 360);
    case "analogous":
      return (
        allowedFields("count", "spread") &&
        optionalInteger("count", 1, 12) &&
        optionalNumber("spread", 0, 180)
      );
    case "triadic":
    case "tetradic":
      return allowedFields("angle") && optionalNumber("angle", 0, 180);
    case "split-complementary":
      return allowedFields("spread") && optionalNumber("spread", 0, 180);
    case "monochromatic":
      return allowedFields("count") && optionalInteger("count", 1, 16);
    default:
      issue(issues, "harmony.type", [...path, "type"], "Unsupported harmony rule type");
      return false;
  }
}

function validatePaletteShape(
  value: unknown,
  path: readonly (string | number)[],
  issues: DocumentValidationIssue[],
  resolved: ResolvedValidationLimits,
  jsonSafe: boolean
): value is Palette {
  if (!isRecord(value)) {
    issue(issues, "palette.type", path, "Palette must be an object");
    return false;
  }
  let valid = stringField(value.kind, [...path, "kind"], issues);
  if (
    Object.hasOwn(value, "schema") ||
    Object.hasOwn(value, "schemaVersion") ||
    Object.hasOwn(value, "palette")
  ) {
    issue(issues, "palette.reserved-field", path, "Palette uses a reserved document field");
    valid = false;
  }
  if (value.name !== undefined && typeof value.name !== "string") {
    issue(issues, "palette.name", [...path, "name"], "Palette name must be a string");
    valid = false;
  }
  const colorIds = new Set<string>();
  if (!Array.isArray(value.colors)) {
    issue(issues, "palette.colors", [...path, "colors"], "Palette colors must be an array");
    valid = false;
  } else {
    if (value.colors.length > resolved.maxColors) {
      issue(
        issues,
        "palette.size",
        [...path, "colors"],
        `Palette exceeds ${resolved.maxColors} colors`
      );
      valid = false;
    }
    for (const [index, entry] of value.colors.entries()) {
      const entryPath = [...path, "colors", index] as const;
      if (!isRecord(entry)) {
        issue(issues, "palette.color", entryPath, "Palette color must be an object");
        valid = false;
        continue;
      }
      if (!stringField(entry.id, [...entryPath, "id"], issues)) {
        valid = false;
      } else if (colorIds.has(entry.id)) {
        issue(issues, "palette.duplicate-id", [...entryPath, "id"], "Color IDs must be unique");
        valid = false;
      } else {
        colorIds.add(entry.id);
      }
      valid = validateColorValue(entry.color, [...entryPath, "color"], issues) && valid;
      if (entry.name !== undefined && typeof entry.name !== "string") {
        issue(issues, "palette.name", [...entryPath, "name"], "Name must be a string");
        valid = false;
      }
      if (entry.role !== undefined && typeof entry.role !== "string") {
        issue(issues, "palette.role", [...entryPath, "role"], "Role must be a string");
        valid = false;
      }
      if (entry.locked !== undefined && typeof entry.locked !== "boolean") {
        issue(issues, "palette.locked", [...entryPath, "locked"], "Locked must be a boolean");
        valid = false;
      }
    }
  }

  if (!isRecord(value.provenance)) {
    issue(issues, "palette.provenance", [...path, "provenance"], "Provenance is required");
    valid = false;
  } else {
    const origins = new Set(["wheel", "generated", "manual", "imported"]);
    if (typeof value.provenance.origin !== "string" || !origins.has(value.provenance.origin)) {
      issue(
        issues,
        "palette.origin",
        [...path, "provenance", "origin"],
        "Unsupported provenance origin"
      );
      valid = false;
    }
    if (
      value.provenance.strategy !== undefined &&
      !validateStrategyReference(
        value.provenance.strategy,
        [...path, "provenance", "strategy"],
        issues
      )
    ) {
      valid = false;
    }
    if (value.provenance.seeds !== undefined) {
      if (!Array.isArray(value.provenance.seeds)) {
        issue(issues, "palette.seeds", [...path, "provenance", "seeds"], "Seeds must be an array");
        valid = false;
      } else {
        for (const [index, seed] of value.provenance.seeds.entries()) {
          valid =
            validateColorValue(seed, [...path, "provenance", "seeds", index], issues) && valid;
        }
      }
    }
  }

  if (value.recipe !== undefined) {
    if (!isRecord(value.recipe) || !["wheel", "generated"].includes(String(value.recipe.type))) {
      issue(issues, "palette.recipe", [...path, "recipe"], "Recipe is invalid");
      valid = false;
    } else {
      if (
        value.recipe.seed !== undefined &&
        !validateColorValue(value.recipe.seed, [...path, "recipe", "seed"], issues)
      ) {
        valid = false;
      }
      if (value.recipe.seedColorId !== undefined) {
        if (!stringField(value.recipe.seedColorId, [...path, "recipe", "seedColorId"], issues)) {
          valid = false;
        } else {
          if (value.recipe.seed === undefined) {
            issue(
              issues,
              "palette.recipe-seed-owner",
              [...path, "recipe", "seedColorId"],
              "A seed color ID requires a recipe seed"
            );
            valid = false;
          }
          if (!Array.isArray(value.colors) || !colorIds.has(value.recipe.seedColorId)) {
            issue(
              issues,
              "palette.recipe-seed-owner",
              [...path, "recipe", "seedColorId"],
              "Recipe seed color ID must reference a palette color"
            );
            valid = false;
          }
        }
      }
      if (value.recipe.colorSlotIds !== undefined) {
        if (!Array.isArray(value.recipe.colorSlotIds)) {
          issue(
            issues,
            "palette.recipe-slots",
            [...path, "recipe", "colorSlotIds"],
            "Recipe color slot IDs must be an array"
          );
          valid = false;
        } else {
          const slotIds = new Set<string>();
          for (const [index, colorId] of value.recipe.colorSlotIds.entries()) {
            const slotPath = [...path, "recipe", "colorSlotIds", index] as const;
            if (!stringField(colorId, slotPath, issues)) {
              valid = false;
            } else if (slotIds.has(colorId)) {
              issue(issues, "palette.recipe-slots", slotPath, "Recipe color slots must be unique");
              valid = false;
            } else {
              slotIds.add(colorId);
              if (!colorIds.has(colorId)) {
                issue(
                  issues,
                  "palette.recipe-slots",
                  slotPath,
                  "Recipe color slot ID must reference a palette color"
                );
                valid = false;
              }
            }
          }
          if (
            typeof value.recipe.seedColorId === "string" &&
            !slotIds.has(value.recipe.seedColorId)
          ) {
            issue(
              issues,
              "palette.recipe-slots",
              [...path, "recipe", "colorSlotIds"],
              "Recipe color slots must include the recipe seed color ID"
            );
            valid = false;
          }
        }
      }
      if (
        value.recipe.harmony !== undefined &&
        !validateHarmonyRule(value.recipe.harmony, [...path, "recipe", "harmony"], issues)
      ) {
        valid = false;
      }
      if (
        value.recipe.strategy !== undefined &&
        !validateStrategyReference(value.recipe.strategy, [...path, "recipe", "strategy"], issues)
      ) {
        valid = false;
      }
    }
  }

  const metadataEntries: {
    readonly metadata: unknown;
    readonly path: readonly (string | number)[];
  }[] = [{ metadata: value.metadata, path: [...path, "metadata"] }];
  if (Array.isArray(value.colors)) {
    for (const [index, entry] of value.colors.entries()) {
      metadataEntries.push({
        metadata: isRecord(entry) ? entry.metadata : undefined,
        path: [...path, "colors", index, "metadata"]
      });
    }
  }
  for (const { metadata, path: metadataPath } of metadataEntries) {
    if (metadata !== undefined) {
      if (!isRecord(metadata)) {
        issue(issues, "palette.metadata", metadataPath, "Metadata must be a JSON object");
        valid = false;
      }
      const encoded = jsonSafe ? (JSON.stringify(metadata) ?? "") : "";
      if (jsonSafe && utf8ByteLength(encoded) > resolved.maxMetadataBytes) {
        issue(
          issues,
          "palette.metadata-size",
          metadataPath,
          `Metadata exceeds ${resolved.maxMetadataBytes} bytes`
        );
        valid = false;
      }
    }
  }
  return valid;
}

export function validatePalette(
  input: unknown,
  options: ValidationLimits = {}
): ValidationResult<Palette> {
  const resolved = limits(options);
  const issues: DocumentValidationIssue[] = [];
  const jsonValid = validateJsonValue(input, [], issues, resolved, new Set(), 0);
  let shapeValid = jsonValid && validatePaletteShape(input, [], issues, resolved, true);
  if (jsonValid) {
    const encoded = JSON.stringify(input);
    if (utf8ByteLength(encoded) > resolved.maxDocumentBytes) {
      issue(issues, "document.size", [], `Palette exceeds ${resolved.maxDocumentBytes} bytes`);
      shapeValid = false;
    }
  }
  return jsonValid && shapeValid
    ? { valid: true, value: input as Palette, issues: [] }
    : { valid: false, issues };
}

export function assertPalette(
  input: unknown,
  options: ValidationLimits = {}
): asserts input is Palette {
  const result = validatePalette(input, options);
  if (!result.valid) throw new PaletteDocumentValidationError(result.issues);
}

export function validatePaletteDocument(
  input: unknown,
  options: ValidationLimits = {}
): ValidationResult<PaletteDocument> {
  const resolved = limits(options);
  const issues: DocumentValidationIssue[] = [];
  const jsonValid = validateJsonValue(input, [], issues, resolved, new Set(), 0);
  let shapeValid = jsonValid;
  if (!jsonValid) {
    shapeValid = false;
  } else if (!isRecord(input)) {
    issue(issues, "document.type", [], "Document must be an object");
    shapeValid = false;
  } else {
    if (Object.hasOwn(input, "colors")) {
      issue(issues, "document.reserved-field", [], "Document cannot contain palette fields");
      shapeValid = false;
    }
    if (input.schema !== "color-palette") {
      issue(issues, "document.schema", ["schema"], "Unsupported document schema");
      shapeValid = false;
    }
    if (input.schemaVersion !== 1) {
      issue(issues, "document.version", ["schemaVersion"], "Unsupported schema version");
      shapeValid = false;
    }
    shapeValid =
      validatePaletteShape(input.palette, ["palette"], issues, resolved, true) && shapeValid;
  }
  if (jsonValid) {
    const encoded = JSON.stringify(input);
    if (utf8ByteLength(encoded) > resolved.maxDocumentBytes) {
      issue(issues, "document.size", [], `Document exceeds ${resolved.maxDocumentBytes} bytes`);
      shapeValid = false;
    }
  }
  return jsonValid && shapeValid
    ? { valid: true, value: input as PaletteDocument, issues: [] }
    : { valid: false, issues };
}

export function assertPaletteDocument(
  input: unknown,
  options: ValidationLimits = {}
): asserts input is PaletteDocument {
  const result = validatePaletteDocument(input, options);
  if (!result.valid) throw new PaletteDocumentValidationError(result.issues);
}

export function createPaletteDocument<Metadata extends object>(
  palette: Palette<Metadata>
): PaletteDocument<Metadata> {
  assertPalette(palette);
  return { schema: "color-palette", schemaVersion: 1, palette };
}

export function serializePaletteDocument(
  input: Palette<object> | PaletteDocument<object>,
  indentation: number | string = 2
): string {
  const schema = Object.getOwnPropertyDescriptor(input, "schema");
  const schemaVersion = Object.getOwnPropertyDescriptor(input, "schemaVersion");
  const palette = Object.getOwnPropertyDescriptor(input, "palette");
  const isDocument =
    schema !== undefined &&
    "value" in schema &&
    schema.value === "color-palette" &&
    schemaVersion !== undefined &&
    "value" in schemaVersion &&
    schemaVersion.value === 1 &&
    palette !== undefined &&
    "value" in palette;
  const document = isDocument ? input : createPaletteDocument(input as Palette<object>);
  assertPaletteDocument(document);
  return JSON.stringify(document, null, indentation);
}

export function parsePaletteDocument(
  content: string,
  options: ValidationLimits = {}
): PaletteDocument {
  assertPaletteDocumentContentSize(content, options);
  let input: unknown;
  try {
    input = JSON.parse(content) as unknown;
  } catch {
    throw new PaletteDocumentValidationError([
      { code: "document.json", path: [], message: "Document is not valid JSON" }
    ]);
  }
  assertPaletteDocument(input, options);
  return input;
}

/** Current v1 documents need no migrations; unsupported versions fail explicitly. */
export function migratePaletteDocument(input: unknown): PaletteDocument {
  assertPaletteDocument(input);
  return input;
}

export function assignPaletteColorIds<Metadata extends object = JsonObject>(
  entries: readonly PaletteColorInput<Metadata>[],
  prefix = "color"
): readonly PaletteColor<Metadata>[] {
  if (!isRuntimeArray(entries)) throw new TypeError("entries must be an array");
  for (let index = 0; index < entries.length; index += 1) {
    if (!Object.hasOwn(entries, index)) throw new TypeError("entries cannot be sparse");
  }
  if (typeof prefix !== "string" || prefix.length === 0) {
    throw new TypeError("prefix must be a non-empty string");
  }
  const reserved = new Set(
    entries
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  );
  const used = new Set<string>();
  let next = 1;
  const result = entries.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      throw new TypeError("Each palette color entry must be an object");
    }
    let id = entry.id;
    if (id === undefined || id.length === 0 || used.has(id)) {
      while (used.has(`${prefix}-${next}`) || reserved.has(`${prefix}-${next}`)) next += 1;
      id = `${prefix}-${next}`;
      used.add(id);
      next += 1;
    } else {
      used.add(id);
    }
    return {
      id,
      color: resolveColor(entry.color),
      ...(entry.name === undefined ? {} : { name: entry.name }),
      ...(entry.role === undefined ? {} : { role: entry.role }),
      ...(entry.locked === undefined ? {} : { locked: entry.locked }),
      ...(entry.metadata === undefined ? {} : { metadata: entry.metadata })
    };
  });
  assertPalette({
    colors: result,
    kind: "custom",
    provenance: { origin: "manual" }
  });
  return result;
}
