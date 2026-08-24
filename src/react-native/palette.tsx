import { Fragment, useEffect, useRef, useState } from "react";
import type { ComponentRef, ComponentType, ReactNode, Ref } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import type {
  PressableProps,
  StyleProp,
  TextInputProps,
  TextStyle,
  ViewProps,
  ViewStyle
} from "react-native";
import { formatColor, parseColor } from "../core";
import type { JsonObject, PaletteColor } from "../core";
import type { PickerState } from "../editor";
import { useNativePickerController, useNativePickerSelector } from "./context";

const selectState = <Metadata extends object>(
  state: PickerState<Metadata>
): PickerState<Metadata> => state;
const INVALID_COLOR_MESSAGE = "Enter a supported CSS color.";

export interface NativePaletteActionProps {
  readonly select: PressableProps;
  readonly lock: PressableProps;
  readonly moveEarlier: PressableProps;
  readonly moveLater: PressableProps;
  readonly remove: PressableProps;
  readonly nameInput: TextInputProps;
  readonly colorInput: TextInputProps;
}

export interface NativePaletteSwatchRenderProps<Metadata extends object = JsonObject> {
  readonly entry: PaletteColor<Metadata>;
  readonly index: number;
  readonly count: number;
  readonly active: boolean;
  readonly anchor: boolean;
  readonly editable: boolean;
  readonly actionProps: NativePaletteActionProps;
}

export interface NativePaletteStyles {
  readonly root?: StyleProp<ViewStyle>;
  readonly header?: StyleProp<ViewStyle>;
  readonly heading?: StyleProp<TextStyle>;
  readonly description?: StyleProp<TextStyle>;
  readonly count?: StyleProp<TextStyle>;
  readonly list?: StyleProp<ViewStyle>;
  readonly swatchRow?: StyleProp<ViewStyle>;
  readonly activeSwatchRow?: StyleProp<ViewStyle>;
  readonly colorButton?: StyleProp<ViewStyle>;
  readonly anchorMark?: StyleProp<TextStyle>;
  readonly fields?: StyleProp<ViewStyle>;
  readonly nameInput?: StyleProp<TextStyle>;
  readonly colorInput?: StyleProp<TextStyle>;
  readonly invalidInput?: StyleProp<TextStyle>;
  readonly error?: StyleProp<TextStyle>;
  readonly actions?: StyleProp<ViewStyle>;
  readonly actionButton?: StyleProp<ViewStyle>;
  readonly actionButtonPressed?: StyleProp<ViewStyle>;
  readonly actionLabel?: StyleProp<TextStyle>;
  readonly empty?: StyleProp<TextStyle>;
  readonly addButton?: StyleProp<ViewStyle>;
  readonly addButtonPressed?: StyleProp<ViewStyle>;
  readonly addLabel?: StyleProp<TextStyle>;
}

export interface NativePaletteSwatchProps<
  Metadata extends object = JsonObject
> extends NativePaletteSwatchRenderProps<Metadata> {
  /** Receives the selection control used for accessibility-focus recovery. */
  readonly focusRef?: Ref<ComponentRef<typeof Pressable>>;
  readonly showName?: boolean;
  readonly showActions?: boolean;
  readonly styles?: NativePaletteStyles;
  readonly testID?: string;
}

function colorLabel<Metadata extends object>(entry: PaletteColor<Metadata>, index: number): string {
  return entry.name?.trim() || entry.role?.trim() || `Color ${index + 1}`;
}

function colorHex<Metadata extends object>(entry: PaletteColor<Metadata>): string {
  return formatColor(entry.color, {
    format: "hex",
    alpha: "auto",
    mapToSrgb: true
  });
}

function invalidColorHint(hint: string | undefined): string {
  const trimmed = hint?.trim();
  return trimmed === undefined || trimmed.length === 0
    ? INVALID_COLOR_MESSAGE
    : `${trimmed} ${INVALID_COLOR_MESSAGE}`;
}

