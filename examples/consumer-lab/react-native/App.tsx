import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import Svg, { Circle } from "react-native-svg";

import { createHarmonyPalette, formatColor, type HarmonyRule } from "@s9rg/colorwheel/core";
import {
  NativePaletteBlock,
  NativeWheelBlock,
  Picker,
  usePickerController,
  usePickerSelector,
  type ChangeMeta,
  type NativePaletteBlockProps,
  type NativePaletteSwatchRenderProps,
  type NativePickerBlockProps,
  type NativePickerBlocks,
  type NativeWheelBlockProps,
  type NativeWheelGraphicProps,
  type Palette,
  type PaletteColor,
  type PickerControllerOptions,
  type PickerState
} from "@s9rg/colorwheel/react-native";

interface LabMetadata {
  readonly source: "consumer-lab";
  readonly presetId: string;
  readonly revision: number;
  readonly slot: number | null;
}

interface PalettePreset {
  readonly id: string;
  readonly label: string;
  readonly seed: string;
  readonly harmony: HarmonyRule;
}

interface EventRecord {
  readonly id: number;
  readonly callback: "onChange" | "onPaletteChange";
  readonly meta: ChangeMeta;
}

const PRESETS = [
  {
    id: "complementary",
    label: "Complementary",
    seed: "#5b5bd6",
    harmony: { type: "complementary" }
  },
  {
    id: "triadic",
    label: "Triadic",
    seed: "#0f9f8f",
    harmony: { type: "triadic" }
  },
  {
    id: "analogous",
    label: "Analogous",
    seed: "#e85d75",
    harmony: { type: "analogous", count: 3, spread: 34 }
  }
] as const satisfies readonly PalettePreset[];

function presetIndex(presetId: string | undefined): number {
  const index = PRESETS.findIndex((preset) => preset.id === presetId);
  return index < 0 ? 0 : index;
}

function createLabPalette(
  index: number,
  revision: number,
  lockedColors: readonly PaletteColor<LabMetadata>[] = []
): Palette<LabMetadata> {
  const preset = PRESETS[index % PRESETS.length] ?? PRESETS[0];
  const generated = createHarmonyPalette({
    seed: preset.seed,
    harmony: preset.harmony,
    name: `${preset.label} product palette`,
    idFactory: (slot) => `brand-${slot + 1}`
  });
  const lockedById = new Map(lockedColors.map((entry) => [entry.id, entry]));

  return {
    ...generated,
    metadata: {
      source: "consumer-lab",
      presetId: preset.id,
      revision,
      slot: null
    },
    colors: generated.colors.map((entry, slot) => {
      const locked = lockedById.get(entry.id);
      if (locked) return locked;

      return {
        ...entry,
        name: slot === 0 ? "Brand anchor" : `Brand support ${slot}`,
        role: slot === 0 ? "primary" : "supporting",
        metadata: {
          source: "consumer-lab",
          presetId: preset.id,
          revision,
          slot
        }
      };
    })
  };
}

function ConsumerWheelBlock(props: NativeWheelBlockProps<LabMetadata>) {
  return (
    <View style={styles.blockShell} testID="consumer-wheel-block">
      <Text style={styles.blockEyebrow}>CUSTOM WHEEL BLOCK</Text>
      <NativeWheelBlock<LabMetadata> {...props} style={[styles.nativeBlock, props.style]} />
    </View>
  );
}

function ConsumerPaletteBlock(props: NativePaletteBlockProps<LabMetadata>) {
  return (
    <View style={styles.blockShell} testID="consumer-palette-block">
      <Text style={styles.blockEyebrow}>CUSTOM PALETTE BLOCK</Text>
      <NativePaletteBlock<LabMetadata> {...props} style={[styles.nativeBlock, props.style]} />
    </View>
  );
}

const LAB_BLOCKS = {
  wheel: ConsumerWheelBlock,
  palette: ConsumerPaletteBlock
} satisfies NativePickerBlocks<LabMetadata>;

function renderWheelGraphic(props: NativeWheelGraphicProps, defaultGraphic: ReactNode): ReactNode {
  return (
    <View pointerEvents="none" style={props.style}>
      {defaultGraphic}
      <Svg
        accessible={false}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
      >
        <Circle
          cx="50"
          cy="50"
          r="47.25"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.62"
          strokeWidth="0.75"
        />
      </Svg>
    </View>
  );
}

