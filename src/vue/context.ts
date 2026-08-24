import { inject, provide, shallowReadonly, shallowRef, watch } from "vue";
import type { ComputedRef, InjectionKey, ShallowRef } from "vue";
import type { JsonObject, Palette } from "../core";
import type { PickerController, PickerEquality, PickerSelector, PickerState } from "../editor";

export interface ColorwheelContext<Metadata extends object = JsonObject> {
  readonly controller: PickerController<Metadata>;
  readonly state: Readonly<ShallowRef<PickerState<Metadata>>>;
  readonly palette: ComputedRef<Palette<Metadata>>;
}

const colorwheelContextKey: InjectionKey<ColorwheelContext<JsonObject>> =
  Symbol("ColorwheelVueContext");

/** @internal Used by adapter components; custom providers may also compose it. */
export function provideColorwheelContext<Metadata extends object>(
  context: ColorwheelContext<Metadata>
): void {
  provide(colorwheelContextKey, context as unknown as ColorwheelContext<JsonObject>);
}

export function useColorwheelContext<
  Metadata extends object = JsonObject
>(): ColorwheelContext<Metadata> {
  const context = inject(colorwheelContextKey);
  if (context === undefined) {
    throw new Error("Colorwheel Vue composables must be used inside <Colorwheel>");
  }
  return context as unknown as ColorwheelContext<Metadata>;
}

/** A stable facade that follows controller-prop replacements made by the nearest component. */
export function useColorwheelController<
  Metadata extends object = JsonObject
>(): PickerController<Metadata> {
  const context = useColorwheelContext<Metadata>();
  const commands = new Proxy(context.controller.commands, {
    get(_target, property) {
      const command = Reflect.get(
        context.controller.commands,
        property,
        context.controller.commands
      ) as unknown;
      if (typeof command !== "function") return command;
      return (...args: unknown[]) => {
        const currentCommands = context.controller.commands;
        const currentCommand = Reflect.get(currentCommands, property, currentCommands) as unknown;
        if (typeof currentCommand !== "function") return currentCommand;
        const invoke = currentCommand as (...parameters: unknown[]) => unknown;
        return invoke.apply(currentCommands, args);
      };
    }
  });
  return new Proxy(context.controller, {
    get(_target, property) {
      if (property === "commands") return commands;
      const controller = context.controller;
      const value = Reflect.get(controller, property, controller) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const current = context.controller;
        const method = Reflect.get(current, property, current) as unknown;
        if (typeof method !== "function") return method;
        const invoke = method as (...parameters: unknown[]) => unknown;
        return invoke.apply(current, args);
      };
    }
  });
}

/** A fine-grained reactive selector for custom Vue blocks. */
export function useColorwheelSelector<Result, Metadata extends object = JsonObject>(
  selector: PickerSelector<Result, Metadata>,
  equality: PickerEquality<Result> = Object.is
): Readonly<ShallowRef<Result>> {
  const context = useColorwheelContext<Metadata>();
  const selected = shallowRef(selector(context.state.value)) as ShallowRef<Result>;
  watch(
    context.state,
    (state) => {
      const next = selector(state);
      if (!equality(selected.value, next)) selected.value = next;
    },
    { flush: "sync" }
  );
  return shallowReadonly(selected);
}
