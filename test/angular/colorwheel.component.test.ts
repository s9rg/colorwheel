import "@angular/compiler";
import { Component, PLATFORM_ID } from "@angular/core";
import { TestBed, getTestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import axe from "axe-core";
import { createHarmonyPalette } from "../../src/core";
import type { Palette } from "../../src/core";
import { createPickerController, createPickerState } from "../../src/editor";
import type { ChangeMeta } from "../../src/editor";
import {
  ColorwheelComponent,
  ColorwheelPaletteTemplateDirective,
  ColorwheelWheelTemplateDirective
} from "../../src/angular";
import type { ColorwheelPaletteRenderer } from "../../src/angular";

function palette(name = "Adapter palette"): Palette {
  return {
    name,
    kind: "manual",
    provenance: { origin: "manual" },
    colors: [
      {
        id: "violet",
        name: "Violet",
        color: { space: "hsv", h: 268, s: 0.72, v: 0.94 }
      },
      {
        id: "gold",
        name: "Gold",
        color: { space: "hsv", h: 44, s: 0.84, v: 0.96 }
      }
    ]
  };
}

function pointerEvent(
  type: string,
  values: {
    readonly pointerId: number;
    readonly clientX: number;
    readonly clientY: number;
    readonly pointerType?: string;
    readonly button?: number;
  }
): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: values.pointerId },
    clientX: { value: values.clientX },
    clientY: { value: values.clientY },
    pointerType: { value: values.pointerType ?? "touch" },
    button: { value: values.button ?? 0 },
    isPrimary: { value: true }
  });
  return event as PointerEvent;
}

