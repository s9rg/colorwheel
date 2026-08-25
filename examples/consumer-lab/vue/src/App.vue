<script setup lang="ts">
import { computed, shallowRef } from "vue";

import { createHarmonyPalette, formatColor, type Palette } from "@s9rg/colorwheel/core";
import type { ChangeMeta } from "@s9rg/colorwheel/editor";
import { Colorwheel, type ColorwheelBlockProps } from "@s9rg/colorwheel/vue";

interface EventEntry {
  readonly id: number;
  readonly action: string;
  readonly detail: string;
}

type Preset = "cool" | "warm";

function createPreset(preset: Preset): Palette {
  return preset === "cool"
    ? createHarmonyPalette({
        seed: "#17B6C8",
        harmony: { type: "analogous", count: 4, spread: 28 },
        name: "Vue ocean accents"
      })
    : createHarmonyPalette({
        seed: "#F06A4A",
        harmony: { type: "split-complementary", spread: 34 },
        name: "Vue sunset accents"
      });
}

const palette = shallowRef<Palette>(createPreset("cool"));
const selectedPreset = shallowRef<Preset>("cool");
const eventLog = shallowRef<readonly EventEntry[]>([
  { id: 0, action: "ready", detail: "Controlled palette mounted with four colors." }
]);
let nextEventId = 1;

const blockProps = {
  wheel: {
    title: "Vue color surface",
    description: "The parent owns the palette; the adapter owns the interaction state.",
    showInstructions: false,
    showChannelRing: true
  },
  palette: {
    title: "Reactive swatches",
    description: "Names, order, and locks are emitted back through v-model:palette.",
    showName: true,
    showActions: true,
    allowAdd: true
  }
} satisfies ColorwheelBlockProps;

const paletteSummary = computed(() =>
  palette.value.colors.map((entry) => formatColor(entry.color, { format: "hex" })).join(" · ")
);

function prependEvent(action: string, detail: string): void {
  eventLog.value = [{ id: nextEventId++, action, detail }, ...eventLog.value].slice(0, 6);
}

function loadPreset(preset: Preset): void {
  selectedPreset.value = preset;
  palette.value = createPreset(preset);
  prependEvent("external", `${preset === "cool" ? "Cool analogous" : "Warm split"} loaded.`);
}

function onPaletteChange(nextPalette: Palette, meta: ChangeMeta): void {
  const changed = meta.changedColorIds.length > 0 ? meta.changedColorIds.join(", ") : "none";
  prependEvent(
    `${meta.action}:${meta.phase}`,
    `${meta.origin}; ${nextPalette.colors.length} colors; changed ${changed}`
  );
}
</script>

<template>
  <main class="consumer-shell" data-test="vue-app">
    <header class="consumer-hero">
      <p class="consumer-eyebrow">Published package · Vue 3</p>
      <h1>Controlled Vue palette</h1>
      <p>
        This page uses <code>createApp</code>, <code>v-model:palette</code>, scoped slots, and
        detailed adapter events—without importing repository source.
      </p>
    </header>

    <section class="consumer-controls" aria-labelledby="vue-presets-title">
      <div>
        <h2 id="vue-presets-title">Parent-owned presets</h2>
        <p>Replacing the ref drives the same component through its controlled palette prop.</p>
      </div>
      <div class="consumer-button-group" role="group" aria-label="Choose a Vue palette preset">
        <button
          type="button"
          :aria-pressed="selectedPreset === 'cool'"
          data-test="vue-preset-cool"
          @click="loadPreset('cool')"
        >
          Cool analogous
        </button>
        <button
          type="button"
          :aria-pressed="selectedPreset === 'warm'"
          data-test="vue-preset-warm"
          @click="loadPreset('warm')"
        >
          Warm split
        </button>
      </div>
    </section>

    <section class="consumer-editor" aria-label="Vue Colorwheel consumer">
      <Colorwheel
        v-model:palette="palette"
        aria-label="Vue-controlled brand palette editor"
        class-name="vue-consumer-colorwheel"
        :block-props="blockProps"
        data-test="vue-colorwheel"
        @palette-change="onPaletteChange"
      >
        <template #default="{ state, palette: livePalette }">
          <aside class="vue-slot-summary" data-test="vue-slot-summary" aria-label="Vue slot data">
            <strong>Consumer-owned default slot</strong>
            <span>
              {{ livePalette.colors.length }} colors · active
              {{ state.activeColorId ?? "none" }}
            </span>
          </aside>
        </template>
      </Colorwheel>
    </section>

    <section class="consumer-observability" aria-labelledby="vue-events-title">
      <div class="consumer-summary">
        <h2 id="vue-events-title">Event metadata</h2>
        <output data-test="vue-palette-summary" aria-live="polite">{{ paletteSummary }}</output>
      </div>
      <ol class="consumer-event-list" data-test="vue-event-log">
        <li v-for="entry in eventLog" :key="entry.id">
          <code>{{ entry.action }}</code>
          <span>{{ entry.detail }}</span>
        </li>
      </ol>
    </section>
  </main>
</template>
