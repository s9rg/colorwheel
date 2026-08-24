import { useEffect, useInsertionEffect, useLayoutEffect, useState } from "react";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import type { JsonObject, Palette } from "../core";
import { createPickerController, createPickerState } from "../editor";
import type {
  ChangeMeta,
  PickerController,
  PickerControllerOptions,
  PickerState,
  WheelEditorOptions
} from "../editor";
import { PickerProvider } from "./context";
import { createDefaultPalette } from "./defaults";

const usePrePaintEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

interface RootPresentationProps {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly id?: string;
  readonly unstyled?: boolean;
  readonly "aria-label"?: string;
}

interface RootCallbacks<Metadata extends object> {
  readonly onChange?: (state: PickerState<Metadata>, meta: ChangeMeta) => void;
  readonly onPaletteChange?: (palette: Palette<Metadata>, meta: ChangeMeta) => void;
  readonly controllerOptions?: Omit<
    PickerControllerOptions<Metadata>,
    "onChange" | "onPaletteChange"
  >;
}

interface ControllerRootProps<Metadata extends object> extends RootPresentationProps {
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

interface StateRootProps<Metadata extends object>
  extends RootPresentationProps, RootCallbacks<Metadata> {
  readonly value: PickerState<Metadata>;
  readonly defaultValue?: never;
  readonly palette?: never;
  readonly defaultPalette?: never;
  readonly wheel?: never;
  readonly controller?: never;
}

interface PaletteRootProps<Metadata extends object>
  extends RootPresentationProps, RootCallbacks<Metadata> {
  readonly palette: Palette<Metadata>;
  readonly defaultPalette?: never;
  readonly value?: never;
  readonly defaultValue?: never;
  readonly wheel?: Partial<WheelEditorOptions>;
  readonly controller?: never;
}

interface DefaultStateRootProps<Metadata extends object>
  extends RootPresentationProps, RootCallbacks<Metadata> {
  readonly defaultValue: PickerState<Metadata>;
  readonly defaultPalette?: never;
  readonly value?: never;
  readonly palette?: never;
  readonly wheel?: never;
  readonly controller?: never;
}

interface DefaultPaletteRootProps<Metadata extends object>
  extends RootPresentationProps, RootCallbacks<Metadata> {
  readonly defaultPalette?: Palette<Metadata>;
  readonly defaultValue?: never;
  readonly value?: never;
  readonly palette?: never;
  readonly wheel?: Partial<WheelEditorOptions>;
  readonly controller?: never;
}

type UncontrolledRootProps<Metadata extends object> =
  DefaultStateRootProps<Metadata> | DefaultPaletteRootProps<Metadata>;

export type PickerRootProps<Metadata extends object = JsonObject> =
  | ControllerRootProps<Metadata>
  | StateRootProps<Metadata>
  | PaletteRootProps<Metadata>
  | UncontrolledRootProps<Metadata>;

class RootCallbackBridge<Metadata extends object> {
  #props: PickerRootProps<Metadata>;
  #controller: PickerController<Metadata> | null = null;
  #reconcileQueued = false;

  constructor(props: PickerRootProps<Metadata>) {
    this.#props = props;
  }

  update(props: PickerRootProps<Metadata>): void {
    this.#props = props;
  }

  connect(controller: PickerController<Metadata> | null): void {
    this.#controller = controller;
  }

  #scheduleControlledReconciliation(): void {
    if (this.#reconcileQueued || this.#controller === null) return;
    this.#reconcileQueued = true;
    queueMicrotask(() => {
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

class ControllerLifecycle {
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
    queueMicrotask(() => {
      if (this.#generation === generation) controller.destroy();
    });
  }
}

function hasController<Metadata extends object>(
  props: PickerRootProps<Metadata>
): props is ControllerRootProps<Metadata> {
  return props.controller !== undefined;
}

function createInitialState<Metadata extends object>(
  props: Exclude<PickerRootProps<Metadata>, ControllerRootProps<Metadata>>
): PickerState<Metadata> {
  if (props.value !== undefined) return props.value;
  if (props.defaultValue !== undefined) return props.defaultValue;
  const palette =
    props.palette ?? props.defaultPalette ?? (createDefaultPalette() as Palette<Metadata>);
  const wheel = {
    ...props.wheel,
    interaction: props.wheel?.interaction ?? (palette.recipe?.type === "wheel" ? "linked" : "free")
  } as Partial<WheelEditorOptions>;
  return createPickerState({ palette, wheel });
}

type RootMode = "controller" | "value" | "palette" | "uncontrolled";

function rootMode<Metadata extends object>(props: PickerRootProps<Metadata>): RootMode {
  if (hasController(props)) return "controller";
  if (props.value !== undefined) return "value";
  if (props.palette !== undefined) return "palette";
  return "uncontrolled";
}

function assertSingleRootSource<Metadata extends object>(props: PickerRootProps<Metadata>): void {
  const sourceCount = [
    props.controller,
    props.value,
    props.palette,
    props.defaultValue,
    props.defaultPalette
  ].filter((source) => source !== undefined).length;
  if (sourceCount > 1) {
    throw new TypeError(
      "Picker.Root accepts exactly one controller, value, palette, defaultValue, or defaultPalette source"
    );
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

export function PickerRoot<Metadata extends object = JsonObject>(props: PickerRootProps<Metadata>) {
  assertSingleRootSource(props);
  const [callbackBridge] = useState(() => new RootCallbackBridge(props));
  const [lifecycle] = useState(() => new ControllerLifecycle());
  const [initialMode] = useState(() => rootMode(props));
  const [ownedController] = useState<PickerController<Metadata> | null>(() => {
    if (hasController(props)) return null;
    const initialState = createInitialState(props);
    return createPickerController(initialState, {
      ...props.controllerOptions,
      onChange(state, meta) {
        callbackBridge.emitChange(state, meta);
      },
      onPaletteChange(palette, meta) {
        callbackBridge.emitPaletteChange(palette, meta);
      }
    });
  });

  const controller = hasController(props)
    ? props.controller
    : (ownedController as PickerController<Metadata>);

  if (rootMode(props) !== initialMode) {
    throw new TypeError(
      "Picker.Root cannot switch between controller, controlled, and uncontrolled modes"
    );
  }
  useInsertionEffect(() => {
    callbackBridge.update(props);
    callbackBridge.connect(ownedController);
    return () => callbackBridge.connect(null);
  }, [callbackBridge, ownedController, props]);

  useEffect(() => {
    const generation = lifecycle.activate();
    return () => {
      lifecycle.destroyAfterEffectReplay(generation, ownedController);
    };
  }, [lifecycle, ownedController]);

  usePrePaintEffect(() => {
    if (hasController(props)) return;
    if (props.value !== undefined && controller.getState() !== props.value) {
      controller.setState(props.value);
      return;
    }
    if (props.palette !== undefined && controller.getPalette() !== props.palette) {
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

  const rootAttributes: HTMLAttributes<HTMLDivElement> = {
    id: props.id,
    className: props.className,
    style: props.style,
    "aria-label": props["aria-label"],
    role: "group"
  };

  return (
    <PickerProvider controller={controller}>
      <div
        {...rootAttributes}
        data-colorwheel=""
        data-part="root"
        data-unstyled={props.unstyled ? "" : undefined}
      >
        {props.children}
      </div>
    </PickerProvider>
  );
}
