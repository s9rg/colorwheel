import {
  createSSRApp,
  defineComponent,
  effectScope,
  h,
  nextTick,
  onUnmounted,
  ref,
  toRaw
} from "vue";
import { renderToString } from "vue/server-renderer";
import { mount } from "@vue/test-utils";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { ColorValue, Palette, PaletteColor } from "../../src/core";
import {
  DestroyedPickerControllerError,
  createPickerController,
  createPickerState
} from "../../src/editor";
import type { ChangeMeta, PickerState } from "../../src/editor";
import {
  Colorwheel,
  createColorwheelComponent,
  useColorwheel,
  useColorwheelController,
  useColorwheelSelector
} from "../../src/vue";
import type {
  ColorwheelExposed,
  ColorwheelPointerSlotScope,
  ColorwheelSwatchSlotScope
} from "../../src/vue";

const red: ColorValue = { space: "hsv", h: 0, s: 1, v: 1 };
const green: ColorValue = { space: "hsv", h: 120, s: 1, v: 1 };
const blue: ColorValue = { space: "hsv", h: 240, s: 1, v: 1 };

function entry(id: string, color: ColorValue, name: string): PaletteColor {
  return { id, color, name };
}

function palette(
  colors: readonly PaletteColor[] = [
    entry("red", red, "Red"),
    entry("green", green, "Green"),
    entry("blue", blue, "Blue")
  ]
): Palette {
  return {
    colors,
    kind: "custom",
    provenance: { origin: "manual" }
  };
}

function exposed(wrapper: ReturnType<typeof mount>): ColorwheelExposed {
  return wrapper.vm as unknown as ColorwheelExposed;
}

function pointerEvent(
  type: string,
  values: {
    readonly pointerId: number;
    readonly clientX: number;
    readonly clientY: number;
  }
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: values.clientX,
    clientY: values.clientY
  });
  Object.defineProperties(event, {
    pointerId: { value: values.pointerId },
    pointerType: { value: "touch" },
    isPrimary: { value: true }
  });
  return event;
}

