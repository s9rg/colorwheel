import assert from "node:assert/strict";
import { ColorwheelComponent, ColorwheelPaletteTemplateDirective } from "@s9rg/colorwheel/angular";

assert.equal(typeof ColorwheelComponent, "function");
assert.equal(typeof ColorwheelPaletteTemplateDirective, "function");
assert.equal(typeof ColorwheelComponent.ɵcmp, "object");
assert.equal(typeof ColorwheelPaletteTemplateDirective.ɵdir, "object");
