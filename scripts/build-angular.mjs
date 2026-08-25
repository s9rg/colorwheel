import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const temporaryRoot = join(projectRoot, ".angular-build");
const angularTypesRoot = join(temporaryRoot, "angular");
const outputRoot = join(projectRoot, "dist", "angular");
const executableSuffix = process.platform === "win32" ? ".cmd" : "";

function run(binary, args) {
  const executable = join(projectRoot, "node_modules", ".bin", `${binary}${executableSuffix}`);
  const result = spawnSync(executable, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`${binary} exited with status ${String(result.status)}`);
  }
}

async function copyAngularDeclarations() {
  await mkdir(outputRoot, { recursive: true });
  const files = await readdir(angularTypesRoot);
  for (const file of files) {
    if (!file.endsWith(".d.ts")) continue;
    const source = await readFile(join(angularTypesRoot, file), "utf8");
    const declaration = source
      .replaceAll('"../core"', '"../core/index.js"')
      .replaceAll('"../dom"', '"../dom/index.js"')
      .replaceAll('"../editor"', '"../editor/index.js"')
      .replaceAll('"./colorwheel.component"', '"./colorwheel.component.js"')
      .replaceAll('"./palette-template.directive"', '"./palette-template.directive.js"');
    await writeFile(join(outputRoot, file), declaration);
  }
}

async function assertPartialCompilation() {
  const output = await readFile(join(outputRoot, "index.js"), "utf8");
  if (!output.includes("\u0275\u0275ngDeclareComponent")) {
    throw new Error(
      "Angular output must contain literal partial-Ivy declarations for Angular CLI linker detection"
    );
  }
  if (output.includes("\\u0275\\u0275ngDeclare")) {
    throw new Error("Angular partial-Ivy declaration identifiers must not be ASCII escaped");
  }
}

await rm(temporaryRoot, { recursive: true, force: true });

try {
  run("ngc", ["--project", "tsconfig.angular.json"]);
  run("tsup", ["--config", "tsup.angular.config.ts"]);
  await copyAngularDeclarations();
  await assertPartialCompilation();
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
