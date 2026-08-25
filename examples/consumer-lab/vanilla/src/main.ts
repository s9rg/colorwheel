import { createHarmonyPalette, formatColor, type Palette } from "@s9rg/colorwheel/core";
import { createPickerController, createPickerState } from "@s9rg/colorwheel/editor";
import {
  mountColorwheel,
  type ColorwheelBlockProps,
  type ColorwheelInstance
} from "@s9rg/colorwheel/vanilla";
import "@s9rg/colorwheel/styles.css";

import "./app.css";

interface LabMetadata {
  readonly source: string;
}

interface EventItem {
  readonly number: number;
  readonly action: string;
  readonly detail: string;
}

function requiredElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (element === null) throw new Error(`Missing consumer-lab element: ${selector}`);
  return element;
}

function withMetadata(palette: Palette, source: string): Palette<LabMetadata> {
  return {
    ...palette,
    metadata: { source },
    colors: palette.colors.map((entry, index) => ({
      ...entry,
      name: entry.name ?? `Campaign ${index + 1}`,
      role: index === 0 ? "background" : index === 1 ? "foreground" : "accent",
      metadata: { source }
    }))
  };
}

const defaultPalette = withMetadata(
  createHarmonyPalette({
    seed: "#15c6a3",
    harmony: { type: "split-complementary", spread: 28 },
    name: "Evergreen campaign"
  }),
  "mount default"
);

const launchPalette = withMetadata(
  createHarmonyPalette({
    seed: "#ff6854",
    harmony: { type: "analogous", count: 4, spread: 22 },
    name: "Launch campaign"
  }),
  "external update"
);

const applicationController = createPickerController<LabMetadata>(
  createPickerState<LabMetadata>({
    palette: defaultPalette,
    wheel: { interaction: "linked" }
  })
);
const applicationEvents = new AbortController();

const pickerHost = requiredElement<HTMLElement>("#picker-host");
const summary = requiredElement<HTMLElement>("#palette-summary");
const eventList = requiredElement<HTMLOListElement>("#event-list");
const eventCount = requiredElement<HTMLOutputElement>("#event-count");
const lifecycleStatus = requiredElement<HTMLOutputElement>(
  "[data-test='vanilla-lifecycle-status']"
);
const instanceState = requiredElement<HTMLElement>("[data-test='vanilla-instance-state']");
const mountButton = requiredElement<HTMLButtonElement>("[data-test='vanilla-mount']");
const focusButton = requiredElement<HTMLButtonElement>("[data-test='vanilla-focus']");
const updatePaletteButton = requiredElement<HTMLButtonElement>(
  "[data-test='vanilla-update-palette']"
);
const updateBlocksButton = requiredElement<HTMLButtonElement>(
  "[data-test='vanilla-update-blocks']"
);
const destroyButton = requiredElement<HTMLButtonElement>("[data-test='vanilla-destroy']");

let colorwheel: ColorwheelInstance<LabMetadata> | null = null;
let compactBlocks = false;
let eventSequence = 0;
let events: readonly EventItem[] = [];

function blockProps(compact: boolean): ColorwheelBlockProps {
  return compact
    ? {
        wheel: {
          title: "Quick adjust",
          description: "A reduced presentation applied through instance.update().",
          showInstructions: false,
          showChannels: false,
          showChannelRing: false
        },
        palette: {
          title: "Swatches",
          description: "Compact mode keeps selection and value editing available.",
          showName: false,
          showActions: false,
          allowAdd: false
        }
      }
    : {
        wheel: {
          title: "Campaign relationship",
          description: "Edit the anchor on the wheel and value on the outer ring.",
          showInstructions: true,
          showChannels: true,
          showChannelRing: true
        },
        palette: {
          title: "Working colors",
          description: "Names, values, ordering, locking, and additions use the built-in block.",
          showName: true,
          showActions: true,
          allowAdd: true
        }
      };
}

function setLifecycleStatus(message: string): void {
  lifecycleStatus.value = message;
  lifecycleStatus.textContent = message;
}

function syncLifecycleControls(): void {
  const mounted = colorwheel !== null;
  mountButton.disabled = mounted;
  focusButton.disabled = !mounted;
  updatePaletteButton.disabled = !mounted;
  updateBlocksButton.disabled = !mounted;
  destroyButton.disabled = !mounted;
  instanceState.textContent = mounted ? "Running" : "Stopped";
  if (mounted) instanceState.dataset.running = "";
  else instanceState.removeAttribute("data-running");
}

function renderSummary(palette: Palette<LabMetadata>): void {
  const heading = document.createElement("p");
  const name = document.createElement("strong");
  const detail = document.createElement("span");
  const swatches = document.createElement("ul");
  name.textContent = palette.name ?? "Untitled palette";
  detail.textContent = `${palette.colors.length} colors · ${palette.metadata?.source ?? "unknown source"}`;
  heading.append(name, detail);

  for (const entry of palette.colors) {
    const color = formatColor(entry.color, { format: "hex", alpha: "auto" });
    const item = document.createElement("li");
    const colorChip = document.createElement("span");
    const colorName = document.createElement("strong");
    const value = document.createElement("code");
    colorChip.style.setProperty("--summary-color", color);
    colorChip.setAttribute("aria-hidden", "true");
    colorName.textContent = entry.name ?? entry.id;
    value.textContent = color;
    item.append(colorChip, colorName, value);
    swatches.append(item);
  }

  summary.replaceChildren(heading, swatches);
}

