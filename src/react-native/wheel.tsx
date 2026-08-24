import { useEffect, useInsertionEffect, useState } from "react";
import type { ComponentRef, ComponentType, ReactNode } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import type {
  AccessibilityActionEvent,
  GestureResponderEvent,
  LayoutChangeEvent,
  NativeTouchEvent,
  PressableProps,
  StyleProp,
  TextStyle,
  ViewProps,
  ViewStyle
} from "react-native";
import { convertColor, formatColor } from "../core";
import type { JsonObject, PaletteColor } from "../core";
import {
  clientPointToWheelPoint,
  colorToWheelPoint,
  getWheelChannelValue,
  OKLCH_WHEEL_MAX_CHROMA,
  resolveWheelEditingColor,
  wheelPointToColor
} from "../editor";
import type { PickerController, PickerInteraction, PickerState, WheelPoint } from "../editor";
import { useNativePickerController, useNativePickerSelector } from "./context";
import { adjustNativeWheelColor } from "./interactions";
import type { NativeWheelAdjustment } from "./interactions";
import { NativeSvgWheel } from "./svg-wheel";

const selectState = <Metadata extends object>(
  state: PickerState<Metadata>
): PickerState<Metadata> => state;

interface MeasuredWheel {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface ActiveGesture<Metadata extends object> {
  readonly colorId: string;
  readonly interaction: PickerInteraction<Metadata>;
}

export interface NativeWheelGraphicProps {
  readonly model: PickerState["wheel"]["wheelModel"];
  readonly activeColor?: PaletteColor["color"];
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export interface NativeWheelHandleRenderProps<Metadata extends object = JsonObject> {
  readonly entry: PaletteColor<Metadata>;
  readonly point: WheelPoint;
  readonly active: boolean;
  readonly anchor: boolean;
  readonly editable: boolean;
  readonly pressableProps: PressableProps;
  readonly style: StyleProp<ViewStyle>;
}

export interface NativeWheelStyles {
  readonly root?: StyleProp<ViewStyle>;
  readonly heading?: StyleProp<TextStyle>;
  readonly description?: StyleProp<TextStyle>;
  readonly surface?: StyleProp<ViewStyle>;
  readonly graphic?: StyleProp<ViewStyle>;
  readonly handle?: StyleProp<ViewStyle>;
  readonly activeHandle?: StyleProp<ViewStyle>;
  readonly anchorMark?: StyleProp<ViewStyle>;
  readonly adjustmentRow?: StyleProp<ViewStyle>;
  readonly adjustmentButton?: StyleProp<ViewStyle>;
  readonly adjustmentButtonPressed?: StyleProp<ViewStyle>;
  readonly adjustmentLabel?: StyleProp<TextStyle>;
  readonly value?: StyleProp<TextStyle>;
}

export interface NativeWheelBlockProps<Metadata extends object = JsonObject> extends Omit<
  ViewProps,
  "children"
> {
  readonly title?: ReactNode | false;
  readonly description?: ReactNode;
  readonly size?: number;
  readonly disabled?: boolean;
  readonly showAdjustments?: boolean;
  readonly hueStep?: number;
  readonly radiusStep?: number;
  readonly channelStep?: number;
  readonly graphic?: ComponentType<NativeWheelGraphicProps>;
  readonly renderGraphic?: (props: NativeWheelGraphicProps, defaultGraphic: ReactNode) => ReactNode;
  readonly renderHandle?: (
    props: NativeWheelHandleRenderProps<Metadata>,
    defaultHandle: ReactNode
  ) => ReactNode;
  readonly styles?: NativeWheelStyles;
}

function findEntry<Metadata extends object>(
  state: PickerState<Metadata>,
  colorId: string | undefined
): PaletteColor<Metadata> | undefined {
  return colorId === undefined
    ? undefined
    : state.palette.colors.find((entry) => entry.id === colorId);
}

function canEdit<Metadata extends object>(
  state: PickerState<Metadata>,
  entry: PaletteColor<Metadata>,
  disabled: boolean
): boolean {
  return (
    !disabled &&
    !entry.locked &&
    (state.wheel.interaction === "free" || entry.id === state.anchorColorId)
  );
}

function activeEntry<Metadata extends object>(
  state: PickerState<Metadata>
): PaletteColor<Metadata> | undefined {
  return findEntry(state, state.activeColorId) ?? state.palette.colors[0];
}

function accessibilityValue<Metadata extends object>(
  state: PickerState<Metadata>,
  entry: PaletteColor<Metadata>
): string {
  const modelColor = convertColor(resolveWheelEditingColor(state, entry), state.wheel.wheelModel);
  const rawRadius =
    modelColor.space === "oklch"
      ? Math.round((modelColor.c / OKLCH_WHEEL_MAX_CHROMA) * 100)
      : Math.round(modelColor.s * 100);
  const radius = Math.max(0, Math.min(100, rawRadius));
  const channel = Math.round(
    getWheelChannelValue(modelColor, { model: state.wheel.wheelModel }) * 100
  );
  const channelName = state.wheel.wheelModel === "oklch" ? "lightness" : "value";
  return `${Math.round(modelColor.h)} degrees, ${radius} percent from center, ${channelName} ${channel} percent`;
}

class NativeWheelGestureSession<Metadata extends object> {
  #controller: PickerController<Metadata>;
  #disabled: boolean;
  #surface: ComponentRef<typeof View> | null = null;
  #layout: Pick<MeasuredWheel, "width" | "height"> | null = null;
  #measurement: MeasuredWheel | null = null;
  #gesture: ActiveGesture<Metadata> | null = null;

