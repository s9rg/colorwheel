import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

const ignoredDirectoryNames = new Set([
  ".cache",
  ".git",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results"
]);

const ignoredRelativePaths = new Set([
  "demo/dist",
  // Lock metadata can preserve historical package names even after the package is renamed.
  "package-lock.json"
]);

const forbiddenReferences = [
  {
    label: "retired project name",
    value: ["react", "colorwheel"].join("-")
  },
  {
    label: "prohibited implementation reference",
    value: ["react", "colorful"].join("-")
  }
];

async function* walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name);
    const relativePath = relative(projectRoot, absolutePath).replaceAll("\\", "/");

    if (ignoredRelativePaths.has(relativePath)) continue;
    if (entry.isDirectory()) {
      if (ignoredDirectoryNames.has(entry.name)) continue;
      yield* walk(absolutePath);
      continue;
    }
    if (entry.isFile()) yield { absolutePath, relativePath };
  }
}

const violations = [];

for await (const { absolutePath, relativePath } of walk(projectRoot)) {
  const content = await readFile(absolutePath);
  if (content.includes(0)) continue;

  const text = content.toString("utf8").toLowerCase();
  for (const reference of forbiddenReferences) {
    if (text.includes(reference.value)) {
      violations.push(`${relativePath}: ${reference.label}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Clean-room reference scan failed:\n");
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exitCode = 1;
} else {
  console.log("Clean-room reference scan passed.");
}
