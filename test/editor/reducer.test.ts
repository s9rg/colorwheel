import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { createHarmonyPalette } from "../../src/core";
import {
  DuplicateColorIdError,
  EditorStateError,
  LinkedInteractionError,
  LockedColorConstraintError,
  createPickerState,
  reducePickerState
} from "../../src/editor";
import { blue, green, makeEntry, makeHarmonyPalette, makePalette, red } from "./fixtures";

describe("reducePickerState", () => {
  it("edits one free color with structural sharing and detaches the live recipe", () => {
    const palette = makeHarmonyPalette();
    const state = createPickerState({ palette, wheel: { interaction: "free" } });
    const nextColor = { space: "hsv" as const, h: 20, s: 0.7, v: 0.8 };
    const result = reducePickerState(state, {
      type: "set-color",
      colorId: "red",
      color: nextColor
    });

    expect(result.changedColorIds).toEqual(["red"]);
    expect(result.state.palette).not.toBe(palette);
    expect(result.state.palette.recipe).toBeUndefined();
    expect(result.state.palette.colors[0]?.color).toEqual(nextColor);
    expect(result.state.palette.colors[1]).toBe(palette.colors[1]);
    expect(result.state.palette.provenance).toBe(palette.provenance);
  });

  it("requires an explicit recalculated palette in linked reducer updates", () => {
    const state = createPickerState({
      palette: makeHarmonyPalette(),
      wheel: { interaction: "linked" }
    });
    expect(() =>
      reducePickerState(state, {
        type: "set-color",
        colorId: "red",
        color: { space: "hsv", h: 30, s: 1, v: 1 }
      })
    ).toThrow(LinkedInteractionError);

    const moved = { space: "hsv" as const, h: 30, s: 1, v: 1 };
    const generated = makeHarmonyPalette();
    const recalculated = {
      ...generated,
      colors: generated.colors.map((entry) =>
        entry.id === "red" ? { ...entry, color: moved } : entry
      )
    };
    const result = reducePickerState(state, {
      type: "set-color",
      colorId: "red",
      color: moved,
      linkedPalette: recalculated
    });
    expect(result.state.palette).toBe(recalculated);
  });

  it("adds and removes colors, selects a predictable neighbor, and changes to free mode", () => {
    const linked = createPickerState({
      palette: makeHarmonyPalette(),
      activeColorId: "green",
      anchorColorId: "green",
      wheel: { interaction: "linked" }
    });
    const removed = reducePickerState(linked, { type: "remove-color", colorId: "green" }).state;
    expect(removed.palette.colors.map((entry) => entry.id)).toEqual(["red", "blue"]);
    expect(removed.activeColorId).toBe("blue");
    expect(removed.anchorColorId).toBe("blue");
    expect(removed.palette.recipe).toBeUndefined();
    expect(removed.wheel.interaction).toBe("free");

    const added = reducePickerState(removed, {
      type: "add-color",
      entry: makeEntry("green-2", green),
      index: 1
    }).state;
    expect(added.palette.colors.map((entry) => entry.id)).toEqual(["red", "green-2", "blue"]);
    expect(added.colorFocusOrder).toEqual(["red", "blue", "green-2"]);
  });

  it("rejects duplicate additions", () => {
    const state = createPickerState({ palette: makePalette() });
    expect(() =>
      reducePickerState(state, {
        type: "add-color",
        entry: makeEntry("red", blue)
      })
    ).toThrow(DuplicateColorIdError);
  });

  it("reorders swatches without changing recipe or wheel focus order", () => {
    const palette = makeHarmonyPalette();
    const state = createPickerState({ palette, wheel: { interaction: "linked" } });
    const result = reducePickerState(state, {
      type: "reorder-color",
      colorId: "blue",
      toIndex: 0
    });

    expect(result.state.palette.colors.map((entry) => entry.id)).toEqual(["blue", "red", "green"]);
    expect(result.state.colorFocusOrder).toEqual(["red", "green", "blue"]);
    expect(result.state.palette.recipe).toBe(palette.recipe);
    expect(result.state.wheel.interaction).toBe("linked");
  });

  it("supports lock, name, role, active, and anchor actions", () => {
    let state = createPickerState({ palette: makePalette() });
    state = reducePickerState(state, {
      type: "set-color-locked",
      colorId: "green",
      locked: true
    }).state;
    const lockedState = state;
    state = reducePickerState(state, {
      type: "set-color",
      colorId: "green",
      color: blue
    }).state;
    expect(state).toBe(lockedState);

    state = reducePickerState(state, {
      type: "set-color-name",
      colorId: "green",
      name: "Leaf"
    }).state;
    state = reducePickerState(state, {
      type: "set-color-role",
      colorId: "green",
      role: "success"
    }).state;
    state = reducePickerState(state, { type: "set-active-color", colorId: "blue" }).state;
    state = reducePickerState(state, { type: "set-anchor-color", colorId: "blue" }).state;

    expect(state.palette.colors[1]).toMatchObject({
      id: "green",
      name: "Leaf",
      role: "success",
      locked: true
    });
    expect(state.activeColorId).toBe("blue");
    expect(state.anchorColorId).toBe("blue");
  });

  it("rejects regeneration that changes or removes locked colors", () => {
    const palette = makePalette([
      makeEntry("red", red, { locked: true }),
      makeEntry("green", green)
    ]);
    const state = createPickerState({ palette });
    const invalid = makePalette([makeEntry("red", blue), makeEntry("green", green)]);
    expect(() => reducePickerState(state, { type: "regenerate", palette: invalid })).toThrow(
      LockedColorConstraintError
    );
  });

  it("moves a controlled manual palette out of linked mode", () => {
    const state = createPickerState({
      palette: makeHarmonyPalette(),
      wheel: { interaction: "linked" }
    });
    const result = reducePickerState(state, {
      type: "replace-palette",
      palette: makePalette()
    });
    expect(result.state.wheel.interaction).toBe("free");
  });

  it("follows the declared seed owner when portable palette data is replaced", () => {
    const initial = createHarmonyPalette({
      seed: "#00c4cc",
      harmony: { type: "complementary" }
    });
    const state = createPickerState({ palette: initial, wheel: { interaction: "linked" } });
    const analogous = createHarmonyPalette({
      seed: "#00c4cc",
      harmony: { type: "analogous" }
    });

    const result = reducePickerState(state, {
      type: "replace-palette",
      palette: analogous
    });

    expect(result.state.anchorColorId).toBe(analogous.recipe?.seedColorId);
    expect(result.state.activeColorId).toBe(analogous.recipe?.seedColorId);
    expect(result.state.anchorColorId).not.toBe(initial.recipe?.seedColorId);
  });

  it("does not create selections during palette replacement when they were cleared", () => {
    const state = createPickerState({
      palette: makePalette(),
      activeColorId: undefined,
      anchorColorId: undefined
    });
    const next = createHarmonyPalette({
      seed: "#00c4cc",
      harmony: { type: "analogous" }
    });

    const result = reducePickerState(state, { type: "replace-palette", palette: next });

    expect(result.state.activeColorId).toBeUndefined();
    expect(result.state.anchorColorId).toBeUndefined();
  });

  it("does not enter linked mode without a live wheel recipe", () => {
    const state = createPickerState({ palette: makePalette() });
    expect(() =>
      reducePickerState(state, {
        type: "set-wheel-options",
        options: { interaction: "linked" }
      })
    ).toThrow(LinkedInteractionError);
  });

  it("rejects malformed JavaScript actions before they can enter state", () => {
    const state = createPickerState({ palette: makePalette() });
    const invalidActions: unknown[] = [
      { type: "unknown" },
      { type: "remove-color", colorId: 42 },
      { type: "reorder-color", colorId: "red", toIndex: Number.NaN },
      { type: "set-color-locked", colorId: "red", locked: "yes" },
      { type: "set-color-name", colorId: "red", name: 42 },
      { type: "set-color-name", colorId: "red", name: "x".repeat(20_000) },
      { type: "set-color-role", colorId: "red", role: null },
      {
        type: "set-color",
        colorId: "red",
        color: { space: "hsv", h: 360, s: 2, v: Number.POSITIVE_INFINITY }
      },
      {
        type: "add-color",
        entry: { id: "unsafe", color: red, metadata: { callback: () => undefined } }
      },
      { type: "set-active-color", colorId: "red", unexpected: true },
      { type: "remove-color", colorId: "red", change: { origin: "system" } }
    ];

    for (const action of invalidActions) {
      expect(() => reducePickerState(state, action as never)).toThrow();
    }
    expect(state.palette.colors.map((entry) => entry.id)).toEqual(["red", "green", "blue"]);
  });

  it("validates replacement and regeneration palettes at the public reducer boundary", () => {
    const state = createPickerState({ palette: makePalette() });
    const invalid = makePalette(undefined, {
      metadata: { callback: () => undefined } as never
    });
    expect(() =>
      reducePickerState(state, { type: "replace-palette", palette: invalid } as never)
    ).toThrow();
    expect(() =>
      reducePickerState(state, { type: "regenerate", palette: invalid } as never)
    ).toThrow();
    expect(() => reducePickerState(state, null as never)).toThrow(EditorStateError);
  });

  it("accepts plain action and change objects from another JavaScript realm", () => {
    const state = createPickerState({ palette: makePalette() });
    const action = runInNewContext(`({
      type: "set-color-name",
      colorId: "red",
      name: "Foreign realm",
      change: { action: "programmatic", origin: "extension", phase: "commit" }
    })`) as never;
    expect(reducePickerState(state, action).state.palette.colors[0]?.name).toBe("Foreign realm");
  });
});
