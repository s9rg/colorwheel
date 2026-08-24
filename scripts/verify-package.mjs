import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { transformAsync } from "@babel/core";
import angularLinker from "@angular/compiler-cli/linker/babel";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const fixtureRoot = join(projectRoot, "test");
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const tscExecutable = join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc"
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    ...options
  });

  if (result.status !== 0) {
    const renderedCommand = [command, ...args].join(" ");
    throw new Error(
      [
        `Command failed (${String(result.status)}): ${renderedCommand}`,
        result.stdout.trim(),
        result.stderr.trim()
      ]
        .filter(Boolean)
        .join("\n\n")
    );
  }
  return result.stdout;
}

function packagePath(packageName) {
  return join(projectRoot, "node_modules", ...packageName.split("/"));
}

function consumerPackagePath(consumerRoot, packageName) {
  return join(consumerRoot, "node_modules", ...packageName.split("/"));
}

async function linkDevelopmentDependency(consumerRoot, packageName) {
  const source = packagePath(packageName);
  if (!existsSync(source)) return;

  const destination = join(consumerRoot, "node_modules", ...packageName.split("/"));
  await mkdir(dirname(destination), { recursive: true });
  await symlink(source, destination, process.platform === "win32" ? "junction" : "dir");
}

async function copyFixture(sourceRelativePath, destination) {
  const source = join(fixtureRoot, sourceRelativePath);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}

function assertConditionalEntry(entry, subpath) {
  assert.equal(typeof entry, "object", `${subpath} must use conditional exports`);
  assert.equal(typeof entry.import, "object", `${subpath} needs an import condition`);
  assert.equal(typeof entry.require, "object", `${subpath} needs a require condition`);
  assert.match(entry.import.types, /\.d\.ts$/, `${subpath} import types must be ESM declarations`);
  assert.match(entry.import.default, /\.js$/, `${subpath} import target must be ESM`);
  assert.match(
    entry.require.types,
    /\.d\.cts$/,
    `${subpath} require types must be CommonJS declarations`
  );
  assert.match(entry.require.default, /\.cjs$/, `${subpath} require target must be CommonJS`);
}

function assertEsmEntry(entry, subpath) {
  assert.equal(typeof entry, "object", `${subpath} must use an export map`);
  assert.match(entry.types, /\.d\.ts$/, `${subpath} types must be ESM declarations`);
  assert.match(entry.default, /\.js$/, `${subpath} default target must be ESM`);
  assert.equal("require" in entry, false, `${subpath} must not expose raw partial-Ivy as CommonJS`);
}

function collectExportTargets(value, targets = []) {
  if (typeof value === "string") {
    targets.push(value);
    return targets;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((nested) => collectExportTargets(nested, targets));
  }
  return targets;
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "colorwheel-package-"));

