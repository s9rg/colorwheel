import { Fragment, useCallback, useEffect, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { analyzePalette } from "../core";
import type {
  AnalysisOptions,
  JsonObject,
  Palette,
  PaletteAnalysis,
  PaletteDiagnostic
} from "../core";
import { usePickerController } from "./context";

export type AnalysisSchedule = "live" | "commit" | "manual";

function inferredContrastPairs<Metadata extends object>(
  palette: Palette<Metadata>
): AnalysisOptions["contrastPairs"] {
  const foreground = palette.colors.find((entry) =>
    ["foreground", "text", "on-background"].includes(entry.role?.toLowerCase() ?? "")
  );
  const background = palette.colors.find((entry) =>
    ["background", "surface", "canvas"].includes(entry.role?.toLowerCase() ?? "")
  );
  return foreground !== undefined && background !== undefined
    ? [
        {
          foregroundId: foreground.id,
          backgroundId: background.id,
          usage: "normal-text" as const,
          level: "AA" as const
        }
      ]
    : undefined;
}

function defaultAnalyze<Metadata extends object>(palette: Palette<Metadata>): PaletteAnalysis {
  return analyzePalette(palette, {
    outputGamut: "srgb",
    includeGamut: true,
    includePerceptualDistance: true,
    contrastPairs: inferredContrastPairs(palette)
  });
}

function useScheduledAnalysis<Metadata extends object>(
  analyze: (palette: Palette<Metadata>) => PaletteAnalysis,
  schedule: AnalysisSchedule,
  enabled: boolean
): readonly [PaletteAnalysis, () => void] {
  const controller = usePickerController<Metadata>();
  const analysisKey = useMemo(
    () => ({ analyze, controller, enabled, schedule }),
    [analyze, controller, enabled, schedule]
  );
  const baseline = useMemo<{
    readonly key: object;
    readonly value: PaletteAnalysis;
  }>(
    () => ({
      key: analysisKey,
      value: enabled ? analyze(controller.getPalette()) : { diagnostics: [] }
    }),
    [analysisKey, analyze, controller, enabled]
  );
  const [computed, setComputed] = useState<{
    readonly key: object;
    readonly value: PaletteAnalysis;
  } | null>(null);

  const analysis = computed?.key === analysisKey ? computed.value : baseline.value;

  const refresh = useCallback(() => {
    setComputed({ key: analysisKey, value: analyze(controller.getPalette()) });
  }, [analysisKey, analyze, controller]);

  useEffect(() => {
    if (!enabled || schedule === "manual") return;
    return controller.subscribe(
      (state) => state.palette,
      (palette, meta) => {
        if (schedule === "live" || meta.phase === "commit") {
          setComputed({ key: analysisKey, value: analyze(palette) });
        }
      }
    );
  }, [analysisKey, analyze, controller, enabled, schedule]);

  return [analysis, refresh];
}

function diagnosticMessage(diagnostic: PaletteDiagnostic): string {
  const parameters = diagnostic.messageParameters ?? {};
  switch (diagnostic.messageKey) {
    case "palette.gamut.outside": {
      const gamut = typeof parameters.gamut === "string" ? parameters.gamut : "the selected gamut";
      return `A color is outside ${gamut} and will be mapped.`;
    }
    case "palette.difference.insufficient": {
      const distance = parameters.distance;
      return `Two colors may be difficult to distinguish${typeof distance === "number" ? ` (distance ${distance.toFixed(3)})` : ""}.`;
    }
    case "palette.contrast.insufficient": {
      const ratio = parameters.ratio;
      const minimum = parameters.minimum;
      return `Declared foreground and background contrast is ${typeof ratio === "number" ? ratio.toFixed(2) : "below target"}:1${typeof minimum === "number" ? `; target ${minimum}:1` : ""}.`;
    }
    case "palette.contrast.missingColor":
      return "A declared contrast pair refers to a color that is not in the palette.";
    default:
      return diagnostic.messageKey;
  }
}

export interface DiagnosticItemProps {
  readonly diagnostic: PaletteDiagnostic;
}

export function DiagnosticItem({ diagnostic }: DiagnosticItemProps) {
  return (
    <li data-part="diagnostic" data-severity={diagnostic.severity} data-rule-id={diagnostic.ruleId}>
      <span data-part="diagnostic-severity">{diagnostic.severity}</span>
      <span>{diagnosticMessage(diagnostic)}</span>
      {diagnostic.colorIds && diagnostic.colorIds.length > 0 ? (
        <code data-part="diagnostic-colors">{diagnostic.colorIds.join(", ")}</code>
      ) : null}
    </li>
  );
}

export interface DiagnosticsBlockProps<Metadata extends object = JsonObject> {
  readonly title?: ReactNode;
  readonly schedule?: AnalysisSchedule;
  readonly analysis?: PaletteAnalysis;
  readonly analyze?: (palette: Palette<Metadata>) => PaletteAnalysis;
  readonly renderDiagnostic?: (diagnostic: PaletteDiagnostic, defaultItem: ReactNode) => ReactNode;
  readonly emptyMessage?: ReactNode;
}

export function DiagnosticsBlock<Metadata extends object = JsonObject>({
  title = "Palette checks",
  schedule = "commit",
  analysis: suppliedAnalysis,
  analyze = defaultAnalyze,
  renderDiagnostic,
  emptyMessage = "No built-in warnings for the checks run. Review the palette in its real content and context."
}: DiagnosticsBlockProps<Metadata>) {
  const titleId = useId();
  const stableAnalyze = useMemo(() => analyze, [analyze]);
  const [computedAnalysis, refresh] = useScheduledAnalysis<Metadata>(
    stableAnalyze,
    schedule,
    suppliedAnalysis === undefined
  );
  const analysis = suppliedAnalysis ?? computedAnalysis;

  return (
    <section data-part="diagnostics" aria-labelledby={titleId}>
      <header data-part="block-header">
        <div>
          <h2 id={titleId} data-part="block-title">
            {title}
          </h2>
          <p data-part="block-description">
            Measurements are signals, not a universal palette quality score.
          </p>
        </div>
        {schedule === "manual" && suppliedAnalysis === undefined ? (
          <button type="button" data-part="secondary-button" onClick={refresh}>
            Run checks
          </button>
        ) : null}
      </header>

      {analysis.diagnostics.length === 0 ? (
        <p data-part="diagnostic-empty">{emptyMessage}</p>
      ) : (
        <ul data-part="diagnostic-list" aria-live="polite">
          {analysis.diagnostics.map((diagnostic, index) => {
            const defaultItem = (
              <DiagnosticItem
                key={`${diagnostic.ruleId}-${diagnostic.colorIds?.join("-") ?? index}`}
                diagnostic={diagnostic}
              />
            );
            const key = `${diagnostic.ruleId}-${diagnostic.colorIds?.join("-") ?? index}`;
            return (
              <Fragment key={key}>
                {renderDiagnostic?.(diagnostic, defaultItem) ?? defaultItem}
              </Fragment>
            );
          })}
        </ul>
      )}
    </section>
  );
}
