import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { createHarmonyPalette, validatePalette } from "../../src/core";
import {
  DuplicateColorIdError,
  EditorStateError,
  LinkedInteractionError,
  UnknownColorIdError,
  createPickerState,
  resolveWheelEditingColor
} from "../../src/editor";
import { normalizeColorFocusOrder } from "../../src/editor/state";
import { makeEntry, makeHarmonyPalette, makePalette, red } from "./fixtures";

describe("createPickerState", () => {
  it("makes arbitrary controlled palettes immediately editable", () => {
    const palette = makePalette();
    const state = createPickerState({ palette });

    expect(state.activeColorId).toBe("red");
    expect(state.anchorColorId).toBe("red");
    expect(state.colorFocusOrder).toEqual(["red", "green", "blue"]);
    expect(state.wheel).toEqual({
      wheelModel: "hsv",
      interaction: "free",
      outputGamut: "srgb"
    });
  });

  it("allows intentionally empty selections", () => {
    const state = createPickerState({
      palette: makePalette(),
      activeColorId: undefined,
      anchorColorId: undefined
    });
    expect(state.activeColorId).toBeUndefined();
    expect(state.anchorColorId).toBeUndefined();
    expect(Object.hasOwn(state, "activeColorId")).toBe(false);
    expect(Object.hasOwn(state, "anchorColorId")).toBe(false);
    expect(() => JSON.stringify(state)).not.toThrow();
  });

  it("normalizes a partial focus order without following palette order", () => {
    const palette = makePalette();
    expect(normalizeColorFocusOrder(palette, ["blue", "missing", "blue"])).toEqual([
      "blue",
      "red",
      "green"
    ]);
  });

  it("rejects duplicate IDs and invalid selections", () => {
    const duplicate = makePalette([makeEntry("same", red), makeEntry("same", red)]);
    expect(() => createPickerState({ palette: duplicate })).toThrow(DuplicateColorIdError);
    expect(() => createPickerState({ palette: makePalette(), activeColorId: "missing" })).toThrow(
      UnknownColorIdError
    );
    expect(() =>
      createPickerState({ palette: makePalette(), wheel: { interaction: "linked" } })
    ).toThrow(LinkedInteractionError);
  });

  it("uses only a linked anchor's live recipe seed as its wheel editing color", () => {
    const palette = makeHarmonyPalette();
    const linked = createPickerState({ palette, wheel: { interaction: "linked" } });
    const anchor = linked.palette.colors[0];
    const companion = linked.palette.colors[1];
    expect(anchor).toBeDefined();
    expect(companion).toBeDefined();
    if (anchor === undefined || companion === undefined) return;

    expect(resolveWheelEditingColor(linked, anchor)).toBe(palette.recipe?.seed);
    expect(resolveWheelEditingColor(linked, companion)).toBe(companion.color);

    const free = createPickerState({ palette });
    expect(resolveWheelEditingColor(free, anchor)).toBe(anchor.color);
  });

  it("defaults to the portable seed owner and safely infers legacy ownership", () => {
    const generated = createHarmonyPalette({
      seed: { space: "oklch", l: 0.62, c: 0.1, h: 40 },
      harmony: { type: "analogous" },
      idFactory: (index) => ["left", "seed", "right"][index] ?? `extra-${index}`
    });
    const reordered = {
      ...generated,
      colors: [generated.colors[2], generated.colors[0], generated.colors[1]].filter(
        (entry) => entry !== undefined
      )
    };
    const state = createPickerState({ palette: reordered, wheel: { interaction: "linked" } });
    expect(state.anchorColorId).toBe("seed");
    expect(state.activeColorId).toBe("seed");
    const owner = state.palette.colors.find((entry) => entry.id === "seed");
    expect(owner).toBeDefined();
    if (owner === undefined) return;
    expect(resolveWheelEditingColor(state, owner)).toBe(generated.recipe?.seed);

    const { seedColorId: _seedColorId, ...legacyRecipe } = generated.recipe ?? {
      type: "wheel" as const
    };
    void _seedColorId;
    const legacy = { ...generated, recipe: legacyRecipe };
    expect(
      createPickerState({ palette: legacy, wheel: { interaction: "linked" } }).anchorColorId
    ).toBe("seed");

    const noMatchingOwner = makePalette(undefined, {
      kind: "harmony",
      recipe: {
        type: "wheel",
        seed: { space: "hsv", h: 60, s: 1, v: 1 },
        harmony: { type: "triadic" }
      },
      provenance: { origin: "wheel" }
    });
    const unmatched = createPickerState({
      palette: noMatchingOwner,
      wheel: { interaction: "linked" }
    });
    const unmatchedAnchor = unmatched.palette.colors[0];
    expect(unmatchedAnchor).toBeDefined();
    if (unmatchedAnchor !== undefined) {
      expect(resolveWheelEditingColor(unmatched, unmatchedAnchor)).toBe(unmatchedAnchor.color);
    }
  });

  it("rejects invalid palette data and malformed JavaScript state options", () => {
    expect(() =>
      createPickerState({
        palette: makePalette([makeEntry("bad", { space: "hsv", h: Number.NaN, s: 2, v: -1 })])
      })
    ).toThrow();
    expect(() =>
      createPickerState({
        palette: makePalette(undefined, {
          metadata: { callback: () => undefined } as never
        })
      })
    ).toThrow();
    expect(() =>
      createPickerState({ palette: makePalette(), colorFocusOrder: ["red", 2] } as never)
    ).toThrow(EditorStateError);
    expect(() =>
      createPickerState({
        palette: makePalette(),
        wheel: { interaction: "linked", extra: true }
      } as never)
    ).toThrow(EditorStateError);
  });

  it("accepts plain palette and option objects from another JavaScript realm", () => {
    const foreignOptions = runInNewContext(`({
      palette: {
        colors: [{ id: "foreign", color: { space: "hsv", h: 30, s: 1, v: 1 } }],
        kind: "custom",
        provenance: { origin: "manual" }
      },
      wheel: { wheelModel: "hsv", interaction: "free", outputGamut: "srgb" }
    })`) as never;
    expect(createPickerState(foreignOptions).activeColorId).toBe("foreign");
  });

  it("snapshots accessor-backed creation options before validation", () => {
    const palette = makePalette();
    let reads = 0;
    const options: Record<string, unknown> = {};
    Object.defineProperty(options, "palette", {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1 ? palette : { invalid: true };
      }
    });

    const state = createPickerState(options as never);
    expect(reads).toBe(1);
    expect(validatePalette(state.palette).valid).toBe(true);
  });
});
