import {
  computed,
  defineComponent,
  Fragment,
  getCurrentInstance,
  h,
  nextTick,
  onBeforeMount,
  onBeforeUnmount,
  reactive,
  render,
  shallowReadonly,
  shallowRef,
  toRaw,
  watch
} from "vue";
import type { CSSProperties, PropType, SlotsType, VNode, VNodeChild } from "vue";
import { convertColor, formatColor, parseColor } from "../core";
import type { JsonObject, Palette, PaletteColor } from "../core";
import {
  OKLCH_WHEEL_MAX_CHROMA,
  clientPointToWheelPoint,
  colorToWheelPoint,
  createPickerController,
  createPickerState,
  getPointerAccessibilityProps,
  getSliderKeyboardValue,
  getWheelAccessibilityProps,
  getWheelChannelValue,
  resolveWheelEditingColor,
  ringPointToWheelChannelValue,
  setWheelChannelValue,
  wheelChannelValueToRingPoint,
  wheelPointToColor
} from "../editor";
import type {
  ChangeMeta,
  PickerController,
  PickerControllerOptions,
  PickerFocusTarget,
  PickerInteraction,
  PickerState,
  WheelEditorOptions,
  WheelPoint,
  WheelRingSide
} from "../editor";
import { provideColorwheelContext } from "./context";
import { createDefaultPalette } from "./defaults";

export interface PaletteRenderContext<Metadata extends object = JsonObject> {
  readonly container: HTMLElement;
  readonly controller: PickerController<Metadata>;
  readonly state: PickerState<Metadata>;
  readonly renderDefault: () => HTMLElement;
}

export interface PaletteRenderHandle<Metadata extends object = JsonObject> {
  readonly node?: Node;
  readonly update?: (context: PaletteRenderContext<Metadata>) => void;
  readonly destroy?: () => void;
}

export type PaletteRenderResult<Metadata extends object = JsonObject> =
  Node | PaletteRenderHandle<Metadata> | null | undefined | void;
export type RenderPalette<Metadata extends object = JsonObject> = (
  context: PaletteRenderContext<Metadata>
) => PaletteRenderResult<Metadata>;

export interface ColorwheelWheelBlockProps {
  readonly title?: VNodeChild;
  readonly description?: VNodeChild;
  readonly className?: string;
  readonly showInstructions?: boolean;
  readonly showChannelRing?: boolean;
}

export interface ColorwheelPaletteBlockProps {
  readonly title?: VNodeChild;
  readonly description?: VNodeChild;
  readonly className?: string;
  readonly showName?: boolean;
  readonly showActions?: boolean;
  readonly allowAdd?: boolean;
}

export interface ColorwheelBlockProps {
  readonly wheel?: ColorwheelWheelBlockProps;
  readonly palette?: ColorwheelPaletteBlockProps;
}

interface ColorwheelPresentationProps<Metadata extends object> {
  readonly className?: string;
  readonly ariaLabel?: string;
  readonly unstyled?: boolean;
  readonly blockProps?: ColorwheelBlockProps;
  /** Legacy DOM escape hatch. Prefer the native `palette` slot in Vue applications. */
  readonly renderPalette?: RenderPalette<Metadata> | false;
}

interface ColorwheelControllerProps<Metadata extends object> {
  readonly controller: PickerController<Metadata>;
  readonly modelValue?: never;
  readonly palette?: never;
  readonly defaultValue?: never;
  readonly defaultPalette?: never;
  readonly wheel?: never;
  readonly controllerOptions?: never;
}

interface ColorwheelStateProps<Metadata extends object> {
  readonly modelValue: PickerState<Metadata>;
  readonly controller?: never;
  readonly palette?: never;
  readonly defaultValue?: never;
  readonly defaultPalette?: never;
  readonly wheel?: never;
  readonly controllerOptions?: Omit<
    PickerControllerOptions<Metadata>,
    "onChange" | "onPaletteChange"
  >;
}

interface ColorwheelPaletteProps<Metadata extends object> {
  readonly palette: Palette<Metadata>;
  readonly controller?: never;
  readonly modelValue?: never;
  readonly defaultValue?: never;
  readonly defaultPalette?: never;
  readonly wheel?: Partial<WheelEditorOptions>;
  readonly controllerOptions?: Omit<
    PickerControllerOptions<Metadata>,
    "onChange" | "onPaletteChange"
  >;
}

interface ColorwheelDefaultStateProps<Metadata extends object> {
  readonly defaultValue: PickerState<Metadata>;
  readonly controller?: never;
  readonly modelValue?: never;
  readonly palette?: never;
  readonly defaultPalette?: never;
  readonly wheel?: never;
  readonly controllerOptions?: Omit<
    PickerControllerOptions<Metadata>,
    "onChange" | "onPaletteChange"
  >;
}

interface ColorwheelDefaultPaletteProps<Metadata extends object> {
  readonly defaultPalette?: Palette<Metadata>;
  readonly controller?: never;
  readonly modelValue?: never;
  readonly palette?: never;
  readonly defaultValue?: never;
  readonly wheel?: Partial<WheelEditorOptions>;
  readonly controllerOptions?: Omit<
    PickerControllerOptions<Metadata>,
    "onChange" | "onPaletteChange"
  >;
}

export type ColorwheelProps<Metadata extends object = JsonObject> =
  ColorwheelPresentationProps<Metadata> &
    (
      | ColorwheelControllerProps<Metadata>
      | ColorwheelStateProps<Metadata>
      | ColorwheelPaletteProps<Metadata>
      | ColorwheelDefaultStateProps<Metadata>
      | ColorwheelDefaultPaletteProps<Metadata>
    );

export interface ColorwheelSlotScope<Metadata extends object = JsonObject> {
  readonly controller: PickerController<Metadata>;
  readonly state: PickerState<Metadata>;
  readonly palette: Palette<Metadata>;
}

export interface ColorwheelPointerSlotScope<Metadata extends object = JsonObject> {
  readonly entry: PaletteColor<Metadata>;
  readonly point: WheelPoint;
  readonly active: boolean;
  readonly anchor: boolean;
  readonly editable: boolean;
  /** Bind these attributes to a button to retain the standard interaction contract. */
  readonly buttonProps: Readonly<Record<string, unknown>>;
  readonly defaultPointer: VNode;
}

export interface ColorwheelSwatchSlotScope<Metadata extends object = JsonObject> {
  readonly entry: PaletteColor<Metadata>;
  readonly index: number;
  readonly count: number;
  readonly active: boolean;
  readonly anchor: boolean;
  readonly editable: boolean;
  readonly actionProps: {
    readonly select: Readonly<Record<string, unknown>>;
    readonly lock: Readonly<Record<string, unknown>>;
    readonly moveEarlier: Readonly<Record<string, unknown>>;
    readonly moveLater: Readonly<Record<string, unknown>>;
    readonly remove: Readonly<Record<string, unknown>>;
  };
  readonly defaultSwatch: VNode;
}

