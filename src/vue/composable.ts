import {
  computed,
  getCurrentInstance,
  getCurrentScope,
  onBeforeMount,
  onBeforeUnmount,
  onScopeDispose,
  shallowRef,
  shallowReadonly,
  toRaw,
  toValue,
  watch
} from "vue";
import type { ComputedRef, MaybeRefOrGetter, ShallowRef } from "vue";
import type { JsonObject, Palette } from "../core";
import { createPickerController, createPickerState } from "../editor";
import type {
  ChangeMeta,
  PickerController,
  PickerControllerOptions,
  PickerState,
  WheelEditorOptions
} from "../editor";
import { createDefaultPalette } from "./defaults";

interface UseColorwheelCallbacks<Metadata extends object> {
  readonly onChange?: (state: PickerState<Metadata>, meta: ChangeMeta) => void;
  readonly onPaletteChange?: (palette: Palette<Metadata>, meta: ChangeMeta) => void;
}

interface UseColorwheelOwnedOptions<
  Metadata extends object
> extends UseColorwheelCallbacks<Metadata> {
  readonly controllerOptions?: Omit<
    PickerControllerOptions<Metadata>,
    "onChange" | "onPaletteChange"
  >;
}

interface ControllerSource<Metadata extends object> extends UseColorwheelCallbacks<Metadata> {
  /** The controller remains owned by the caller and is never destroyed by this composable. */
  readonly controller: PickerController<Metadata>;
  readonly value?: never;
  readonly palette?: never;
  readonly defaultValue?: never;
  readonly defaultPalette?: never;
  readonly wheel?: never;
  readonly controllerOptions?: never;
}

interface StateSource<Metadata extends object> extends UseColorwheelOwnedOptions<Metadata> {
  /** A reactive controlled full-state source. */
  readonly value: MaybeRefOrGetter<PickerState<Metadata>>;
  readonly controller?: never;
  readonly palette?: never;
  readonly defaultValue?: never;
  readonly defaultPalette?: never;
  readonly wheel?: never;
}

interface PaletteSource<Metadata extends object> extends UseColorwheelOwnedOptions<Metadata> {
  /** A reactive controlled palette source. Session state remains adapter-owned. */
  readonly palette: MaybeRefOrGetter<Palette<Metadata>>;
  readonly controller?: never;
  readonly value?: never;
  readonly defaultValue?: never;
  readonly defaultPalette?: never;
  readonly wheel?: MaybeRefOrGetter<Partial<WheelEditorOptions> | undefined>;
}

interface DefaultStateSource<Metadata extends object> extends UseColorwheelOwnedOptions<Metadata> {
  readonly defaultValue: PickerState<Metadata>;
  readonly controller?: never;
  readonly value?: never;
  readonly palette?: never;
  readonly defaultPalette?: never;
  readonly wheel?: never;
}

interface DefaultPaletteSource<
  Metadata extends object
> extends UseColorwheelOwnedOptions<Metadata> {
  readonly defaultPalette?: Palette<Metadata>;
  readonly controller?: never;
  readonly value?: never;
  readonly palette?: never;
  readonly defaultValue?: never;
  readonly wheel?: MaybeRefOrGetter<Partial<WheelEditorOptions> | undefined>;
}

export type UseColorwheelOptions<Metadata extends object = JsonObject> =
  | ControllerSource<Metadata>
  | StateSource<Metadata>
  | PaletteSource<Metadata>
  | DefaultStateSource<Metadata>
  | DefaultPaletteSource<Metadata>;

export interface UseColorwheelResult<Metadata extends object = JsonObject> {
  readonly controller: PickerController<Metadata>;
  readonly state: Readonly<ShallowRef<PickerState<Metadata>>>;
  readonly palette: ComputedRef<Palette<Metadata>>;
  /** Releases subscriptions and destroys an adapter-owned controller. Idempotent. */
  readonly destroy: () => void;
}

type SourceMode = "controller" | "value" | "palette" | "uncontrolled";

function sourceMode<Metadata extends object>(options: UseColorwheelOptions<Metadata>): SourceMode {
  if (options.controller !== undefined) return "controller";
  if (options.value !== undefined) return "value";
  if (options.palette !== undefined) return "palette";
  return "uncontrolled";
}

function assertSingleSource<Metadata extends object>(
  options: UseColorwheelOptions<Metadata>
): void {
  const sources = [
    options.controller,
    options.value,
    options.palette,
    options.defaultValue,
    options.defaultPalette
  ].filter((source) => source !== undefined);
  if (sources.length > 1) {
    throw new TypeError(
      "useColorwheel accepts exactly one controller, value, palette, defaultValue, or defaultPalette source"
    );
  }
  if (options.controller !== undefined && options.controllerOptions !== undefined) {
    throw new TypeError("controllerOptions apply only to adapter-owned controllers");
  }
  if (
    options.wheel !== undefined &&
    (options.controller !== undefined ||
      options.value !== undefined ||
      options.defaultValue !== undefined)
  ) {
    throw new TypeError("wheel is configured by full-state and injected-controller sources");
  }
}

function sourceObject<Value extends object>(source: MaybeRefOrGetter<Value>): Value {
  return toRaw(toValue(source));
}

