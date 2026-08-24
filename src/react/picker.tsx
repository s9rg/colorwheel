import type { ComponentType, ReactNode } from "react";
import type { JsonObject } from "../core";
import { ControlsBlock } from "./controls";
import type { ControlsBlockProps } from "./controls";
import { DiagnosticsBlock } from "./diagnostics";
import type { DiagnosticsBlockProps } from "./diagnostics";
import { ExportBlock } from "./export";
import type { ExportBlockProps } from "./export";
import { PaletteBlock } from "./palette";
import type { PaletteBlockProps } from "./palette";
import { PickerRoot } from "./root";
import type { PickerRootProps } from "./root";
import { WheelBlock } from "./wheel";
import type { WheelBlockProps } from "./wheel";

type WithoutChildren<Value> = Value extends unknown ? Omit<Value, "children"> : never;

export interface PickerBlocks<Metadata extends object = JsonObject> {
  readonly wheel?: ComponentType<WheelBlockProps<Metadata>> | false;
  readonly palette?: ComponentType<PaletteBlockProps<Metadata>> | false;
  readonly controls?: ComponentType<ControlsBlockProps> | false;
  readonly diagnostics?: ComponentType<DiagnosticsBlockProps<Metadata>> | false;
  readonly export?: ComponentType<ExportBlockProps<Metadata>> | false;
}

export interface PickerBlockProps<Metadata extends object = JsonObject> {
  readonly wheel?: WheelBlockProps<Metadata>;
  readonly palette?: PaletteBlockProps<Metadata>;
  readonly controls?: ControlsBlockProps;
  readonly diagnostics?: DiagnosticsBlockProps<Metadata>;
  readonly export?: ExportBlockProps<Metadata>;
}

interface PickerCompositionProps<Metadata extends object> {
  readonly blocks?: PickerBlocks<Metadata>;
  readonly blockProps?: PickerBlockProps<Metadata>;
  /** Replaces the preset layout while retaining the configured root/controller. */
  readonly children?: ReactNode;
}

export type PickerProps<Metadata extends object = JsonObject> = WithoutChildren<
  PickerRootProps<Metadata>
> &
  PickerCompositionProps<Metadata>;

export function PickerPreset<Metadata extends object = JsonObject>({
  blocks,
  blockProps,
  children,
  ...rootProps
}: PickerProps<Metadata>) {
  const Wheel = blocks?.wheel === false ? null : (blocks?.wheel ?? WheelBlock<Metadata>);
  const Palette = blocks?.palette === false ? null : (blocks?.palette ?? PaletteBlock<Metadata>);
  const Controls = blocks?.controls === false ? null : (blocks?.controls ?? ControlsBlock);
  const Diagnostics =
    blocks?.diagnostics === false ? null : (blocks?.diagnostics ?? DiagnosticsBlock<Metadata>);
  const Export = blocks?.export === false ? null : (blocks?.export ?? ExportBlock<Metadata>);

  return (
    <PickerRoot<Metadata> {...rootProps}>
      {children ?? (
        <div data-part="picker-layout">
          {Wheel ? <Wheel {...blockProps?.wheel} /> : null}
          {Palette ? <Palette {...blockProps?.palette} /> : null}
          {Controls ? <Controls {...blockProps?.controls} /> : null}
          {Diagnostics ? <Diagnostics {...blockProps?.diagnostics} /> : null}
          {Export ? <Export {...blockProps?.export} /> : null}
        </div>
      )}
    </PickerRoot>
  );
}

export const Picker = Object.assign(PickerPreset, {
  Root: PickerRoot,
  Wheel: WheelBlock,
  Palette: PaletteBlock,
  Controls: ControlsBlock,
  Diagnostics: DiagnosticsBlock,
  Export: ExportBlock
});