export interface ColorwheelSlots<Metadata extends object = JsonObject> {
  readonly default?: (scope: ColorwheelSlotScope<Metadata>) => VNodeChild;
  readonly palette?: (scope: ColorwheelSlotScope<Metadata>) => VNodeChild;
  readonly pointer?: (scope: ColorwheelPointerSlotScope<Metadata>) => VNodeChild;
  readonly swatch?: (scope: ColorwheelSwatchSlotScope<Metadata>) => VNodeChild;
}

export interface ColorwheelExposed<Metadata extends object = JsonObject> {
  readonly controller: PickerController<Metadata>;
  readonly root: HTMLElement | null;
  readonly state: PickerState<Metadata>;
  focus(target?: PickerFocusTarget): void;
  setState(state: PickerState<Metadata>): void;
  setPalette(palette: Palette<Metadata>): void;
}

type ComponentSourceMode = "controller" | "value" | "palette" | "uncontrolled";

interface RuntimeProps<Metadata extends object> {
  readonly controller?: PickerController<Metadata>;
  readonly modelValue?: PickerState<Metadata>;
  readonly palette?: Palette<Metadata>;
  readonly defaultValue?: PickerState<Metadata>;
  readonly defaultPalette?: Palette<Metadata>;
  readonly wheel?: Partial<WheelEditorOptions>;
  readonly controllerOptions?: Omit<
    PickerControllerOptions<Metadata>,
    "onChange" | "onPaletteChange"
  >;
  readonly className?: string;
  readonly ariaLabel?: string;
  readonly unstyled: boolean;
  readonly blockProps?: ColorwheelBlockProps;
  readonly renderPalette?: RenderPalette<Metadata> | false;
}

interface ActiveDrag<Metadata extends object> {
  readonly pointerId: number;
  readonly colorId: string;
  readonly element: HTMLElement;
  readonly region: "wheel" | "ring";
  readonly interaction: PickerInteraction<Metadata>;
}

interface ColorDraft {
  readonly source: string;
  readonly value: string;
  readonly invalid: boolean;
}

function componentSourceMode<Metadata extends object>(
  props: RuntimeProps<Metadata>
): ComponentSourceMode {
  if (props.controller !== undefined) return "controller";
  if (props.modelValue !== undefined) return "value";
  if (props.palette !== undefined) return "palette";
  return "uncontrolled";
}

function assertComponentSource<Metadata extends object>(props: RuntimeProps<Metadata>): void {
  const sourceCount = [
    props.controller,
    props.modelValue,
    props.palette,
    props.defaultValue,
    props.defaultPalette
  ].filter((source) => source !== undefined).length;
  if (sourceCount > 1) {
    throw new TypeError(
      "Colorwheel accepts exactly one controller, modelValue, palette, defaultValue, or defaultPalette source"
    );
  }
  if (props.controller !== undefined && props.controllerOptions !== undefined) {
    throw new TypeError("controllerOptions apply only to adapter-owned controllers");
  }
  if (
    props.wheel !== undefined &&
    (props.controller !== undefined ||
      props.modelValue !== undefined ||
      props.defaultValue !== undefined)
  ) {
    throw new TypeError("wheel is configured by full-state and injected-controller sources");
  }
}

function initialState<Metadata extends object>(
  props: RuntimeProps<Metadata>
): PickerState<Metadata> {
  if (props.modelValue !== undefined) return toRaw(props.modelValue);
  if (props.defaultValue !== undefined) return toRaw(props.defaultValue);
  const palette =
    (props.palette === undefined ? undefined : toRaw(props.palette)) ??
    (props.defaultPalette === undefined ? undefined : toRaw(props.defaultPalette)) ??
    (createDefaultPalette() as Palette<Metadata>);
  const wheel = {
    ...toRaw(props.wheel),
    interaction: props.wheel?.interaction ?? (palette.recipe?.type === "wheel" ? "linked" : "free")
  };
  return createPickerState({ palette, wheel });
}

function entryById<Metadata extends object>(
  state: PickerState<Metadata>,
  colorId: string
): PaletteColor<Metadata> | undefined {
  return state.palette.colors.find((entry) => entry.id === colorId);
}

function canEdit<Metadata extends object>(
  state: PickerState<Metadata>,
  entry: PaletteColor<Metadata>
): boolean {
  return !entry.locked && (state.wheel.interaction === "free" || entry.id === state.anchorColorId);
}

function colorLabel<Metadata extends object>(entry: PaletteColor<Metadata>, index: number): string {
  return entry.name?.trim() || `Color ${index + 1}`;
}

function toHex<Metadata extends object>(entry: PaletteColor<Metadata>): string {
  return formatColor(entry.color, { format: "hex", alpha: "auto" });
}

function eventTargetElement(event: Event): Element | null {
  const target = event.target;
  return typeof target === "object" &&
    target !== null &&
    (target as Node).nodeType === 1 &&
    typeof (target as Element).closest === "function"
    ? (target as Element)
    : null;
}

function keyboardColor<Metadata extends object>(
  state: PickerState<Metadata>,
  entry: PaletteColor<Metadata>,
  event: KeyboardEvent
) {
  const hueStep = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
  const radialStep = event.shiftKey ? 0.1 : event.altKey ? 0.001 : 0.01;
  const editingColor = resolveWheelEditingColor(state, entry);
  if (state.wheel.wheelModel === "oklch") {
    const color = convertColor(editingColor, "oklch");
    if (event.key === "ArrowLeft" || event.key === "PageDown")
      return { ...color, h: color.h - (event.key === "PageDown" ? 10 : hueStep) };
    if (event.key === "ArrowRight" || event.key === "PageUp")
      return { ...color, h: color.h + (event.key === "PageUp" ? 10 : hueStep) };
    if (event.key === "ArrowUp")
      return {
        ...color,
        c: Math.min(OKLCH_WHEEL_MAX_CHROMA, color.c + radialStep * OKLCH_WHEEL_MAX_CHROMA)
      };
    if (event.key === "ArrowDown")
      return {
        ...color,
        c: Math.max(0, color.c - radialStep * OKLCH_WHEEL_MAX_CHROMA)
      };
    if (event.key === "Home") return { ...color, c: 0 };
    if (event.key === "End") return { ...color, c: OKLCH_WHEEL_MAX_CHROMA };
    return undefined;
  }
  const color = convertColor(editingColor, "hsv");
  if (event.key === "ArrowLeft" || event.key === "PageDown")
    return { ...color, h: color.h - (event.key === "PageDown" ? 10 : hueStep) };
  if (event.key === "ArrowRight" || event.key === "PageUp")
    return { ...color, h: color.h + (event.key === "PageUp" ? 10 : hueStep) };
  if (event.key === "ArrowUp") return { ...color, s: Math.min(1, color.s + radialStep) };
  if (event.key === "ArrowDown") return { ...color, s: Math.max(0, color.s - radialStep) };
  if (event.key === "Home") return { ...color, s: 0 };
  if (event.key === "End") return { ...color, s: 1 };
  return undefined;
}

