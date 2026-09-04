import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = join(root, "demo", "dist");
const html = await readFile(join(output, "index.html"), "utf8");
const notices = await readFile(join(output, "THIRD_PARTY_NOTICES.txt"), "utf8");

assert.match(html, /<title>Colorwheel/);
assert.match(notices, /^Colorwheel — Third-Party Notices/m);
assert.match(notices, /Package: @s9rg\/theme-compiler@0\.6\.0/);
for (const adapter of [
  "angular-material",
  "antd",
  "css",
  "daisyui",
  "dtcg",
  "ionic",
  "mui",
  "react-native-paper",
  "shadcn",
  "tailwind",
  "vuetify"
]) {
  assert.match(notices, new RegExp(`Package: @s9rg/theme-adapter-${adapter}@0\\.6\\.0`));
}
assert.match(notices, /MATERIAL_COLOR_UTILITIES_LICENSE/);
assert.match(notices, /Apache License\s+Version 2\.0/);

const externalScript = /<script\b[^>]*src=["']https?:\/\//i;
const externalStylesheet = /<link\b(?=[^>]*rel=["']stylesheet["'])[^>]*href=["']https?:\/\//i;
assert.equal(externalScript.test(html), false, "demo must not load external scripts");
assert.equal(externalStylesheet.test(html), false, "demo must not load external stylesheets");

const localAssetPattern = /<(?:script|link)\b[^>]*(?:src|href)=["']\/colorwheel\/([^"']+)["']/gi;
for (const match of html.matchAll(localAssetPattern)) {
  const relativePath = match[1];
  assert.ok(relativePath, "demo asset path must not be empty");
  await access(join(output, relativePath));
}

console.log("Verified Colorwheel demo assets and third-party notices.");
