import { memo, useId, useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Svg, { Circle, ClipPath, Defs, G, Polygon, RadialGradient, Stop } from "react-native-svg";
import { convertColor, formatColor } from "../core";
import type { ColorValue } from "../core";
import { OKLCH_WHEEL_MAX_CHROMA } from "../editor";
import type { WheelModel } from "../editor";

const SEGMENT_COUNT = 120;
const CENTER = 50;
const RADIUS = 50;

interface WheelSegment {
  readonly fill: string;
  readonly points: string;
}

const NativeWheelSegments = memo(function NativeWheelSegments({
  segments
}: {
  readonly segments: readonly WheelSegment[];
}) {
  return segments.map((segment, index) => (
    <Polygon key={index} points={segment.points} fill={segment.fill} />
  ));
});

function pointAt(hue: number, radius = RADIUS): readonly [number, number] {
  const radians = ((hue - 90) * Math.PI) / 180;
  return [CENTER + Math.cos(radians) * radius, CENTER + Math.sin(radians) * radius];
}

function nativeHex(color: ColorValue): string {
  return formatColor(color, { format: "hex", alpha: "never", mapToSrgb: true });
}

function createSegments(
  model: WheelModel,
  oklchLightness: number | undefined
): readonly WheelSegment[] {
  const modelColor =
    model === "oklch"
      ? { space: "oklch" as const, l: oklchLightness ?? 0.72, c: 0.2, h: 0 }
      : { space: "hsv" as const, h: 0, s: 1, v: 1 };

  return Array.from({ length: SEGMENT_COUNT }, (_, index) => {
    const startHue = (index / SEGMENT_COUNT) * 360;
    const endHue = ((index + 1.08) / SEGMENT_COUNT) * 360;
    const [startX, startY] = pointAt(startHue, RADIUS + 0.3);
    const [endX, endY] = pointAt(endHue, RADIUS + 0.3);
    const color: ColorValue =
      modelColor.space === "oklch"
        ? {
            ...modelColor,
            c: OKLCH_WHEEL_MAX_CHROMA,
            h: startHue
          }
        : {
            ...modelColor,
            h: startHue,
            s: 1,
            v: 1
          };
    return {
      fill: nativeHex(color),
      points: `${CENTER},${CENTER} ${startX},${startY} ${endX},${endY}`
    };
  });
}

export interface NativeSvgWheelProps {
  readonly model: WheelModel;
  readonly activeColor?: ColorValue;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/**
 * Default native wheel graphic. Kept in its own module so applications replacing
 * `Picker.Wheel` can tree-shake the `react-native-svg` peer dependency.
 */
export function NativeSvgWheel({ model, activeColor, style, testID }: NativeSvgWheelProps) {
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `colorwheel-clip-${id}`;
  const centerGradientId = `colorwheel-center-${id}`;
  const darknessGradientId = `colorwheel-darkness-${id}`;
  const oklchLightness =
    model === "oklch" && activeColor !== undefined
      ? convertColor(activeColor, "oklch").l
      : undefined;
  const segments = useMemo(() => createSegments(model, oklchLightness), [model, oklchLightness]);
  const centerColor =
    model === "oklch"
      ? nativeHex({
          ...convertColor(activeColor ?? { space: "oklch", l: 0.72, c: 0, h: 0 }, "oklch"),
          c: 0
        })
      : "#ffffff";
  const darkness =
    model === "hsv" && activeColor !== undefined
      ? Math.min(0.6, 1 - convertColor(activeColor, "hsv").v)
      : 0;

  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      style={style}
      testID={testID}
      pointerEvents="none"
    >
      <Defs>
        <ClipPath id={clipId}>
          <Circle cx={CENTER} cy={CENTER} r={RADIUS} />
        </ClipPath>
        <RadialGradient id={centerGradientId} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={centerColor} stopOpacity={1} />
          <Stop offset="70%" stopColor={centerColor} stopOpacity={0.18} />
          <Stop offset="100%" stopColor={centerColor} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={darknessGradientId} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#000000" stopOpacity={darkness} />
          <Stop offset="100%" stopColor="#000000" stopOpacity={darkness} />
        </RadialGradient>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        <NativeWheelSegments segments={segments} />
        <Circle cx={CENTER} cy={CENTER} r={RADIUS} fill={`url(#${centerGradientId})`} />
        {darkness > 0 ? (
          <Circle cx={CENTER} cy={CENTER} r={RADIUS} fill={`url(#${darknessGradientId})`} />
        ) : null}
      </G>
    </Svg>
  );
}