class SwatchFocusRegistry {
  readonly #nodes = new Map<string, ComponentRef<typeof Pressable>>();
  #pending:
    { readonly kind: "color"; readonly id: string } | { readonly kind: "add" | "root" } | undefined;

  get(id: string): ComponentRef<typeof Pressable> | undefined {
    return this.#nodes.get(id);
  }

  set(id: string, node: ComponentRef<typeof Pressable> | null): void {
    if (node === null) this.#nodes.delete(id);
    else this.#nodes.set(id, node);
  }

  setPending(
    target: { readonly kind: "color"; readonly id: string } | { readonly kind: "add" | "root" }
  ): void {
    this.#pending = target;
  }

  takePending():
    | { readonly kind: "color"; readonly id: string }
    | { readonly kind: "add" | "root" }
    | undefined {
    const pending = this.#pending;
    this.#pending = undefined;
    return pending;
  }
}

function ActionButton({
  props,
  label,
  styles
}: {
  readonly props: PressableProps;
  readonly label: string;
  readonly styles?: NativePaletteStyles;
}) {
  return (
    <Pressable
      {...props}
      style={(state) => [
        nativeStyles.actionButton,
        styles?.actionButton,
        typeof props.style === "function" ? props.style(state) : props.style,
        state.pressed && nativeStyles.actionButtonPressed,
        state.pressed && styles?.actionButtonPressed
      ]}
    >
      <Text style={[nativeStyles.actionLabel, styles?.actionLabel]}>{label}</Text>
    </Pressable>
  );
}

export function NativePaletteSwatch<Metadata extends object = JsonObject>({
  entry,
  index,
  active,
  anchor,
  editable,
  actionProps,
  showName = true,
  showActions = true,
  focusRef,
  styles,
  testID = `colorwheel-palette-color-${entry.id}`
}: NativePaletteSwatchProps<Metadata>) {
  const source = colorHex(entry);
  const [draft, setDraft] = useState(source);
  const [invalid, setInvalid] = useState(false);
  const editingColor = useRef(false);

  useEffect(() => {
    if (!editingColor.current) {
      setDraft(source);
      setInvalid(false);
    }
  }, [source]);

  function commitColor(): void {
    editingColor.current = false;
    try {
      actionProps.colorInput.onChangeText?.(draft);
      setInvalid(false);
    } catch {
      setInvalid(true);
    }
  }

  const label = colorLabel(entry, index);
  return (
    <View
      style={[
        nativeStyles.swatchRow,
        styles?.swatchRow,
        active && nativeStyles.activeSwatchRow,
        active && styles?.activeSwatchRow
      ]}
      testID={testID}
      accessibilityLabel={anchor ? `${label}, anchor color` : undefined}
    >
      <Pressable
        {...actionProps.select}
        ref={focusRef}
        style={(state) => [
          nativeStyles.colorButton,
          styles?.colorButton,
          typeof actionProps.select.style === "function"
            ? actionProps.select.style(state)
            : actionProps.select.style,
          { backgroundColor: source }
        ]}
      >
        {anchor ? <Text style={[nativeStyles.anchorMark, styles?.anchorMark]}>◆</Text> : null}
      </Pressable>
      <View style={[nativeStyles.fields, styles?.fields]}>
        {showName ? (
          <TextInput
            {...actionProps.nameInput}
            style={[nativeStyles.nameInput, styles?.nameInput]}
            value={entry.name ?? ""}
            placeholder={label}
            accessibilityLabel={`${label} name`}
            returnKeyType="done"
            selectTextOnFocus={false}
          />
        ) : null}
        <TextInput
          {...actionProps.colorInput}
          style={[
            nativeStyles.colorInput,
            styles?.colorInput,
            invalid && nativeStyles.invalidInput,
            invalid && styles?.invalidInput
          ]}
          value={draft}
          editable={editable && actionProps.colorInput.editable !== false}
          accessibilityLabel={`${label} color value${invalid ? ", invalid" : ""}`}
          accessibilityHint={
            invalid
              ? invalidColorHint(actionProps.colorInput.accessibilityHint)
              : actionProps.colorInput.accessibilityHint
          }
          accessibilityState={{
            ...actionProps.colorInput.accessibilityState,
            disabled: !editable
          }}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="done"
          onFocus={(event) => {
            editingColor.current = true;
            actionProps.colorInput.onFocus?.(event);
          }}
          onChangeText={(value) => {
            setDraft(value);
          }}
          onSubmitEditing={commitColor}
          onBlur={(event) => {
            if (editingColor.current) commitColor();
            actionProps.colorInput.onBlur?.(event);
          }}
        />
        {invalid ? (
          <Text
            nativeID={`${testID}-value-error`}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            style={[nativeStyles.error, styles?.error]}
          >
            {INVALID_COLOR_MESSAGE}
          </Text>
        ) : null}
      </View>
      {showActions ? (
        <View style={[nativeStyles.actions, styles?.actions]}>
          <ActionButton
            props={actionProps.lock}
            label={entry.locked ? "Unlock" : "Lock"}
            styles={styles}
          />
          <ActionButton props={actionProps.moveEarlier} label="↑" styles={styles} />
          <ActionButton props={actionProps.moveLater} label="↓" styles={styles} />
          <ActionButton props={actionProps.remove} label="Remove" styles={styles} />
        </View>
      ) : null}
    </View>
  );
}