describe("ColorwheelComponent", () => {
  beforeAll(() => {
    getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  afterAll(() => {
    getTestBed().resetTestEnvironment();
  });

  it("renders an Angular-native editor from an owned default palette and destroys ownership", () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const fixture = TestBed.createComponent(ColorwheelComponent);
    fixture.componentRef.setInput("defaultPalette", palette());
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const root = host.querySelector<HTMLElement>("[data-colorwheel]");
    const controller = fixture.componentInstance.editorController;
    expect(root).not.toBeNull();
    expect(root?.querySelectorAll("[data-part='pointer']")).toHaveLength(2);
    expect(controller?.getPalette().name).toBe("Adapter palette");
    expect(host).toHaveAttribute("data-colorwheel-angular");

    fixture.destroy();
    expect(() => controller?.commands.setActive("violet")).toThrow(/destroyed/i);
  });

  it("infers linked interaction for a live wheel recipe unless explicitly overridden", () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const generated = createHarmonyPalette({
      seed: "#7059cc",
      harmony: { type: "complementary" }
    });
    const linked = TestBed.createComponent(ColorwheelComponent);
    linked.componentRef.setInput("defaultPalette", generated);
    linked.detectChanges();
    expect(linked.componentInstance.editorController?.getState().wheel.interaction).toBe("linked");
    linked.destroy();

    const free = TestBed.createComponent(ColorwheelComponent);
    free.componentRef.setInput("defaultPalette", generated);
    free.componentRef.setInput("wheel", { interaction: "free" });
    free.detectChanges();
    expect(free.componentInstance.editorController?.getState().wheel.interaction).toBe("free");
    free.destroy();
  });

  it("emits plain two-way values plus detailed ChangeMeta and reconciles rejected palette changes", async () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const fixture = TestBed.createComponent(ColorwheelComponent);
    const original = palette();
    fixture.componentRef.setInput("palette", original);
    fixture.detectChanges();

    const palettes: Palette<object>[] = [];
    const actions: string[] = [];
    fixture.componentInstance.paletteChange.subscribe((next) => palettes.push(next));
    fixture.componentInstance.colorwheelChange.subscribe((event) =>
      actions.push(event.meta.action)
    );

    fixture.componentInstance.editorController?.commands.setName("violet", "Purple", {
      action: "text-input",
      origin: "user",
      phase: "commit"
    });

    expect(palettes.at(-1)?.colors[0]?.name).toBe("Purple");
    expect(actions).toContain("text-input");

    await Promise.resolve();
    expect(fixture.componentInstance.editorController?.getPalette()).toBe(original);
  });

  it("accepts external controlled state without echoing it through outputs", () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const fixture = TestBed.createComponent(ColorwheelComponent);
    const initial = createPickerState({ palette: palette("Initial") });
    const next = createPickerState({ palette: palette("External") });
    fixture.componentRef.setInput("value", initial);
    fixture.detectChanges();

    const changes: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe((value) => changes.push(value));
    fixture.componentRef.setInput("value", next);
    fixture.detectChanges();

    expect(fixture.componentInstance.editorController?.getState()).toBe(next);
    expect(changes).toEqual([]);
  });

  it("keeps caller-owned controllers alive and rebinds identity without replacing the native root", () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const first = createPickerController(createPickerState({ palette: palette("First") }));
    const second = createPickerController(createPickerState({ palette: palette("Second") }));
    const fixture = TestBed.createComponent(ColorwheelComponent);
    fixture.componentRef.setInput("controller", first);
    fixture.detectChanges();
    const root = fixture.componentInstance.instance?.root;
    expect(fixture.componentInstance.editorController).toBe(first);

    fixture.componentRef.setInput("controller", second);
    fixture.detectChanges();
    expect(fixture.componentInstance.editorController).toBe(second);
    expect(fixture.componentInstance.instance?.root).toBe(root);
    expect(first.getPalette().name).toBe("First");

    fixture.destroy();
    expect(second.getPalette().name).toBe("Second");
    first.destroy();
    second.destroy();
  });

  it("applies presentation and wheel input changes without remounting", () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const fixture = TestBed.createComponent(ColorwheelComponent);
    fixture.componentRef.setInput("defaultPalette", palette());
    fixture.componentRef.setInput("wheel", { interaction: "free" });
    fixture.detectChanges();
    const instance = fixture.componentInstance.instance;

    fixture.componentRef.setInput("ariaLabel", "Brand palette editor");
    fixture.componentRef.setInput("className", "brand-editor");
    fixture.componentRef.setInput("unstyled", true);
    fixture.componentRef.setInput("wheel", { wheelModel: "oklch" });
    fixture.detectChanges();

    expect(fixture.componentInstance.instance).toBe(instance);
    expect(instance?.root).toHaveAttribute("aria-label", "Brand palette editor");
    expect(instance?.root).toHaveClass("brand-editor");
    expect(instance?.root).toHaveAttribute("data-unstyled");
    expect(instance?.controller.getState().wheel.wheelModel).toBe("oklch");
  });

  it("configures native blocks without replacing their controller or root", () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const fixture = TestBed.createComponent(ColorwheelComponent);
    fixture.componentRef.setInput("defaultPalette", palette());
    fixture.componentRef.setInput("blockProps", {
      wheel: {
        title: "Brand wheel",
        description: "Edit a brand color",
        showChannels: false,
        showChannelRing: false
      },
      palette: {
        title: "Brand colors",
        description: "Choose a brand color",
        showName: false,
        showActions: false,
        allowAdd: false
      }
    });
    fixture.detectChanges();

    const root = fixture.componentInstance.instance?.root;
    expect(root?.querySelector("[data-part='wheel-frame']")).toHaveAttribute("data-ring", "false");
    expect(root?.querySelector("[data-part='block-title']")?.textContent).toContain("Brand wheel");
    const wheelBlock = root?.querySelector<HTMLElement>("[data-part='wheel-block']");
    const wheelTitle = wheelBlock?.querySelector<HTMLElement>("[data-part='block-title']");
    const wheelDescription = wheelBlock?.querySelector<HTMLElement>(
      "[data-part='block-description']"
    );
    const wheel = wheelBlock?.querySelector<HTMLElement>("[data-part='wheel']");
    const wheelInstructions = wheelBlock?.querySelector<HTMLElement>(
      "[data-part='wheel-instructions']"
    );
    const paletteBlock = root?.querySelector<HTMLElement>("[data-part='palette']");
    const paletteTitle = paletteBlock?.querySelector<HTMLElement>("[data-part='block-title']");
    const paletteDescription = paletteBlock?.querySelector<HTMLElement>(
      "[data-part='block-description']"
    );

    expect(wheelBlock).toHaveAttribute("aria-label", "Brand wheel");
    expect(wheelBlock).toHaveAttribute("aria-description", "Edit a brand color");
    expect(wheelBlock).not.toHaveAttribute("aria-labelledby");
    expect(wheelBlock).not.toHaveAttribute("aria-describedby");
    expect(wheelTitle).not.toHaveAttribute("id");
    expect(wheelDescription).toHaveTextContent("Edit a brand color");
    expect(wheelDescription).not.toHaveAttribute("id");
    expect(wheelInstructions).not.toHaveAttribute("id");
    expect(wheel).toHaveAttribute(
      "aria-description",
      `Edit a brand color ${wheelInstructions?.textContent?.trim()}`
    );
    expect(wheel).not.toHaveAttribute("aria-describedby");
    expect(paletteBlock).toHaveAttribute("aria-label", "Brand colors");
    expect(paletteBlock).toHaveAttribute("aria-description", "Choose a brand color");
    expect(paletteBlock).not.toHaveAttribute("aria-labelledby");
    expect(paletteBlock).not.toHaveAttribute("aria-describedby");
    expect(paletteTitle).not.toHaveAttribute("id");
    expect(paletteDescription).toHaveTextContent("Choose a brand color");
    expect(paletteDescription).not.toHaveAttribute("id");
    expect(root?.querySelector("[data-part='channels']")).toBeNull();
    expect(root?.querySelector("[data-part='name-input']")).toBeNull();
    expect(root?.querySelector("[data-part='palette-item-actions']")).toBeNull();
    expect(root?.querySelector("[data-part='add-color']")).toBeNull();
  });

  it("uses the shared editor interaction lifecycle for native pointer dragging", () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const fixture = TestBed.createComponent(ColorwheelComponent);
    fixture.componentRef.setInput("defaultPalette", palette());
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const wheel = host.querySelector<HTMLElement>("[data-part='wheel']");
    if (wheel === null) throw new Error("Missing native wheel");
    Object.defineProperty(wheel, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: 200,
        height: 200,
        right: 200,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON: () => ({})
      })
    });
    const phases: string[] = [];
    const transactionIds: string[] = [];
    fixture.componentInstance.colorwheelChange.subscribe(({ meta }) => {
      if (meta.action !== "pointer") return;
      phases.push(meta.phase);
      if (meta.transactionId !== undefined) transactionIds.push(meta.transactionId);
    });
    const before = fixture.componentInstance.editorController?.getPalette().colors[0]?.color;

    wheel.dispatchEvent(pointerEvent("pointerdown", { pointerId: 7, clientX: 200, clientY: 100 }));
    document.dispatchEvent(
      pointerEvent("pointermove", { pointerId: 7, clientX: 100, clientY: 200 })
    );
    document.dispatchEvent(pointerEvent("pointerup", { pointerId: 7, clientX: 0, clientY: 100 }));
    fixture.detectChanges();

    expect(fixture.componentInstance.editorController?.getPalette().colors[0]?.color).not.toEqual(
      before
    );
    expect(phases).toEqual(["start", "update", "update", "update", "commit"]);
    expect(new Set(transactionIds).size).toBe(1);
  });

  it("commits inactive-handle selection outside paired pointer and keyboard edits", () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const fixture = TestBed.createComponent(ColorwheelComponent);
    fixture.componentRef.setInput("defaultPalette", palette());
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const wheel = host.querySelector<HTMLElement>("[data-part='wheel']");
    const goldPointer = host.querySelector<HTMLButtonElement>(
      "[data-part='pointer'][data-color-id='gold']"
    );
    if (wheel === null || goldPointer === null) throw new Error("Missing native wheel controls");
    Object.defineProperty(wheel, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: 200,
        height: 200,
        right: 200,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON: () => ({})
      })
    });
    const changes: ChangeMeta[] = [];
    fixture.componentInstance.colorwheelChange.subscribe(({ meta }) => changes.push(meta));

    goldPointer.dispatchEvent(
      pointerEvent("pointerdown", { pointerId: 17, clientX: 200, clientY: 100 })
    );
    document.dispatchEvent(
      pointerEvent("pointermove", { pointerId: 17, clientX: 100, clientY: 200 })
    );
    document.dispatchEvent(pointerEvent("pointerup", { pointerId: 17, clientX: 0, clientY: 100 }));

    const selection = changes.filter((meta) => meta.action === "selection");
    const pointer = changes.filter((meta) => meta.action === "pointer");
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
    expect(pointer[0]?.changedColorIds).toEqual([]);
    expect(pointer.slice(1).every((meta) => meta.changedColorIds.includes("gold"))).toBe(true);
    expect(pointer[0]?.transactionId).toBeTruthy();
    expect(new Set(pointer.map((meta) => meta.transactionId))).toEqual(
      new Set([pointer[0]?.transactionId])
    );

    fixture.componentInstance.editorController?.commands.setActive("violet");
    changes.length = 0;
    goldPointer.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(
      changes.map(({ action, phase, transactionId }) => ({
        action,
        phase,
        transactionId
      }))
    ).toEqual([
      { action: "selection", phase: "commit", transactionId: undefined },
      { action: "keyboard", phase: "commit", transactionId: undefined }
    ]);

    fixture.destroy();
  });

  it("keeps native accessibility bindings and keyboard editing in sync", () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const fixture = TestBed.createComponent(ColorwheelComponent);
    fixture.componentRef.setInput("defaultPalette", palette());
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const pointer = host.querySelector<HTMLButtonElement>(
      "[data-part='pointer'][data-color-id='violet']"
    );
    const swatch = host.querySelector<HTMLButtonElement>(
      "[data-part='swatch'][data-color-id='violet']"
    );
    expect(pointer).toHaveAttribute("aria-label", expect.stringContaining("Violet"));
    expect(pointer).toHaveAttribute("aria-pressed", "true");
    expect(host.querySelector("[data-part='palette-list']")?.tagName).toBe("OL");
    expect(host.querySelector("[data-part='palette-list']")).not.toHaveAttribute("role");
    expect(swatch).not.toHaveAttribute("role");
    expect(swatch).toHaveAttribute("aria-pressed", "true");
    expect(swatch?.tabIndex).toBe(0);
    expect(
      host.querySelector<HTMLButtonElement>("[data-part='swatch'][data-color-id='gold']")?.tabIndex
    ).toBe(0);

    const before = fixture.componentInstance.editorController?.getPalette().colors[0]?.color;
    pointer?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.editorController?.getPalette().colors[0]?.color).not.toEqual(
      before
    );

    fixture.componentInstance.focus({ type: "swatch", colorId: "gold" });
    expect(document.activeElement).toBe(
      host.querySelector("[data-part='swatch'][data-color-id='gold']")
    );

    expect(
      host.querySelector<HTMLElement>("[data-part='pointer'][data-color-id='gold']")?.tabIndex
    ).toBe(0);
  });

  it("passes an axe scan with the standard rich palette semantics", async () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const fixture = TestBed.createComponent(ColorwheelComponent);
    fixture.componentRef.setInput("defaultPalette", palette());
    fixture.componentRef.setInput("blockProps", {
      wheel: { description: "Edit colors on the wheel" },
      palette: { description: "Edit palette values and order" }
    });
    fixture.detectChanges();

    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { "color-contrast": { enabled: false } }
    });

    expect(results.violations).toEqual([]);
    fixture.destroy();
  });

  it("retains and updates a low-level palette renderer without delegating the standard tree", () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const fixture = TestBed.createComponent(ColorwheelComponent);
    const mounted: string[] = [];
    const updated: string[] = [];
    let destroyed = 0;
    const renderer: ColorwheelPaletteRenderer = ({ state }) => {
      mounted.push(state.palette.name ?? "");
      const node = document.createElement("div");
      node.dataset.testid = "imperative-palette";
      node.textContent = state.palette.colors[0]?.name ?? "";
      return {
        node,
        update(context) {
          updated.push(context.state.palette.colors[0]?.name ?? "");
          node.textContent = context.state.palette.colors[0]?.name ?? "";
        },
        destroy() {
          destroyed += 1;
        }
      };
    };
    fixture.componentRef.setInput("defaultPalette", palette());
    fixture.componentRef.setInput("renderPalette", renderer);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    fixture.componentInstance.editorController?.commands.setName("violet", "Purple");
    fixture.detectChanges();
    expect(mounted).toEqual(["Adapter palette"]);
    expect(updated).toEqual(["Purple"]);
    expect(host.querySelector("[data-testid='imperative-palette']")?.textContent).toBe("Purple");
    expect(host.querySelector("[data-part='palette-list']")).toBeNull();

    fixture.destroy();
    expect(destroyed).toBe(1);
  });

  it("keeps a node-only low-level renderer mounted across state changes", () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const fixture = TestBed.createComponent(ColorwheelComponent);
    const renderer = vi.fn(({ container }: { container: HTMLElement }) =>
      container.ownerDocument.createElement("aside")
    );
    fixture.componentRef.setInput("defaultPalette", palette());
    fixture.componentRef.setInput("renderPalette", renderer);
    fixture.detectChanges();

    fixture.componentInstance.editorController?.commands.setActive("gold");
    fixture.detectChanges();
    expect(renderer).toHaveBeenCalledOnce();
    fixture.destroy();
  });

  it("restores focus to the palette when the last swatch is removed without an add button", async () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const fixture = TestBed.createComponent(ColorwheelComponent);
    const oneColor = palette();
    fixture.componentRef.setInput("defaultPalette", {
      ...oneColor,
      colors: [oneColor.colors[0]]
    });
    fixture.componentRef.setInput("blockProps", { palette: { allowAdd: false } });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLElement>("[data-part='swatch']")?.focus();
    host.querySelector<HTMLButtonElement>("[aria-label^='Remove']")?.click();
    fixture.detectChanges();
    await Promise.resolve();

    expect(document.activeElement).toBe(host.querySelector("[data-part='palette']"));
    fixture.destroy();
  });

  it("lets the legacy palette hook reuse the Angular default block", () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const fixture = TestBed.createComponent(ColorwheelComponent);
    const renderer: ColorwheelPaletteRenderer = (context) => context.renderDefault();
    fixture.componentRef.setInput("defaultPalette", palette());
    fixture.componentRef.setInput("renderPalette", renderer);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const gold = host.querySelector<HTMLButtonElement>(
      "[data-part='swatch'][data-color-id='gold']"
    );

    expect(host.querySelectorAll("[data-part='palette-item']")).toHaveLength(2);
    gold?.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.editorController?.getState().activeColorId).toBe("gold");
  });

  it("keeps invalid color drafts local and exposes a stable no-IDREF error description", () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const fixture = TestBed.createComponent(ColorwheelComponent);
    fixture.componentRef.setInput("defaultPalette", palette());
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>(
      "[data-part='color-input'][data-color-id='violet']"
    );
    if (input === null) throw new Error("Missing color input");
    const before = fixture.componentInstance.editorController?.getPalette().colors[0]?.color;

    input.value = "not-a-color";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    fixture.detectChanges();

    expect(input).toHaveAttribute("aria-invalid", "true");
    const error = host.querySelector<HTMLElement>("[data-part='field-error']");
    expect(error).toHaveAttribute("role", "alert");
    expect(error).toHaveTextContent("Enter a supported CSS color.");
    expect(error).not.toHaveAttribute("id");
    expect(input).toHaveAttribute("aria-description", "Enter a supported CSS color.");
    expect(input).not.toHaveAttribute("aria-describedby");

    fixture.componentInstance.editorController?.commands.setName("gold", "Sunlit gold");
    fixture.detectChanges();
    expect(host.querySelector<HTMLElement>("[data-part='field-error']")).toBe(error);
    expect(input).toHaveAttribute("aria-description", "Enter a supported CSS color.");
    expect(fixture.componentInstance.editorController?.getPalette().colors[0]?.color).toEqual(
      before
    );
  });

  it("preserves color-input focus after Enter commit and Escape cancel", () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const fixture = TestBed.createComponent(ColorwheelComponent);
    fixture.componentRef.setInput("defaultPalette", palette());
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>(
      "[data-part='color-input'][data-color-id='violet']"
    );
    if (input === null) throw new Error("Missing color input");

    input.focus();
    input.value = "#112233";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    );
    fixture.detectChanges();

    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("#112233");
    expect(fixture.componentInstance.editorController?.getPalette().colors[0]?.color).toMatchObject(
      {
        space: "srgb"
      }
    );

    input.value = "not-a-color";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    );
    fixture.detectChanges();
    expect(document.activeElement).toBe(input);
    expect(input).toHaveAttribute("aria-invalid", "true");

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    );
    fixture.detectChanges();
    expect(document.activeElement).toBe(input);
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(input).not.toHaveAttribute("aria-description");
    expect(host.querySelector("[data-part='field-error']")).toBeNull();
    expect(input.value).toBe("#112233");
  });

  it("abandons removed name edits without external echo or transaction reuse", () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const fixture = TestBed.createComponent(ColorwheelComponent);
    const original = palette();
    fixture.componentRef.setInput("palette", original);
    fixture.detectChanges();
    const changes: ChangeMeta[] = [];
    fixture.componentInstance.colorwheelChange.subscribe(({ meta }) => changes.push(meta));
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      "[data-part='name-input'][data-color-id='violet']"
    );
    if (input === null) throw new Error("Missing name input");

    input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    input.value = "Rouge";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const firstTransaction = changes.at(-1)?.transactionId;
    const changeCount = changes.length;

    fixture.componentRef.setInput("palette", { ...original, colors: original.colors.slice(1) });
    fixture.detectChanges();
    expect(changes).toHaveLength(changeCount);

    fixture.componentRef.setInput("palette", palette("Replacement"));
    fixture.detectChanges();
    const replacement = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      "[data-part='name-input'][data-color-id='violet']"
    );
    if (replacement === null) throw new Error("Missing replacement name input");
    replacement.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    replacement.value = "Purple";
    replacement.dispatchEvent(new Event("input", { bubbles: true }));

    expect(changes.at(-1)?.transactionId).toBeDefined();
    expect(changes.at(-1)?.transactionId).not.toBe(firstTransaction);
    fixture.destroy();
  });

  it("cleans up safely if a caller destroys an injected controller first", () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const controller = createPickerController(createPickerState({ palette: palette() }));
    const fixture = TestBed.createComponent(ColorwheelComponent);
    fixture.componentRef.setInput("controller", controller);
    fixture.detectChanges();
    const name = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      "[data-part='name-input'][data-color-id='violet']"
    );
    name?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));

    controller.destroy();
    expect(() => fixture.destroy()).not.toThrow();
  });

  it("rejects ambiguous sources and controlled-mode switches", () => {
    TestBed.configureTestingModule({ imports: [ColorwheelComponent] });
    const ambiguous = TestBed.createComponent(ColorwheelComponent);
    ambiguous.componentRef.setInput("palette", palette());
    ambiguous.componentRef.setInput("defaultPalette", palette("Other"));
    expect(() => ambiguous.detectChanges()).toThrow(/exactly one/i);
    ambiguous.destroy();

    const fixture = TestBed.createComponent(ColorwheelComponent);
    fixture.componentRef.setInput("palette", palette());
    fixture.detectChanges();
    fixture.componentRef.setInput("palette", undefined);
    fixture.componentRef.setInput("value", createPickerState({ palette: palette() }));
    expect(() => fixture.detectChanges()).toThrow(/cannot switch/i);
  });

  it("renders deterministic native markup on the server without exposing a browser instance", () => {
    TestBed.configureTestingModule({
      imports: [ColorwheelComponent],
      providers: [{ provide: PLATFORM_ID, useValue: "server" }]
    });
    const fixture = TestBed.createComponent(ColorwheelComponent);
    fixture.componentRef.setInput("defaultPalette", palette());
    fixture.detectChanges();

    expect(fixture.componentInstance.instance).toBeUndefined();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector("[data-colorwheel]")).not.toBeNull();
    expect(host.querySelectorAll("[data-part='pointer']")).toHaveLength(2);
    expect(host.querySelector("[data-part='palette-list']")?.textContent).toContain("Violet");
  });

  it("renders byte-for-byte stable no-IDREF markup across repeated server renders", () => {
    TestBed.configureTestingModule({
      imports: [ColorwheelComponent],
      providers: [{ provide: PLATFORM_ID, useValue: "server" }]
    });

    const render = (): string => {
      const fixture = TestBed.createComponent(ColorwheelComponent);
      fixture.componentRef.setInput("defaultPalette", palette());
      fixture.componentRef.setInput("blockProps", {
        wheel: { description: "Edit the active color" },
        palette: { description: "Review the generated palette" }
      });
      fixture.detectChanges();
      const markup = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
        "[data-colorwheel]"
      )?.outerHTML;
      fixture.destroy();
      if (markup === undefined) throw new Error("Missing server-rendered colorwheel");
      return markup;
    };

    const first = render();
    const second = render();
    expect(second).toBe(first);

    const container = document.createElement("div");
    container.innerHTML = first;
    expect(container.querySelectorAll("[id]")).toHaveLength(0);
    expect(container.querySelectorAll("[aria-labelledby], [aria-describedby]")).toHaveLength(0);
    expect(container.querySelector("[data-part='wheel-block']")).toHaveAttribute(
      "aria-label",
      "Color wheel"
    );
    expect(container.querySelector("[data-part='wheel-block']")).toHaveAttribute(
      "aria-description",
      "Edit the active color"
    );
    expect(container.querySelector("[data-part='wheel']")).toHaveAttribute(
      "aria-description",
      expect.stringContaining("Edit the active color Drag or tap the wheel.")
    );
    expect(container.querySelector("[data-part='palette']")).toHaveAttribute(
      "aria-description",
      "Review the generated palette"
    );
  });

  it("keeps the legacy palette host topology stable during server rendering", () => {
    TestBed.configureTestingModule({
      imports: [ColorwheelComponent],
      providers: [{ provide: PLATFORM_ID, useValue: "server" }]
    });
    const fixture = TestBed.createComponent(ColorwheelComponent);
    const renderer = vi.fn(() => document.createElement("aside"));
    fixture.componentRef.setInput("defaultPalette", palette());
    fixture.componentRef.setInput("renderPalette", renderer);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector("[data-part='palette-renderer']")).not.toBeNull();
    expect(host.querySelector("[data-part='palette']")).toBeNull();
    expect(renderer).not.toHaveBeenCalled();
    fixture.destroy();
  });
});

