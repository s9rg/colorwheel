import type * as ReactNamespace from "react";

type NativeProps = Record<string, unknown>;

interface NativeRuntimeOptions {
  readonly findNodeHandle?: (node: unknown) => number | null;
  readonly setAccessibilityFocus?: (handle: number) => void;
}

function domAccessibilityProps(props: NativeProps) {
  const accessibilityState = props.accessibilityState as
    { disabled?: boolean; selected?: boolean } | undefined;
  return {
    "aria-disabled": accessibilityState?.disabled,
    "aria-label": props.accessibilityLabel,
    "aria-description": props.accessibilityHint,
    "aria-live": props.accessibilityLiveRegion,
    "aria-pressed": accessibilityState?.selected,
    "data-testid": props.testID,
    id: props.nativeID,
    role:
      props.accessibilityRole === "adjustable"
        ? "slider"
        : props.accessibilityRole === "header"
          ? "heading"
          : props.accessibilityRole
  };
}

/** Minimal host-component runtime for exercising the native adapter in jsdom. */
export function createReactNativeMock(
  React: typeof ReactNamespace,
  options: NativeRuntimeOptions = {}
) {
  let nextHandle = 1;
  const handles = new WeakMap<object, number>();
  const findNodeHandle =
    options.findNodeHandle ??
    ((node: unknown): number | null => {
      if ((typeof node !== "object" && typeof node !== "function") || node === null) return null;
      const existing = handles.get(node);
      if (existing !== undefined) return existing;
      const handle = nextHandle;
      nextHandle += 1;
      handles.set(node, handle);
      return handle;
    });
  const View = React.forwardRef<HTMLElement, NativeProps>((props, forwardedRef) => {
    React.useLayoutEffect(() => {
      (props.onLayout as ((event: unknown) => void) | undefined)?.({
        nativeEvent: { layout: { height: 200, width: 200, x: 0, y: 0 } }
      });
    }, [props.onLayout]);
    return React.createElement(
      "div",
      {
        ...domAccessibilityProps(props),
        ref(node: HTMLElement | null) {
          if (node !== null) {
            Object.assign(node, {
              measureInWindow() {}
            });
          }
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef !== null) forwardedRef.current = node;
        }
      },
      props.children as ReactNamespace.ReactNode
    );
  });
  const Text = React.forwardRef<HTMLElement, NativeProps>((props, ref) =>
    React.createElement(
      "span",
      { ...domAccessibilityProps(props), ref },
      props.children as ReactNamespace.ReactNode
    )
  );
  const Pressable = React.forwardRef<HTMLElement, NativeProps>((props, ref) =>
    React.createElement(
      "button",
      {
        ...domAccessibilityProps(props),
        disabled: Boolean(props.disabled),
        onClick: props.disabled ? undefined : props.onPress,
        ref
      },
      props.children as ReactNamespace.ReactNode
    )
  );
  const TextInput = React.forwardRef<HTMLInputElement, NativeProps>((props, ref) =>
    React.createElement("input", {
      ...domAccessibilityProps(props),
      disabled: props.editable === false,
      onBlur: props.onBlur,
      onChange: (event: ReactNamespace.ChangeEvent<HTMLInputElement>) =>
        (props.onChangeText as ((value: string) => void) | undefined)?.(event.currentTarget.value),
      onFocus: props.onFocus,
      onKeyDown: (event: ReactNamespace.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
          (props.onSubmitEditing as (() => void) | undefined)?.();
        }
      },
      placeholder: props.placeholder,
      ref,
      value: props.value
    })
  );

  return {
    AccessibilityInfo: {
      setAccessibilityFocus: options.setAccessibilityFocus ?? (() => undefined)
    },
    findNodeHandle,
    PanResponder: { create: () => ({ panHandlers: {} }) },
    Pressable,
    StyleSheet: { absoluteFill: {}, create: <Value,>(value: Value) => value },
    Text,
    TextInput,
    View
  };
}
