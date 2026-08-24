const assert = require("node:assert/strict");
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { Picker, PickerPreset } = require("@s9rg/colorwheel/react");

assert.equal(typeof PickerPreset, "function");
assert.equal(typeof Picker.Root, "function");

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
