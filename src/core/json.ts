export interface JsonContainerIssue {
  readonly code:
    | "json.to-json"
    | "json.inherited"
    | "json.symbol-key"
    | "json.array-field"
    | "json.accessor"
    | "json.non-enumerable";
  readonly key?: string;
  readonly message: string;
}

const STANDARD_OBJECT_PROTOTYPE_KEYS = new Set<PropertyKey>([
  "constructor",
  "__defineGetter__",
  "__defineSetter__",
  "hasOwnProperty",
  "__lookupGetter__",
  "__lookupSetter__",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toString",
  "valueOf",
  "__proto__",
  "toLocaleString"
]);

/** Cross-realm-safe plain-object check for portable JSON boundaries. */
export function isPlainJsonObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype === null) return true;
  const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor");
  return (
    Object.getPrototypeOf(prototype) === null &&
    constructor !== undefined &&
    "value" in constructor &&
    typeof constructor.value === "function" &&
    (constructor.value as { name?: unknown }).name === "Object"
  );
}

/**
 * Check that an object has stable JSON.stringify semantics without invoking
 * user accessors or hooks.
 */
export function inspectJsonContainer(value: object): JsonContainerIssue | undefined {
  let current: object | null = value;
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, "toJSON");
    if (
      descriptor !== undefined &&
      (!("value" in descriptor) || typeof descriptor.value === "function")
    ) {
      return { code: "json.to-json", message: "Custom toJSON hooks are not supported" };
    }
    current = Object.getPrototypeOf(current) as object | null;
  }

  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (
      prototype !== null &&
      Reflect.ownKeys(prototype).some((key) => !STANDARD_OBJECT_PROTOTYPE_KEYS.has(key))
    ) {
      return {
        code: "json.inherited",
        message: "Plain JSON objects cannot inherit application data"
      };
    }
  }

  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") continue;
    if (typeof key !== "string") {
      return { code: "json.symbol-key", message: "JSON objects cannot contain symbol keys" };
    }
    if (Array.isArray(value)) {
      const index = Number(key);
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= value.length ||
        String(index) !== key
      ) {
        return {
          code: "json.array-field",
          key,
          message: "JSON arrays cannot contain named fields"
        };
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      return { code: "json.accessor", key, message: "JSON values cannot use accessor properties" };
    }
    if (!descriptor.enumerable) {
      return {
        code: "json.non-enumerable",
        key,
        message: "JSON values cannot contain non-enumerable data"
      };
    }
  }
  return undefined;
}
