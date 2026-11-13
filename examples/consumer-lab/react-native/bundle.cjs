const assert = require("node:assert/strict");
const path = require("node:path");
const { loadConfig, runBuild } = require("metro");

async function main() {
  process.env.NODE_ENV = "production";
  const config = await loadConfig({
    config: path.join(__dirname, "metro.config.cjs"),
    maxWorkers: 2
  });
  const result = await runBuild(config, {
    entry: "index.js",
    platform: "ios",
    dev: false,
    minify: true,
    assets: true,
    bundleOut: path.join(__dirname, "main.jsbundle")
  });
  // This fixture uses native views and SVG rather than file-backed assets.
  // Fail explicitly if that changes so asset copying cannot silently be skipped.
  assert.equal(result.assets.length, 0, "Native fixture assets need an explicit copy step");
  assert.ok(result.code.length > 0, "Metro must generate a production native bundle");
  console.log("React Native production Metro bundle passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