  constructor(controller: PickerController<Metadata>, disabled: boolean) {
    this.#controller = controller;
    this.#disabled = disabled;
  }

  update(controller: PickerController<Metadata>, disabled: boolean): void {
    if (controller !== this.#controller) this.#commitActiveGesture();
    this.#controller = controller;
    this.#disabled = disabled;
  }

  readonly setSurface = (surface: ComponentRef<typeof View> | null): void => {
    this.#surface = surface;
  };

  readonly onLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    this.#layout = { width, height };
    this.#updateMeasurement(width, height);
  };

  #updateMeasurement(width?: number, height?: number): void {
    this.#surface?.measureInWindow((left, top, measuredWidth, measuredHeight) => {
      this.#measurement = {
        left,
        top,
        width: measuredWidth || width || 0,
        height: measuredHeight || height || 0
      };
    });
  }

  #pointFromTouch(touch: NativeTouchEvent): WheelPoint | undefined {
    const layout = this.#layout;
    if (
      layout !== null &&
      layout.width > 0 &&
      layout.height > 0 &&
      Number.isFinite(touch.locationX) &&
      Number.isFinite(touch.locationY)
    ) {
      return clientPointToWheelPoint(
        { x: touch.locationX, y: touch.locationY },
        { left: 0, top: 0, width: layout.width, height: layout.height }
      );
    }
    const rect = this.#measurement;
    if (rect === null || rect.width <= 0 || rect.height <= 0) return undefined;
    return clientPointToWheelPoint(
      { x: touch.pageX - rect.left, y: touch.pageY - rect.top },
      { left: 0, top: 0, width: rect.width, height: rect.height }
    );
  }

  #colorIdAtTouch(
    currentState: PickerState<Metadata>,
    touch: NativeTouchEvent
  ): string | undefined {
    const point = this.#pointFromTouch(touch);
    const dimensions = this.#layout ?? this.#measurement;
    if (point === undefined || dimensions === null) return undefined;
    const size = Math.min(dimensions.width, dimensions.height);
    let nearest: { readonly colorId: string; readonly distance: number } | undefined;
    for (const entry of currentState.palette.colors) {
      const handlePoint = colorToWheelPoint(resolveWheelEditingColor(currentState, entry), {
        model: currentState.wheel.wheelModel
      });
      const distance = Math.hypot(handlePoint.x - point.x, handlePoint.y - point.y) * size;
      if (distance <= 28 && (nearest === undefined || distance < nearest.distance)) {
        nearest = { colorId: entry.id, distance };
      }
    }
    return nearest?.colorId;
  }

  #applyTouch(event: GestureResponderEvent, activeGesture: ActiveGesture<Metadata>): void {
    const currentState = this.#controller.getState();
    const entry = findEntry(currentState, activeGesture.colorId);
    const point = this.#pointFromTouch(event.nativeEvent);
    if (
      entry === undefined ||
      point === undefined ||
      !canEdit(currentState, entry, this.#disabled)
    ) {
      return;
    }
    activeGesture.interaction.update({
      type: "set-color",
      colorId: entry.id,
      color: wheelPointToColor(point, resolveWheelEditingColor(currentState, entry), {
        model: currentState.wheel.wheelModel
      })
    });
  }

  readonly begin = (event: GestureResponderEvent): void => {
    this.#updateMeasurement();
    const currentState = this.#controller.getState();
    const requested =
      this.#colorIdAtTouch(currentState, event.nativeEvent) ??
      (currentState.wheel.interaction === "linked"
        ? currentState.anchorColorId
        : (currentState.activeColorId ?? currentState.palette.colors[0]?.id));
    const entry = findEntry(currentState, requested);
    if (entry === undefined || !canEdit(currentState, entry, this.#disabled)) return;
    this.#controller.commands.setActive(entry.id, {
      action: "selection",
      phase: "commit"
    });
    this.#gesture = {
      colorId: entry.id,
      interaction: this.#controller.beginInteraction({ action: "pointer" })
    };
  };

  readonly move = (event: GestureResponderEvent): void => {
    if (this.#gesture !== null) this.#applyTouch(event, this.#gesture);
  };

  readonly release = (event: GestureResponderEvent): void => {
    if (this.#gesture === null) return;
    this.#applyTouch(event, this.#gesture);
    this.#gesture.interaction.commit();
    this.#gesture = null;
  };

  readonly terminate = (): void => {
    if (this.#gesture === null) return;
    this.#gesture.interaction.cancel();
    this.#gesture = null;
  };

  #commitActiveGesture(): void {
    if (this.#gesture === null) return;
    this.#gesture.interaction.commit();
    this.#gesture = null;
  }

  createPanResponder() {
    return PanResponder.create({
      onStartShouldSetPanResponderCapture: () => !this.#disabled,
      onStartShouldSetPanResponder: () => !this.#disabled,
      onMoveShouldSetPanResponder: () => !this.#disabled,
      onPanResponderGrant: this.begin,
      onPanResponderMove: this.move,
      onPanResponderRelease: this.release,
      onPanResponderTerminate: this.terminate,
      onPanResponderTerminationRequest: () => true,
      onShouldBlockNativeResponder: () => true
    });
  }

  destroy(): void {
    this.#commitActiveGesture();
    this.#surface = null;
    this.#layout = null;
    this.#measurement = null;
  }
}

function defaultHandleNode<Metadata extends object>(
  props: NativeWheelHandleRenderProps<Metadata>,
  styles: NativeWheelStyles | undefined
): ReactNode {
  return (
    <Pressable
      {...props.pressableProps}
      style={(state) => [
        nativeStyles.handle,
        styles?.handle,
        props.active && nativeStyles.activeHandle,
        props.active && styles?.activeHandle,
        typeof props.pressableProps.style === "function"
          ? props.pressableProps.style(state)
          : props.pressableProps.style,
        props.style
      ]}
    >
      {props.anchor ? <View style={[nativeStyles.anchorMark, styles?.anchorMark]} /> : null}
    </Pressable>
  );
}

export function NativeWheelBlock<Metadata extends object = JsonObject>({
  title = "Color wheel",
  description,
  size,
  disabled = false,
  showAdjustments = true,
  hueStep = 1,
  radiusStep = 0.02,
  channelStep = 0.02,
  graphic,
  renderGraphic,
  renderHandle,
  styles,
  style,
  testID = "colorwheel-wheel",
  accessibilityLabel = "Color wheel",
  ...viewProps
}: NativeWheelBlockProps<Metadata>) {
  const state = useNativePickerSelector<PickerState<Metadata>, Metadata>(selectState);
  const controller = useNativePickerController<Metadata>();
  const [gestureSession] = useState(() => new NativeWheelGestureSession(controller, disabled));
  const [panResponder] = useState(() => gestureSession.createPanResponder());

  const Graphic = graphic ?? NativeSvgWheel;
  const selected = activeEntry(state);
  const orderedEntries = state.colorFocusOrder
    .map((id) => findEntry(state, id))
    .filter((entry): entry is PaletteColor<Metadata> => entry !== undefined);

  useInsertionEffect(() => {
    gestureSession.update(controller, disabled);
  }, [controller, disabled, gestureSession]);

  useEffect(() => () => gestureSession.destroy(), [gestureSession]);

  function adjust(entry: PaletteColor<Metadata>, adjustment: NativeWheelAdjustment): void {
    const currentState = controller.getState();
    const currentEntry = findEntry(currentState, entry.id);
    if (currentEntry === undefined || !canEdit(currentState, currentEntry, disabled)) {
      return;
    }
    controller.commands.setColor(
      entry.id,
      adjustNativeWheelColor(
        resolveWheelEditingColor(currentState, currentEntry),
        currentState.wheel.wheelModel,
        adjustment,
        { hueStep, radiusStep, channelStep }
      ),
      { action: "keyboard", phase: "commit" }
    );
  }

  function onHandleAccessibilityAction(
    entry: PaletteColor<Metadata>,
    event: AccessibilityActionEvent
  ): void {
    const action = event.nativeEvent.actionName;
    if (action === "activate") {
      controller.commands.setActive(entry.id, { action: "selection", phase: "commit" });
    } else if (action === "increment") {
      adjust(entry, "increase-hue");
    } else if (action === "decrement") {
      adjust(entry, "decrease-hue");
    } else if (action === "increaseRadius") {
      adjust(entry, "increase-radius");
    } else if (action === "decreaseRadius") {
      adjust(entry, "decrease-radius");
    } else if (action === "increaseChannel") {
      adjust(entry, "increase-channel");
    } else if (action === "decreaseChannel") {
      adjust(entry, "decrease-channel");
    }
  }

  const selectedEditingColor =
    selected === undefined ? undefined : resolveWheelEditingColor(state, selected);
  const channelLabel = state.wheel.wheelModel === "oklch" ? "Lightness" : "Value";
  const channelPercent =
    selectedEditingColor === undefined
      ? undefined
      : Math.round(
          getWheelChannelValue(selectedEditingColor, { model: state.wheel.wheelModel }) * 100
        );

  const graphicProps: NativeWheelGraphicProps = {
    model: state.wheel.wheelModel,
    activeColor: selectedEditingColor,
    style: [StyleSheet.absoluteFill, styles?.graphic],
    testID: `${testID}-graphic`
  };
  const defaultGraphic = <Graphic {...graphicProps} />;
  const renderedGraphic = renderGraphic?.(graphicProps, defaultGraphic) ?? defaultGraphic;
  const surfaceStyle = [
    nativeStyles.surface,
    size === undefined ? nativeStyles.fluidSurface : { width: size, height: size },
    styles?.surface
  ];

  return (
    <View
      {...viewProps}
      style={[nativeStyles.root, styles?.root, style]}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
    >
      {title === false ? null : typeof title === "string" || typeof title === "number" ? (
        <Text accessibilityRole="header" style={[nativeStyles.heading, styles?.heading]}>
          {title}
        </Text>
      ) : (
        title
      )}
      {description === undefined ? null : typeof description === "string" ||
        typeof description === "number" ? (
        <Text style={[nativeStyles.description, styles?.description]}>{description}</Text>
      ) : (
        description
      )}
      <View
        ref={(surface) => gestureSession.setSurface(surface)}
        collapsable={false}
        style={surfaceStyle}
        onLayout={(event) => gestureSession.onLayout(event)}
        testID={`${testID}-surface`}
        {...panResponder.panHandlers}
      >
        {renderedGraphic}
        {orderedEntries.map((entry) => {
          const point = colorToWheelPoint(resolveWheelEditingColor(state, entry), {
            model: state.wheel.wheelModel
          });
          const active = entry.id === state.activeColorId;
          const anchor = entry.id === state.anchorColorId;
          const editable = canEdit(state, entry, disabled);
          const color = formatColor(entry.color, {
            format: "hex",
            alpha: "never",
            mapToSrgb: true
          });
          const pressableProps: PressableProps = {
            disabled: !editable,
            onPress: editable
              ? () => {
                  controller.commands.setActive(entry.id, {
                    action: "selection",
                    phase: "commit"
                  });
                }
              : undefined,
            accessible: true,
            accessibilityRole: "adjustable",
            accessibilityLabel: `${entry.name ?? entry.role ?? `Color ${entry.id}`}${anchor ? ", anchor color" : ""}`,
            accessibilityHint: editable
              ? "Swipe to adjust, or use accessibility actions to change hue, distance from center, and value or lightness"
              : disabled
                ? "Color wheel editing is disabled"
                : entry.locked
                  ? "This color is locked"
                  : "Only the anchor color can be edited in linked mode",
            accessibilityState: { selected: active, disabled: !editable },
            accessibilityValue: { text: accessibilityValue(state, entry) },
            accessibilityActions: editable
              ? [
                  { name: "activate", label: "Select color" },
                  { name: "increment", label: "Increase hue" },
                  { name: "decrement", label: "Decrease hue" },
                  { name: "increaseRadius", label: "Increase distance from center" },
                  { name: "decreaseRadius", label: "Decrease distance from center" },
                  { name: "increaseChannel", label: `Increase ${channelLabel.toLowerCase()}` },
                  { name: "decreaseChannel", label: `Decrease ${channelLabel.toLowerCase()}` }
                ]
              : [],
            onAccessibilityAction: editable
              ? (event) => {
                  onHandleAccessibilityAction(entry, event);
                }
              : undefined,
            hitSlop: 10,
            testID: `${testID}-handle-${entry.id}`
          };
          const renderProps: NativeWheelHandleRenderProps<Metadata> = {
            entry,
            point,
            active,
            anchor,
            editable,
            pressableProps,
            style: {
              left: `${point.x * 100}%`,
              top: `${point.y * 100}%`,
              backgroundColor: color
            }
          };
          const defaultHandle = defaultHandleNode(renderProps, styles);
          return (
            <View key={entry.id} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              {renderHandle?.(renderProps, defaultHandle) ?? defaultHandle}
            </View>
          );
        })}
      </View>
      {showAdjustments && selected !== undefined ? (
        <View
          style={[nativeStyles.adjustmentRow, styles?.adjustmentRow]}
          accessibilityLabel={`Adjust ${selected.name ?? selected.role ?? "selected color"}`}
          testID={`${testID}-adjustments`}
        >
          {(
            [
              ["decrease-hue", "Hue −"],
              ["increase-hue", "Hue +"],
              ["decrease-radius", "Center"],
              ["increase-radius", "Edge"],
              ["decrease-channel", `${channelLabel} −`],
              ["increase-channel", `${channelLabel} +`]
            ] as const
          ).map(([adjustment, label]) => (
            <Pressable
              key={adjustment}
              accessibilityRole="button"
              accessibilityLabel={`${label} for ${selected.name ?? selected.role ?? "selected color"}`}
              disabled={!canEdit(state, selected, disabled)}
              onPress={() => adjust(selected, adjustment)}
              style={({ pressed }) => [
                nativeStyles.adjustmentButton,
                styles?.adjustmentButton,
                pressed && nativeStyles.adjustmentButtonPressed,
                pressed && styles?.adjustmentButtonPressed
              ]}
              testID={`${testID}-${adjustment}`}
            >
              <Text style={[nativeStyles.adjustmentLabel, styles?.adjustmentLabel]}>{label}</Text>
            </Pressable>
          ))}
          <Text style={[nativeStyles.value, styles?.value]} numberOfLines={1}>
            {channelLabel} {channelPercent}% ·{" "}
            {formatColor(selected.color, {
              format: "hex",
              alpha: "auto",
              mapToSrgb: true
            })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const nativeStyles = StyleSheet.create({
  root: {
    width: "100%",
    alignItems: "center",
    gap: 10
  },
  heading: {
    alignSelf: "stretch",
    color: "#17151f",
    fontSize: 18,
    fontWeight: "700"
  },
  description: {
    alignSelf: "stretch",
    color: "#686474",
    fontSize: 14,
    lineHeight: 20
  },
  surface: {
    position: "relative",
    alignSelf: "center",
    borderRadius: 9999
  },
  fluidSurface: {
    width: "100%",
    maxWidth: 420,
    aspectRatio: 1
  },
  handle: {
    position: "absolute",
    width: 30,
    height: 30,
    marginLeft: -15,
    marginTop: -15,
    borderRadius: 15,
    borderWidth: 3,
    borderColor: "#ffffff",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.24,
    shadowRadius: 3,
    elevation: 4,
    alignItems: "center",
    justifyContent: "center"
  },
  activeHandle: {
    width: 38,
    height: 38,
    marginLeft: -19,
    marginTop: -19,
    borderRadius: 19,
    borderWidth: 4,
    borderColor: "#17151f"
  },
  anchorMark: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#17151f"
  },
  adjustmentRow: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8
  },
  adjustmentButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d9d6e0",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center"
  },
  adjustmentButtonPressed: {
    backgroundColor: "#efedf4"
  },
  adjustmentLabel: {
    color: "#282531",
    fontSize: 13,
    fontWeight: "600"
  },
  value: {
    color: "#686474",
    fontSize: 13,
    fontVariant: ["tabular-nums"]
  }
});