try {
  const packDirectory = join(temporaryRoot, "pack");
  await mkdir(packDirectory);
  const packOutput = run(
    npmExecutable,
    ["pack", "--json", "--ignore-scripts", "--pack-destination", packDirectory],
    { cwd: projectRoot }
  );
  const packResults = JSON.parse(packOutput);
  assert.equal(packResults.length, 1, "npm pack should produce exactly one tarball");

  const packResult = packResults[0];
  const tarballPath = resolve(packDirectory, packResult.filename);
  assert.ok(
    tarballPath.startsWith(`${resolve(packDirectory)}${sep}`),
    "npm returned a tarball outside the temporary pack directory"
  );
  assert.ok(existsSync(tarballPath), "npm pack did not create the reported tarball");

  const packedFiles = new Set(packResult.files.map((file) => file.path));
  const requiredFiles = [
    "CHANGELOG.md",
    "CODE_OF_CONDUCT.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "README.md",
    "SECURITY.md",
    "docs/API.md",
    "docs/CUSTOMIZATION.md",
    "docs/PLAN.md",
    "docs/RELEASE_CHECKLIST.md",
    "docs/RESEARCH.md",
    "docs/RFC-0001-public-api.md",
    "dist/index.cjs",
    "dist/index.d.cts",
    "dist/index.d.ts",
    "dist/index.js",
    "dist/angular/colorwheel.component.d.ts",
    "dist/angular/index.d.ts",
    "dist/angular/index.js",
    "dist/angular/palette-template.directive.d.ts",
    "dist/react-native/index.d.cts",
    "dist/react-native/index.d.ts",
    "dist/react-native/index.js",
    "dist/styles.css",
    "dist/styles.css.d.ts",
    "dist/vue/index.d.cts",
    "dist/vue/index.d.ts",
    "dist/vue/index.js",
    "package.json"
  ];
  requiredFiles.forEach((file) => {
    assert.ok(packedFiles.has(file), `packed artifact is missing ${file}`);
  });

  for (const file of packedFiles) {
    assert.ok(
      file === "package.json" ||
        file === "README.md" ||
        file === "CHANGELOG.md" ||
        file === "CODE_OF_CONDUCT.md" ||
        file === "CONTRIBUTING.md" ||
        file === "LICENSE" ||
        file === "SECURITY.md" ||
        file === "docs/API.md" ||
        file === "docs/CUSTOMIZATION.md" ||
        file === "docs/PLAN.md" ||
        file === "docs/RELEASE_CHECKLIST.md" ||
        file === "docs/RESEARCH.md" ||
        file === "docs/RFC-0001-public-api.md" ||
        file.startsWith("dist/"),
      `unexpected file in packed artifact: ${file}`
    );
    assert.equal(file.startsWith("dist/demo/"), false, `demo leaked into packed artifact: ${file}`);
    assert.equal(file.includes("/test/"), false, `tests leaked into packed artifact: ${file}`);
    assert.equal(file.includes("/src/"), false, `sources leaked into packed artifact: ${file}`);
  }

  const consumerRoot = join(temporaryRoot, "consumer");
  await mkdir(consumerRoot);
  await writeFile(
    join(consumerRoot, "package.json"),
    `${JSON.stringify({ name: "colorwheel-package-consumer", private: true, type: "module" }, null, 2)}\n`
  );
  run(
    npmExecutable,
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--omit=optional",
      "--omit=peer",
      tarballPath
    ],
    { cwd: consumerRoot }
  );

  const installedPackageRoot = join(consumerRoot, "node_modules", "@s9rg", "colorwheel");
  const installedManifest = JSON.parse(
    await readFile(join(installedPackageRoot, "package.json"), "utf8")
  );
  assert.equal(installedManifest.name, "@s9rg/colorwheel");
  assert.match(
    installedManifest.version,
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:[-+].+)?$/
  );
  assert.notEqual(installedManifest.version, "0.0.0", "release package needs a real version");
  assert.equal(installedManifest.private, undefined, "release package cannot be private");
  assert.equal(installedManifest.sideEffects[0], "**/*.css");
  assert.equal(installedManifest.peerDependencies["@angular/core"], "^21.0.0");
  assert.equal(installedManifest.peerDependencies.react, "^18.2.0 || ^19.0.0");
  assert.equal(installedManifest.peerDependencies["react-dom"], "^18.2.0 || ^19.0.0");
  assert.equal(installedManifest.peerDependencies["react-native"], ">=0.76.0 <1");
  assert.equal(installedManifest.peerDependencies["react-native-svg"], "^15.8.0");
  assert.equal(installedManifest.peerDependencies.vue, "^3.3.0");
  assert.equal(installedManifest.peerDependenciesMeta["@angular/core"].optional, true);
  assert.equal(installedManifest.peerDependenciesMeta.react.optional, true);
  assert.equal(installedManifest.peerDependenciesMeta["react-dom"].optional, true);
  assert.equal(installedManifest.peerDependenciesMeta["react-native"].optional, true);
  assert.equal(installedManifest.peerDependenciesMeta["react-native-svg"].optional, true);
  assert.equal(installedManifest.peerDependenciesMeta.vue.optional, true);
  assert.equal(installedManifest.publishConfig.access, "public");
  assert.equal(installedManifest.publishConfig.registry, "https://registry.npmjs.org/");
  assert.equal(
    installedManifest.dependencies,
    undefined,
    "package must not gain runtime dependencies"
  );

  const JavaScriptEntryPoints = [
    ".",
    "./core",
    "./editor",
    "./dom",
    "./vanilla",
    "./react",
    "./vue",
    "./react-native"
  ];
  JavaScriptEntryPoints.forEach((subpath) =>
    assertConditionalEntry(installedManifest.exports[subpath], subpath)
  );
  assertEsmEntry(installedManifest.exports["./angular"], "./angular");
  assert.equal(installedManifest.exports["./styles.css"].types, "./dist/styles.css.d.ts");
  assert.equal(installedManifest.exports["./styles.css"].default, "./dist/styles.css");
  assert.equal(installedManifest.exports["./package.json"], "./package.json");

  for (const target of collectExportTargets(installedManifest.exports)) {
    assert.ok(target.startsWith("./"), `export target must be package-relative: ${target}`);
    const absoluteTarget = resolve(installedPackageRoot, target);
    assert.ok(
      absoluteTarget.startsWith(`${resolve(installedPackageRoot)}${sep}`),
      `export target escapes the package: ${target}`
    );
    assert.ok(existsSync(absoluteTarget), `export target does not exist: ${target}`);
  }

  assert.equal(
    existsSync(join(consumerRoot, "node_modules", "react")),
    false,
    "framework-neutral install unexpectedly installed React"
  );
  assert.equal(
    existsSync(join(consumerRoot, "node_modules", "react-dom")),
    false,
    "framework-neutral install unexpectedly installed React DOM"
  );
  for (const packageName of ["@angular/core", "react-native", "react-native-svg", "vue"]) {
    assert.equal(
      existsSync(consumerPackagePath(consumerRoot, packageName)),
      false,
      `framework-neutral install unexpectedly installed ${packageName}`
    );
  }

  const angularOutput = await readFile(join(installedPackageRoot, "dist/angular/index.js"), "utf8");
  assert.ok(
    angularOutput.includes("ɵɵngDeclareComponent") ||
      angularOutput.includes("\\u0275\\u0275ngDeclareComponent"),
    "Angular entry point must contain partial-Ivy declarations"
  );
  const linkedAngular = await transformAsync(angularOutput, {
    babelrc: false,
    compact: false,
    configFile: false,
    filename: join(installedPackageRoot, "dist/angular/index.js"),
    plugins: [angularLinker],
    sourceType: "module"
  });
  assert.ok(linkedAngular?.code, "Angular linker did not emit JavaScript");
  assert.ok(
    linkedAngular.code.includes("ɵɵdefineComponent") ||
      linkedAngular.code.includes("\\u0275\\u0275defineComponent"),
    "Angular linker did not produce full-Ivy component definitions"
  );
  assert.equal(
    linkedAngular.code.includes("ngDeclareComponent"),
    false,
    "Angular linker left partial component declarations unresolved"
  );

  await copyFixture("package/runtime-esm.mjs", join(consumerRoot, "runtime-esm.mjs"));
  await copyFixture("package/runtime-cjs.cjs", join(consumerRoot, "runtime-cjs.cjs"));
  run(process.execPath, ["runtime-esm.mjs"], { cwd: consumerRoot });
  run(process.execPath, ["runtime-cjs.cjs"], { cwd: consumerRoot });

  const reactDependencies = [
    "react",
    "react-dom",
    "scheduler",
    "@types/react",
    "@types/react-dom",
    "csstype"
  ];
  for (const packageName of reactDependencies) {
    await linkDevelopmentDependency(consumerRoot, packageName);
  }
  for (const packageName of ["vue", "@angular/core", "rxjs", "react-native", "react-native-svg"]) {
    await linkDevelopmentDependency(consumerRoot, packageName);
  }
  await writeFile(join(installedPackageRoot, "dist/angular/index.js"), linkedAngular.code);
  await copyFixture(
    "package/runtime-angular-linked-esm.mjs",
    join(consumerRoot, "runtime-angular-linked-esm.mjs")
  );
  run(process.execPath, ["runtime-angular-linked-esm.mjs"], { cwd: consumerRoot });
  const installedReact19Manifest = JSON.parse(
    await readFile(join(consumerRoot, "node_modules", "react", "package.json"), "utf8")
  );
  assert.match(
    installedReact19Manifest.version,
    /^19\./,
    "the development consumer must exercise React 19"
  );

  await copyFixture("package/runtime-react-esm.mjs", join(consumerRoot, "runtime-react-esm.mjs"));
  await copyFixture("package/runtime-react-cjs.cjs", join(consumerRoot, "runtime-react-cjs.cjs"));
  run(process.execPath, ["runtime-react-esm.mjs"], { cwd: consumerRoot });
  run(process.execPath, ["runtime-react-cjs.cjs"], { cwd: consumerRoot });

  const react18ConsumerRoot = join(temporaryRoot, "react-18-consumer");
  await mkdir(react18ConsumerRoot);
  await writeFile(
    join(react18ConsumerRoot, "package.json"),
    `${JSON.stringify({ name: "colorwheel-react-18-consumer", private: true, type: "module" }, null, 2)}\n`
  );
  run(
    npmExecutable,
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      tarballPath,
      "react@18.2.0",
      "react-dom@18.2.0"
    ],
    { cwd: react18ConsumerRoot }
  );
  const installedReact18Manifest = JSON.parse(
    await readFile(join(react18ConsumerRoot, "node_modules", "react", "package.json"), "utf8")
  );
  assert.equal(installedReact18Manifest.version, "18.2.0");
  await copyFixture(
    "package/runtime-react-esm.mjs",
    join(react18ConsumerRoot, "runtime-react-esm.mjs")
  );
  await copyFixture(
    "package/runtime-react-cjs.cjs",
    join(react18ConsumerRoot, "runtime-react-cjs.cjs")
  );
  run(process.execPath, ["runtime-react-esm.mjs"], { cwd: react18ConsumerRoot });
  run(process.execPath, ["runtime-react-cjs.cjs"], { cwd: react18ConsumerRoot });

  const typeFixtureRoot = join(consumerRoot, "type-fixtures");
  for (const fixture of ["bundler", "nodenext", "react", "vue", "angular", "react-native"]) {
    const fixtureDirectory = join(typeFixtureRoot, fixture);
    await copyFixture(`types/${fixture}`, fixtureDirectory);
    run(tscExecutable, ["--project", join(fixtureDirectory, "tsconfig.json")], {
      cwd: fixtureDirectory
    });
  }

  const packageSize = Number(packResult.size);
  assert.ok(
    Number.isFinite(packageSize) && packageSize > 0,
    "npm reported an invalid package size"
  );
  console.log(
    `Packed package verification passed (${packedFiles.size} files, ${Math.ceil(packageSize / 1024)} KiB tarball).`
  );
} finally {
  const relativeTemporaryRoot = relative(tmpdir(), temporaryRoot);
  if (
    relativeTemporaryRoot.startsWith("colorwheel-package-") &&
    !relativeTemporaryRoot.includes(sep)
  ) {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
