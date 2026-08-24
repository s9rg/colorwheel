import type { Palette } from "../../src/core";

export function testPalette(): Palette {
  return {
    name: "Interface",
    kind: "semantic",
    colors: [
      {
        id: "ink",
        name: "Ink",
        role: "text",
        color: { space: "srgb", r: 0.05, g: 0.07, b: 0.1 }
      },
      {
        id: "paper",
        name: "Paper",
        role: "background",
        color: { space: "srgb", r: 0.98, g: 0.98, b: 0.97 }
      },
      {
        id: "accent",
        name: "Accent",
        role: "accent",
        color: { space: "oklch", l: 0.64, c: 0.18, h: 255 }
      }
    ],
    provenance: { origin: "manual" }
  };
}