function renderPaletteSwatch(
  props: NativePaletteSwatchRenderProps<LabMetadata>,
  defaultSwatch: ReactNode
): ReactNode {
  const metadata = props.entry.metadata;

  return (
    <View style={[styles.swatchFrame, props.active && styles.swatchFrameActive]}>
      {defaultSwatch}
      <Text
        accessibilityLabel={`Consumer metadata, revision ${metadata?.revision ?? 0}, slot ${(metadata?.slot ?? props.index) + 1}`}
        style={styles.swatchMetadata}
      >
        consumer metadata · r{metadata?.revision ?? 0} · slot {(metadata?.slot ?? props.index) + 1}
      </Text>
    </View>
  );
}

function RegenerateControl() {
  const controller = usePickerController<LabMetadata>();
  const presetId = usePickerSelector<string, LabMetadata>(
    (state) => state.palette.metadata?.presetId ?? PRESETS[0].id
  );
  const currentIndex = presetIndex(presetId);
  const current = PRESETS[currentIndex] ?? PRESETS[0];
  const next = PRESETS[(currentIndex + 1) % PRESETS.length] ?? PRESETS[0];

  const regenerate = useCallback(() => {
    controller.commands.regenerate({
      action: "regenerate",
      origin: "user",
      phase: "commit"
    });
  }, [controller]);

  return (
    <View style={styles.presetPanel} testID="preset-regenerate-panel">
      <View style={styles.presetCopy}>
        <Text style={styles.presetLabel}>ACTIVE PRESET</Text>
        <Text accessibilityRole="header" style={styles.presetValue}>
          {current.label}
        </Text>
        <Text style={styles.presetHint}>Locked swatches survive regeneration.</Text>
      </View>
      <Pressable
        accessibilityHint={`Creates the ${next.label} preset and keeps locked swatches`}
        accessibilityLabel={`Regenerate palette as ${next.label}`}
        accessibilityRole="button"
        onPress={regenerate}
        style={({ pressed }) => [styles.regenerateButton, pressed && styles.buttonPressed]}
        testID="regenerate-preset"
      >
        <Text style={styles.regenerateButtonLabel}>Regenerate</Text>
        <Text style={styles.regenerateButtonValue}>{next.label} →</Text>
      </Pressable>
    </View>
  );
}

