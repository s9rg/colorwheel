import { useEffect, useInsertionEffect, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";
import { View } from "react-native";
import type { ViewProps } from "react-native";
import type { JsonObject, Palette } from "../core";
import { createPickerController, createPickerState } from "../editor";
import type {
  ChangeMeta,
  PickerController,
  PickerControllerOptions,
  PickerState,
  WheelEditorOptions
} from "../editor";
import { NativePickerProvider } from "./context";
import { createDefaultNativePalette } from "./defaults";

interface NativeRootPresentationProps extends Omit<ViewProps, "children"> {
  readonly children?: ReactNode;
}

interface NativeRootCallbacks<Metadata extends object> {
  readonly onChange?: (state: PickerState<Metadata>, meta: ChangeMeta) => void;
  readonly onPaletteChange?: (palette: Palette<Metadata>, meta: ChangeMeta) => void;
  readonly controllerOptions?: Omit<
    PickerControllerOptions<Metadata>,
    "onChange" | "onPaletteChange"
  >;
}

interface NativeControllerRootProps<Metadata extends object> extends NativeRootPresentationProps {
  readonly controller: PickerController<Metadata>;
  readonly value?: never;
  readonly defaultValue?: never;
  readonly palette?: never;
  readonly defaultPalette?: never;
  readonly wheel?: never;
  readonly onChange?: never;
  readonly onPaletteChange?: never;
  readonly controllerOptions?: never;
}

interface NativeStateRootProps<Metadata extends object>
  extends NativeRootPresentationProps, NativeRootCallbacks<Metadata> {
  readonly value: PickerState<Metadata>;
  readonly defaultValue?: never;
  readonly palette?: never;
  readonly defaultPalette?: never;
  readonly wheel?: never;
  readonly controller?: never;
}

interface NativePaletteRootProps<Metadata extends object>
  extends NativeRootPresentationProps, NativeRootCallbacks<Metadata> {
  readonly palette: Palette<Metadata>;
  readonly defaultPalette?: never;
  readonly value?: never;
  readonly defaultValue?: never;
  readonly wheel?: Partial<WheelEditorOptions>;
  readonly controller?: never;
}

interface NativeDefaultStateRootProps<Metadata extends object>
  extends NativeRootPresentationProps, NativeRootCallbacks<Metadata> {
  readonly defaultValue: PickerState<Metadata>;
  readonly defaultPalette?: never;
  readonly value?: never;
  readonly palette?: never;
  readonly wheel?: never;
  readonly controller?: never;
}

interface NativeDefaultPaletteRootProps<Metadata extends object>
  extends NativeRootPresentationProps, NativeRootCallbacks<Metadata> {
  readonly defaultPalette?: Palette<Metadata>;
  readonly defaultValue?: never;
  readonly value?: never;
  readonly palette?: never;
  readonly wheel?: Partial<WheelEditorOptions>;
  readonly controller?: never;
}

type NativeUncontrolledRootProps<Metadata extends object> =
  NativeDefaultStateRootProps<Metadata> | NativeDefaultPaletteRootProps<Metadata>;

export type NativePickerRootProps<Metadata extends object = JsonObject> =
  | NativeControllerRootProps<Metadata>
  | NativeStateRootProps<Metadata>
  | NativePaletteRootProps<Metadata>
  | NativeUncontrolledRootProps<Metadata>;

type RootMode = "controller" | "value" | "palette" | "uncontrolled";

function hasController<Metadata extends object>(
  props: NativePickerRootProps<Metadata>
): props is NativeControllerRootProps<Metadata> {
  return props.controller !== undefined;
}

function rootMode<Metadata extends object>(props: NativePickerRootProps<Metadata>): RootMode {
  if (hasController(props)) return "controller";
  if (props.value !== undefined) return "value";
  if (props.palette !== undefined) return "palette";
  return "uncontrolled";
}

function assertSingleRootSource<Metadata extends object>(
  props: NativePickerRootProps<Metadata>
): void {
  const sourceCount = [
    props.controller,
    props.value,
    props.palette,
    props.defaultValue,
    props.defaultPalette
  ].filter((source) => source !== undefined).length;
  if (sourceCount > 1) {
    throw new TypeError("Picker.Root accepts one state source");
  }
  if (props.controller !== undefined && props.controllerOptions !== undefined) {
    throw new TypeError("controllerOptions apply only to adapter-owned controllers");
  }
  if (
    props.wheel !== undefined &&
    (props.controller !== undefined ||
      props.value !== undefined ||
      props.defaultValue !== undefined)
  ) {
    throw new TypeError("wheel is configured by full-state and injected-controller sources");
  }
}

function createInitialState<Metadata extends object>(
  props: Exclude<NativePickerRootProps<Metadata>, NativeControllerRootProps<Metadata>>
): PickerState<Metadata> {
  if (props.value !== undefined) return props.value;
  if (props.defaultValue !== undefined) return props.defaultValue;
  const palette =
    props.palette ?? props.defaultPalette ?? (createDefaultNativePalette() as Palette<Metadata>);
  const wheel = {
    ...props.wheel,
    interaction: props.wheel?.interaction ?? (palette.recipe?.type === "wheel" ? "linked" : "free")
  } as Partial<WheelEditorOptions>;
  return createPickerState({ palette, wheel });
}

function enqueueMicrotask(callback: () => void): void {
  const nativeQueueMicrotask = (
    globalThis as typeof globalThis & {
      readonly queueMicrotask?: (task: () => void) => void;
    }
  ).queueMicrotask;
  if (nativeQueueMicrotask !== undefined) {
    nativeQueueMicrotask(callback);
  } else {
    void Promise.resolve().then(callback);
  }
}

class NativeControllerLifecycle {
  #generation = 0;

  activate(): number {
    this.#generation += 1;
    return this.#generation;
  }

  destroyAfterEffectReplay<Metadata extends object>(
    generation: number,
    controller: PickerController<Metadata> | null
  ): void {
    if (controller === null) return;
    enqueueMicrotask(() => {
      if (this.#generation === generation) controller.destroy();
    });
  }
}

class NativeRootCallbackBridge<Metadata extends object> {
  #props: NativePickerRootProps<Metadata>;
  #controller: PickerController<Metadata> | null = null;
  #reconcileQueued = false;

  constructor(props: NativePickerRootProps<Metadata>) {
    this.#props = props;
  }

  update(props: NativePickerRootProps<Metadata>): void {
    this.#props = props;
  }

  connect(controller: PickerController<Metadata> | null): void {
    this.#controller = controller;
  }

  #scheduleControlledReconciliation(): void {
    if (this.#reconcileQueued || this.#controller === null) return;
    this.#reconcileQueued = true;
    enqueueMicrotask(() => {
      this.#reconcileQueued = false;
      const controller = this.#controller;
      if (controller === null || hasController(this.#props)) return;
      if (this.#props.value !== undefined && controller.getState() !== this.#props.value) {
        controller.setState(this.#props.value);
      } else if (
        this.#props.palette !== undefined &&
        controller.getPalette() !== this.#props.palette
      ) {
        controller.setPalette(this.#props.palette);
      }
    });
  }

  emitChange(state: PickerState<Metadata>, meta: ChangeMeta): void {
    if (!hasController(this.#props)) {
      this.#props.onChange?.(state, meta);
      this.#scheduleControlledReconciliation();
    }
  }

  emitPaletteChange(palette: Palette<Metadata>, meta: ChangeMeta): void {
    if (!hasController(this.#props)) {
      this.#props.onPaletteChange?.(palette, meta);
      this.#scheduleControlledReconciliation();
    }
  }
}

/**
 * Provides one portable picker controller to native composition blocks.
 * Controlled values are reconciled after each user callback; external writes do
 * not echo through `onChange` or `onPaletteChange`.
 */
export function NativePickerRoot<Metadata extends object = JsonObject>(
  props: NativePickerRootProps<Metadata>
) {
  assertSingleRootSource(props);
  const [callbackBridge] = useState(() => new NativeRootCallbackBridge(props));
  const [initialMode] = useState(() => rootMode(props));
  const [lifecycle] = useState(() => new NativeControllerLifecycle());
  const [ownedController] = useState<PickerController<Metadata> | null>(() => {
    if (hasController(props)) return null;
    const controller = createPickerController(createInitialState(props), {
      ...props.controllerOptions,
      onChange(state, meta) {
        callbackBridge.emitChange(state, meta);
      },
      onPaletteChange(palette, meta) {
        callbackBridge.emitPaletteChange(palette, meta);
      }
    });
    return controller;
  });

  const controller = hasController(props)
    ? props.controller
    : (ownedController as PickerController<Metadata>);

  if (rootMode(props) !== initialMode) {
    throw new TypeError("Picker.Root source mode cannot change");
  }

  useInsertionEffect(() => {
    callbackBridge.update(props);
    callbackBridge.connect(ownedController);
    return () => callbackBridge.connect(null);
  }, [callbackBridge, ownedController, props]);

  useEffect(() => {
    const generation = lifecycle.activate();
    return () => lifecycle.destroyAfterEffectReplay(generation, ownedController);
  }, [lifecycle, ownedController]);

  useLayoutEffect(() => {
    if (hasController(props)) return;
    if (props.value !== undefined && controller.getState() !== props.value) {
      controller.setState(props.value);
    } else if (props.palette !== undefined && controller.getPalette() !== props.palette) {
      controller.setPalette(props.palette);
    }
    if (props.wheel !== undefined) {
      const current = controller.getState();
      const nextWheel = { ...current.wheel, ...props.wheel };
      if (
        nextWheel.wheelModel !== current.wheel.wheelModel ||
        nextWheel.interaction !== current.wheel.interaction ||
        nextWheel.outputGamut !== current.wheel.outputGamut
      ) {
        controller.setState({ ...current, wheel: nextWheel });
      }
    }
  }, [controller, props]);

  const children = props.children;
  const viewProps = { ...props } as NativeRootPresentationProps & {
    controller?: unknown;
    value?: unknown;
    defaultValue?: unknown;
    palette?: unknown;
    defaultPalette?: unknown;
    wheel?: unknown;
    onChange?: unknown;
    onPaletteChange?: unknown;
    controllerOptions?: unknown;
  };
  Reflect.deleteProperty(viewProps, "children");
  Reflect.deleteProperty(viewProps, "controller");
  Reflect.deleteProperty(viewProps, "value");
  Reflect.deleteProperty(viewProps, "defaultValue");
  Reflect.deleteProperty(viewProps, "palette");
  Reflect.deleteProperty(viewProps, "defaultPalette");
  Reflect.deleteProperty(viewProps, "wheel");
  Reflect.deleteProperty(viewProps, "onChange");
  Reflect.deleteProperty(viewProps, "onPaletteChange");
  Reflect.deleteProperty(viewProps, "controllerOptions");

  return (
    <NativePickerProvider controller={controller}>
      <View {...viewProps}>{children}</View>
    </NativePickerProvider>
  );
}