function optionalSourceObject<Value extends object>(
  source: MaybeRefOrGetter<Value | undefined>
): Value | undefined {
  const value = toValue(source);
  return value === undefined ? undefined : toRaw(value);
}

function createInitialState<Metadata extends object>(
  options: Exclude<UseColorwheelOptions<Metadata>, ControllerSource<Metadata>>
): PickerState<Metadata> {
  if (options.value !== undefined) return sourceObject(options.value);
  if (options.defaultValue !== undefined) return toRaw(options.defaultValue);
  const palette =
    (options.palette === undefined ? undefined : sourceObject(options.palette)) ??
    (options.defaultPalette === undefined ? undefined : toRaw(options.defaultPalette)) ??
    (createDefaultPalette() as Palette<Metadata>);
  const suppliedWheel =
    options.wheel === undefined ? undefined : optionalSourceObject(options.wheel);
  const wheel = {
    ...suppliedWheel,
    interaction:
      suppliedWheel?.interaction ?? (palette.recipe?.type === "wheel" ? "linked" : "free")
  };
  return createPickerState({ palette, wheel });
}

/**
 * Creates a reactive headless picker controller. It works during SSR because it
 * does not touch DOM globals; framework cleanup is tied to the active Vue scope.
 */
export function useColorwheel<Metadata extends object = JsonObject>(
  options: UseColorwheelOptions<Metadata> = {}
): UseColorwheelResult<Metadata> {
  assertSingleSource(options);
  const mode = sourceMode(options);
  const owned = mode !== "controller";
  const controller =
    options.controller ??
    createPickerController(createInitialState(options), options.controllerOptions);
  const currentState = shallowRef(controller.getState()) as ShallowRef<PickerState<Metadata>>;
  let previousPalette = currentState.value.palette;
  let destroyed = false;
  let reconciliationQueued = false;

  function reconcileControlledSource(): void {
    if (reconciliationQueued || (mode !== "value" && mode !== "palette")) return;
    reconciliationQueued = true;
    queueMicrotask(() => {
      reconciliationQueued = false;
      if (destroyed) return;
      if (mode === "value" && options.value !== undefined) {
        const desired = sourceObject(options.value);
        if (controller.getState() !== desired) controller.setState(desired);
      } else if (mode === "palette" && options.palette !== undefined) {
        const desired = sourceObject(options.palette);
        if (controller.getPalette() !== desired) controller.setPalette(desired);
      }
    });
  }

  let unsubscribe: (() => void) | undefined;
  let stopSourceWatch: (() => void) | undefined;
  let stopWheelWatch: (() => void) | undefined;

  function connect(): void {
    if (destroyed || unsubscribe !== undefined) return;
    currentState.value = controller.getState();
    previousPalette = currentState.value.palette;
    unsubscribe = controller.subscribe(
      (state) => state,
      (state, meta) => {
        const paletteChanged = previousPalette !== state.palette;
        previousPalette = state.palette;
        currentState.value = state;
        if (meta.origin === "external") return;
        options.onChange?.(state, meta);
        if (paletteChanged) options.onPaletteChange?.(state.palette, meta);
        reconcileControlledSource();
      }
    );
    stopSourceWatch =
      mode === "value" && options.value !== undefined
        ? watch(
            () => toValue(options.value),
            (next) => {
              const desired = toRaw(next);
              if (!destroyed && controller.getState() !== desired) controller.setState(desired);
            },
            { flush: "sync", immediate: true }
          )
        : mode === "palette" && options.palette !== undefined
          ? watch(
              () => toValue(options.palette),
              (next) => {
                const desired = toRaw(next);
                if (!destroyed && controller.getPalette() !== desired)
                  controller.setPalette(desired);
              },
              { flush: "sync", immediate: true }
            )
          : undefined;
    const wheelSource = "wheel" in options ? options.wheel : undefined;
    stopWheelWatch =
      wheelSource === undefined
        ? undefined
        : watch(
            () => toValue(wheelSource),
            (next) => {
              if (destroyed || next === undefined) return;
              const state = controller.getState();
              const wheel = { ...state.wheel, ...toRaw(next) };
              if (
                wheel.wheelModel !== state.wheel.wheelModel ||
                wheel.interaction !== state.wheel.interaction ||
                wheel.outputGamut !== state.wheel.outputGamut
              ) {
                controller.setState({ ...state, wheel });
              }
            },
            { deep: true, flush: "sync", immediate: true }
          );
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    stopSourceWatch?.();
    stopWheelWatch?.();
    unsubscribe?.();
    unsubscribe = undefined;
    if (owned) controller.destroy();
  }

  const componentInstance = getCurrentInstance();
  if (componentInstance !== null && !componentInstance.isMounted) {
    onBeforeMount(connect);
    onBeforeUnmount(destroy);
    if (getCurrentScope() !== undefined) onScopeDispose(destroy);
  } else {
    connect();
    if (getCurrentScope() !== undefined) onScopeDispose(destroy);
  }

  return {
    controller,
    state: shallowReadonly(currentState),
    palette: computed(() => currentState.value.palette),
    destroy
  };
}
