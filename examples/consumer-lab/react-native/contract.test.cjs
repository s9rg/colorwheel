const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const packageManifest = require("@s9rg/colorwheel/package.json");
const svgManifest = require("react-native-svg/package.json");
const appSource = readFileSync(path.join(__dirname, "App.tsx"), "utf8");

assert.equal(packageManifest.name, "@s9rg/colorwheel");
assert.equal(packageManifest.version, "1.0.0");
assert.ok(packageManifest.exports["./react-native"], "React Native export is missing");
assert.match(svgManifest.version, /^15\./, "consumer must exercise react-native-svg 15");

for (const contract of [
  'from "@s9rg/colorwheel/react-native"',
  'from "react-native-svg"',
  "palette={palette}",
  "blocks={LAB_BLOCKS}",
  "blockProps={blockProps}",
  "renderLayout={renderLayout}",
  "onPaletteChange={handlePaletteChange}"
]) {
  assert.ok(appSource.includes(contract), `App.tsx no longer exercises ${contract}`);
}

console.log("React Native consumer contract passed.");
