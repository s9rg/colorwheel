import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Picker, PickerPreset } from "@s9rg/colorwheel/react";

assert.equal(typeof PickerPreset, "function");
assert.equal(typeof Picker.Root, "function");
assert.equal(typeof Picker.Wheel, "function");
assert.equal(typeof Picker.Palette, "function");

const errors = [];
const originalConsoleError = globalThis.console.error;
globalThis.console.error = (...values) => errors.push(values.map(String).join(" "));
let markup;
try {
  markup = renderToStaticMarkup(
    createElement(PickerPreset, {
      blocks: { controls: false, diagnostics: false, export: false }
    })
  );
} finally {
  globalThis.console.error = originalConsoleError;
}
assert.deepEqual(errors, [], `React SSR emitted warnings:\n${errors.join("\n")}`);
assert.match(markup, /data-colorwheel/);
assert.match(markup, /data-part="wheel"/);
assert.match(markup, /data-part="palette"/);
