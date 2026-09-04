import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { strToU8, zipSync } from "fflate";
import type { Palette } from "../../../src/core";
import { compilePaletteTheme, EMPTY_THEME_COMPILATION } from "./compile";
import type { ThemeBuilderCompilation, ThemeBuilderFile } from "./compile";
import { buildThemeBuilderModel, THEME_TARGETS } from "./model";
import type {
  PreviewProfile,
  PreviewSemanticColors,
  ThemeTargetDefinition,
  ThemeTargetKey
} from "./model";
import "./theme-builder.css";

const THEME_BUILDER_URL = "https://s9rg.github.io/ui-theme-builder/";

interface CompileState {
  readonly requestKey: string | null;
  readonly result: ThemeBuilderCompilation;
}

function PreviewIcon({ name }: { name: "chart" | "grid" | "people" | "search" }) {
  if (name === "chart") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 19V9m5 10V5m5 14v-7m5 7V3" />
      </svg>
    );
  }
  if (name === "grid") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  }
  if (name === "people") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 5a3 3 0 0 1 0 6m1 3a4 4 0 0 1 4 4v2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function ProductPreview({
  colors,
  profile,
  target
}: {
  colors: PreviewSemanticColors;
  profile: PreviewProfile;
  target: ThemeTargetDefinition;
}) {
  const style = {
    "--theme-preview-background": colors.background,
    "--theme-preview-surface": colors.surface,
    "--theme-preview-foreground": colors.foreground,
    "--theme-preview-muted": colors.muted,
    "--theme-preview-primary": colors.primary,
    "--theme-preview-primary-text": colors.primaryText,
    "--theme-preview-accent": colors.accent,
    "--theme-preview-accent-text": colors.accentText,
    "--theme-preview-border": colors.border
  } as CSSProperties;

  return (
    <section className="theme-preview-panel" aria-labelledby="theme-preview-title">
      <div className="theme-preview-heading">
        <div>
          <span>Semantic product preview</span>
          <h3 id="theme-preview-title">Northstar workspace</h3>
        </div>
        <div className="theme-preview-badges" aria-label="Preview context">
          <span>{target.name}</span>
          <span>{profile}</span>
        </div>
      </div>
      <div
        className="theme-product-preview"
        data-preview-style={target.previewStyle}
        style={style}
        aria-hidden="true"
        inert
      >
        <aside className="theme-product-sidebar">
          <div className="theme-product-brand">
            <span>N</span>
            <strong>Northstar</strong>
          </div>
          <div className="theme-product-nav">
            <span className="is-active">
              <PreviewIcon name="grid" /> Overview
            </span>
            <span>
              <PreviewIcon name="chart" /> Analytics
            </span>
            <span>
              <PreviewIcon name="people" /> Customers
            </span>
          </div>
          <div className="theme-product-plan">
            <small>Scale plan</small>
            <strong>18 of 25 seats</strong>
            <span>
              <i />
            </span>
          </div>
        </aside>
        <div className="theme-product-main">
          <header className="theme-product-topbar">
            <div>
              <small>Workspace /</small> <strong>Overview</strong>
            </div>
            <span className="theme-product-search">
              <PreviewIcon name="search" /> Search
            </span>
            <span className="theme-product-avatar">SP</span>
          </header>
          <div className="theme-product-content">
            <div className="theme-product-title">
              <div>
                <small>Friday, September 4</small>
                <strong>Good afternoon, Sergii.</strong>
              </div>
              <span>New report</span>
            </div>
            <div className="theme-metric-grid">
              <div>
                <small>Monthly revenue</small>
                <strong>$84,240</strong>
                <span>+12.4%</span>
              </div>
              <div>
                <small>Active customers</small>
                <strong>2,481</strong>
                <span>+8.1%</span>
              </div>
              <div>
                <small>Conversion</small>
                <strong>6.82%</strong>
                <span>+1.7%</span>
              </div>
            </div>
            <div className="theme-product-detail-grid">
              <div className="theme-chart-card">
                <div>
                  <strong>Revenue trend</strong>
                  <small>Last 8 weeks</small>
                </div>
                <div className="theme-chart-bars">
                  {[38, 52, 46, 66, 58, 76, 69, 91].map((height, index) => (
                    <span key={index} style={{ "--bar-height": `${height}%` } as CSSProperties} />
                  ))}
                </div>
              </div>
              <div className="theme-activity-card">
                <div>
                  <strong>Recent activity</strong>
                  <small>Live</small>
                </div>
                <p>
                  <span>JL</span>
                  <span>
                    <strong>Q3 report published</strong>
                    <small>8 minutes ago</small>
                  </span>
                </p>
                <p>
                  <span>MO</span>
                  <span>
                    <strong>Four accounts added</strong>
                    <small>32 minutes ago</small>
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="theme-preview-note">
        The preview applies the explicit semantic mapping. Generated provider source is not
        evaluated in this page.
      </p>
    </section>
  );
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadThemeBundle(files: readonly ThemeBuilderFile[], target: ThemeTargetKey): void {
  const entries = Object.fromEntries(files.map((file) => [file.path, strToU8(file.content)]));
  const archive = zipSync(entries, { level: 6 });
  const bytes = new Uint8Array(archive.byteLength);
  bytes.set(archive);
  triggerDownload(new Blob([bytes], { type: "application/zip" }), `colorwheel-theme-${target}.zip`);
}

function diagnosticPath(file: ThemeBuilderCompilation["diagnostics"][number]): string {
  return file.path === undefined ? "" : ` · ${file.path.join(".")}`;
}

export function ThemeBuilderSection({ palette }: { palette: Palette }) {
  const [targetKey, setTargetKey] = useState<ThemeTargetKey>("css");
  const [profile, setProfile] = useState<PreviewProfile>("light");
  const [requestedFile, setRequestedFile] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState({ requestKey: "", message: "" });
  const [compileState, setCompileState] = useState<CompileState>({
    requestKey: null,
    result: EMPTY_THEME_COMPILATION
  });
  const model = useMemo(() => buildThemeBuilderModel(palette), [palette]);
  const target = THEME_TARGETS.find((candidate) => candidate.key === targetKey) ?? THEME_TARGETS[0];
  const requestKey = useMemo(() => JSON.stringify({ palette, targetKey }), [palette, targetKey]);

  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void compilePaletteTheme(palette, targetKey, controller.signal).then((result) => {
        if (current && !controller.signal.aborted) {
          setCompileState({ requestKey, result });
        }
      });
    }, 120);

    return () => {
      current = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [palette, requestKey, targetKey]);

  const isCompiling = compileState.requestKey !== requestKey;
  const compilation = isCompiling ? EMPTY_THEME_COMPILATION : compileState.result;
  const activeFile =
    compilation.files.find((file) => file.path === requestedFile) ?? compilation.files[0];
  const errorCount = compilation.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  ).length;
  const warningCount = compilation.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning"
  ).length;

  async function copyActiveFile(): Promise<void> {
    if (activeFile === undefined) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopyStatus({ requestKey, message: `${activeFile.path} copied.` });
    } catch {
      setCopyStatus({
        requestKey,
        message: "Copy failed. Select the generated code and copy it manually."
      });
    }
  }

  return (
    <section
      id="themes"
      className="content-section doc-section theme-builder-section"
      aria-labelledby="themes-title"
    >
      <div className="section-intro">
        <p className="eyebrow">Theme builder</p>
        <h2 id="themes-title">Turn this palette into a UI theme.</h2>
        <p>
          Use the live Colorwheel palette above, choose a target, then inspect and download the
          deterministic theme files.
        </p>
      </div>

      <div className="theme-builder-shell" aria-busy={isCompiling}>
        <aside className="theme-builder-controls" aria-labelledby="theme-controls-title">
          <div className="theme-builder-controls-heading">
            <p className="eyebrow">Current palette</p>
            <h3 id="theme-controls-title">{palette.name ?? "Untitled palette"}</h3>
            <a href="#examples">Edit colors in the example ↑</a>
          </div>

          <ul className="theme-builder-swatches" aria-label="Current palette colors">
            {model.swatches.map((swatch) => (
              <li key={swatch.id} title={`${swatch.name}: ${swatch.color}`}>
                <span
                  style={{ "--theme-swatch": swatch.color } as CSSProperties}
                  aria-hidden="true"
                />
                <span className="visually-hidden">
                  {swatch.name}, {swatch.color}
                </span>
              </li>
            ))}
          </ul>

          <label className="theme-builder-field">
            <span>Theme target</span>
            <select
              value={targetKey}
              onChange={(event) => setTargetKey(event.currentTarget.value as ThemeTargetKey)}
            >
              {THEME_TARGETS.map((candidate) => (
                <option key={candidate.key} value={candidate.key}>
                  {candidate.name} — {candidate.version}
                </option>
              ))}
            </select>
          </label>
          <p className="theme-target-description">
            <span>{target.artifact}</span> {target.description}
          </p>

          <div className="theme-profile-control" role="group" aria-label="Preview scheme">
            {(["light", "dark"] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                aria-pressed={profile === candidate}
                onClick={() => setProfile(candidate)}
              >
                {candidate === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>

          <div
            className="theme-build-status"
            id="theme-builder-status"
            role="status"
            aria-live="polite"
          >
            <span data-state={isCompiling ? "working" : compilation.ok ? "ready" : "failed"} />
            {isCompiling
              ? `Compiling ${target.name}…`
              : compilation.ok
                ? `${compilation.files.length} files ready`
                : "No files ready"}
          </div>

          <button
            type="button"
            className="theme-download-button"
            disabled={isCompiling || compilation.files.length === 0}
            aria-describedby="theme-builder-status"
            onClick={() => downloadThemeBundle(compilation.files, targetKey)}
          >
            <span aria-hidden="true">↓</span> Download theme
          </button>

          <a className="theme-builder-full-link" href={THEME_BUILDER_URL}>
            Open the full UI Theme Builder <span aria-hidden="true">↗</span>
          </a>
        </aside>

        <div className="theme-builder-results">
          <ProductPreview colors={model.previews[profile]} profile={profile} target={target} />

          <section className="theme-code-panel" aria-labelledby="theme-code-title">
            <div className="theme-code-heading">
              <div>
                <span>Generated code</span>
                <h3 id="theme-code-title">{target.name} files</h3>
              </div>
              <button
                type="button"
                disabled={activeFile === undefined}
                onClick={() => void copyActiveFile()}
              >
                Copy code
              </button>
            </div>

            {activeFile === undefined ? (
              <div className="theme-code-empty">
                {isCompiling ? "Generating theme files…" : "No code was generated."}
              </div>
            ) : (
              <>
                <label className="theme-file-picker">
                  <span>Generated file</span>
                  <select
                    value={activeFile.path}
                    onChange={(event) => setRequestedFile(event.currentTarget.value)}
                  >
                    {compilation.files.map((file) => (
                      <option key={file.path} value={file.path}>
                        {file.path}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="theme-code-meta">
                  <span>{activeFile.mediaType}</span>
                  <span>{activeFile.adapterId}</span>
                </div>
                <pre tabIndex={0} aria-label={`Generated ${activeFile.path}`}>
                  <code data-testid="theme-builder-output">{activeFile.content}</code>
                </pre>
              </>
            )}
            <p className="visually-hidden" role="status" aria-live="polite">
              {copyStatus.requestKey === requestKey ? copyStatus.message : ""}
            </p>
          </section>

          <section className="theme-diagnostics" aria-labelledby="theme-diagnostics-title">
            <div>
              <span>Compiler diagnostics</span>
              <h3 id="theme-diagnostics-title">
                {isCompiling
                  ? "Checking generated files"
                  : errorCount > 0
                    ? `${errorCount} error${errorCount === 1 ? "" : "s"}`
                    : warningCount > 0
                      ? `${warningCount} warning${warningCount === 1 ? "" : "s"}`
                      : "Ready to use"}
              </h3>
            </div>
            {isCompiling ? (
              <p>Compiler checks will appear when this build finishes.</p>
            ) : compilation.diagnostics.length === 0 ? (
              <p>No compiler diagnostics for this target.</p>
            ) : (
              <ul aria-live="polite">
                {compilation.diagnostics.map((diagnostic, index) => (
                  <li key={`${diagnostic.code}-${index}`} data-severity={diagnostic.severity}>
                    <strong>{diagnostic.code}</strong>
                    <span>
                      {diagnostic.message}
                      {diagnosticPath(diagnostic)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