export interface NativePaletteBlockProps<Metadata extends object = JsonObject> extends Omit<
  ViewProps,
  "children"
> {
  readonly title?: ReactNode | false;
  readonly description?: ReactNode;
  readonly swatch?: ComponentType<NativePaletteSwatchProps<Metadata>>;
  readonly renderSwatch?: (
    props: NativePaletteSwatchRenderProps<Metadata>,
    defaultSwatch: ReactNode
  ) => ReactNode;
  readonly renderEmpty?: (defaultEmpty: ReactNode) => ReactNode;
  readonly showName?: boolean;
  readonly showActions?: boolean;
  readonly allowAdd?: boolean;
  readonly allowRemove?: boolean;
  readonly allowReorder?: boolean;
  readonly disabled?: boolean;
  readonly styles?: NativePaletteStyles;
}

export function NativePaletteBlock<Metadata extends object = JsonObject>({
  title = "Palette",
  description,
  swatch,
  renderSwatch,
  renderEmpty,
  showName = true,
  showActions = true,
  allowAdd = true,
  allowRemove = true,
  allowReorder = true,
  disabled = false,
  styles,
  style,
  testID = "colorwheel-palette",
  ...viewProps
}: NativePaletteBlockProps<Metadata>) {
  const state = useNativePickerSelector<PickerState<Metadata>, Metadata>(selectState);
  const controller = useNativePickerController<Metadata>();
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  const headingRef = useRef<ComponentRef<typeof Text>>(null);
  const addButtonRef = useRef<ComponentRef<typeof Pressable>>(null);
  const [swatchFocusRegistry] = useState(() => new SwatchFocusRegistry());
  const Swatch =
    swatch ?? (NativePaletteSwatch as ComponentType<NativePaletteSwatchProps<Metadata>>);
  const selected =
    state.palette.colors.find((entry) => entry.id === state.activeColorId) ??
    state.palette.colors[0];

  useEffect(() => {
    const target = swatchFocusRegistry.takePending();
    if (target === undefined) return;

    const node =
      target.kind === "color"
        ? (swatchFocusRegistry.get(target.id) ??
          addButtonRef.current ??
          headingRef.current ??
          rootRef.current)
        : target.kind === "add"
          ? (addButtonRef.current ?? headingRef.current ?? rootRef.current)
          : (headingRef.current ?? rootRef.current);
    const handle = findNodeHandle(node);
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [state.palette.colors, swatchFocusRegistry]);

  function addColor(): void {
    const id = controller.commands.addColor(
      {
        color: selected?.color ?? { space: "hsv", h: 0, s: 0, v: 0.5 },
        name: "New color"
      },
      undefined,
      { action: "add", phase: "commit" }
    );
    controller.commands.setActive(id, { action: "selection", phase: "commit" });
  }

  function removeColor(entry: PaletteColor<Metadata>, index: number): void {
    const colors = controller.getState().palette.colors;
    const next = colors[index + 1] ?? colors[index - 1];
    swatchFocusRegistry.setPending(
      next === undefined
        ? allowAdd
          ? { kind: "add" }
          : { kind: "root" }
        : { kind: "color", id: next.id }
    );
    controller.commands.removeColor(entry.id, {
      action: "remove",
      phase: "commit"
    });
  }

  const defaultEmpty = (
    <Text style={[nativeStyles.empty, styles?.empty]}>
      This palette is empty. Add a color to begin.
    </Text>
  );

  return (
    <View
      {...viewProps}
      ref={rootRef}
      style={[nativeStyles.root, styles?.root, style]}
      testID={testID}
    >
      <View style={[nativeStyles.header, styles?.header]}>
        <View style={nativeStyles.headerCopy}>
          {title === false ? null : typeof title === "string" || typeof title === "number" ? (
            <Text
              ref={headingRef}
              accessibilityRole="header"
              style={[nativeStyles.heading, styles?.heading]}
            >
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
        </View>
        <Text
          style={[nativeStyles.count, styles?.count]}
          accessibilityLabel={`${state.palette.colors.length} ${state.palette.colors.length === 1 ? "color" : "colors"}`}
        >
          {state.palette.colors.length}
        </Text>
      </View>
      <View style={[nativeStyles.list, styles?.list]}>
        {state.palette.colors.length === 0
          ? (renderEmpty?.(defaultEmpty) ?? defaultEmpty)
          : state.palette.colors.map((entry, index) => {
              const label = colorLabel(entry, index);
              const active = entry.id === state.activeColorId;
              const editable =
                !disabled &&
                !entry.locked &&
                (state.wheel.interaction === "free" || entry.id === state.anchorColorId);
              const actionProps: NativePaletteActionProps = {
                select: {
                  accessibilityRole: "button",
                  accessibilityLabel: `Select ${label}, ${colorHex(entry)}${entry.id === state.anchorColorId ? ", anchor color" : ""}`,
                  accessibilityState: { selected: active, disabled },
                  disabled,
                  onPress: () =>
                    controller.commands.setActive(entry.id, {
                      action: "selection",
                      phase: "commit"
                    }),
                  testID: `${testID}-select-${entry.id}`
                },
                lock: {
                  accessibilityRole: "button",
                  accessibilityLabel: `${entry.locked ? "Unlock" : "Lock"} ${label}`,
                  accessibilityState: { disabled, checked: Boolean(entry.locked) },
                  disabled,
                  onPress: () =>
                    controller.commands.setLocked(entry.id, !entry.locked, {
                      action: "lock",
                      phase: "commit"
                    }),
                  testID: `${testID}-lock-${entry.id}`
                },
                moveEarlier: {
                  accessibilityRole: "button",
                  accessibilityLabel: `Move ${label} earlier`,
                  disabled: disabled || !allowReorder || index === 0,
                  onPress: () =>
                    controller.commands.reorderColor(entry.id, index - 1, {
                      action: "reorder",
                      phase: "commit"
                    }),
                  testID: `${testID}-move-earlier-${entry.id}`
                },
                moveLater: {
                  accessibilityRole: "button",
                  accessibilityLabel: `Move ${label} later`,
                  disabled: disabled || !allowReorder || index === state.palette.colors.length - 1,
                  onPress: () =>
                    controller.commands.reorderColor(entry.id, index + 1, {
                      action: "reorder",
                      phase: "commit"
                    }),
                  testID: `${testID}-move-later-${entry.id}`
                },
                remove: {
                  accessibilityRole: "button",
                  accessibilityLabel: `Remove ${label}`,
                  disabled: disabled || !allowRemove,
                  onPress: () => removeColor(entry, index),
                  testID: `${testID}-remove-${entry.id}`
                },
                nameInput: {
                  editable: !disabled,
                  onChangeText: (name) =>
                    controller.commands.setName(entry.id, name || undefined, {
                      action: "text-input",
                      phase: "commit"
                    }),
                  testID: `${testID}-name-${entry.id}`
                },
                colorInput: {
                  editable,
                  onChangeText(value) {
                    controller.commands.setColor(entry.id, parseColor(value), {
                      action: "text-input",
                      phase: "commit"
                    });
                  },
                  testID: `${testID}-value-${entry.id}`
                }
              };
              const renderProps: NativePaletteSwatchRenderProps<Metadata> = {
                entry,
                index,
                count: state.palette.colors.length,
                active,
                anchor: entry.id === state.anchorColorId,
                editable,
                actionProps
              };
              const swatchProps: NativePaletteSwatchProps<Metadata> = {
                ...renderProps,
                focusRef: (node) => swatchFocusRegistry.set(entry.id, node),
                showName,
                showActions,
                styles,
                testID: `${testID}-color-${entry.id}`
              };
              const defaultSwatch = <Swatch {...swatchProps} />;
              return (
                <Fragment key={entry.id}>
                  {renderSwatch?.(renderProps, defaultSwatch) ?? defaultSwatch}
                </Fragment>
              );
            })}
      </View>
      {allowAdd ? (
        <Pressable
          ref={addButtonRef}
          accessibilityRole="button"
          accessibilityLabel="Add color"
          disabled={disabled}
          onPress={addColor}
          style={({ pressed }) => [
            nativeStyles.addButton,
            styles?.addButton,
            pressed && nativeStyles.addButtonPressed,
            pressed && styles?.addButtonPressed
          ]}
          testID={`${testID}-add`}
        >
          <Text style={[nativeStyles.addLabel, styles?.addLabel]}>Add color</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const nativeStyles = StyleSheet.create({
  root: {
    width: "100%",
    gap: 12
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  headerCopy: {
    flex: 1,
    gap: 3
  },
  heading: {
    color: "#17151f",
    fontSize: 18,
    fontWeight: "700"
  },
  description: {
    color: "#686474",
    fontSize: 14,
    lineHeight: 20
  },
  count: {
    minWidth: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
    color: "#514c5e",
    backgroundColor: "#efedf4",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center"
  },
  list: {
    gap: 10
  },
  swatchRow: {
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dedbe4",
    backgroundColor: "#ffffff",
    gap: 10
  },
  activeSwatchRow: {
    borderColor: "#7059cc",
    borderWidth: 2,
    padding: 9
  },
  colorButton: {
    minHeight: 54,
    width: "100%",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.14)",
    alignItems: "flex-end",
    justifyContent: "flex-start",
    padding: 7
  },
  anchorMark: {
    color: "#ffffff",
    fontSize: 12,
    textShadowColor: "rgba(0, 0, 0, 0.65)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
  fields: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  nameInput: {
    flexGrow: 1,
    flexBasis: 150,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#dedbe4",
    color: "#282531",
    backgroundColor: "#ffffff",
    fontSize: 15,
    fontWeight: "600"
  },
  colorInput: {
    flexGrow: 1,
    flexBasis: 112,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#dedbe4",
    color: "#514c5e",
    backgroundColor: "#ffffff",
    fontSize: 14,
    fontVariant: ["tabular-nums"]
  },
  invalidInput: {
    borderColor: "#b42318"
  },
  error: {
    width: "100%",
    color: "#b42318",
    fontSize: 12
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7
  },
  actionButton: {
    minHeight: 44,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dedbe4",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center"
  },
  actionButtonPressed: {
    backgroundColor: "#efedf4"
  },
  actionLabel: {
    color: "#514c5e",
    fontSize: 12,
    fontWeight: "700"
  },
  empty: {
    padding: 20,
    borderRadius: 14,
    color: "#686474",
    backgroundColor: "#f7f6fa",
    fontSize: 14,
    textAlign: "center"
  },
  addButton: {
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: "#17151f",
    alignItems: "center",
    justifyContent: "center"
  },
  addButtonPressed: {
    backgroundColor: "#3c3748"
  },
  addLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700"
  }
});