@Component({
  standalone: true,
  imports: [ColorwheelComponent, ColorwheelPaletteTemplateDirective],
  template: `
    <s9rg-colorwheel [defaultPalette]="colors">
      <ng-template s9rgColorwheelPalette let-palette let-controller="controller">
        <button
          type="button"
          data-testid="custom-palette"
          (click)="controller.commands.setActive(palette.colors[1].id)"
        >
          {{ palette.name }}
        </button>
      </ng-template>
    </s9rg-colorwheel>
  `
})
class CustomPaletteFixture {
  readonly colors = palette("Projected palette");
}

@Component({
  standalone: true,
  imports: [ColorwheelComponent],
  template: `<s9rg-colorwheel [(palette)]="colors" />`
})
class ControlledPaletteFixture {
  colors = palette("Controlled palette");
}

@Component({
  standalone: true,
  imports: [
    ColorwheelComponent,
    ColorwheelPaletteTemplateDirective,
    ColorwheelWheelTemplateDirective
  ],
  template: `
    <s9rg-colorwheel [defaultPalette]="colors">
      <ng-template s9rgColorwheelWheel let-state let-controller="controller">
        <button
          type="button"
          data-testid="custom-wheel"
          (click)="controller.commands.setActive(state.palette.colors[1].id)"
        >
          {{ state.activeColorId }}
        </button>
      </ng-template>
      <ng-template s9rgColorwheelPalette let-palette>
        <span data-testid="custom-palette-count">{{ palette.colors.length }}</span>
      </ng-template>
    </s9rg-colorwheel>
  `
})
class CustomBlocksFixture {
  readonly colors = palette("Custom blocks");
}