function renderEvents(): void {
  eventCount.value = `${events.length} ${events.length === 1 ? "event" : "events"}`;
  eventCount.textContent = eventCount.value;
  eventList.replaceChildren();
  for (const event of events) {
    const item = document.createElement("li");
    const action = document.createElement("strong");
    const detail = document.createElement("span");
    action.textContent = event.action;
    detail.textContent = event.detail;
    item.dataset.eventId = String(event.number);
    item.append(action, detail);
    eventList.append(item);
  }
}

function addEvent(action: string, detail: string): void {
  eventSequence += 1;
  events = [{ number: eventSequence, action, detail }, ...events].slice(0, 8);
  renderEvents();
}

function mountPicker(): void {
  if (colorwheel !== null) {
    colorwheel.focus({ type: "root" });
    setLifecycleStatus("Already mounted; focus returned to the editor.");
    return;
  }

  colorwheel = mountColorwheel<LabMetadata>(pickerHost, {
    controller: applicationController,
    ariaLabel: "Campaign palette editor",
    className: "vanilla-picker",
    blockProps: blockProps(compactBlocks),
    onChange(state, meta) {
      const changed =
        meta.changedColorIds.length === 0 ? "no palette IDs" : meta.changedColorIds.join(", ");
      addEvent(meta.action, `${meta.origin} · ${meta.phase} · ${changed}`);
      renderSummary(state.palette);
    },
    onPaletteChange(palette, meta) {
      renderSummary(palette);
      if (meta.phase === "commit") {
        setLifecycleStatus(`Committed ${meta.action} for ${palette.colors.length} colors.`);
      }
    }
  });

  renderSummary(colorwheel.controller.getPalette());
  addEvent("mount", "application · caller-owned controller");
  setLifecycleStatus(
    `Mounted the caller-owned controller with ${compactBlocks ? "compact" : "detailed"} block props.`
  );
  syncLifecycleControls();
}

function focusWheel(): void {
  const instance = colorwheel;
  if (instance === null) {
    setLifecycleStatus("Mount the editor before requesting focus.");
    return;
  }
  const state = instance.controller.getState();
  const colorId =
    state.wheel.interaction === "linked"
      ? state.anchorColorId
      : (state.activeColorId ?? state.colorFocusOrder[0]);
  if (colorId === undefined) instance.focus({ type: "root" });
  else instance.focus({ type: "pointer", colorId });
  addEvent("focus", `application · ${colorId === undefined ? "root" : "editable wheel handle"}`);
  setLifecycleStatus("Focus moved to the wheel's active handle.");
}

function updatePalette(): void {
  const instance = colorwheel;
  if (instance === null) {
    setLifecycleStatus("Mount the editor before updating its palette.");
    return;
  }

  instance.update({ palette: launchPalette });
  renderSummary(instance.controller.getPalette());
  addEvent("update", "external · launch palette · callbacks intentionally silent");
  setLifecycleStatus("Applied an external palette with instance.update().");
}

function updatePresentation(): void {
  const instance = colorwheel;
  if (instance === null) {
    setLifecycleStatus("Mount the editor before updating its blocks.");
    return;
  }

  compactBlocks = !compactBlocks;
  instance.update({
    ariaLabel: compactBlocks ? "Compact campaign palette editor" : "Campaign palette editor",
    blockProps: blockProps(compactBlocks)
  });
  updateBlocksButton.textContent = compactBlocks ? "Use detailed blocks" : "Use compact blocks";
  addEvent("update", `application · ${compactBlocks ? "compact" : "detailed"} block props`);
  setLifecycleStatus(`Applied ${compactBlocks ? "compact" : "detailed"} presentation options.`);
}

function destroyPicker(reason = "Destroyed by user."): void {
  const instance = colorwheel;
  colorwheel = null;
  if (instance === null) {
    setLifecycleStatus("The editor is already destroyed.");
    syncLifecycleControls();
    return;
  }

  instance.destroy();
  summary.textContent = "No palette is mounted.";
  addEvent("destroy", "application · adapter released; caller controller retained");
  setLifecycleStatus(reason);
  syncLifecycleControls();
}

mountButton.addEventListener("click", mountPicker, { signal: applicationEvents.signal });
focusButton.addEventListener("click", focusWheel, { signal: applicationEvents.signal });
updatePaletteButton.addEventListener("click", updatePalette, { signal: applicationEvents.signal });
updateBlocksButton.addEventListener("click", updatePresentation, {
  signal: applicationEvents.signal
});
destroyButton.addEventListener("click", () => destroyPicker(), {
  signal: applicationEvents.signal
});

function disposeApplication(reason: string): void {
  destroyPicker(reason);
  applicationEvents.abort();
  applicationController.destroy();
}

window.addEventListener("pagehide", () => disposeApplication("Destroyed during page cleanup."), {
  once: true,
  signal: applicationEvents.signal
});
import.meta.hot?.dispose(() => disposeApplication("Destroyed for hot reload."));

syncLifecycleControls();
mountPicker();
