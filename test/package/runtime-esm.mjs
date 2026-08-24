import assert from "node:assert/strict";
import * as colorwheel from "@s9rg/colorwheel";
import * as core from "@s9rg/colorwheel/core";
import * as dom from "@s9rg/colorwheel/dom";
import * as editor from "@s9rg/colorwheel/editor";
import * as vanilla from "@s9rg/colorwheel/vanilla";

assert.equal(typeof colorwheel.parseColor, "function");
assert.equal(typeof core.createHarmonyPalette, "function");
assert.equal(typeof editor.createPickerState, "function");
assert.equal(typeof dom.mountColorwheel, "function");
assert.equal(vanilla.mountColorwheel, dom.mountColorwheel);
assert.equal("PickerPreset" in colorwheel, false);
assert.equal("mountColorwheel" in colorwheel, false);

const parsed = colorwheel.parseColor("#336699");
assert.equal(parsed.space, "srgb");

const palette = core.createHarmonyPalette({
  seed: parsed,
  harmony: { type: "complementary" }
});
assert.equal(palette.colors.length, 2);

const state = editor.createPickerState({ palette });
assert.equal(state.palette, palette);
assert.equal(state.activeColorId, palette.colors[0]?.id);

const controller = editor.createPickerController(state);
assert.equal(controller.getPalette(), palette);
controller.destroy();
