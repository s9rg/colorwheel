const assert = require("node:assert/strict");
const colorwheel = require("@s9rg/colorwheel");
const core = require("@s9rg/colorwheel/core");
const dom = require("@s9rg/colorwheel/dom");
const editor = require("@s9rg/colorwheel/editor");
const vanilla = require("@s9rg/colorwheel/vanilla");

assert.equal(typeof colorwheel.parseColor, "function");
assert.equal(typeof core.createHarmonyPalette, "function");
assert.equal(typeof editor.createPickerState, "function");
assert.equal(typeof dom.mountColorwheel, "function");
assert.equal(vanilla.mountColorwheel, dom.mountColorwheel);
assert.equal("PickerPreset" in colorwheel, false);
assert.equal("mountColorwheel" in colorwheel, false);

const palette = core.createTonalPalette({ seed: "oklch(65% 0.18 240)", count: 5 });
assert.equal(palette.colors.length, 5);

const state = editor.createPickerState({ palette });
const controller = editor.createPickerController(state);
assert.equal(controller.getState().palette, palette);
controller.destroy();
