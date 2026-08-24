import colorwheel = require("@s9rg/colorwheel");
import core = require("@s9rg/colorwheel/core");
import dom = require("@s9rg/colorwheel/dom");
import vanilla = require("@s9rg/colorwheel/vanilla");
import editor = require("@s9rg/colorwheel/editor");

const palette = colorwheel.createTonalPalette({ seed: "#663399", count: 7 });
const state = editor.createPickerState({ palette });
const color: core.SrgbColor = core.convertColor(palette.colors[0].color, "srgb");

void color;
void dom.mountColorwheel;
void vanilla.mountColorwheel;
void state;