describe("Angular template integration", () => {
  beforeAll(() => {
    getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  afterAll(() => {
    getTestBed().resetTestEnvironment();
  });

  it("renders and updates an Angular-owned palette block inside the shared adapter", () => {
    TestBed.configureTestingModule({ imports: [CustomPaletteFixture] });
    const fixture = TestBed.createComponent(CustomPaletteFixture);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const custom = host.querySelector<HTMLButtonElement>("[data-testid='custom-palette']");
    expect(custom?.textContent).toContain("Projected palette");
    expect(host.querySelector("[data-part='palette-list']")).toBeNull();

    custom?.click();
    fixture.detectChanges();
    const colorwheel = fixture.debugElement.children[0]?.componentInstance as
      ColorwheelComponent | undefined;
    expect(colorwheel?.editorController?.getState().activeColorId).toBe("gold");
    expect(host.querySelector("[data-testid='custom-palette']")).toBe(custom);
  });

  it("retains Angular-owned wheel and palette template views across live updates", () => {
    TestBed.configureTestingModule({ imports: [CustomBlocksFixture] });
    const fixture = TestBed.createComponent(CustomBlocksFixture);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const wheel = host.querySelector<HTMLButtonElement>("[data-testid='custom-wheel']");
    const paletteCount = host.querySelector("[data-testid='custom-palette-count']");
    expect(wheel?.textContent).toContain("violet");
    expect(paletteCount?.textContent).toContain("2");
    expect(host.querySelector("[data-part='wheel-block']")).toBeNull();
    expect(host.querySelector("[data-part='palette-list']")).toBeNull();

    wheel?.click();
    fixture.detectChanges();
    expect(wheel?.textContent).toContain("gold");
    expect(host.querySelector("[data-testid='custom-wheel']")).toBe(wheel);
    expect(host.querySelector("[data-testid='custom-palette-count']")).toBe(paletteCount);
  });

  it("supports accepted two-way palette updates before controlled reconciliation", async () => {
    TestBed.configureTestingModule({ imports: [ControlledPaletteFixture] });
    const fixture = TestBed.createComponent(ControlledPaletteFixture);
    fixture.detectChanges();
    const colorwheel = fixture.debugElement.children[0]?.componentInstance as
      ColorwheelComponent | undefined;

    colorwheel?.editorController?.commands.setName("violet", "Purple", {
      action: "text-input",
      origin: "user",
      phase: "commit"
    });
    await fixture.whenStable();

    expect(fixture.componentInstance.colors.colors[0]?.name).toBe("Purple");
    expect(colorwheel?.editorController?.getPalette()).toBe(fixture.componentInstance.colors);
  });
});
