import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

interface PackageManifest {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly license?: unknown;
}

interface LicenseDocument {
  readonly name: string;
  readonly content: string;
}

interface PackageNotice {
  readonly key: string;
  readonly name: string;
  readonly version: string;
  readonly declaredLicense: string;
  readonly documents: readonly LicenseDocument[];
}

const require = createRequire(import.meta.url);
const NODE_MODULES_MARKER = "/node_modules/";
const NOTICE_FILENAME = "THIRD_PARTY_NOTICES.txt";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeText(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function packageRootFromModuleId(moduleId: string): string | undefined {
  const normalized = moduleId.replaceAll("\\", "/").replace(/^\0/, "").split("?", 1)[0];
  if (normalized === undefined) return undefined;

  const markerIndex = normalized.lastIndexOf(NODE_MODULES_MARKER);
  if (markerIndex < 0) return undefined;

  const prefix = normalized.slice(0, markerIndex + NODE_MODULES_MARKER.length);
  const segments = normalized.slice(markerIndex + NODE_MODULES_MARKER.length).split("/");
  const first = segments[0];
  if (first === undefined || first.length === 0 || first.startsWith(".")) return undefined;

  const packageSegments = first.startsWith("@") ? segments.slice(0, 2) : [first];
  if (packageSegments.some((segment) => segment === undefined || segment.length === 0)) {
    return undefined;
  }
  return path.normalize(`${prefix}${packageSegments.join("/")}`);
}

function isLicenseDocument(filename: string): boolean {
  const normalized = filename.toLowerCase().replace(/[^a-z]/g, "");
  return (
    normalized.startsWith("license") ||
    normalized.startsWith("licence") ||
    normalized.startsWith("copying") ||
    normalized.startsWith("notice") ||
    normalized.startsWith("thirdpartynotice") ||
    normalized.endsWith("license") ||
    normalized.endsWith("notice")
  );
}

function formatDeclaredLicense(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (value !== undefined) {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) return serialized;
  }
  return "UNSPECIFIED";
}

async function readPackageNotice(packageRoot: string): Promise<PackageNotice> {
  const manifestPath = path.join(packageRoot, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as PackageManifest;
  if (
    typeof manifest.name !== "string" ||
    manifest.name.length === 0 ||
    typeof manifest.version !== "string" ||
    manifest.version.length === 0
  ) {
    throw new Error(`Bundled package has invalid identity metadata: ${manifestPath}`);
  }
  const packageName = manifest.name;
  const packageVersion = manifest.version;

  const entries = await readdir(packageRoot, { withFileTypes: true });
  const documentNames = entries
    .filter((entry) => entry.isFile() && isLicenseDocument(entry.name))
    .map((entry) => entry.name)
    .sort(compareText);
  if (documentNames.length === 0) {
    throw new Error(
      `Bundled package ${manifest.name}@${manifest.version} has no license or notice file.`
    );
  }

  const documents = await Promise.all(
    documentNames.map(async (name): Promise<LicenseDocument> => {
      const content = normalizeText(await readFile(path.join(packageRoot, name), "utf8"));
      if (content.length === 0) {
        throw new Error(`Bundled package ${packageName}@${packageVersion} has an empty ${name}.`);
      }
      return { name, content };
    })
  );

  return {
    key: `${packageName}@${packageVersion}`,
    name: packageName,
    version: packageVersion,
    declaredLicense: formatDeclaredLicense(manifest.license),
    documents
  };
}

function renderPackageNotice(notice: PackageNotice): string {
  return [
    "================================================================================",
    `Package: ${notice.name}@${notice.version}`,
    `Declared license: ${notice.declaredLicense}`,
    "",
    ...notice.documents.flatMap((document) => [
      `----- ${document.name} -----`,
      document.content,
      ""
    ])
  ].join("\n");
}

async function buildNotice(packageRoots: ReadonlySet<string>): Promise<string> {
  const notices = await Promise.all([...packageRoots].sort(compareText).map(readPackageNotice));
  const unique = new Map<string, PackageNotice>();
  for (const notice of notices) {
    const existing = unique.get(notice.key);
    if (existing !== undefined) {
      if (renderPackageNotice(existing) !== renderPackageNotice(notice)) {
        throw new Error(`Bundled package ${notice.key} has conflicting license metadata.`);
      }
      continue;
    }
    unique.set(notice.key, notice);
  }

  const ordered = [...unique.values()].sort((left, right) => compareText(left.key, right.key));
  return `${[
    "Colorwheel — Third-Party Notices",
    "",
    "Generated deterministically from the production demo bundle's module graph.",
    "",
    `Bundled packages: ${ordered.length}`,
    "",
    ...ordered.map(renderPackageNotice)
  ].join("\n")}\n`;
}

export function thirdPartyNoticesPlugin(): Plugin {
  return {
    name: "colorwheel-third-party-notices",
    apply: "build",
    async generateBundle(_options, bundle) {
      const packageRoots = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const moduleId of Object.keys(output.modules)) {
          const packageRoot = packageRootFromModuleId(moduleId);
          if (packageRoot !== undefined) packageRoots.add(packageRoot);
        }
      }

      const viteRoot = packageRootFromModuleId(require.resolve("vite"));
      if (viteRoot === undefined) throw new Error("Could not resolve Vite's package root.");
      packageRoots.add(viteRoot);

      if (packageRoots.size === 0) {
        throw new Error("Production bundle contains no attributable npm packages.");
      }
      this.emitFile({
        type: "asset",
        fileName: NOTICE_FILENAME,
        source: await buildNotice(packageRoots)
      });
    }
  };
}