function isNode(value: unknown): value is Node {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Node).nodeType === "number" &&
    typeof (value as Node).cloneNode === "function"
  );
}

/** Creates a metadata-specialized Vue 3 component. */
export function createColorwheelComponent<Metadata extends object = JsonObject>() {
  return defineComponent({
    name: "Colorwheel",
    inheritAttrs: false,
    props: {
      controller: Object as PropType<PickerController<Metadata>>,
      modelValue: Object as PropType<PickerState<Metadata>>,
      palette: Object as PropType<Palette<Metadata>>,
      defaultValue: Object as PropType<PickerState<Metadata>>,
      defaultPalette: Object as PropType<Palette<Metadata>>,
      wheel: Object as PropType<Partial<WheelEditorOptions>>,
      controllerOptions: Object as PropType<
        Omit<PickerControllerOptions<Metadata>, "onChange" | "onPaletteChange">
      >,
      className: String,
      ariaLabel: String,
      unstyled: Boolean,
      blockProps: Object as PropType<ColorwheelBlockProps>,
      renderPalette: {
        type: [Function, Boolean] as PropType<RenderPalette<Metadata> | false>,
        default: undefined,
        validator: (value: unknown) => value === false || typeof value === "function"
      }
    },
    emits: {
      "update:modelValue": (state: PickerState<Metadata>, meta: ChangeMeta) =>
        state.palette !== undefined && meta.action !== undefined,
      "update:palette": (palette: Palette<Metadata>, meta: ChangeMeta) =>
        palette.colors !== undefined && meta.action !== undefined,
      change: (state: PickerState<Metadata>, meta: ChangeMeta) =>
        state.palette !== undefined && meta.action !== undefined,
      "palette-change": (palette: Palette<Metadata>, meta: ChangeMeta) =>
        palette.colors !== undefined && meta.action !== undefined
    },
    slots: Object as SlotsType<ColorwheelSlots<Metadata>>,
    setup(props, { attrs, emit, expose, slots }) {
      assertComponentSource(props);
      const mode = componentSourceMode(props);
      const owned = mode !== "controller";
      const ownedController = owned
        ? createPickerController(initialState(props), props.controllerOptions)
        : undefined;
      const currentController = shallowRef(
        props.controller === undefined
          ? (ownedController as PickerController<Metadata>)
          : toRaw(props.controller)
      );
      const state = shallowRef(currentController.value.getState());
      const palette = computed(() => state.value.palette);
      const root = shallowRef<HTMLElement | null>(null);
      const legacyHost = shallowRef<HTMLElement | null>(null);
      const componentInstance = getCurrentInstance();
      const componentId = `colorwheel-vue-${componentInstance?.uid ?? 0}`;
      const ringSide = shallowRef<WheelRingSide>("right");
      const drafts = reactive<Record<string, ColorDraft>>({});
      const nameInteractions = new Map<string, PickerInteraction<Metadata>>();
      let drag: ActiveDrag<Metadata> | undefined;
      let ringDrag: ActiveDrag<Metadata> | undefined;
      let stopDragListeners: (() => void) | undefined;
      let unsubscribe: (() => void) | undefined;
      let previousPalette = state.value.palette;
      let alive = true;
      let mounted = false;
      let reconciliationQueued = false;
      let legacyCleanup: (() => void) | undefined;
      let legacyUpdate: ((context: PaletteRenderContext<Metadata>) => void) | undefined;
      let legacyContext: PaletteRenderContext<Metadata> | undefined;
      let mountedLegacyRenderer: RenderPalette<Metadata> | undefined;
      let mountedLegacyController: PickerController<Metadata> | undefined;
      const legacyRenderRoots = new Set<HTMLElement>();

      function pruneRemovedEditState(next: PickerState<Metadata>, meta: ChangeMeta): void {
        const colorIds = new Set(next.palette.colors.map((entry) => entry.id));
        for (const id of Object.keys(drafts)) {
          if (!colorIds.has(id)) delete drafts[id];
        }
        for (const [id, interaction] of nameInteractions) {
          if (colorIds.has(id)) continue;
          nameInteractions.delete(id);
          if (meta.origin !== "external") interaction.commit();
        }
      }

      function emitChange(
        next: PickerState<Metadata>,
        meta: ChangeMeta,
        paletteChanged: boolean
      ): void {
        if (meta.origin === "external") return;
        emit("update:modelValue", next, meta);
        emit("change", next, meta);
        if (paletteChanged) {
          emit("update:palette", next.palette, meta);
          emit("palette-change", next.palette, meta);
        }
        if ((mode === "value" || mode === "palette") && !reconciliationQueued) {
          reconciliationQueued = true;
          queueMicrotask(() => {
            reconciliationQueued = false;
            if (!alive) return;
            const controller = currentController.value;
            if (mode === "value" && props.modelValue !== undefined) {
              const desired = toRaw(props.modelValue);
              if (controller.getState() !== desired) controller.setState(desired);
            } else if (mode === "palette" && props.palette !== undefined) {
              const desired = toRaw(props.palette);
              if (controller.getPalette() !== desired) controller.setPalette(desired);
            }
          });
        }
      }

      function bindController(controller: PickerController<Metadata>): void {
        unsubscribe?.();
        unsubscribe = undefined;
        previousPalette = controller.getPalette();
        state.value = controller.getState();
        if (!mounted) return;
        unsubscribe = controller.subscribe(
          (next) => next,
          (next, meta) => {
            const paletteChanged = previousPalette !== next.palette;
            previousPalette = next.palette;
            state.value = next;
            pruneRemovedEditState(next, meta);
            emitChange(next, meta, paletteChanged);
          }
        );
      }

      bindController(currentController.value);
      onBeforeMount(() => {
        mounted = true;
        bindController(currentController.value);
      });
      const context = {
        get controller() {
          return currentController.value;
        },
        state: shallowReadonly(state),
        palette
      };
      provideColorwheelContext(context);

      watch(
        () =>
          [
            props.controller,
            props.modelValue,
            props.palette,
            props.defaultValue,
            props.defaultPalette,
            props.wheel,
            props.controllerOptions
          ] as const,
        () => {
          assertComponentSource(props);
          if (componentSourceMode(props) !== mode) {
            throw new TypeError(
              "Colorwheel cannot switch between controller, controlled, and uncontrolled modes"
            );
          }
        },
        { flush: "sync" }
      );

      if (mode === "controller") {
        watch(
          () => props.controller,
          (next) => {
            if (next === undefined) return;
            const controller = toRaw(next);
            if (controller === currentController.value) return;
            finishInteractions(true, true);
            finishNameInteractions(true);
            for (const id of Object.keys(drafts)) delete drafts[id];
            currentController.value = controller;
            bindController(controller);
          },
          { flush: "sync" }
        );
      } else if (mode === "value") {
        watch(
          () => props.modelValue,
          (next) => {
            if (next === undefined) return;
            const desired = toRaw(next);
            if (currentController.value.getState() !== desired) {
              currentController.value.setState(desired);
            }
          },
          { flush: "sync" }
        );
      } else if (mode === "palette") {
        watch(
          () => props.palette,
          (next) => {
            if (next === undefined) return;
            const desired = toRaw(next);
            if (currentController.value.getPalette() !== desired) {
              currentController.value.setPalette(desired);
            }
          },
          { flush: "sync" }
        );
      }

      if (mode === "palette" || mode === "uncontrolled") {
        watch(
          () => props.wheel,
          (next) => {
            if (next === undefined) return;
            const controller = currentController.value;
            const current = controller.getState();
            const wheel = { ...current.wheel, ...toRaw(next) };
            if (
              wheel.wheelModel !== current.wheel.wheelModel ||
              wheel.interaction !== current.wheel.interaction ||
              wheel.outputGamut !== current.wheel.outputGamut
            ) {
              controller.setState({ ...current, wheel });
            }
          },
          { deep: true, flush: "sync" }
        );
      }

      function slotScope(): ColorwheelSlotScope<Metadata> {
        return {
          controller: currentController.value,
          state: state.value,
          palette: state.value.palette
        };
      }

      function finishInteractions(cancelled: boolean, suppressErrors = false): void {
        const active = drag;
        const activeRing = ringDrag;
        drag = undefined;
        ringDrag = undefined;
        stopDragListeners?.();
        stopDragListeners = undefined;
        let failure: unknown;
        for (const item of [active, activeRing]) {
          if (item === undefined) continue;
          try {
            if (cancelled) item.interaction.cancel();
            else item.interaction.commit();
          } catch (error) {
            failure ??= error;
          }
        }
        if (!suppressErrors && failure !== undefined) {
          throw failure instanceof Error ? failure : new Error("Colorwheel interaction failed");
        }
      }

      function finishNameInteractions(suppressErrors = false): void {
        const interactions = [...nameInteractions.values()];
        nameInteractions.clear();
        let failure: unknown;
        for (const interaction of interactions) {
          try {
            interaction.commit();
          } catch (error) {
            failure ??= error;
          }
        }
        if (!suppressErrors && failure !== undefined) {
          throw failure instanceof Error ? failure : new Error("Colorwheel interaction failed");
        }
      }

      function pointColor(
        current: PickerState<Metadata>,
        entry: PaletteColor<Metadata>,
        element: HTMLElement,
        event: PointerEvent
      ) {
        const rect = element.getBoundingClientRect();
        return wheelPointToColor(
          clientPointToWheelPoint(
            { x: event.clientX, y: event.clientY },
            { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
          ),
          resolveWheelEditingColor(current, entry),
          { model: current.wheel.wheelModel }
        );
      }

      function ringColor(
        current: PickerState<Metadata>,
        entry: PaletteColor<Metadata>,
        element: HTMLElement,
        event: PointerEvent
      ) {
        const rect = element.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        if (x < 0.45) ringSide.value = "left";
        else if (x > 0.55) ringSide.value = "right";
        const point = clientPointToWheelPoint(
          { x: event.clientX, y: event.clientY },
          { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        );
        return setWheelChannelValue(
          resolveWheelEditingColor(current, entry),
          ringPointToWheelChannelValue(point),
          { model: current.wheel.wheelModel }
        );
      }

      function applyDrag(session: ActiveDrag<Metadata>, event: PointerEvent): void {
        const current = currentController.value.getState();
        const entry = entryById(current, session.colorId);
        if (entry === undefined || !canEdit(current, entry)) return;
        session.interaction.update({
          type: "set-color",
          colorId: entry.id,
          color:
            session.region === "ring"
              ? ringColor(current, entry, session.element, event)
              : pointColor(current, entry, session.element, event)
        });
      }

      function listenForPointer(ownerDocument: Document): void {
        stopDragListeners?.();
        const move = (event: PointerEvent) => {
          const session = drag ?? ringDrag;
          if (session === undefined || session.pointerId !== event.pointerId) return;
          applyDrag(session, event);
          event.preventDefault();
        };
        const end = (event: PointerEvent) => {
          const session = drag ?? ringDrag;
          if (session === undefined || session.pointerId !== event.pointerId) return;
          endPointer(event, session.region);
        };
        ownerDocument.addEventListener("pointermove", move);
        ownerDocument.addEventListener("pointerup", end);
        ownerDocument.addEventListener("pointercancel", end);
        stopDragListeners = () => {
          ownerDocument.removeEventListener("pointermove", move);
          ownerDocument.removeEventListener("pointerup", end);
          ownerDocument.removeEventListener("pointercancel", end);
        };
      }

      function startPointer(event: PointerEvent, region: "wheel" | "ring"): void {
        if (event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0))
          return;
        if (drag !== undefined || ringDrag !== undefined) return;
        const element = event.currentTarget as HTMLElement;
        const current = currentController.value.getState();
        const requested =
          eventTargetElement(event)?.closest<HTMLElement>("[data-part='pointer']")?.dataset.colorId;
        const colorId =
          region === "ring"
            ? ((current.wheel.interaction === "linked"
                ? current.anchorColorId
                : current.activeColorId) ?? current.palette.colors[0]?.id)
            : (requested ??
              (current.wheel.interaction === "linked"
                ? current.anchorColorId
                : current.activeColorId) ??
              current.palette.colors[0]?.id);
        if (colorId === undefined) return;
        const entry = entryById(current, colorId);
        if (entry === undefined || !canEdit(current, entry)) return;
        currentController.value.commands.setActive(colorId, {
          action: "selection",
          phase: "commit"
        });
        try {
          element.setPointerCapture?.(event.pointerId);
        } catch {
          // Document listeners retain the gesture when capture is unavailable.
        }
        const interaction = currentController.value.beginInteraction({ action: "pointer" });
        const session = { pointerId: event.pointerId, colorId, element, region, interaction };
        if (region === "ring") ringDrag = session;
        else drag = session;
        listenForPointer(element.ownerDocument);
        applyDrag(session, event);
        event.preventDefault();
      }

      function endPointer(event: PointerEvent, region: "wheel" | "ring"): void {
        const session = region === "ring" ? ringDrag : drag;
        if (session === undefined || session.pointerId !== event.pointerId) return;
        if (region === "ring") ringDrag = undefined;
        else drag = undefined;
        stopDragListeners?.();
        stopDragListeners = undefined;
        if (event.type === "pointercancel" || event.type === "lostpointercapture") {
          session.interaction.cancel();
        } else {
          applyDrag(session, event);
          session.interaction.commit();
        }
        try {
          if (session.element.hasPointerCapture?.(event.pointerId)) {
            session.element.releasePointerCapture?.(event.pointerId);
          }
        } catch {
          // The element may have been detached during a controlled update.
        }
      }

      function pointerKeydown(entry: PaletteColor<Metadata>, event: KeyboardEvent): void {
        if (event.ctrlKey || event.metaKey) return;
        if (event.key === "Enter" || event.key === " ") {
          currentController.value.commands.setActive(entry.id, { action: "selection" });
          return;
        }
        const current = state.value;
        if (!canEdit(current, entry)) return;
        const next = keyboardColor(current, entry, event);
        if (next === undefined) return;
        event.preventDefault();
        currentController.value.commands.setActive(entry.id, {
          action: "selection",
          phase: "commit"
        });
        currentController.value.commands.setColor(entry.id, next, {
          action: "keyboard",
          phase: "commit"
        });
      }

      function ringKeydown(
        entry: PaletteColor<Metadata>,
        value: number,
        event: KeyboardEvent
      ): void {
        if (!canEdit(state.value, entry)) return;
        const next = getSliderKeyboardValue(value, event, {
          minimum: 0,
          maximum: 1,
          step: 0.01,
          coarseStep: 0.1,
          fineStep: 0.001,
          orientation: "vertical"
        });
        if (next === undefined) return;
        event.preventDefault();
        currentController.value.commands.setActive(entry.id, { action: "selection" });
        currentController.value.commands.setColor(
          entry.id,
          setWheelChannelValue(resolveWheelEditingColor(state.value, entry), next, {
            model: state.value.wheel.wheelModel
          }),
          { action: "keyboard", phase: "commit" }
        );
      }

      function renderWheel(): VNode {
        const current = state.value;
        const options = props.blockProps?.wheel;
        const showInstructions = options?.showInstructions ?? true;
        const showRing = options?.showChannelRing ?? true;
        const active =
          (current.activeColorId === undefined
            ? undefined
            : entryById(current, current.activeColorId)) ?? current.palette.colors[0];
        const anchor =
          current.anchorColorId === undefined
            ? undefined
            : entryById(current, current.anchorColorId);
        const ringEntry = current.wheel.interaction === "linked" ? anchor : active;
        const activeEditing =
          active === undefined ? undefined : resolveWheelEditingColor(current, active);
        const ringEditing =
          ringEntry === undefined ? undefined : resolveWheelEditingColor(current, ringEntry);
        const ringValue =
          ringEditing === undefined
            ? 0.5
            : getWheelChannelValue(ringEditing, { model: current.wheel.wheelModel });
        const ringPoint = wheelChannelValueToRingPoint(ringValue, { side: ringSide.value });
        const ringChannel = current.wheel.wheelModel === "oklch" ? "lightness" : "value";
        const points = current.colorFocusOrder.flatMap((id) => {
          const entry = entryById(current, id);
          return entry === undefined
            ? []
            : [
                {
                  entry,
                  point: colorToWheelPoint(resolveWheelEditingColor(current, entry), {
                    model: current.wheel.wheelModel
                  })
                }
              ];
        });
        const activeHsv =
          activeEditing === undefined ? undefined : convertColor(activeEditing, "hsv");
        const surfaceStyle: CSSProperties = {
          "--colorwheel-value": String(activeHsv?.v ?? 1),
          "--colorwheel-lightness": `${
            activeEditing === undefined ? 70 : convertColor(activeEditing, "oklch").l * 100
          }%`,
          ...(ringEditing === undefined
            ? {}
            : {
                "--colorwheel-channel-start": formatColor(
                  setWheelChannelValue(ringEditing, 0, { model: current.wheel.wheelModel }),
                  { format: "rgb", alpha: "never" }
                ),
                "--colorwheel-channel-mid": formatColor(
                  setWheelChannelValue(ringEditing, 0.5, { model: current.wheel.wheelModel }),
                  { format: "rgb", alpha: "never" }
                ),
                "--colorwheel-channel-end": formatColor(
                  setWheelChannelValue(ringEditing, 1, { model: current.wheel.wheelModel }),
                  { format: "rgb", alpha: "never" }
                ),
                "--colorwheel-channel-ring-x": `${ringPoint.x * 100}%`,
                "--colorwheel-channel-ring-y": `${ringPoint.y * 100}%`,
                "--colorwheel-channel-ring-angle": `${Math.atan2(
                  ringPoint.y - 0.5,
                  ringPoint.x - 0.5
                )}rad`,
                "--colorwheel-channel-color": formatColor(ringEditing, {
                  format: "rgb",
                  alpha: "never"
                })
              })
        };
        const instructionsId =
          typeof attrs.id === "string" ? `${attrs.id}-wheel-instructions` : undefined;
        const instructionsText = `Drag or tap the wheel to set ${
          current.wheel.wheelModel === "oklch" ? "hue and chroma" : "hue and saturation"
        }.${showRing ? ` Use the outer ring to set ${ringChannel}.` : ""} Use arrow keys on a handle.`;
        const ringIndex =
          ringEntry === undefined
            ? -1
            : current.palette.colors.findIndex((entry) => entry.id === ringEntry.id);

        const ring =
          showRing && ringEntry !== undefined
            ? h(
                "div",
                {
                  role: "slider",
                  "data-part": "channel-ring",
                  "data-color-id": ringEntry.id,
                  "data-channel": ringChannel,
                  "data-model": current.wheel.wheelModel,
                  "data-side": ringSide.value,
                  tabindex: canEdit(current, ringEntry) ? 0 : -1,
                  "aria-label": `${colorLabel(ringEntry, Math.max(0, ringIndex))} ${ringChannel} ring`,
                  "aria-valuemin": 0,
                  "aria-valuemax": 100,
                  "aria-valuenow": Math.round(ringValue * 1000) / 10,
                  "aria-valuetext": `${Math.round(ringValue * 100)} percent`,
                  "aria-orientation": "vertical",
                  "aria-disabled": !canEdit(current, ringEntry) || undefined,
                  onKeydown: (event: KeyboardEvent) => ringKeydown(ringEntry, ringValue, event),
                  onPointerdown: (event: PointerEvent) => startPointer(event, "ring"),
                  onLostpointercapture: (event: PointerEvent) => endPointer(event, "ring")
                },
                [
                  h("span", { "data-part": "channel-ring-track", "aria-hidden": "true" }),
                  h("span", { "data-part": "channel-ring-thumb", "aria-hidden": "true" })
                ]
              )
            : null;

        const lines =
          points.length > 1
            ? h(
                "svg",
                { "data-part": "harmony-lines", viewBox: "0 0 100 100", "aria-hidden": "true" },
                points.map(({ point }, index) => {
                  const next = points[(index + 1) % points.length]?.point;
                  return next === undefined
                    ? null
                    : h("line", {
                        key: `${index}-${(index + 1) % points.length}`,
                        x1: point.x * 100,
                        y1: point.y * 100,
                        x2: next.x * 100,
                        y2: next.y * 100
                      });
                })
              )
            : null;

        const handles = points.map(({ entry, point }) => {
          const editable = canEdit(current, entry);
          const buttonProps = {
            ...getPointerAccessibilityProps(current, entry.id),
            type: "button",
            "data-part": "pointer",
            "data-color-id": entry.id,
            "data-editable": editable ? "" : undefined,
            "data-active": entry.id === current.activeColorId ? "true" : "false",
            "data-anchor": entry.id === current.anchorColorId ? "true" : "false",
            disabled: !editable,
            "aria-disabled": !editable || undefined,
            style: {
              "--colorwheel-pointer-x": `${point.x * 100}%`,
              "--colorwheel-pointer-y": `${point.y * 100}%`,
              "--colorwheel-pointer-color": formatColor(entry.color, {
                format: "rgb",
                alpha: "auto"
              })
            },
            onFocus: () =>
              currentController.value.commands.setActive(entry.id, {
                action: "selection",
                phase: "commit"
              }),
            onKeydown: (event: KeyboardEvent) => pointerKeydown(entry, event)
          };
          const defaultPointer = h("button", buttonProps, [
            h("span", { "data-part": "pointer-color", "aria-hidden": "true" }),
            entry.id === current.anchorColorId
              ? h("span", { "data-part": "pointer-anchor", "aria-hidden": "true" })
              : null
          ]);
          const replacement = slots.pointer?.({
            entry,
            point,
            active: entry.id === current.activeColorId,
            anchor: entry.id === current.anchorColorId,
            editable,
            buttonProps,
            defaultPointer
          });
          return h(Fragment, { key: entry.id }, [replacement ?? defaultPointer]);
        });

        return h("section", { "data-part": "wheel-block", class: options?.className }, [
          h("header", { "data-part": "block-header" }, [
            h("div", [
              h("h2", { "data-part": "block-title" }, options?.title ?? "Color wheel"),
              options?.description === undefined
                ? null
                : h("div", { "data-part": "block-description" }, [options.description])
            ]),
            h(
              "output",
              { "data-part": "active-color", "aria-live": "polite" },
              active === undefined ? "No color" : toHex(active)
            )
          ]),
          h(
            "div",
            {
              "data-part": "wheel-frame",
              "data-ring": showRing && ringEntry !== undefined ? "true" : "false",
              "data-model": current.wheel.wheelModel,
              style: surfaceStyle
            },
            [
              ring,
              h(
                "div",
                {
                  ...getWheelAccessibilityProps(),
                  "data-part": "wheel",
                  "data-model": current.wheel.wheelModel,
                  tabindex: -1,
                  "aria-describedby": showInstructions ? instructionsId : undefined,
                  "aria-description":
                    showInstructions && instructionsId === undefined ? instructionsText : undefined,
                  onPointerdown: (event: PointerEvent) => startPointer(event, "wheel"),
                  onLostpointercapture: (event: PointerEvent) => endPointer(event, "wheel")
                },
                [h("div", { "data-part": "wheel-color", "aria-hidden": "true" }), lines, handles]
              )
            ]
          ),
          showInstructions
            ? h("p", { id: instructionsId, "data-part": "wheel-instructions" }, instructionsText)
            : null
        ]);
      }

      function beginName(entry: PaletteColor<Metadata>): PickerInteraction<Metadata> {
        const existing = nameInteractions.get(entry.id);
        if (existing !== undefined) return existing;
        const interaction = currentController.value.beginInteraction({ action: "text-input" });
        interaction.start();
        nameInteractions.set(entry.id, interaction);
        return interaction;
      }

      function commitName(entry: PaletteColor<Metadata>): void {
        nameInteractions.get(entry.id)?.commit();
        nameInteractions.delete(entry.id);
      }

      function commitColor(entry: PaletteColor<Metadata>, input: HTMLInputElement): void {
        const liveEntry = entryById(state.value, entry.id) ?? entry;
        const source = toHex(liveEntry);
        const storedDraft = drafts[entry.id];
        if (storedDraft !== undefined && storedDraft.source !== source) {
          delete drafts[entry.id];
          input.value = source;
          return;
        }
        if (storedDraft === undefined && input.value === source) return;
        try {
          const next = parseColor(input.value);
          currentController.value.commands.setColor(entry.id, next, {
            action: "text-input",
            phase: "commit"
          });
          delete drafts[entry.id];
        } catch {
          drafts[entry.id] = { source, value: input.value, invalid: true };
        }
      }

      function removeColor(entry: PaletteColor<Metadata>, index: number): void {
        const nextId =
          state.value.palette.colors[index + 1]?.id ?? state.value.palette.colors[index - 1]?.id;
        currentController.value.commands.removeColor(entry.id, {
          action: "remove",
          phase: "commit"
        });
        void nextTick(() => {
          const target =
            (nextId === undefined
              ? null
              : [...(root.value?.querySelectorAll<HTMLElement>("[data-part='swatch']") ?? [])].find(
                  (candidate) => candidate.dataset.colorId === nextId
                )) ??
            root.value?.querySelector<HTMLElement>("[data-part='add-color']") ??
            root.value?.querySelector<HTMLElement>("[data-part='palette']") ??
            root.value;
          target?.focus();
        });
      }

      function renderPaletteBlock(): VNode {
        const current = state.value;
        const options = props.blockProps?.palette;
        const showName = options?.showName ?? true;
        const showActions = options?.showActions ?? true;
        const allowAdd = options?.allowAdd ?? true;
        const active =
          current.activeColorId === undefined
            ? undefined
            : entryById(current, current.activeColorId);
        const paletteTitleId =
          typeof attrs.id === "string" ? `${attrs.id}-palette-title` : undefined;
        const items = current.palette.colors.map((entry, index) => {
          const label = colorLabel(entry, index);
          const source = toHex(entry);
          const storedDraft = drafts[entry.id];
          const draft = storedDraft?.source === source ? storedDraft : undefined;
          const errorId = `${componentId}-color-error-${encodeURIComponent(entry.id)}`;
          const editable = canEdit(current, entry);
          const actionProps = {
            select: {
              type: "button",
              "data-part": "swatch",
              "data-color-id": entry.id,
              "aria-label": `Select ${label}, ${source}`,
              "aria-pressed": entry.id === current.activeColorId,
              onClick: () =>
                currentController.value.commands.setActive(entry.id, {
                  action: "selection",
                  phase: "commit"
                })
            },
            lock: {
              type: "button",
              "aria-label": `${entry.locked ? "Unlock" : "Lock"} ${label}`,
              "aria-pressed": Boolean(entry.locked),
              onClick: () =>
                currentController.value.commands.setLocked(entry.id, !entry.locked, {
                  action: "lock",
                  phase: "commit"
                })
            },
            moveEarlier: {
              type: "button",
              "aria-label": `Move ${label} earlier`,
              disabled: index === 0,
              onClick: () =>
                currentController.value.commands.reorderColor(entry.id, index - 1, {
                  action: "reorder",
                  phase: "commit"
                })
            },
            moveLater: {
              type: "button",
              "aria-label": `Move ${label} later`,
              disabled: index === current.palette.colors.length - 1,
              onClick: () =>
                currentController.value.commands.reorderColor(entry.id, index + 1, {
                  action: "reorder",
                  phase: "commit"
                })
            },
            remove: {
              type: "button",
              "aria-label": `Remove ${label}`,
              onClick: () => removeColor(entry, index)
            }
          };
          const defaultSwatch = h(
            "li",
            {
              key: entry.id,
              "data-part": "palette-item",
              "data-color-id": entry.id,
              "data-active": entry.id === current.activeColorId ? "" : undefined,
              "data-anchor": entry.id === current.anchorColorId ? "" : undefined,
              "data-locked": entry.locked ? "" : undefined
            },
            [
              h(
                "button",
                {
                  ...actionProps.select,
                  style: {
                    "--colorwheel-swatch-color": formatColor(convertColor(entry.color, "srgb"), {
                      format: "rgb",
                      alpha: "auto"
                    })
                  }
                },
                [
                  h("span", { "data-part": "swatch-color", "aria-hidden": "true" }),
                  entry.id === current.anchorColorId
                    ? h("span", { "data-part": "anchor-mark" }, "Anchor")
                    : null
                ]
              ),
              h("div", { "data-part": "palette-item-fields" }, [
                showName
                  ? h("label", { "data-part": "field" }, [
                      h("span", { class: "colorwheel-visually-hidden" }, `${label} name`),
                      h("input", {
                        "data-part": "name-input",
                        "data-color-id": entry.id,
                        value: entry.name ?? "",
                        placeholder: label,
                        onFocus: () => beginName(entry),
                        onInput: (event: Event) =>
                          beginName(entry).update({
                            type: "set-color-name",
                            colorId: entry.id,
                            name: (event.currentTarget as HTMLInputElement).value || undefined
                          }),
                        onBlur: () => commitName(entry)
                      })
                    ])
                  : null,
                h("label", { "data-part": "field" }, [
                  h("span", { class: "colorwheel-visually-hidden" }, `${label} value`),
                  h("input", {
                    "data-part": "color-input",
                    "data-color-id": entry.id,
                    value: draft?.value ?? source,
                    disabled: !editable,
                    "aria-invalid": draft?.invalid || undefined,
                    "aria-describedby": draft?.invalid ? errorId : undefined,
                    spellcheck: false,
                    autocapitalize: "none",
                    onInput: (event: Event) => {
                      drafts[entry.id] = {
                        source,
                        value: (event.currentTarget as HTMLInputElement).value,
                        invalid: false
                      };
                    },
                    onChange: (event: Event) =>
                      commitColor(entry, event.currentTarget as HTMLInputElement),
                    onBlur: (event: Event) =>
                      commitColor(entry, event.currentTarget as HTMLInputElement),
                    onKeydown: (event: KeyboardEvent) => {
                      const input = event.currentTarget as HTMLInputElement;
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitColor(entry, input);
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        delete drafts[entry.id];
                        input.value = source;
                      }
                    }
                  })
                ]),
                draft?.invalid
                  ? h(
                      "span",
                      { id: errorId, "data-part": "field-error", role: "alert" },
                      "Enter a supported CSS color."
                    )
                  : null
              ]),
              showActions
                ? h("div", { "data-part": "palette-item-actions" }, [
                    h(
                      "button",
                      {
                        ...actionProps.lock,
                        "data-part": "icon-button"
                      },
                      entry.locked ? "Locked" : "Lock"
                    ),
                    h(
                      "button",
                      {
                        ...actionProps.moveEarlier,
                        "data-part": "icon-button"
                      },
                      "←"
                    ),
                    h(
                      "button",
                      {
                        ...actionProps.moveLater,
                        "data-part": "icon-button"
                      },
                      "→"
                    ),
                    h(
                      "button",
                      {
                        ...actionProps.remove,
                        "data-part": "icon-button"
                      },
                      "Remove"
                    )
                  ])
                : null
            ]
          );
          const replacement = slots.swatch?.({
            entry,
            index,
            count: current.palette.colors.length,
            active: entry.id === current.activeColorId,
            anchor: entry.id === current.anchorColorId,
            editable,
            actionProps,
            defaultSwatch
          });
          return h(Fragment, { key: entry.id }, [replacement ?? defaultSwatch]);
        });
        return h(
          "section",
          {
            "data-part": "palette",
            class: options?.className,
            "aria-labelledby": paletteTitleId,
            "aria-label": paletteTitleId === undefined ? "Color palette" : undefined,
            tabindex: -1
          },
          [
            h("header", { "data-part": "block-header" }, [
              h("div", [
                h(
                  "h2",
                  { id: paletteTitleId, "data-part": "block-title" },
                  options?.title ?? "Palette"
                ),
                options?.description === undefined
                  ? null
                  : h("div", { "data-part": "block-description" }, [options.description])
              ]),
              h(
                "span",
                { "data-part": "palette-count" },
                `${current.palette.colors.length} ${
                  current.palette.colors.length === 1 ? "color" : "colors"
                }`
              )
            ]),
            current.palette.colors.length === 0
              ? h(
                  "p",
                  { "data-part": "empty-state" },
                  "This palette is empty. Add a color to begin."
                )
              : h("ol", { "data-part": "palette-list" }, items),
            allowAdd
              ? h(
                  "button",
                  {
                    type: "button",
                    "data-part": "add-color",
                    onClick: () => {
                      const id = currentController.value.commands.addColor(
                        {
                          color: active?.color ?? { space: "hsv", h: 0, s: 0, v: 0.5 },
                          name: "New color"
                        },
                        undefined,
                        { action: "add", phase: "commit" }
                      );
                      currentController.value.commands.setActive(id, {
                        action: "selection",
                        phase: "commit"
                      });
                    }
                  },
                  "Add color"
                )
              : null
          ]
        );
      }

      function disposeLegacy(): void {
        const cleanup = legacyCleanup;
        legacyCleanup = undefined;
        legacyUpdate = undefined;
        mountedLegacyRenderer = undefined;
        mountedLegacyController = undefined;
        const container = legacyContext?.container;
        legacyContext = undefined;
        let failure: unknown;
        try {
          cleanup?.();
        } catch (error) {
          failure = error;
        }
        for (const container of legacyRenderRoots) {
          try {
            render(null, container);
          } catch (error) {
            failure ??= error;
          }
        }
        legacyRenderRoots.clear();
        container?.replaceChildren();
        if (failure !== undefined) {
          throw failure instanceof Error ? failure : new Error("Legacy palette cleanup failed");
        }
      }

      function mountLegacyPalette(): void {
        const container = legacyHost.value;
        const renderer = props.renderPalette;
        if (container === null || typeof renderer !== "function") {
          if (mountedLegacyRenderer !== undefined) disposeLegacy();
          return;
        }
        if (
          mountedLegacyRenderer === renderer &&
          mountedLegacyController === currentController.value &&
          legacyContext?.container === container
        )
          return;
        disposeLegacy();
        container.replaceChildren();
        const ownerDocument = container.ownerDocument;
        const context: PaletteRenderContext<Metadata> = {
          container,
          get controller() {
            return currentController.value;
          },
          get state() {
            return state.value;
          },
          renderDefault: () => {
            const staging = ownerDocument.createElement("div");
            const vnode = renderPaletteBlock();
            vnode.appContext = componentInstance?.appContext ?? null;
            render(vnode, staging);
            legacyRenderRoots.add(staging);
            return (staging.firstElementChild as HTMLElement | null) ?? staging;
          }
        };
        const result = renderer(context);
        const node = isNode(result)
          ? result
          : typeof result === "object" && result !== null && "node" in result
            ? result.node
            : undefined;
        if (node !== undefined && isNode(node) && node.parentNode !== container) {
          container.append(node);
        }
        if (
          typeof result === "object" &&
          result !== null &&
          !isNode(result) &&
          "destroy" in result &&
          typeof result.destroy === "function"
        ) {
          legacyCleanup = result.destroy;
        }
        if (
          typeof result === "object" &&
          result !== null &&
          !isNode(result) &&
          "update" in result &&
          typeof result.update === "function"
        ) {
          legacyUpdate = result.update;
        }
        legacyContext = context;
        mountedLegacyRenderer = renderer;
        mountedLegacyController = currentController.value;
      }

      watch([legacyHost, () => props.renderPalette], () => mountLegacyPalette(), {
        flush: "post",
        immediate: true
      });
      watch(
        [state, currentController],
        () => {
          if (legacyContext === undefined) return;
          if (mountedLegacyController !== currentController.value) mountLegacyPalette();
          else legacyUpdate?.(legacyContext);
        },
        { flush: "post" }
      );
      watch(
        () => props.blockProps?.palette,
        () => {
          if (legacyContext !== undefined) legacyUpdate?.(legacyContext);
        },
        { deep: true, flush: "post" }
      );

      onBeforeUnmount(() => {
        alive = false;
        mounted = false;
        reconciliationQueued = false;
        let failure: unknown;
        for (const cleanup of [
          () => finishInteractions(false, true),
          () => finishNameInteractions(true),
          disposeLegacy,
          () => unsubscribe?.(),
          () => {
            if (owned) ownedController?.destroy();
          }
        ]) {
          try {
            cleanup();
          } catch (error) {
            failure ??= error;
          }
        }
        unsubscribe = undefined;
        if (failure !== undefined) {
          throw failure instanceof Error ? failure : new Error("Colorwheel cleanup failed");
        }
      });

      const exposed: ColorwheelExposed<Metadata> = {
        get controller() {
          return currentController.value;
        },
        get root() {
          return root.value;
        },
        get state() {
          return state.value;
        },
        focus(target = { type: "root" }) {
          const candidates = [...(root.value?.querySelectorAll<HTMLElement>("[data-part]") ?? [])];
          const element =
            target.type === "root"
              ? root.value
              : candidates.find((candidate) => {
                  if (target.type === "pointer" || target.type === "swatch") {
                    return (
                      candidate.dataset.part === target.type &&
                      candidate.dataset.colorId === target.colorId
                    );
                  }
                  if (target.type === "channel") {
                    return (
                      (candidate.dataset.part === "channel-input" ||
                        candidate.dataset.part === "channel-ring") &&
                      candidate.dataset.colorId === target.colorId &&
                      candidate.dataset.channel === target.channel
                    );
                  }
                  return candidate.dataset.part === target.type;
                });
          element?.focus();
          currentController.value.focus(target);
        },
        setState(next) {
          currentController.value.setState(next);
        },
        setPalette(next) {
          currentController.value.setPalette(next);
        }
      };
      expose(exposed);

      return () => {
        const scope = slotScope();
        const paletteContent =
          slots.palette !== undefined
            ? slots.palette(scope)
            : props.renderPalette === false
              ? null
              : typeof props.renderPalette !== "function"
                ? renderPaletteBlock()
                : h("div", { ref: legacyHost, "data-part": "palette-slot" });
        return h(
          "div",
          {
            ...attrs,
            ref: root,
            class: [attrs.class, props.className],
            role: "group",
            tabindex: attrs.tabindex ?? -1,
            "aria-label":
              props.ariaLabel ?? attrs["aria-label"] ?? "Color wheel and palette editor",
            "data-colorwheel": "",
            "data-colorwheel-vue": "",
            "data-part": "root",
            "data-unstyled": props.unstyled ? "" : undefined
          },
          [
            h("div", { "data-part": "picker-layout" }, [renderWheel(), paletteContent]),
            slots.default?.(scope)
          ]
        );
      };
    }
  });
}

export const Colorwheel = createColorwheelComponent<JsonObject>();
