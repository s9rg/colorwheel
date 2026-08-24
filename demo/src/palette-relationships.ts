export type PaletteMode =
  | "single"
  | "complementary"
  | "analogous"
  | "triadic"
  | "tetradic"
  | "split-complementary"
  | "monochromatic"
  | "tonal";

export interface PaletteRelationship {
  readonly id: PaletteMode;
  readonly label: string;
  readonly description: string;
}

export const PALETTE_RELATIONSHIPS: readonly PaletteRelationship[] = [
  { id: "complementary", label: "Complementary", description: "Two opposing hues" },
  { id: "monochromatic", label: "Monochromatic", description: "One hue, five variations" },
  { id: "analogous", label: "Analogous", description: "Three neighboring hues" },
  { id: "triadic", label: "Triadic", description: "Three evenly spaced hues" },
  { id: "tetradic", label: "Tetradic", description: "Four evenly spaced hues" },
  {
    id: "split-complementary",
    label: "Split complementary",
    description: "Base + two near-opposites"
  },
  { id: "tonal", label: "Tonal scale", description: "Seven lightness steps" },
  { id: "single", label: "Single color", description: "One editable color" }
] as const;
