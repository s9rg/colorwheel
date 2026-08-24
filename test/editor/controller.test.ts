import { describe, expect, it, vi } from "vitest";
import {
  BUILT_IN_HARMONY_IDS,
  BUILT_IN_STRATEGY_VERSION,
  createHarmonyPalette,
  formatColor,
  mapToGamut,
  parsePaletteDocument,
  serializePaletteDocument
} from "../../src/core";
import type { ChangeMeta, LinkedColorUpdate, PickerState } from "../../src/editor";
import {
  DestroyedPickerControllerError,
  EditorStateError,
  LinkedInteractionError,
  LockedColorConstraintError,
  MissingRegeneratorError,
  createPickerController,
  createPickerState,
  resolveWheelEditingColor,
  selectActiveColorId,
  selectPalette,
  setWheelChannelValue
} from "../../src/editor";
import { blue, green, makeEntry, makeHarmonyPalette, makePalette, red } from "./fixtures";

function makeState(): PickerState {
  return createPickerState({ palette: makePalette() });
}

function hue(state: PickerState, colorId: string): number | undefined {
  const color = state.palette.colors.find((entry) => entry.id === colorId)?.color;
  return color?.space === "hsv" ? color.h : undefined;
}

describe("createPickerController", () => {
  it("synchronizes external palettes without echoing controlled callbacks", () => {
    const onChange = vi.fn();
    const onPaletteChange = vi.fn();
    const controller = createPickerController(makeState(), { onChange, onPaletteChange });
    const subscription = vi.fn();
    controller.subscribe(selectPalette, subscription);

    const next = makePalette([makeEntry("cyan", { space: "hsv", h: 180, s: 1, v: 1 })]);
    controller.setPalette(next);

    expect(controller.getPalette()).toBe(next);
    expect(controller.getState().activeColorId).toBe("cyan");
    expect(subscription).toHaveBeenCalledOnce();
    expect(subscription.mock.calls[0]?.[1]).toMatchObject({
      action: "programmatic",
      origin: "external",
      phase: "commit",
      changedColorIds: ["red", "green", "blue", "cyan"]
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(onPaletteChange).not.toHaveBeenCalled();

    const another = makePalette([makeEntry("magenta", { space: "hsv", h: 300, s: 1, v: 1 })]);
    controller.setPalette(another, { action: "programmatic" });
    expect(onChange).not.toHaveBeenCalled();
    expect(onPaletteChange).not.toHaveBeenCalled();
  });

  it("notifies narrow selectors only when their selection changes", () => {
    const controller = createPickerController(makeState());
    const activeListener = vi.fn();
    const paletteListener = vi.fn();
    controller.subscribe(selectActiveColorId, activeListener);
    controller.subscribe(selectPalette, paletteListener);

    controller.commands.setName("red", "Crimson");
    expect(activeListener).not.toHaveBeenCalled();
    expect(paletteListener).toHaveBeenCalledOnce();

    controller.commands.setActive("blue");
    expect(activeListener).toHaveBeenCalledWith(
      "blue",
      expect.objectContaining({ action: "selection", changedColorIds: [] })
    );
    expect(paletteListener).toHaveBeenCalledOnce();
  });

  it("serializes reentrant notifications without dropping the outer event", () => {
    const controller = createPickerController(makeState());
    const events: string[] = [];
    let nested = false;
    const selector = (state: PickerState) => `${hue(state, "red")}/${hue(state, "green")}`;
    controller.subscribe(selector, (value, meta) => {
      events.push(`first:${meta.action}:${value}`);
      if (!nested && meta.action === "outer") {
        nested = true;
        controller.commands.setColor(
          "green",
          { space: "hsv", h: 240, s: 1, v: 1 },
          { action: "inner" }
        );
      }
    });
    controller.subscribe(selector, (value, meta) => {
      events.push(`second:${meta.action}:${value}`);
    });

    controller.commands.setColor("red", { space: "hsv", h: 60, s: 1, v: 1 }, { action: "outer" });

    expect(events).toEqual([
      "first:outer:60/120",
      "second:outer:60/120",
      "first:inner:60/240",
      "second:inner:60/240"
    ]);
  });

  it("pairs reentrant change and palette callbacks with the state that produced each meta", () => {
    const events: string[] = [];
    const controller: ReturnType<typeof createPickerController> = createPickerController(
      makeState(),
      {
        onChange(state, meta) {
          events.push(`state:${meta.action}:${hue(state, "red")}/${hue(state, "green")}`);
          if (meta.action === "outer") {
            controller.commands.setColor(
              "green",
              { space: "hsv", h: 240, s: 1, v: 1 },
              { action: "inner" }
            );
          }
        },
        onPaletteChange(palette, meta) {
          const next = createPickerState({ palette });
          events.push(`palette:${meta.action}:${hue(next, "red")}/${hue(next, "green")}`);
        }
      }
    );

    controller.commands.setColor("red", { space: "hsv", h: 60, s: 1, v: 1 }, { action: "outer" });

    expect(events).toEqual([
      "state:outer:60/120",
      "palette:outer:60/120",
      "state:inner:60/240",
      "palette:inner:60/240"
    ]);
  });

  it("batches a transaction into one notification and rolls back failed transactions", () => {
    const controller = createPickerController(makeState());
    const listener = vi.fn();
    controller.subscribe((state) => state, listener);

    const result = controller.transaction(
      () => {
        controller.commands.setName("red", "Crimson");
        controller.commands.setRole("green", "success");
        return 42;
      },
      { action: "programmatic" }
    );

    expect(result).toBe(42);
    expect(listener).toHaveBeenCalledOnce();
    const meta = listener.mock.calls[0]?.[1] as ChangeMeta;
    expect(meta.changedColorIds).toEqual(["red", "green"]);
    expect(meta.phase).toBe("commit");
    expect(meta.transactionId).toMatch(/^picker-transaction-/);

    const beforeFailure = controller.getState();
    expect(() =>
      controller.transaction(() => {
        controller.commands.setName("blue", "Sky");
        controller.commands.addColor({ id: "red", color: red });
      })
    ).toThrow();
    expect(controller.getState()).toBe(beforeFailure);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("emits start, update, and commit with one interaction ID", () => {
    const onPaletteChange = vi.fn();
    const controller = createPickerController(makeState(), { onPaletteChange });
    const listener = vi.fn();
    controller.subscribe((state) => state.palette, listener);
    const interaction = controller.beginInteraction({ action: "pointer" });

    interaction.start();
    interaction.update({
      type: "set-color",
      colorId: "red",
      color: { space: "hsv", h: 15, s: 0.8, v: 0.9 }
    });
    interaction.commit();

    expect(listener.mock.calls.map((call) => (call[1] as ChangeMeta).phase)).toEqual([
      "start",
      "update",
      "commit"
    ]);
    expect(
      new Set(listener.mock.calls.map((call) => (call[1] as ChangeMeta).transactionId)).size
    ).toBe(1);
    expect((listener.mock.calls[2]?.[1] as ChangeMeta).changedColorIds).toEqual(["red"]);
    expect(onPaletteChange.mock.calls.map((call) => (call[1] as ChangeMeta).phase)).toEqual([
      "update",
      "commit"
    ]);
  });

  it("finalizes a cancelled interaction so update-only state is not left uncommitted", () => {
    const controller = createPickerController(makeState());
    const listener = vi.fn();
    controller.subscribe((state) => state.palette, listener);
    const interaction = controller.beginInteraction({ action: "pointer" });
    interaction.update({
      type: "set-color",
      colorId: "red",
      color: { space: "hsv", h: 15, s: 0.8, v: 0.9 }
    });
    interaction.cancel();

    expect(listener.mock.calls.map((call) => (call[1] as ChangeMeta).phase)).toEqual([
      "start",
      "update",
      "commit"
    ]);
  });

  it("unions update and final-action IDs in the interaction commit", () => {
    const controller = createPickerController(makeState());
    const listener = vi.fn();
    controller.subscribe((state) => state.palette, listener);
    const interaction = controller.beginInteraction({ action: "pointer" });
    interaction.update({
      type: "set-color",
      colorId: "red",
      color: { space: "hsv", h: 15, s: 0.8, v: 0.9 }
    });
    interaction.commit({
      type: "set-color",
      colorId: "green",
      color: { space: "hsv", h: 130, s: 0.7, v: 0.8 }
    });

    const commit = listener.mock.calls.at(-1)?.[1] as ChangeMeta;
    expect(commit.phase).toBe("commit");
    expect(commit.changedColorIds).toEqual(["red", "green"]);
  });

  it("does not start a failed interaction and invalidates live interactions on destroy", () => {
    const controller = createPickerController(makeState());
    const listener = vi.fn();
    controller.subscribe((state) => state.palette, listener);
    const interaction = controller.beginInteraction();

    expect(() =>
      interaction.start({
        type: "set-color",
        colorId: "red",
        color: { space: "hsv", h: Number.NaN, s: 1, v: 1 }
      })
    ).toThrow();
    expect(listener).not.toHaveBeenCalled();

    interaction.start({
      type: "set-color",
      colorId: "red",
      color: { space: "hsv", h: 10, s: 1, v: 1 }
    });
    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0]?.[1] as ChangeMeta).phase).toBe("start");

    const stillLive = controller.beginInteraction();
    controller.destroy();
    expect(() =>
      stillLive.update({
        type: "set-color",
        colorId: "green",
        color: { space: "hsv", h: 130, s: 1, v: 1 }
      })
    ).toThrow(DestroyedPickerControllerError);
    expect(() => stillLive.commit()).toThrow(DestroyedPickerControllerError);
  });

  it("uses the core harmony generator for linked anchor changes and preserves entry data", () => {
    const palette = makeHarmonyPalette();
    const state = createPickerState({
      palette: {
        ...palette,
        colors: palette.colors.map((entry, index) =>
          index === 1 ? { ...entry, role: "secondary" } : entry
        )
      },
      wheel: { interaction: "linked" }
    });
    const controller = createPickerController(state);

    controller.commands.setColor(
      "red",
      { space: "hsv", h: 35, s: 0.8, v: 0.9 },
      {
        action: "pointer",
        phase: "update"
      }
    );

    const next = controller.getPalette();
    expect(next.colors.map((entry) => entry.id)).toEqual(["red", "green", "blue"]);
    expect(next.colors[1]?.role).toBe("secondary");
    expect(next.recipe).toMatchObject({ type: "wheel", harmony: { type: "triadic" } });
    expect(next.recipe?.seed).toMatchObject({ space: "hsv", h: 35 });
  });

  it("preserves unlocked and locked colors outside the generated recipe slots", () => {
    for (const locked of [false, true]) {
      const generated = createHarmonyPalette({
        seed: red,
        harmony: { type: "complementary" },
        idFactory: (index) => (index === 0 ? "seed" : "companion")
      });
      const extra = makeEntry("manual-extra", green, {
        name: locked ? "Locked extra" : "Extra",
        ...(locked ? { locked: true } : {})
      });
      const palette = { ...generated, colors: [...generated.colors, extra] };
      const controller = createPickerController(
        createPickerState({ palette, wheel: { interaction: "linked" } })
      );

      controller.commands.setColor("seed", { space: "hsv", h: 35, s: 0.8, v: 0.9 });

      expect(controller.getPalette().colors.find((entry) => entry.id === extra.id)).toEqual(extra);
      expect(controller.getPalette().recipe?.colorSlotIds).not.toContain(extra.id);
    }
  });

  it("keeps the live linked seed as the editing basis at an achromatic endpoint", () => {
    const palette = createHarmonyPalette({
      seed: { space: "hsv", h: 182, s: 1, v: 0.8 },
      harmony: { type: "complementary" },
      idFactory: (index) => (index === 0 ? "anchor" : "complement")
    });
    const controller = createPickerController(
      createPickerState({ palette, wheel: { interaction: "linked" } })
    );

    controller.commands.setColor("anchor", { space: "hsv", h: 182, s: 1, v: 0 });

    const blackState = controller.getState();
    const blackAnchor = blackState.palette.colors[0];
    expect(blackAnchor).toBeDefined();
    if (blackAnchor === undefined) return;
    expect(formatColor(blackAnchor.color, { format: "hex", alpha: "never" })).toBe("#000000");
    expect(blackState.palette.recipe?.seed).toEqual({
      space: "hsv",
      h: 182,
      s: 1,
      v: 0
    });

    const recovered = setWheelChannelValue(resolveWheelEditingColor(blackState, blackAnchor), 0.01);
    controller.commands.setColor("anchor", recovered);

    expect(controller.getPalette().recipe?.seed).toEqual({
      space: "hsv",
      h: 182,
      s: 1,
      v: 0.01
    });
    expect(
      formatColor(controller.getPalette().colors[0]?.color ?? red, {
        format: "hex",
        alpha: "never"
      })
    ).not.toBe("#030303");
  });

  it("keeps linked color relationships attached to IDs after swatch reordering", () => {
    const state = createPickerState({
      palette: makeHarmonyPalette(),
      wheel: { interaction: "linked" }
    });
    const controller = createPickerController(state);
    controller.commands.reorderColor("blue", 0);
    controller.commands.setColor("red", { space: "hsv", h: 40, s: 1, v: 1 });

    const next = controller.getPalette();
    expect(next.colors.map((entry) => entry.id)).toEqual(["blue", "red", "green"]);
    const anchor = next.colors.find((entry) => entry.id === "red");
    expect(anchor).toBeDefined();
    const expectedAnchor = createHarmonyPalette({
      seed: { space: "hsv", h: 40, s: 1, v: 1 },
      harmony: { type: "triadic" }
    }).colors[0]?.color;
    expect(anchor?.color).toEqual(expectedAnchor);
  });

  it("edits explicit seed slots for even analogous and monochromatic palettes without anchor jumps", () => {
    const cases = [
      createHarmonyPalette({
        seed: { space: "hsv", h: 40, s: 0.8, v: 0.9 },
        harmony: { type: "analogous", count: 4 },
        idFactory: (index) => `analogous-${index}`
      }),
      createHarmonyPalette({
        seed: { space: "hsv", h: 220, s: 0.75, v: 0.65 },
        harmony: { type: "monochromatic", count: 6 },
        idFactory: (index) => `monochromatic-${index}`
      })
    ];

    for (const palette of cases) {
      const controller = createPickerController(
        createPickerState({ palette, wheel: { interaction: "linked" } })
      );
      const ownerId = palette.recipe?.seedColorId;
      expect(controller.getState().anchorColorId).toBe(ownerId);
      expect(ownerId).toBeDefined();
      if (ownerId === undefined) continue;
      const moved = { space: "hsv" as const, h: 125, s: 0.7, v: 0.72 };
      controller.commands.setColor(ownerId, moved);

      const next = controller.getPalette();
      expect(next.recipe?.seedColorId).toBe(ownerId);
      const ownerColor = next.colors.find((entry) => entry.id === ownerId)?.color;
      expect(ownerColor).toBeDefined();
      if (ownerColor !== undefined) {
        expect(formatColor(ownerColor, { format: "hex", alpha: "never" })).toBe(
          formatColor(mapToGamut(moved, "srgb").color, { format: "hex", alpha: "never" })
        );
      }
      expect(next.colors.map((entry) => entry.id)).toEqual(palette.colors.map((entry) => entry.id));
    }
  });

  it("preserves seed ownership through reorder, serialization, reload, and achromatic recovery", () => {
    const palette = createHarmonyPalette({
      seed: { space: "hsv", h: 182, s: 1, v: 0.8 },
      harmony: { type: "analogous", count: 4 },
      idFactory: (index) => `entry-${index}`
    });
    const originalOwner = palette.recipe?.seedColorId;
    expect(originalOwner).toBeDefined();
    if (originalOwner === undefined) return;

    const first = createPickerController(
      createPickerState({ palette, wheel: { interaction: "linked" } })
    );
    const lastCompanionId = palette.recipe?.colorSlotIds?.at(-1);
    expect(lastCompanionId).toBeDefined();
    if (lastCompanionId === undefined) return;
    first.commands.reorderColor(lastCompanionId, 0);
    const roundTripped = parsePaletteDocument(serializePaletteDocument(first.getPalette())).palette;
    expect(roundTripped.recipe?.colorSlotIds).toEqual(palette.recipe?.colorSlotIds);
    const second = createPickerController(
      createPickerState({ palette: roundTripped, wheel: { interaction: "linked" } })
    );
    expect(second.getState().anchorColorId).toBe(originalOwner);

    second.commands.setColor(originalOwner, { space: "hsv", h: 182, s: 1, v: 0 });
    const blackOwner = second.getPalette().colors.find((entry) => entry.id === originalOwner);
    expect(blackOwner).toBeDefined();
    if (blackOwner === undefined) return;
    const recovered = setWheelChannelValue(
      resolveWheelEditingColor(second.getState(), blackOwner),
      0.02
    );
    second.commands.setColor(originalOwner, recovered);
    expect(second.getPalette().recipe?.seedColorId).toBe(originalOwner);
    expect(second.getPalette().recipe?.seed).toEqual({
      space: "hsv",
      h: 182,
      s: 1,
      v: 0.02
    });
    expect(second.getPalette().recipe?.colorSlotIds).toEqual(palette.recipe?.colorSlotIds);
    const expected = createHarmonyPalette({
      seed: { space: "hsv", h: 182, s: 1, v: 0.02 },
      harmony: { type: "analogous", count: 4 }
    });
    for (const [index, colorId] of (palette.recipe?.colorSlotIds ?? []).entries()) {
      const actualColor = second.getPalette().colors.find((entry) => entry.id === colorId)?.color;
      const expectedColor = expected.colors[index]?.color;
      expect(actualColor).toBeDefined();
      expect(expectedColor).toBeDefined();
      if (actualColor !== undefined && expectedColor !== undefined) {
        expect(formatColor(actualColor, { format: "hex", alpha: "never" })).toBe(
          formatColor(expectedColor, { format: "hex", alpha: "never" })
        );
      }
    }
  });

  it("fails closed for unsupported or mismatched recipe strategy identities", () => {
    const base = createHarmonyPalette({
      seed: red,
      harmony: { type: "triadic" },
      idFactory: (index) => ["seed", "second", "third"][index] ?? `extra-${index}`
    });
    const unsupported = [
      {
        id: BUILT_IN_HARMONY_IDS.triadic,
        version: "0.9.0"
      },
      {
        id: BUILT_IN_HARMONY_IDS.analogous,
        version: BUILT_IN_STRATEGY_VERSION
      }
    ];
    const recipe = base.recipe;
    expect(recipe).toBeDefined();
    if (recipe === undefined) return;

    for (const strategy of unsupported) {
      const palette = {
        ...base,
        recipe: { ...recipe, strategy }
      };
      const controller = createPickerController(
        createPickerState({ palette, wheel: { interaction: "linked" } })
      );
      expect(() =>
        controller.commands.setColor("seed", { space: "hsv", h: 20, s: 1, v: 1 })
      ).toThrow(LinkedInteractionError);
      expect(() => controller.commands.regenerate()).toThrow(MissingRegeneratorError);
    }
  });

  it("fails closed when a legacy recipe has no safely inferable seed owner", () => {
    const generated = createHarmonyPalette({
      seed: { space: "hsv", h: 200, s: 0.8, v: 0.7 },
      harmony: { type: "monochromatic" }
    });
    const { seedColorId: _seedColorId, ...legacyRecipe } = generated.recipe ?? {
      type: "wheel" as const
    };
    void _seedColorId;
    const legacy = {
      ...generated,
      colors: generated.colors.map((entry) =>
        entry.id === generated.recipe?.seedColorId ? { ...entry, color: red } : entry
      ),
      recipe: legacyRecipe
    };
    const controller = createPickerController(
      createPickerState({ palette: legacy, wheel: { interaction: "linked" } })
    );
    expect(() => controller.commands.regenerate()).toThrow(MissingRegeneratorError);
  });

  it("supports injected linked and regeneration policies", () => {
    const linkedPalette = makeHarmonyPalette();
    const state = createPickerState({
      palette: linkedPalette,
      wheel: { interaction: "linked" }
    });
    const resolveLinkedColorUpdate = vi.fn<LinkedColorUpdate>(({ state: current }) => ({
      ...current.palette,
      colors: current.palette.colors.map((entry) =>
        entry.id === "red" ? { ...entry, color: blue } : entry
      )
    }));
    const regenerated = {
      ...linkedPalette,
      colors: linkedPalette.colors.map((entry) =>
        entry.id === "green" ? { ...entry, color: blue } : entry
      )
    };
    const regenerate = vi.fn(() => regenerated);
    const controller = createPickerController(state, {
      resolveLinkedColorUpdate,
      regenerate
    });

    controller.commands.setColor("red", blue);
    expect(resolveLinkedColorUpdate).toHaveBeenCalledOnce();
    expect(controller.getPalette().colors[0]?.color).toBe(blue);
    controller.commands.regenerate();
    expect(regenerate).toHaveBeenCalledOnce();
    expect(controller.getPalette()).toBe(regenerated);
  });

  it("reports missing regeneration strategies and locked constraint violations", () => {
    const controller = createPickerController(makeState());
    expect(() => controller.commands.regenerate()).toThrow(MissingRegeneratorError);

    const locked = makePalette([
      makeEntry("red", red, { locked: true }),
      makeEntry("green", green)
    ]);
    const lockedController = createPickerController(createPickerState({ palette: locked }), {
      regenerate: () =>
        makePalette([makeEntry("red", blue, { locked: true }), makeEntry("green", green)])
    });
    expect(() => lockedController.commands.regenerate()).toThrow(LockedColorConstraintError);
  });

  it("creates collision-free IDs and forwards focus requests", () => {
    const onFocusRequest = vi.fn();
    const controller = createPickerController(makeState(), { onFocusRequest });
    expect(controller.commands.addColor({ color: blue })).toBe("color-1");
    expect(controller.commands.addColor({ color: green })).toBe("color-2");
    controller.focus({ type: "swatch", colorId: "green" });
    expect(onFocusRequest).toHaveBeenCalledWith({ type: "swatch", colorId: "green" });
  });

  it("rejects malformed command, dispatch, controlled-state, and lifecycle inputs", () => {
    const controller = createPickerController(makeState());
    expect(() =>
      controller.commands.setColor("red", {
        space: "hsv",
        h: Number.NaN,
        s: 1,
        v: 1
      })
    ).toThrow();
    expect(() =>
      controller.commands.addColor({
        color: red,
        metadata: { callback: () => undefined }
      } as never)
    ).toThrow();
    expect(() => controller.dispatch({ type: "unknown" } as never)).toThrow();
    expect(() => controller.commands.setLocked("red", "yes" as never)).toThrow();
    expect(() => controller.commands.setName("red", 42 as never)).toThrow();
    expect(() => controller.setPalette(makePalette(), null as never)).toThrow();
    expect(() => controller.beginInteraction({ phase: "later" } as never)).toThrow();

    const invalidState = {
      ...controller.getState(),
      colorFocusOrder: ["red", 42]
    };
    expect(() => controller.setState(invalidState as never)).toThrow();
  });

  it("snapshots accessor-backed action payloads once at the dispatch boundary", () => {
    for (const type of ["replace-palette", "regenerate"] as const) {
      const controller = createPickerController(makeState());
      const first = makePalette([makeEntry("first", red)]);
      const second = makePalette([makeEntry("second", blue)]);
      let reads = 0;
      const action: Record<string, unknown> = { type };
      Object.defineProperty(action, "palette", {
        enumerable: true,
        get() {
          reads += 1;
          return reads === 1 ? first : second;
        }
      });

      controller.dispatch(action as never);
      expect(reads).toBe(1);
      expect(controller.getPalette()).toBe(first);
    }
  });

  it("rejects accessor-backed state envelopes at the controller boundary", () => {
    const input = makeState();
    const backingPalette: unknown = input.palette;
    let reads = 0;
    Object.defineProperty(input, "palette", {
      enumerable: true,
      get() {
        reads += 1;
        return backingPalette;
      }
    });

    expect(() => createPickerController(input)).toThrow(EditorStateError);
    expect(reads).toBe(0);
  });

  it("snapshots transaction and interaction change envelopes once", () => {
    const transactionController = createPickerController(makeState());
    const transactionListener = vi.fn();
    transactionController.subscribe((state) => state, transactionListener);
    let transactionReads = 0;
    const transactionChange: Record<string, unknown> = {};
    Object.defineProperty(transactionChange, "action", {
      enumerable: true,
      get() {
        transactionReads += 1;
        return transactionReads === 1 ? undefined : 42;
      }
    });
    transactionController.transaction(
      () => transactionController.commands.setName("red", "Crimson"),
      transactionChange
    );
    expect(transactionReads).toBe(1);
    expect((transactionListener.mock.calls[0]?.[1] as ChangeMeta).action).toBe("text-input");

    const interactionController = createPickerController(makeState());
    const interactionListener = vi.fn();
    interactionController.subscribe((state) => state, interactionListener);
    let interactionReads = 0;
    const interactionChange: Record<string, unknown> = {};
    Object.defineProperty(interactionChange, "action", {
      enumerable: true,
      get() {
        interactionReads += 1;
        return interactionReads === 1 ? undefined : 42;
      }
    });
    interactionController.beginInteraction(interactionChange).start();
    expect(interactionReads).toBe(1);
    expect((interactionListener.mock.calls[0]?.[1] as ChangeMeta).action).toBe("pointer");
  });

  it("validates controller callbacks and generated transaction IDs before use", () => {
    expect(() => createPickerController(makeState(), { onChange: 42 } as never)).toThrow(
      EditorStateError
    );

    const invalidId = createPickerController(makeState(), {
      createTransactionId: () => ""
    });
    expect(() => invalidId.beginInteraction()).toThrow(EditorStateError);
    expect(() => invalidId.transaction(() => undefined)).toThrow(EditorStateError);
  });

  it("cleans up subscriptions and rejects mutations after destroy", () => {
    const controller = createPickerController(makeState());
    const listener = vi.fn();
    controller.subscribe((state) => state, listener);
    controller.destroy();
    controller.destroy();
    expect(() => controller.commands.removeColor("red")).toThrow(DestroyedPickerControllerError);
    expect(listener).not.toHaveBeenCalled();
  });
});
