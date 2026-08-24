import type { ComponentType, ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { JsonObject } from "../core";
import { NativePaletteBlock } from "./palette";
import type { NativePaletteBlockProps } from "./palette";
import { NativePickerRoot } from "./root";
import type { NativePickerRootProps } from "./root";
import { NativeWheelBlock } from "./wheel";
import type { NativeWheelBlockProps } from "./wheel";
import type { StyleProp, ViewStyle } from "react-native";

type WithoutChildren<Value> = Value extends unknown ? Omit<Value, "children"> : never;

export interface NativePickerBlocks<Metadata extends object = JsonObject> {
  readonly wheel?: ComponentType<NativeWheelBlockProps<Metadata>> | false;
  readonly palette?: ComponentType<NativePaletteBlockProps<Metadata>> | false;
}

export interface NativePickerBlockProps<Metadata extends object = JsonObject> {
  readonly wheel?: NativeWheelBlockProps<Metadata>;
  readonly palette?: NativePaletteBlockProps<Metadata>;
}

export interface NativePickerCompositionProps<Metadata extends object = JsonObject> {
  readonly blocks?: NativePickerBlocks<Metadata>;
  readonly blockProps?: NativePickerBlockProps<Metadata>;
  /** Replaces the preset layout while retaining the configured root/controller. */
  readonly children?: ReactNode;
  readonly layoutStyle?: StyleProp<ViewStyle>;
  readonly renderLayout?: (defaultLayout: ReactNode) => ReactNode;
}

export type NativePickerProps<Metadata extends object = JsonObject> = WithoutChildren<
  NativePickerRootProps<Metadata>
> &
  NativePickerCompositionProps<Metadata>;

export function NativePickerPreset<Metadata extends object = JsonObject>({
  blocks,
  blockProps,
  children,
  layoutStyle,
  renderLayout,
  ...rootProps
}: NativePickerProps<Metadata>) {
  const Wheel = blocks?.wheel === false ? null : (blocks?.wheel ?? NativeWheelBlock<Metadata>);
  const Palette =
    blocks?.palette === false ? null : (blocks?.palette ?? NativePaletteBlock<Metadata>);
  const defaultLayout = (
    <View style={[nativeStyles.layout, layoutStyle]}>
      {Wheel ? <Wheel {...blockProps?.wheel} /> : null}
      {Palette ? <Palette {...blockProps?.palette} /> : null}
    </View>
  );

  return (
    <NativePickerRoot<Metadata> {...rootProps}>
      {children ?? renderLayout?.(defaultLayout) ?? defaultLayout}
    </NativePickerRoot>
  );
}

export const Picker = Object.assign(NativePickerPreset, {
  Root: NativePickerRoot,
  Wheel: NativeWheelBlock,
  Palette: NativePaletteBlock
});

/** Descriptive alias for consumers that prefer the package name over `Picker`. */
export const Colorwheel = Picker;

const nativeStyles = StyleSheet.create({
  layout: {
    width: "100%",
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#f7f6fa",
    gap: 22
  }
});
