import { compileTheme, createThemeProject } from "@s9rg/theme-compiler";
import type { ThemeAdapter, ThemeDiagnostic, ThemeScheme } from "@s9rg/theme-compiler";
import type { Palette } from "../../../src/core";
import { buildThemeBuilderModel } from "./model";
import type { ThemeTargetKey } from "./model";

export interface ThemeBuilderFile {
  readonly path: string;
  readonly mediaType: string;
  readonly content: string;
  readonly adapterId: string;
}

export interface ThemeBuilderCompilation {
  readonly ok: boolean;
  readonly files: readonly ThemeBuilderFile[];
  readonly diagnostics: readonly ThemeDiagnostic[];
  readonly adapterId?: string;
}

export const EMPTY_THEME_COMPILATION: ThemeBuilderCompilation = {
  ok: false,
  files: [],
  diagnostics: []
};

const adapterFactories: Readonly<Record<ThemeTargetKey, () => Promise<ThemeAdapter>>> = {
  css: async () => (await import("@s9rg/theme-adapter-css")).createCssAdapter(),
  tailwind: async () => (await import("@s9rg/theme-adapter-tailwind")).createTailwindAdapter(),
  mui: async () => (await import("@s9rg/theme-adapter-mui")).createMuiAdapter(),
  dtcg: async () => (await import("@s9rg/theme-adapter-dtcg")).createDtcgAdapter(),
  antd: async () => (await import("@s9rg/theme-adapter-antd")).createAntdAdapter(),
  shadcn: async () => (await import("@s9rg/theme-adapter-shadcn")).createShadcnAdapter(),
  daisyui: async () => (await import("@s9rg/theme-adapter-daisyui")).createDaisyUiAdapter(),
  vuetify: async () => (await import("@s9rg/theme-adapter-vuetify")).createVuetifyAdapter(),
  "angular-material": async () =>
    (await import("@s9rg/theme-adapter-angular-material")).createAngularMaterialAdapter(),
  ionic: async () => (await import("@s9rg/theme-adapter-ionic")).createIonicAdapter(),
  "react-native-paper": async () =>
    (await import("@s9rg/theme-adapter-react-native-paper")).createReactNativePaperAdapter()
};

function schemeForAdapter(scheme: ThemeScheme, adapter: ThemeAdapter): ThemeScheme {
  const supported = adapter.manifest.capabilities.roles.supported;
  if (supported === "any") return scheme;
  const allowed = new Set<string>(supported);
  return {
    ...scheme,
    roles: Object.fromEntries(Object.entries(scheme.roles).filter(([role]) => allowed.has(role)))
  };
}

function failureDiagnostic(error: unknown, signal?: AbortSignal): ThemeDiagnostic {
  if (signal?.aborted === true) {
    return {
      severity: "info",
      code: "theme-builder.compile-aborted",
      message: "The previous theme compilation was superseded by a newer request."
    };
  }
  return {
    severity: "error",
    code: "theme-builder.compile-failed",
    message: error instanceof Error ? error.message : "Theme compilation failed."
  };
}

/** Compile the current Colorwheel palette through exactly one lazily loaded target adapter. */
export async function compilePaletteTheme(
  palette: Palette,
  target: ThemeTargetKey,
  signal?: AbortSignal
): Promise<ThemeBuilderCompilation> {
  try {
    signal?.throwIfAborted();
    const adapter = await adapterFactories[target]();
    signal?.throwIfAborted();
    const model = buildThemeBuilderModel(palette);
    const schemes = [
      schemeForAdapter(model.schemes.light, adapter),
      schemeForAdapter(model.schemes.dark, adapter)
    ];
    const project = createThemeProject(model.primitives, {
      id: "colorwheel-demo-theme",
      name: palette.name ?? "Colorwheel theme",
      schemes
    });
    const result = await compileTheme(project, [adapter], {
      ...(signal === undefined ? {} : { signal })
    });

    if (!result.ok) {
      return {
        ok: false,
        files: [],
        diagnostics: result.diagnostics,
        adapterId: adapter.manifest.id
      };
    }

    return {
      ok: true,
      files: result.artifacts.map((artifact) => ({
        path: artifact.path,
        mediaType: artifact.mediaType,
        content: artifact.content,
        adapterId: artifact.adapterId
      })),
      diagnostics: result.diagnostics,
      adapterId: adapter.manifest.id
    };
  } catch (error) {
    return {
      ok: false,
      files: [],
      diagnostics: [failureDiagnostic(error, signal)]
    };
  }
}