function EventLog({ events }: { readonly events: readonly EventRecord[] }) {
  const latestCommit = events.find(
    (event) => event.callback === "onPaletteChange" && event.meta.phase === "commit"
  );
  const liveSummary = latestCommit
    ? `${latestCommit.meta.action} committed, ${latestCommit.meta.changedColorIds.length} colors changed`
    : "No palette commit yet";

  return (
    <View
      accessibilityLabel="Picker callback event log"
      style={styles.logPanel}
      testID="callback-event-log"
    >
      <View style={styles.logHeader}>
        <Text accessibilityRole="header" style={styles.logTitle}>
          Callback metadata
        </Text>
        <Text style={styles.logCount}>{events.length} recent</Text>
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.visuallyHidden}>
        {liveSummary}
      </Text>
      {events.length === 0 ? (
        <Text style={styles.emptyLog}>Edit, select, reorder, or regenerate to see ChangeMeta.</Text>
      ) : (
        events.map((event) => (
          <View key={event.id} style={styles.logRow}>
            <Text style={styles.logCallback}>{event.callback}</Text>
            <Text style={styles.logMeta}>
              {event.meta.action} · {event.meta.origin} · {event.meta.phase}
            </Text>
            <Text numberOfLines={1} style={styles.logIds}>
              {event.meta.changedColorIds.length > 0
                ? event.meta.changedColorIds.join(", ")
                : "no color payload"}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

export default function App() {
  const { width } = useWindowDimensions();
  const [palette, setPalette] = useState<Palette<LabMetadata>>(() => createLabPalette(0, 1));
  const [events, setEvents] = useState<readonly EventRecord[]>([]);
  const [activeColorId, setActiveColorId] = useState<string | undefined>(palette.colors[0]?.id);
  const sequence = useRef(0);
  const wheelSize = Math.max(236, Math.min(320, width - 56));

  const record = useCallback((callback: EventRecord["callback"], meta: ChangeMeta) => {
    const next: EventRecord = { id: ++sequence.current, callback, meta };
    setEvents((current) => [next, ...current].slice(0, 6));
  }, []);

  const handleChange = useCallback(
    (state: PickerState<LabMetadata>, meta: ChangeMeta) => {
      setActiveColorId(state.activeColorId);
      record("onChange", meta);
    },
    [record]
  );

  const handlePaletteChange = useCallback(
    (nextPalette: Palette<LabMetadata>, meta: ChangeMeta) => {
      setPalette(nextPalette);
      record("onPaletteChange", meta);
    },
    [record]
  );

  const controllerOptions = useMemo<PickerControllerOptions<LabMetadata>>(
    () => ({
      regenerate({ state, lockedColors }) {
        const currentIndex = presetIndex(state.palette.metadata?.presetId);
        const revision = (state.palette.metadata?.revision ?? 0) + 1;
        return createLabPalette((currentIndex + 1) % PRESETS.length, revision, lockedColors);
      }
    }),
    []
  );

  const blockProps = useMemo<NativePickerBlockProps<LabMetadata>>(
    () => ({
      wheel: {
        accessibilityLabel: "Product palette color wheel",
        title: "Edit color relationships",
        description:
          "Drag a handle, use the adjustment buttons, or use the adjustable accessibility actions.",
        size: wheelSize,
        showAdjustments: true,
        hueStep: 5,
        radiusStep: 0.04,
        channelStep: 0.04,
        renderGraphic: renderWheelGraphic,
        styles: {
          heading: styles.nativeHeading,
          description: styles.nativeDescription,
          surface: styles.wheelSurface,
          adjustmentButton: styles.adjustmentButton,
          adjustmentLabel: styles.adjustmentLabel
        },
        testID: "consumer-wheel"
      },
      palette: {
        title: "Palette data",
        description: "Edit names and values, then lock, reorder, add, or remove swatches.",
        showName: true,
        showActions: true,
        allowAdd: true,
        allowRemove: true,
        allowReorder: true,
        renderSwatch: renderPaletteSwatch,
        styles: {
          heading: styles.nativeHeading,
          description: styles.nativeDescription,
          actionButton: styles.paletteAction,
          addButton: styles.addButton
        },
        testID: "consumer-palette"
      }
    }),
    [wheelSize]
  );

  const renderLayout = useCallback(
    (defaultLayout: ReactNode) => (
      <View style={styles.renderedLayout} testID="consumer-render-layout">
        <View style={styles.renderSeamLabel}>
          <View style={styles.statusDot} />
          <Text style={styles.renderSeamText}>renderLayout seam · native views</Text>
        </View>
        <RegenerateControl />
        {defaultLayout}
      </View>
    ),
    []
  );

  const firstColor = palette.colors[0];
  const firstHex = firstColor
    ? formatColor(firstColor.color, { format: "hex", mapToSrgb: true })
    : "—";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.page}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>@s9rg/colorwheel · React Native consumer</Text>
          <Text accessibilityRole="header" style={styles.title}>
            A controlled palette, rendered natively.
          </Text>
          <Text style={styles.subtitle}>
            This app imports the published package, replaces both blocks, configures blockProps,
            decorates SVG and swatch render seams, and records callback metadata.
          </Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>COLORS</Text>
              <Text style={styles.summaryValue}>{palette.colors.length}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>ANCHOR</Text>
              <Text style={styles.summaryValue}>{firstHex.toUpperCase()}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>ACTIVE ID</Text>
              <Text numberOfLines={1} style={styles.summaryValue}>
                {activeColorId ?? "none"}
              </Text>
            </View>
          </View>
        </View>

        <Picker<LabMetadata>
          palette={palette}
          onChange={handleChange}
          onPaletteChange={handlePaletteChange}
          controllerOptions={controllerOptions}
          wheel={{ wheelModel: "oklch", interaction: "free", outputGamut: "srgb" }}
          blocks={LAB_BLOCKS}
          blockProps={blockProps}
          renderLayout={renderLayout}
          style={styles.pickerRoot}
          testID="published-native-picker"
        />

        <EventLog events={events} />

        <Text style={styles.deviceNote}>
          Metro and TypeScript can verify this consumer without native projects. VoiceOver,
          TalkBack, wheel gestures, focus recovery, and safe-area behavior still require a real iOS
          or Android host.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#07111f"
  },
  page: {
    gap: 18,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 44
  },
  hero: {
    gap: 12,
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#24354a",
    backgroundColor: "#0d1a2b"
  },
  eyebrow: {
    color: "#60e7d5",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.9,
    textTransform: "uppercase"
  },
  title: {
    color: "#f7fbff",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.7,
    lineHeight: 35
  },
  subtitle: {
    color: "#a8b8cb",
    fontSize: 15,
    lineHeight: 22
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4
  },
  summaryItem: {
    minWidth: 92,
    flexGrow: 1,
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#12243a"
  },
  summaryLabel: {
    color: "#7990aa",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8
  },
  summaryValue: {
    color: "#eff8ff",
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"]
  },
  pickerRoot: {
    width: "100%"
  },
  renderedLayout: {
    gap: 14
  },
  renderSeamLabel: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#12243a"
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: "#60e7d5"
  },
  renderSeamText: {
    color: "#bad0e7",
    fontSize: 12,
    fontWeight: "700"
  },
  presetPanel: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2b3c51",
    backgroundColor: "#0d1a2b"
  },
  presetCopy: {
    flex: 1,
    justifyContent: "center",
    gap: 2
  },
  presetLabel: {
    color: "#7990aa",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8
  },
  presetValue: {
    color: "#f7fbff",
    fontSize: 18,
    fontWeight: "800"
  },
  presetHint: {
    color: "#8da1b8",
    fontSize: 11,
    lineHeight: 16
  },
  regenerateButton: {
    minWidth: 116,
    minHeight: 54,
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#60e7d5"
  },
  buttonPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.98 }]
  },
  regenerateButtonLabel: {
    color: "#061a1a",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  regenerateButtonValue: {
    color: "#0b3d39",
    fontSize: 12,
    fontWeight: "700"
  },
  blockShell: {
    gap: 8,
    padding: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#26394f",
    backgroundColor: "#0a1625"
  },
  blockEyebrow: {
    paddingHorizontal: 8,
    color: "#7088a4",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.85
  },
  nativeBlock: {
    borderColor: "#31475f",
    backgroundColor: "#101f32"
  },
  nativeHeading: {
    color: "#f4f9ff",
    fontSize: 20,
    fontWeight: "800"
  },
  nativeDescription: {
    color: "#9eb1c7",
    fontSize: 13,
    lineHeight: 19
  },
  wheelSurface: {
    alignSelf: "center",
    borderWidth: 4,
    borderColor: "#17283a",
    borderRadius: 999
  },
  adjustmentButton: {
    minHeight: 44,
    borderColor: "#38516b",
    backgroundColor: "#13263b"
  },
  adjustmentLabel: {
    color: "#e7f2ff"
  },
  swatchFrame: {
    gap: 6,
    padding: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "transparent"
  },
  swatchFrameActive: {
    borderColor: "#60e7d5",
    backgroundColor: "#0c2a31"
  },
  swatchMetadata: {
    paddingHorizontal: 8,
    paddingBottom: 4,
    color: "#7f96af",
    fontSize: 10,
    fontWeight: "700"
  },
  paletteAction: {
    minHeight: 44,
    borderColor: "#38516b",
    backgroundColor: "#13263b"
  },
  addButton: {
    minHeight: 48,
    borderColor: "#2f796f",
    backgroundColor: "#123a38"
  },
  logPanel: {
    gap: 10,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#26394f",
    backgroundColor: "#0d1a2b"
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12
  },
  logTitle: {
    color: "#f4f9ff",
    fontSize: 18,
    fontWeight: "800"
  },
  logCount: {
    color: "#7890aa",
    fontSize: 12,
    fontVariant: ["tabular-nums"]
  },
  emptyLog: {
    color: "#8fa3bb",
    fontSize: 13,
    lineHeight: 19
  },
  logRow: {
    gap: 2,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#2a3e54"
  },
  logCallback: {
    color: "#60e7d5",
    fontSize: 11,
    fontWeight: "800"
  },
  logMeta: {
    color: "#e5effa",
    fontSize: 13,
    fontWeight: "700"
  },
  logIds: {
    color: "#7f96af",
    fontSize: 11,
    fontVariant: ["tabular-nums"]
  },
  visuallyHidden: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0
  },
  deviceNote: {
    paddingHorizontal: 4,
    color: "#7e93aa",
    fontSize: 12,
    lineHeight: 18
  }
});