describe("Colorwheel Vue adapter", () => {
  it("mounts an owned editor with shared hooks and metadata-bearing Vue events", async () => {
    const wrapper = mount(Colorwheel, {
      props: {
        defaultPalette: palette(),
        className: "product-picker",
        ariaLabel: "Brand palette",
        unstyled: true
      }
    });

    const root = wrapper.get('[data-colorwheel=""]');
    expect(root.classes()).toContain("product-picker");
    expect(root.attributes("aria-label")).toBe("Brand palette");
    expect(root.attributes()).toHaveProperty("data-unstyled");
    expect(wrapper.findAll('[data-part="pointer"]')).toHaveLength(3);
    expect(wrapper.findAll('[data-part="palette-item"]')).toHaveLength(3);

    await wrapper.get('[data-part="swatch"][data-color-id="green"]').trigger("click");
    const change = wrapper.emitted("change")?.at(-1);
    expect(change?.[0]).toMatchObject({ activeColorId: "green" });
    expect(change?.[1]).toMatchObject({
      action: "selection",
      origin: "user",
      phase: "commit"
    });
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(change);
    expect(wrapper.emitted("palette-change")).toBeUndefined();

    wrapper.unmount();
  });

  it("supports controlled palette v-model without callback echo from external updates", async () => {
    const original = palette();
    const wrapper = mount(Colorwheel, { props: { palette: original } });
    const colorInput = wrapper.get<HTMLInputElement>(
      '[data-part="color-input"][data-color-id="red"]'
    );
    await colorInput.setValue("#00ffff");
    await colorInput.trigger("change");

    const paletteChange = wrapper.emitted("palette-change")?.at(-1);
    expect(paletteChange?.[0] === original).toBe(false);
    expect(paletteChange?.[1]).toMatchObject({
      action: "text-input",
      origin: "user",
      phase: "commit",
      changedColorIds: ["red"]
    });
    expect(wrapper.emitted("update:palette")?.at(-1)).toEqual(paletteChange);

    await Promise.resolve();
    await nextTick();
    expect(exposed(wrapper).controller.getPalette()).toBe(original);

    let currentInput = wrapper.get<HTMLInputElement>(
      '[data-part="color-input"][data-color-id="red"]'
    );
    currentInput.element.value = "#123456";
    await currentInput.trigger("input");
    const eventCount = wrapper.emitted("palette-change")?.length;
    const external = palette([
      entry("red", blue, "Red"),
      entry("green", green, "Green"),
      entry("blue", blue, "Blue")
    ]);
    await wrapper.setProps({ palette: external });
    currentInput = wrapper.get<HTMLInputElement>('[data-part="color-input"][data-color-id="red"]');
    expect(currentInput.element.value).toBe("#0000ff");
    await currentInput.trigger("blur");
    expect(wrapper.emitted("palette-change")?.length).toBe(eventCount);

    const next = palette([entry("blue", blue, "Blue")]);
    await wrapper.setProps({ palette: next });
    expect(exposed(wrapper).controller.getPalette()).toBe(next);
    expect(wrapper.findAll('[data-part="palette-item"]')).toHaveLength(1);
    expect(wrapper.emitted("palette-change")?.length).toBe(eventCount);

    wrapper.unmount();
  });

  it("supports controlled full-state v-model and reconciles unaccepted state", async () => {
    const value = createPickerState({ palette: palette() });
    const wrapper = mount(Colorwheel, { props: { modelValue: value } });

    await wrapper.get('[data-part="swatch"][data-color-id="green"]').trigger("click");
    const update = wrapper.emitted("update:modelValue")?.at(-1);
    expect(update?.[0]).toMatchObject({ activeColorId: "green" });
    expect(update?.[1]).toMatchObject({ action: "selection" });
    await Promise.resolve();
    expect(exposed(wrapper).controller.getState()).toBe(value);

    const next: PickerState = { ...value, activeColorId: "blue" };
    const changeCount = wrapper.emitted("change")?.length;
    await wrapper.setProps({ modelValue: next });
    expect(exposed(wrapper).controller.getState()).toBe(next);
    expect(wrapper.emitted("change")?.length).toBe(changeCount);

    wrapper.unmount();
  });

  it("does not reconcile a controlled value after its owned controller is unmounted", async () => {
    const original = palette();
    const wrapper = mount(Colorwheel, { props: { palette: original } });
    const controller = exposed(wrapper).controller;

    controller.commands.setName("red", "Changed");
    wrapper.unmount();
    await Promise.resolve();

    expect(() => controller.select((state) => state)).toThrow(DestroyedPickerControllerError);
  });

  it("keeps nested callback palette events in causal order", async () => {
    let nested = false;
    const nestedChange: { run?: () => void } = {};
    const wrapper = mount(Colorwheel, {
      props: {
        defaultPalette: palette(),
        onChange: (_state: PickerState, meta: { action: string }) => {
          if (meta.action !== "selection" || nested) return;
          nested = true;
          nestedChange.run?.();
        }
      }
    });
    nestedChange.run = () => exposed(wrapper).controller.commands.setColor("red", green);

    await wrapper.get('[data-part="swatch"][data-color-id="green"]').trigger("click");
    const changes = wrapper.emitted("palette-change") ?? [];
    expect(changes).toHaveLength(1);
    expect((changes[0]?.[0] as Palette).colors[0]?.color).toEqual(green);
    wrapper.unmount();
  });

  it("renders a reactive custom palette slot and arbitrary injected custom blocks", async () => {
    const CustomPalette = defineComponent({
      setup() {
        const colors = useColorwheelSelector((state) => state.palette.colors);
        return () =>
          h(
            "ul",
            { "data-testid": "custom-palette" },
            colors.value.map((color) => h("li", { key: color.id }, color.name))
          );
      }
    });
    const CustomBlock = defineComponent({
      setup() {
        const controller = useColorwheelController();
        const activeId = useColorwheelSelector((state) => state.activeColorId);
        return () =>
          h(
            "button",
            {
              "data-testid": "custom-block",
              onClick: () => controller.commands.setActive("blue")
            },
            activeId.value ?? "none"
          );
      }
    });
    const wrapper = mount(Colorwheel, {
      props: { defaultPalette: palette() },
      slots: {
        palette: () => h(CustomPalette),
        default: () => h(CustomBlock)
      }
    });

    expect(wrapper.find('[data-part="palette-item"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="custom-palette"]').text()).toContain("Green");
    expect(wrapper.get('[data-testid="custom-block"]').text()).toBe("red");
    await wrapper.get('[data-testid="custom-block"]').trigger("click");
    expect(wrapper.get('[data-testid="custom-block"]').text()).toBe("blue");

    exposed(wrapper).controller.commands.removeColor("green");
    await nextTick();
    expect(wrapper.get('[data-testid="custom-palette"]').text().includes("Green")).toBe(false);

    wrapper.unmount();
  });

  it("keeps native Vue nodes, focus, and slot component identity stable across updates", async () => {
    const lifecycle = { mounted: 0, unmounted: 0 };
    const CustomPalette = defineComponent({
      setup() {
        lifecycle.mounted += 1;
        onUnmounted(() => {
          lifecycle.unmounted += 1;
        });
        const activeId = useColorwheelSelector((state) => state.activeColorId);
        return () => h("p", { "data-testid": "stable-slot" }, activeId.value ?? "none");
      }
    });
    const wrapper = mount(Colorwheel, {
      props: { defaultPalette: palette() },
      slots: { default: () => h(CustomPalette) },
      attachTo: document.body
    });
    const root = wrapper.get('[data-colorwheel=""]').element;
    const wheel = wrapper.get('[data-part="wheel"]').element;
    const paletteBlock = wrapper.get('[data-part="palette"]').element;
    const pointer = wrapper.get('[data-part="pointer"][data-color-id="red"]').element;
    const slot = wrapper.get('[data-testid="stable-slot"]').element;
    (pointer as HTMLElement).focus();

    exposed(wrapper).controller.commands.setActive("green");
    await nextTick();

    expect(wrapper.get('[data-colorwheel=""]').element).toBe(root);
    expect(wrapper.get('[data-part="wheel"]').element).toBe(wheel);
    expect(wrapper.get('[data-part="palette"]').element).toBe(paletteBlock);
    expect(wrapper.get('[data-part="pointer"][data-color-id="red"]').element).toBe(pointer);
    expect(wrapper.get('[data-testid="stable-slot"]').element).toBe(slot);
    expect(wrapper.get('[data-testid="stable-slot"]').text()).toBe("green");
    expect(document.activeElement).toBe(pointer);
    expect(lifecycle).toEqual({ mounted: 1, unmounted: 0 });

    wrapper.unmount();
    expect(lifecycle).toEqual({ mounted: 1, unmounted: 1 });
  });

  it("rebinds a replaced controller without remounting native slots or retaining the old one", async () => {
    const first = createPickerController(createPickerState({ palette: palette() }));
    const second = createPickerController(
      createPickerState({
        palette: palette([entry("green", green, "Green"), entry("blue", blue, "Blue")])
      })
    );
    let mounts = 0;
    const ControllerConsumer = defineComponent({
      setup() {
        mounts += 1;
        const controller = useColorwheelController();
        const activeId = useColorwheelSelector((state) => state.activeColorId);
        return () =>
          h(
            "button",
            {
              "data-testid": "controller-consumer",
              onClick: () => controller.commands.setActive("blue")
            },
            activeId.value ?? "none"
          );
      }
    });
    const wrapper = mount(Colorwheel, {
      props: { controller: first },
      slots: { default: () => h(ControllerConsumer) }
    });
    const consumer = wrapper.get('[data-testid="controller-consumer"]').element;

    first.commands.setActive("green");
    await nextTick();
    expect(wrapper.get('[data-testid="controller-consumer"]').text()).toBe("green");

    await wrapper.setProps({ controller: second });
    expect(exposed(wrapper).controller).toBe(second);
    expect(wrapper.findAll('[data-part="palette-item"]')).toHaveLength(2);
    expect(wrapper.get('[data-testid="controller-consumer"]').element).toBe(consumer);
    expect(wrapper.get('[data-testid="controller-consumer"]').text()).toBe("green");
    expect(mounts).toBe(1);

    first.commands.setActive("red");
    await nextTick();
    expect(wrapper.get('[data-testid="controller-consumer"]').text()).toBe("green");
    await wrapper.get('[data-testid="controller-consumer"]').trigger("click");
    expect(second.getState().activeColorId).toBe("blue");

    wrapper.unmount();
    expect(first.getPalette()).toBeDefined();
    expect(second.getPalette()).toBeDefined();
    first.destroy();
    second.destroy();
  });

  it("rebinds after a caller destroys the previous controller during an active edit", async () => {
    const first = createPickerController(createPickerState({ palette: palette() }));
    const second = createPickerController(createPickerState({ palette: palette() }));
    const wrapper = mount(Colorwheel, { props: { controller: first } });
    await wrapper.get('[data-part="name-input"][data-color-id="red"]').trigger("focus");

    first.destroy();
    await expect(wrapper.setProps({ controller: second })).resolves.toBeUndefined();
    expect(exposed(wrapper).controller).toBe(second);

    wrapper.unmount();
    second.destroy();
  });

  it("closes edit sessions and clears drafts when their color is removed", async () => {
    const onChange = vi.fn();
    const wrapper = mount(Colorwheel, { props: { defaultPalette: palette(), onChange } });
    const controller = exposed(wrapper).controller;
    const nameInput = wrapper.get<HTMLInputElement>(
      '[data-part="name-input"][data-color-id="red"]'
    );
    const colorInput = wrapper.get<HTMLInputElement>(
      '[data-part="color-input"][data-color-id="red"]'
    );

    await nameInput.trigger("focus");
    await nameInput.setValue("Rouge");
    await colorInput.setValue("not-a-color");
    await colorInput.trigger("change");
    expect(colorInput.attributes("aria-invalid")).toBe("true");

    controller.commands.removeColor("red");
    await nextTick();
    const textCommits = () =>
      (wrapper.emitted("change") ?? []).filter(
        (event) =>
          (event[1] as ChangeMeta).action === "text-input" &&
          (event[1] as ChangeMeta).phase === "commit"
      );
    expect(textCommits()).toHaveLength(1);

    controller.commands.addColor(entry("red", red, "Replacement"));
    await nextTick();
    const replacement = wrapper.get<HTMLInputElement>(
      '[data-part="color-input"][data-color-id="red"]'
    );
    expect(replacement.element.value).not.toBe("not-a-color");
    expect(replacement.attributes("aria-invalid")).toBeUndefined();

    const changeCount = onChange.mock.calls.length;
    wrapper.unmount();
    expect(onChange).toHaveBeenCalledTimes(changeCount);
  });

  it("does not echo an external removal while abandoning its active edit", async () => {
    const onChange = vi.fn();
    const wrapper = mount(Colorwheel, {
      props: { palette: palette(), onChange }
    });
    const nameInput = wrapper.get<HTMLInputElement>(
      '[data-part="name-input"][data-color-id="red"]'
    );

    await nameInput.trigger("focus");
    await nameInput.setValue("Rouge");
    const changeCount = onChange.mock.calls.length;
    await wrapper.setProps({
      palette: palette([entry("green", green, "Green"), entry("blue", blue, "Blue")])
    });

    expect(onChange).toHaveBeenCalledTimes(changeCount);
    wrapper.unmount();
    expect(onChange).toHaveBeenCalledTimes(changeCount);
  });

  it("supports native block customization and accessible keyboard editing", async () => {
    const wrapper = mount(Colorwheel, {
      props: {
        id: "brand-picker",
        defaultPalette: palette(),
        blockProps: {
          wheel: { title: "Brand wheel", showInstructions: false, showChannelRing: false },
          palette: {
            title: "Brand colors",
            showName: false,
            showActions: false,
            allowAdd: false
          }
        }
      }
    });

    expect(wrapper.get('[data-part="wheel-block"] [data-part="block-title"]').text()).toBe(
      "Brand wheel"
    );
    expect(wrapper.get('[data-part="palette"] [data-part="block-title"]').text()).toBe(
      "Brand colors"
    );
    expect(wrapper.get('[data-part="palette"]').attributes("aria-labelledby")).toBe(
      "brand-picker-palette-title"
    );
    expect(wrapper.find('[data-part="channel-ring"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="wheel-instructions"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="name-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="palette-item-actions"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="add-color"]').exists()).toBe(false);

    const before = exposed(wrapper).controller.getPalette().colors[0]?.color;
    const pointer = wrapper.get('[data-part="pointer"][data-color-id="red"]');
    expect(pointer.attributes("role")).toBe("button");
    expect(pointer.attributes("aria-label")).toContain("Red wheel handle");
    await pointer.trigger("keydown", { key: "ArrowRight" });
    expect(exposed(wrapper).controller.getPalette().colors[0]?.color).not.toEqual(before);
    expect(wrapper.emitted("change")?.at(-1)?.[1]).toMatchObject({
      action: "keyboard",
      phase: "commit"
    });

    wrapper.unmount();
  });

  it("commits inactive-handle selection outside paired pointer and keyboard edits", async () => {
    const wrapper = mount(Colorwheel, { props: { defaultPalette: palette() } });
    const wheel = wrapper.get<HTMLElement>('[data-part="wheel"]');
    const bluePointer = wrapper.get<HTMLElement>('[data-part="pointer"][data-color-id="blue"]');
    wheel.element.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;

    const pointerStart = wrapper.emitted("change")?.length ?? 0;
    bluePointer.element.dispatchEvent(
      pointerEvent("pointerdown", { pointerId: 17, clientX: 100, clientY: 50 })
    );
    document.dispatchEvent(
      pointerEvent("pointermove", { pointerId: 17, clientX: 50, clientY: 100 })
    );
    document.dispatchEvent(pointerEvent("pointerup", { pointerId: 17, clientX: 0, clientY: 50 }));

    const pointerChanges = (wrapper.emitted("change")?.slice(pointerStart) ?? []).map(
      (change) => change[1] as ChangeMeta
    );
    const selection = pointerChanges.filter((meta) => meta.action === "selection");
    const pointer = pointerChanges.filter((meta) => meta.action === "pointer");
    expect(selection).toHaveLength(1);
    expect(selection[0]).toMatchObject({ phase: "commit", changedColorIds: [] });
    expect(selection[0]?.transactionId).toBeUndefined();
    expect(pointer.map((meta) => meta.phase)).toEqual([
      "start",
      "update",
      "update",
      "update",
      "commit"
    ]);
    expect(pointer[0]?.transactionId).toBeTruthy();
    expect(new Set(pointer.map((meta) => meta.transactionId))).toEqual(
      new Set([pointer[0]?.transactionId])
    );

    exposed(wrapper).controller.commands.setActive("red");
    await nextTick();
    const keyboardStart = wrapper.emitted("change")?.length ?? 0;
    await bluePointer.trigger("keydown", { key: "ArrowRight" });
    const keyboardChanges = (wrapper.emitted("change")?.slice(keyboardStart) ?? []).map(
      (change) => change[1] as ChangeMeta
    );
    expect(
      keyboardChanges.map(({ action, phase, transactionId }) => ({
        action,
        phase,
        transactionId
      }))
    ).toEqual([
      { action: "selection", phase: "commit", transactionId: undefined },
      { action: "keyboard", phase: "commit", transactionId: undefined }
    ]);

    wrapper.unmount();
  });

  it("offers Vue-native pointer and swatch slots with the standard interaction bindings", async () => {
    const wrapper = mount(Colorwheel, {
      props: { defaultPalette: palette() },
      slots: {
        pointer: (scope: ColorwheelPointerSlotScope) =>
          h(
            "button",
            { ...scope.buttonProps, "data-testid": `custom-pointer-${scope.entry.id}` },
            scope.entry.name
          ),
        swatch: (scope: ColorwheelSwatchSlotScope) =>
          h("li", { "data-testid": `custom-swatch-${scope.entry.id}` }, [
            h(
              "button",
              { ...scope.actionProps.select, "data-testid": `select-${scope.entry.id}` },
              scope.entry.name
            )
          ])
      }
    });

    expect(wrapper.get('[data-testid="custom-pointer-red"]').attributes("role")).toBe("button");
    expect(wrapper.find('[data-part="palette-item"]').exists()).toBe(false);
    await wrapper.get('[data-testid="select-green"]').trigger("click");
    expect(exposed(wrapper).state.activeColorId).toBe("green");
    await wrapper.get('[data-testid="custom-pointer-red"]').trigger("keydown", {
      key: "ArrowRight"
    });
    expect(wrapper.emitted("change")?.at(-1)?.[1]).toMatchObject({ action: "keyboard" });

    wrapper.unmount();
  });

  it("keeps the legacy renderPalette escape hatch isolated from the native renderer", async () => {
    const cleanup = vi.fn();
    const renderer = vi.fn(
      ({ container, state }: { container: HTMLElement; state: PickerState }) => {
        const node = container.ownerDocument.createElement("aside");
        node.dataset.testid = "legacy-palette";
        node.textContent = state.activeColorId ?? "";
        return { node, destroy: cleanup };
      }
    );
    const wrapper = mount(Colorwheel, {
      props: { defaultPalette: palette(), renderPalette: renderer }
    });
    await nextTick();

    expect(renderer).toHaveBeenCalledOnce();
    expect(wrapper.get('[data-testid="legacy-palette"]').text()).toBe("red");
    exposed(wrapper).controller.commands.setActive("green");
    await nextTick();
    expect(renderer).toHaveBeenCalledOnce();
    expect(cleanup).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="legacy-palette"]').text()).toBe("red");

    wrapper.unmount();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("updates a stateful legacy palette handle without remounting it", async () => {
    const cleanup = vi.fn();
    const update = vi.fn((context: { state: PickerState }) => {
      const node = document.querySelector<HTMLElement>('[data-testid="stateful-legacy"]');
      if (node !== null) node.textContent = context.state.activeColorId ?? "";
    });
    const renderer = vi.fn(
      ({ container, state }: { container: HTMLElement; state: PickerState }) => {
        const node = container.ownerDocument.createElement("aside");
        node.dataset.testid = "stateful-legacy";
        node.textContent = state.activeColorId ?? "";
        return { node, update, destroy: cleanup };
      }
    );
    const wrapper = mount(Colorwheel, {
      props: { defaultPalette: palette(), renderPalette: renderer },
      attachTo: document.body
    });
    await nextTick();

    exposed(wrapper).controller.commands.setActive("green");
    await nextTick();
    expect(renderer).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(wrapper.get('[data-testid="stateful-legacy"]').text()).toBe("green");
    expect(cleanup).not.toHaveBeenCalled();

    wrapper.unmount();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("finishes owned teardown even when a legacy renderer destroy hook throws", async () => {
    const wrapper = mount(Colorwheel, {
      props: {
        defaultPalette: palette(),
        renderPalette: ({ container }) => ({
          node: container.ownerDocument.createElement("aside"),
          destroy() {
            throw new Error("legacy cleanup failed");
          }
        })
      }
    });
    await nextTick();
    const controller = exposed(wrapper).controller;

    expect(() => wrapper.unmount()).toThrow("legacy cleanup failed");
    expect(() => controller.select((state) => state)).toThrow(DestroyedPickerControllerError);
  });

  it("handles adopted Vue nodes and legacy renderer nodes across iframe realms", async () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const frameDocument = frame.contentDocument;
    const frameWindow = frame.contentWindow;
    if (frameDocument === null || frameWindow === null) throw new Error("Missing iframe realm");

    const foreignLegacyNode = document.createElement("aside");
    foreignLegacyNode.dataset.testid = "foreign-legacy";
    const wrapper = mount(Colorwheel, {
      props: { defaultPalette: palette(), renderPalette: () => foreignLegacyNode },
      attachTo: frameDocument.body
    });
    await nextTick();
    expect(frameDocument.querySelector('[data-testid="foreign-legacy"]')).toBe(foreignLegacyNode);

    await wrapper.setProps({ renderPalette: undefined });
    const wheel = wrapper.get<HTMLElement>('[data-part="wheel"]');
    const bluePointer = wrapper.get<HTMLElement>('[data-part="pointer"][data-color-id="blue"]');
    wheel.element.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
    const down = frameDocument.createEvent("Event");
    down.initEvent("pointerdown", true, true);
    Object.defineProperties(down, {
      pointerId: { value: 7 },
      pointerType: { value: "touch" },
      isPrimary: { value: true },
      clientX: { value: 100 },
      clientY: { value: 50 }
    });
    bluePointer.element.dispatchEvent(down);
    expect(exposed(wrapper).state.activeColorId).toBe("blue");

    const cancel = frameDocument.createEvent("Event");
    cancel.initEvent("pointercancel", true, false);
    Object.defineProperty(cancel, "pointerId", { value: 7 });
    frameDocument.dispatchEvent(cancel);
    wrapper.unmount();
    frame.remove();
  });

  it("marks locked wheel controls as disabled for pointer and keyboard users", () => {
    const lockedPalette = palette([
      { ...entry("red", red, "Red"), locked: true },
      entry("green", green, "Green")
    ]);
    const wrapper = mount(Colorwheel, { props: { defaultPalette: lockedPalette } });

    const pointer = wrapper.get('[data-part="pointer"][data-color-id="red"]');
    const colorInput = wrapper.get('[data-part="color-input"][data-color-id="red"]');
    const ring = wrapper.get('[data-part="channel-ring"]');
    expect(pointer.attributes()).toMatchObject({ disabled: "", "aria-disabled": "true" });
    expect(colorInput.attributes()).toHaveProperty("disabled");
    expect(ring.attributes()).toMatchObject({ tabindex: "-1", "aria-disabled": "true" });

    wrapper.unmount();
  });

  it("retains color-input focus and stable error guidance across commit and cancel", async () => {
    const wrapper = mount(Colorwheel, {
      props: { defaultPalette: palette() },
      attachTo: document.body
    });
    let input = wrapper.get<HTMLInputElement>('[data-part="color-input"][data-color-id="red"]');
    const inputElement = input.element;
    inputElement.focus();
    inputElement.value = "#00ffff";
    await input.trigger("input");
    await input.trigger("keydown", { key: "Enter" });

    input = wrapper.get<HTMLInputElement>('[data-part="color-input"][data-color-id="red"]');
    expect(input.element).toBe(inputElement);
    expect(document.activeElement).toBe(inputElement);
    expect(input.element.value).toBe("#00ffff");
    expect(wrapper.emitted("palette-change")).toHaveLength(1);

    input.element.blur();
    await nextTick();
    expect(wrapper.emitted("palette-change")).toHaveLength(1);
    input.element.focus();
    input.element.value = "not-a-color";
    await input.trigger("input");
    await input.trigger("keydown", { key: "Enter" });

    input = wrapper.get<HTMLInputElement>('[data-part="color-input"][data-color-id="red"]');
    const error = wrapper.get('[data-part="field-error"]');
    expect(document.activeElement).toBe(inputElement);
    expect(input.attributes("aria-invalid")).toBe("true");
    expect(input.attributes("aria-describedby")).toBe(error.attributes("id"));
    expect(error.attributes("id")).toMatch(/^colorwheel-vue-\d+-color-error-red$/);
    expect(error.attributes("role")).toBe("alert");

    await input.trigger("keydown", { key: "Escape" });
    expect(document.activeElement).toBe(inputElement);
    expect(input.element.value).toBe("#00ffff");
    expect(input.attributes("aria-invalid")).toBeUndefined();
    expect(input.attributes("aria-describedby")).toBeUndefined();
    expect(wrapper.find('[data-part="field-error"]').exists()).toBe(false);
    expect(wrapper.emitted("palette-change")).toHaveLength(1);
    wrapper.unmount();
  });

  it("cleans up owned resources while preserving an injected controller", () => {
    const ownedWrapper = mount(Colorwheel, { props: { defaultPalette: palette() } });
    const ownedController = exposed(ownedWrapper).controller;
    ownedWrapper.unmount();
    expect(() => ownedController.select((state) => state)).toThrow(DestroyedPickerControllerError);

    const injected = createPickerController(createPickerState({ palette: palette() }));
    const injectedWrapper = mount(Colorwheel, { props: { controller: injected } });
    injectedWrapper.unmount();
    expect(injected.getPalette()).toBeDefined();
    injected.destroy();
  });

  it("renders safely on the server without accessing the DOM adapter", async () => {
    const app = createSSRApp({
      render: () => h(Colorwheel, { defaultPalette: palette(), ariaLabel: "SSR picker" })
    });

    const html = await renderToString(app);

    expect(html).toContain("data-colorwheel-vue");
    expect(html).toContain('data-part="wheel"');
    expect(html).toContain('data-part="palette"');
    expect(html).not.toContain('data-part="vue-host"');
  });

  it("does not subscribe an injected controller during server rendering", async () => {
    const controller = createPickerController(createPickerState({ palette: palette() }));
    const subscribe = vi.spyOn(controller, "subscribe");
    const onChange = vi.fn();
    const render = () =>
      renderToString(
        createSSRApp({
          render: () => h(Colorwheel, { controller, onChange })
        })
      );

    const first = await render();
    const second = await render();
    expect(first).toBe(second);
    expect(subscribe).not.toHaveBeenCalled();
    controller.commands.setActive("green");
    expect(onChange).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("rejects ambiguous ownership sources before mounting", () => {
    expect(() =>
      mount(Colorwheel, {
        props: {
          modelValue: createPickerState({ palette: palette() }),
          palette: palette()
        }
      })
    ).toThrow(/exactly one/);
  });

  it("keeps ownership validation live when injected-controller props change", async () => {
    const firstController = createPickerController(createPickerState({ palette: palette() }));
    const wheelWrapper = mount(Colorwheel, { props: { controller: firstController } });
    await expect(wheelWrapper.setProps({ wheel: { wheelModel: "oklch" } })).rejects.toThrow(
      "wheel is configured by full-state and injected-controller sources"
    );
    wheelWrapper.unmount();
    firstController.destroy();

    const secondController = createPickerController(createPickerState({ palette: palette() }));
    const optionsWrapper = mount(Colorwheel, { props: { controller: secondController } });
    await expect(optionsWrapper.setProps({ controllerOptions: {} })).rejects.toThrow(
      "controllerOptions apply only to adapter-owned controllers"
    );
    optionsWrapper.unmount();
    secondController.destroy();
  });
});

describe("useColorwheel", () => {
  it("does not subscribe an injected controller during component SSR", async () => {
    const controller = createPickerController(createPickerState({ palette: palette() }));
    const subscribe = vi.spyOn(controller, "subscribe");
    const onChange = vi.fn();
    const app = createSSRApp(
      defineComponent({
        setup() {
          useColorwheel({ controller, onChange });
          return () => h("div", "SSR headless picker");
        }
      })
    );

    await renderToString(app);
    expect(subscribe).not.toHaveBeenCalled();
    controller.commands.setActive("green");
    expect(onChange).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("does not subscribe from a nested effect scope during component SSR", async () => {
    const controller = createPickerController(createPickerState({ palette: palette() }));
    const subscribe = vi.spyOn(controller, "subscribe");
    const onChange = vi.fn();
    const app = createSSRApp(
      defineComponent({
        setup() {
          effectScope().run(() => useColorwheel({ controller, onChange }));
          return () => h("div", "Nested SSR headless picker");
        }
      })
    );

    await renderToString(app);
    expect(subscribe).not.toHaveBeenCalled();
    controller.commands.setActive("green");
    expect(onChange).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("refreshes a deferred injected-controller snapshot before client mount", () => {
    const controller = createPickerController(createPickerState({ palette: palette() }));
    const Probe = defineComponent({
      setup() {
        const picker = useColorwheel({ controller });
        controller.commands.setActive("green");
        return () => h("output", picker.state.value.activeColorId);
      }
    });

    const wrapper = mount(Probe);
    expect(wrapper.text()).toBe("green");
    wrapper.unmount();
    controller.destroy();
  });

  it("rejects controller-owned options passed through untyped callers", () => {
    const controller = createPickerController(createPickerState({ palette: palette() }));
    expect(() =>
      useColorwheel({ controller, controllerOptions: {} } as unknown as Parameters<
        typeof useColorwheel
      >[0])
    ).toThrow("controllerOptions apply only to adapter-owned controllers");
    expect(() =>
      useColorwheel({ controller, wheel: { wheelModel: "oklch" } } as unknown as Parameters<
        typeof useColorwheel
      >[0])
    ).toThrow("wheel is configured by full-state and injected-controller sources");
    controller.destroy();
  });

  it("provides controlled headless reactivity, metadata callbacks, and scope cleanup", async () => {
    const source = ref(createPickerState({ palette: palette() }));
    const onChange = vi.fn();
    const scope = effectScope();
    const picker = scope.run(() => useColorwheel({ value: source, onChange }));
    if (picker === undefined) throw new Error("Missing scoped picker");

    picker.controller.commands.setActive("green");
    expect(picker.state.value.activeColorId).toBe("green");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ activeColorId: "green" }),
      expect.objectContaining({ action: "selection", origin: "user" })
    );
    await Promise.resolve();
    expect(picker.state.value).toBe(toRaw(source.value));

    const next = { ...source.value, activeColorId: "blue" };
    source.value = next;
    expect(picker.state.value).toBe(next);
    expect(onChange).toHaveBeenCalledOnce();

    scope.stop();
    expect(() => picker.controller.select((state) => state)).toThrow(
      DestroyedPickerControllerError
    );
  });

  it("retains application metadata types through the factory and composable", () => {
    interface BrandMetadata {
      readonly source: string;
    }
    const brandPalette: Palette<BrandMetadata> = {
      colors: palette().colors.map(({ id, color, name }) => ({ id, color, name })),
      kind: "custom",
      provenance: { origin: "manual" },
      metadata: { source: "brand" }
    };
    const SpecializedColorwheel = createColorwheelComponent<BrandMetadata>();
    const scope = effectScope();
    const picker = scope.run(() => useColorwheel<BrandMetadata>({ defaultPalette: brandPalette }));
    if (picker === undefined) throw new Error("Missing specialized picker");

    expect(SpecializedColorwheel).toBeDefined();
    expectTypeOf(picker.palette.value.metadata).toEqualTypeOf<BrandMetadata | undefined>();
    expect(picker.palette.value.metadata?.source).toBe("brand");
    scope.stop();
  });
});
