const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const installedManifest = require("@s9rg/colorwheel/package.json");
const expectedVersion = process.env.COLORWHEEL_CANDIDATE_VERSION;
const candidateSource = readFileSync(path.join(__dirname, "src/main.candidate.ts"), "utf8");

assert.match(
  expectedVersion ?? "",
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:[-+].+)?$/,
  "COLORWHEEL_CANDIDATE_VERSION must be an explicit semantic version"
);
assert.equal(
  installedManifest.version,
  expectedVersion,
  "Angular candidate must resolve the packed release-candidate version"
);
assert.doesNotMatch(
  candidateSource,
  /@angular\/compiler/,
  "Angular candidate entry must not load the JIT compiler fallback"
);

console.log(`Angular candidate contract passed for @s9rg/colorwheel@${expectedVersion}.`);
