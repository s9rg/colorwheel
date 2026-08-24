import type { ApplicationRef, ComponentRef } from "@angular/core";
import { useEffect, useRef, useState } from "react";
import { createApp, defineComponent, h, shallowRef } from "vue";
import type { App as VueApp, ShallowRef } from "vue";
import type { Palette } from "../../src/core";
import type { ColorwheelComponent } from "../../src/angular";
import { Colorwheel as VueColorwheel } from "../../src/vue";

interface NativePreviewProps {
  readonly palette: Palette;
  readonly onPaletteChange: (palette: Palette) => void;
}

const blockProps = {
  wheel: {
    description: "Move a handle for hue and saturation, or use the outer value ring.",
    showChannelRing: true,
    showInstructions: false,
    showChannels: false
  },
  palette: {
    description: "Select a swatch or enter a color value.",
    showName: false,
    showActions: false,
    allowAdd: false
  }
} as const;

function interactionFor(palette: Palette): "free" | "linked" {
  return palette.kind === "tonal" ? "free" : "linked";
}

export function VuePreview({ palette, onPaletteChange }: NativePreviewProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const vueApp = useRef<VueApp<Element> | null>(null);
  const vuePalette = useRef<ShallowRef<Palette> | null>(null);
  const initialPalette = useRef(palette);
  const onPaletteChangeRef = useRef(onPaletteChange);

  useEffect(() => {
    onPaletteChangeRef.current = onPaletteChange;
  }, [onPaletteChange]);

  useEffect(() => {
    const container = host.current;
    if (container === null) return;

    const paletteState = shallowRef(initialPalette.current);
    vuePalette.current = paletteState;
    const app = createApp(
      defineComponent({
        name: "ColorwheelVueDemo",
        setup() {
          return () =>
            h(VueColorwheel, {
              palette: paletteState.value,
              wheel: { interaction: interactionFor(paletteState.value) },
              className: "demo-picker compact-picker vue-picker",
              ariaLabel: "Vue Colorwheel example",
              blockProps,
              "onUpdate:palette": (next: Palette) => onPaletteChangeRef.current(next)
            });
        }
      })
    );
    vueApp.current = app;
    app.mount(container);

    return () => {
      vuePalette.current = null;
      vueApp.current = null;
      app.unmount();
    };
  }, []);

  useEffect(() => {
    if (vuePalette.current !== null) vuePalette.current.value = palette;
  }, [palette]);

  return (
    <div className="framework-preview" data-testid="vue-studio">
      <div ref={host} />
    </div>
  );
}

interface AngularMount {
  readonly application: ApplicationRef;
  readonly component: ComponentRef<ColorwheelComponent<object>>;
  readonly unsubscribe: () => void;
}

export function AngularPreview({ palette, onPaletteChange }: NativePreviewProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const mount = useRef<AngularMount | null>(null);
  const paletteRef = useRef(palette);
  const onPaletteChangeRef = useRef(onPaletteChange);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onPaletteChangeRef.current = onPaletteChange;
  }, [onPaletteChange]);

  useEffect(() => {
    const container = host.current;
    if (container === null) return;
    let cancelled = false;
    let pendingApplication: ApplicationRef | null = null;
    let pendingComponent: ComponentRef<ColorwheelComponent<object>> | null = null;
    let pendingUnsubscribe: (() => void) | null = null;

    void (async () => {
      // The Angular compiler is demo-only and loaded before the source component
      // so GitHub Pages can JIT the standalone template without bloating the
      // initial React/Vue/Vanilla showcase bundle.
      await import("@angular/compiler");
      const [{ createComponent }, { createApplication }, { ColorwheelComponent }] =
        await Promise.all([
          import("@angular/core"),
          import("@angular/platform-browser"),
          import("../../src/angular")
        ]);
      const application = await createApplication();
      pendingApplication = application;
      if (cancelled) {
        application.destroy();
        pendingApplication = null;
        return;
      }

      const component = createComponent(ColorwheelComponent, {
        environmentInjector: application.injector,
        hostElement: container
      });
      pendingComponent = component;
      component.setInput("palette", paletteRef.current);
      component.setInput("wheel", { interaction: interactionFor(paletteRef.current) });
      component.setInput("className", "demo-picker compact-picker angular-picker");
      component.setInput("ariaLabel", "Angular Colorwheel example");
      component.setInput("blockProps", blockProps);
      const subscription = component.instance.paletteChange.subscribe((next) => {
        onPaletteChangeRef.current(next as Palette);
      });
      pendingUnsubscribe = () => subscription.unsubscribe();
      application.attachView(component.hostView);
      component.changeDetectorRef.detectChanges();
      mount.current = {
        application,
        component,
        unsubscribe: () => subscription.unsubscribe()
      };
      pendingApplication = null;
      pendingComponent = null;
      pendingUnsubscribe = null;
    })().catch(() => {
      pendingUnsubscribe?.();
      pendingComponent?.destroy();
      pendingApplication?.destroy();
      pendingUnsubscribe = null;
      pendingComponent = null;
      pendingApplication = null;
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
      const current = mount.current;
      mount.current = null;
      if (current === null) return;
      current.unsubscribe();
      current.application.detachView(current.component.hostView);
      current.component.destroy();
      current.application.destroy();
    };
  }, []);

  useEffect(() => {
    paletteRef.current = palette;
    const current = mount.current;
    if (current === null) return;
    current.component.setInput("palette", palette);
    current.component.setInput("wheel", { interaction: interactionFor(palette) });
    current.component.changeDetectorRef.detectChanges();
  }, [palette]);

  return (
    <div className="framework-preview" data-testid="angular-studio">
      <div ref={host} />
      {failed ? (
        <p className="adapter-load-error" role="alert">
          The Angular preview could not start. The integration code is still available in the Code
          view.
        </p>
      ) : null}
    </div>
  );
}

export function ReactNativePreview() {
  return (
    <div
      className="framework-preview native-evidence-preview"
      data-testid="react-native-evidence"
      role="region"
      aria-label="React Native adapter evidence"
    >
      <div className="native-evidence-card">
        <div className="native-evidence-icon" aria-hidden="true">
          <span />
        </div>
        <div>
          <p className="native-evidence-kicker">Native runtime</p>
          <h3>Open this adapter in an iOS or Android app.</h3>
          <p>
            The React Native adapter renders native controls and an SVG wheel. A browser preview
            would be a different implementation, so this tab shows the adapter boundary instead.
          </p>
        </div>
        <dl className="native-evidence-list">
          <div>
            <dt>Entry point</dt>
            <dd>
              <code>@s9rg/colorwheel/react-native</code>
            </dd>
          </div>
          <div>
            <dt>Renderer</dt>
            <dd>React Native + react-native-svg</dd>
          </div>
          <div>
            <dt>Browser preview</dt>
            <dd>Not applicable</dd>
          </div>
          <div>
            <dt>Device verification</dt>
            <dd>Still required before release</dd>
          </div>
        </dl>
        <p className="native-evidence-note" role="note">
          Switch to Code for the native integration example. This page does not claim iOS or Android
          device verification.
        </p>
      </div>
    </div>
  );
}
