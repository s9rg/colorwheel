import { convertColor, createHarmonyPalette, formatColor, parseColor } from "../core";
import type { ColorValue, HsvColor, JsonObject, OklchColor, Palette, PaletteColor } from "../core";
import {
  OKLCH_WHEEL_MAX_CHROMA,
  clientPointToWheelPoint,
  colorToWheelPoint,
  createPickerController,
  createPickerState,
  getSliderKeyboardValue,
  getWheelChannelValue,
  getPointerAccessibilityProps,
  getWheelAccessibilityProps,
  ringPointToWheelChannelValue,
  resolveWheelEditingColor,
  setWheelChannelValue,
  wheelChannelValueToRingPoint,
  wheelPointToColor
} from "../editor";
import type {
  PickerAction,
  PickerController,
  PickerInteraction,
  PickerState,
  WheelRingSide,
  WheelRect
} from "../editor";
import type {
  ColorwheelPaletteBlockProps,
  ColorwheelInstance,
  ColorwheelMountOptions,
  ColorwheelPresentationOptions,
  ColorwheelUpdateOptions,
  ColorwheelWheelBlockProps,
  PaletteRenderContext,
  PaletteRenderResult,
  RenderPalette
} from "./types";

let fallbackInstanceId = 0;

interface DragSession<Metadata extends object> {
  readonly region: "wheel" | "channel-ring";
  readonly pointerId: number;
  readonly colorId: string;
  readonly captureTarget: HTMLElement;
  readonly rect: WheelRect;
  readonly interaction: PickerInteraction<Metadata>;
}

interface ColorDraft {
  readonly source: string;
  readonly value: string;
  readonly invalid: boolean;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function createInstanceId(ownerDocument: Document): string {
  const crypto = ownerDocument.defaultView?.crypto;
  if (crypto !== undefined && typeof crypto.randomUUID === "function") {
    return `colorwheel-${crypto.randomUUID()}`;
  }
  fallbackInstanceId += 1;
  return `colorwheel-${fallbackInstanceId}`;
}

function defaultPalette(): Palette {
  return createHarmonyPalette({
    seed: { space: "hsv", h: 258, s: 0.72, v: 0.96 },
    harmony: { type: "complementary" },
    name: "Complementary violet"
  });
}

function assertMountOptions<Metadata extends object>(
  options: ColorwheelMountOptions<Metadata>
): void {
  if (
    options.controller !== undefined &&
    (options.state !== undefined || options.palette !== undefined)
  ) {
    throw new TypeError("controller cannot be combined with state or palette");
  }
  if (options.state !== undefined && options.palette !== undefined) {
    throw new TypeError("state and palette are alternative initial values");
  }
  if (options.controller !== undefined && options.controllerOptions !== undefined) {
    throw new TypeError("controllerOptions apply only to adapter-owned controllers");
  }
  if (
    options.wheel !== undefined &&
    (options.controller !== undefined || options.state !== undefined)
  ) {
    throw new TypeError("wheel is configured by full-state and injected-controller sources");
  }
}

function ownerDocumentOf(value: unknown): Document | undefined {
  if (typeof value !== "object" || value === null || !("ownerDocument" in value)) {
    return undefined;
  }
  const ownerDocument = value.ownerDocument;
  return typeof ownerDocument === "object" &&
    ownerDocument !== null &&
    "createElement" in ownerDocument &&
    typeof ownerDocument.createElement === "function"
    ? (ownerDocument as Document)
    : undefined;
}

function isElement(target: unknown, ownerDocument: Document): target is Element {
  const ElementConstructor = ownerDocument.defaultView?.Element;
  if (ElementConstructor !== undefined) return target instanceof ElementConstructor;
  return (
    typeof target === "object" &&
    target !== null &&
    "nodeType" in target &&
    target.nodeType === 1 &&
    ownerDocumentOf(target) === ownerDocument
  );
}

function isHtmlElement(target: unknown, ownerDocument: Document): target is HTMLElement {
  const HTMLElementConstructor = ownerDocument.defaultView?.HTMLElement;
  if (HTMLElementConstructor !== undefined) return target instanceof HTMLElementConstructor;
  return (
    isElement(target, ownerDocument) &&
    target.namespaceURI === "http://www.w3.org/1999/xhtml" &&
    "dataset" in target
  );
}

function isInputElement(target: unknown, ownerDocument: Document): target is HTMLInputElement {
  const InputConstructor = ownerDocument.defaultView?.HTMLInputElement;
  if (InputConstructor !== undefined) return target instanceof InputConstructor;
  return isHtmlElement(target, ownerDocument) && target.tagName === "INPUT";
}

function isNode(target: unknown, fallbackDocument: Document): target is Node {
  if (typeof target !== "object" || target === null || !("nodeType" in target)) return false;
  const nodeDocument = ownerDocumentOf(target) ?? fallbackDocument;
  const NodeConstructor = nodeDocument.defaultView?.Node;
  if (NodeConstructor !== undefined) return target instanceof NodeConstructor;
  return typeof target.nodeType === "number" && "nodeName" in target;
}

function asElement(target: EventTarget | null, ownerDocument: Document): Element | null {
  return isElement(target, ownerDocument) ? target : null;
}

function closestPart(
  target: EventTarget | null,
  part: string,
  ownerDocument: Document
): HTMLElement | null {
  const element = asElement(target, ownerDocument)?.closest<HTMLElement>(`[data-part="${part}"]`);
  return element ?? null;
}

function colorName(entry: PaletteColor<object>, index: number): string {
  return entry.name?.trim() || `Color ${index + 1}`;
}

function canEditColor<Metadata extends object>(
  state: PickerState<Metadata>,
  entry: PaletteColor<Metadata>
): boolean {
  return !entry.locked && (state.wheel.interaction === "free" || entry.id === state.anchorColorId);
}

/** Resolve the wheel's roving tab stop; callers fall back to the root when this returns undefined. */
function resolveWheelFocusColorId<Metadata extends object>(
  state: PickerState<Metadata>
): string | undefined {
  if (state.wheel.interaction === "linked") {
    const anchor = state.palette.colors.find((entry) => entry.id === state.anchorColorId);
    return anchor !== undefined && canEditColor(state, anchor) ? anchor.id : undefined;
  }

  const active = state.palette.colors.find((entry) => entry.id === state.activeColorId);
  if (active !== undefined && canEditColor(state, active)) return active.id;
  return state.colorFocusOrder.find((colorId) => {
    const entry = state.palette.colors.find((candidate) => candidate.id === colorId);
    return entry !== undefined && canEditColor(state, entry);
  });
}

function colorCss(color: ColorValue): string {
  return formatColor(color, { format: "rgb", alpha: "auto" });
}

function opaqueColorCss(color: ColorValue): string {
  return formatColor(color, { format: "rgb", alpha: "never" });
}

function colorHex(color: ColorValue): string {
  return formatColor(color, { format: "hex", alpha: "auto" });
}

function wheelCoordinates(state: PickerState<object>, color: ColorValue): { x: number; y: number } {
  const point = colorToWheelPoint(color, {
    model: state.wheel.wheelModel,
    maxChroma: OKLCH_WHEEL_MAX_CHROMA
  });
  return { x: point.x * 100, y: point.y * 100 };
}

function colorFromPoint(
  state: PickerState<object>,
  entry: PaletteColor<object>,
  rect: WheelRect,
  clientX: number,
  clientY: number
): ColorValue {
  const point = clientPointToWheelPoint({ x: clientX, y: clientY }, rect);
  return wheelPointToColor(point, resolveWheelEditingColor(state, entry), {
    model: state.wheel.wheelModel,
    maxChroma: OKLCH_WHEEL_MAX_CHROMA
  });
}

function colorFromChannelRingPoint(
  state: PickerState<object>,
  entry: PaletteColor<object>,
  rect: WheelRect,
  clientX: number,
  clientY: number
): ColorValue {
  const point = clientPointToWheelPoint({ x: clientX, y: clientY }, rect);
  return setWheelChannelValue(
    resolveWheelEditingColor(state, entry),
    ringPointToWheelChannelValue(point),
    {
      model: state.wheel.wheelModel
    }
  );
}

function keyboardColor(
  state: PickerState<object>,
  entry: PaletteColor<object>,
  key: string,
  largeStep: boolean
): ColorValue | undefined {
  const hueStep = largeStep ? 10 : 1;
  const radialStep = largeStep ? 0.1 : 0.01;
  const editingColor = resolveWheelEditingColor(state, entry);
  if (state.wheel.wheelModel === "oklch") {
    const color = convertColor(editingColor, "oklch");
    const chromaStep = radialStep * OKLCH_WHEEL_MAX_CHROMA;
    switch (key) {
      case "ArrowLeft":
        return { ...color, h: (color.h - hueStep + 360) % 360 };
      case "ArrowRight":
        return { ...color, h: (color.h + hueStep) % 360 };
      case "PageDown":
        return { ...color, h: (color.h - 10 + 360) % 360 };
      case "PageUp":
        return { ...color, h: (color.h + 10) % 360 };
      case "ArrowDown":
        return { ...color, c: clamp(color.c - chromaStep, 0, OKLCH_WHEEL_MAX_CHROMA) };
      case "ArrowUp":
        return { ...color, c: clamp(color.c + chromaStep, 0, OKLCH_WHEEL_MAX_CHROMA) };
      case "Home":
        return { ...color, c: 0 };
      case "End":
        return { ...color, c: OKLCH_WHEEL_MAX_CHROMA };
      default:
        return undefined;
    }
  }

  const color = convertColor(editingColor, "hsv");
  switch (key) {
    case "ArrowLeft":
      return { ...color, h: (color.h - hueStep + 360) % 360 };
    case "ArrowRight":
      return { ...color, h: (color.h + hueStep) % 360 };
    case "PageDown":
      return { ...color, h: (color.h - 10 + 360) % 360 };
    case "PageUp":
      return { ...color, h: (color.h + 10) % 360 };
    case "ArrowDown":
      return { ...color, s: clamp(color.s - radialStep) };
    case "ArrowUp":
      return { ...color, s: clamp(color.s + radialStep) };
    case "Home":
      return { ...color, s: 0 };
    case "End":
      return { ...color, s: 1 };
    default:
      return undefined;
  }
}

function channelColor(
  state: PickerState<object>,
  entry: PaletteColor<object>,
  channel: string,
  rawValue: string
): ColorValue | undefined {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return undefined;
  const editingColor = resolveWheelEditingColor(state, entry);
  if (state.wheel.wheelModel === "oklch") {
    const color: OklchColor = convertColor(editingColor, "oklch");
    if (channel === "hue") return { ...color, h: ((parsed % 360) + 360) % 360 };
    if (channel === "chroma") {
      return { ...color, c: clamp(parsed, 0, OKLCH_WHEEL_MAX_CHROMA) };
    }
    if (channel === "lightness") return { ...color, l: clamp(parsed / 100) };
    return undefined;
  }
  const color: HsvColor = convertColor(editingColor, "hsv");
  if (channel === "hue") return { ...color, h: ((parsed % 360) + 360) % 360 };
  if (channel === "saturation") return { ...color, s: clamp(parsed / 100) };
  if (channel === "value") return { ...color, v: clamp(parsed / 100) };
  return undefined;
}

function makeElement<K extends keyof HTMLElementTagNameMap>(
  ownerDocument: Document,
  tagName: K,
  part?: string
): HTMLElementTagNameMap[K] {
  const element = ownerDocument.createElement(tagName);
  if (part !== undefined) element.dataset.part = part;
  return element;
}

function button(
  ownerDocument: Document,
  label: string,
  action: string,
  text: string
): HTMLButtonElement {
  const element = makeElement(ownerDocument, "button", "icon-button");
  element.type = "button";
  element.dataset.action = action;
  element.setAttribute("aria-label", label);
  element.textContent = text;
  return element;
}

function reconciliationKey(node: Node): string {
  if (node.nodeType !== 1) return `#${node.nodeType}`;
  const element = node as Element;
  const part = element.getAttribute("data-part") ?? "";
  const fieldPart =
    part === "field" ? (element.querySelector("[data-part]")?.getAttribute("data-part") ?? "") : "";
  return [
    element.namespaceURI,
    element.tagName,
    part,
    element.getAttribute("data-color-id"),
    element.getAttribute("data-channel"),
    element.getAttribute("data-action"),
    fieldPart
  ].join("|");
}

function reconcileNode(current: Node, next: Node): void {
  if (current.nodeType !== 1 || next.nodeType !== 1) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  const currentElement = current as Element;
  const nextElement = next as Element;
  for (const attribute of [...currentElement.attributes]) {
    if (!nextElement.hasAttribute(attribute.name)) currentElement.removeAttribute(attribute.name);
  }
  for (const attribute of [...nextElement.attributes]) {
    if (currentElement.getAttribute(attribute.name) !== attribute.value) {
      currentElement.setAttribute(attribute.name, attribute.value);
    }
  }
  if (currentElement.tagName === "INPUT" && nextElement.tagName === "INPUT") {
    const currentInput = currentElement as HTMLInputElement;
    const nextInput = nextElement as HTMLInputElement;
    if (currentInput.value !== nextInput.value) currentInput.value = nextInput.value;
    currentInput.checked = nextInput.checked;
    currentInput.disabled = nextInput.disabled;
  } else if (currentElement.tagName === "OUTPUT" && nextElement.tagName === "OUTPUT") {
    (currentElement as HTMLOutputElement).value = (nextElement as HTMLOutputElement).value;
  }
  reconcileChildren(currentElement, [...nextElement.childNodes]);
}

function reconcileChildren(parent: Element, desiredChildren: readonly Node[]): void {
  const currentByKey = new Map<string, Node[]>();
  for (const child of [...parent.childNodes]) {
    const key = reconciliationKey(child);
    const matching = currentByKey.get(key);
    if (matching === undefined) currentByKey.set(key, [child]);
    else matching.push(child);
  }
  let reference = parent.firstChild;
  for (const desired of desiredChildren) {
    const current = currentByKey.get(reconciliationKey(desired))?.shift();
    const node = current ?? desired;
    if (current !== undefined) reconcileNode(current, desired);
    if (node !== reference) parent.insertBefore(node, reference);
    reference = node.nextSibling;
  }
  for (const remaining of currentByKey.values()) {
    for (const child of remaining) {
      if (child.parentNode === parent) parent.removeChild(child);
    }
  }
}

function renderPaletteBlock<Metadata extends object>(
  ownerDocument: Document,
  state: PickerState<Metadata>,
  instanceId: string,
  blockProps: ColorwheelPaletteBlockProps = {},
  drafts?: ReadonlyMap<string, ColorDraft>
): HTMLElement {
  const section = makeElement(ownerDocument, "section", "palette");
  section.className = "colorwheel-palette";
  const titleId = `${instanceId}-palette-title`;
  section.setAttribute("aria-labelledby", titleId);

  const header = makeElement(ownerDocument, "header", "block-header");
  const heading = makeElement(ownerDocument, "div");
  const title = makeElement(ownerDocument, "h2", "block-title");
  title.id = titleId;
  title.textContent = blockProps.title ?? "Palette";
  heading.append(title);
  if (blockProps.description) {
    const descriptionId = `${instanceId}-palette-description`;
    const description = makeElement(ownerDocument, "div", "block-description");
    description.id = descriptionId;
    description.textContent = blockProps.description;
    heading.append(description);
    section.setAttribute("aria-describedby", descriptionId);
  }
  const count = makeElement(ownerDocument, "span", "palette-count");
  count.textContent = `${state.palette.colors.length} ${state.palette.colors.length === 1 ? "color" : "colors"}`;
  header.append(heading, count);
  section.append(header);

  const list = makeElement(ownerDocument, "ul", "palette-list");
  state.palette.colors.forEach((entry, index) => {
    const item = makeElement(ownerDocument, "li", "palette-item");
    item.dataset.colorId = entry.id;
    if (entry.id === state.activeColorId) item.dataset.active = "";
    if (entry.id === state.anchorColorId) item.dataset.anchor = "";
    if (entry.locked) item.dataset.locked = "";

    const label = colorName(entry, index);
    const hex = colorHex(entry.color);
    const storedDraft = drafts?.get(entry.id);
    const draft = storedDraft?.source === hex ? storedDraft : undefined;
    const swatch = makeElement(ownerDocument, "button", "swatch");
    swatch.type = "button";
    swatch.dataset.action = "select";
    swatch.dataset.colorId = entry.id;
    swatch.setAttribute("aria-label", `Select ${label}, ${hex}`);
    swatch.setAttribute("aria-pressed", String(entry.id === state.activeColorId));
    swatch.style.setProperty("--colorwheel-swatch-color", colorCss(entry.color));
    const swatchColor = makeElement(ownerDocument, "span", "swatch-color");
    swatchColor.setAttribute("aria-hidden", "true");
    swatch.append(swatchColor);
    if (entry.id === state.anchorColorId) {
      const anchor = makeElement(ownerDocument, "span", "anchor-mark");
      anchor.setAttribute("aria-hidden", "true");
      anchor.textContent = "Anchor";
      swatch.append(anchor);
    }
    item.append(swatch);

    const fields = makeElement(ownerDocument, "div", "palette-item-fields");
    if (blockProps.showName ?? true) {
      const nameLabel = makeElement(ownerDocument, "label", "field");
      const hiddenName = makeElement(ownerDocument, "span");
      hiddenName.className = "colorwheel-visually-hidden";
      hiddenName.textContent = `${label} name`;
      const nameInput = makeElement(ownerDocument, "input", "name-input");
      nameInput.dataset.colorId = entry.id;
      nameInput.value = entry.name ?? "";
      nameInput.placeholder = label;
      nameLabel.append(hiddenName, nameInput);
      fields.append(nameLabel);
    }

    const colorLabelElement = makeElement(ownerDocument, "label", "field");
    const hiddenColor = makeElement(ownerDocument, "span");
    hiddenColor.className = "colorwheel-visually-hidden";
    hiddenColor.textContent = `${label} value`;
    const colorInput = makeElement(ownerDocument, "input", "color-input");
    colorInput.dataset.colorId = entry.id;
    colorInput.value = draft?.value ?? hex;
    colorInput.disabled = !canEditColor(state, entry);
    colorInput.spellcheck = false;
    colorInput.autocapitalize = "none";
    colorLabelElement.append(hiddenColor, colorInput);
    if (draft?.invalid) {
      const errorId = `${instanceId}-color-error-${encodeURIComponent(entry.id)}`;
      colorInput.setAttribute("aria-invalid", "true");
      colorInput.setAttribute("aria-describedby", errorId);
      const error = makeElement(ownerDocument, "span", "field-error");
      error.id = errorId;
      error.setAttribute("role", "alert");
      error.textContent = "Enter a supported CSS color.";
      colorLabelElement.append(error);
    }
    fields.append(colorLabelElement);
    item.append(fields);

    if (blockProps.showActions ?? true) {
      const actions = makeElement(ownerDocument, "div", "palette-item-actions");
      const lock = button(
        ownerDocument,
        `${entry.locked ? "Unlock" : "Lock"} ${label}`,
        "lock",
        entry.locked ? "Locked" : "Lock"
      );
      lock.dataset.colorId = entry.id;
      lock.setAttribute("aria-pressed", String(Boolean(entry.locked)));
      const earlier = button(ownerDocument, `Move ${label} earlier`, "move-earlier", "←");
      earlier.dataset.colorId = entry.id;
      earlier.disabled = index === 0;
      const later = button(ownerDocument, `Move ${label} later`, "move-later", "→");
      later.dataset.colorId = entry.id;
      later.disabled = index === state.palette.colors.length - 1;
      const remove = button(ownerDocument, `Remove ${label}`, "remove", "Remove");
      remove.dataset.colorId = entry.id;
      actions.append(lock, earlier, later, remove);
      item.append(actions);
    }
    list.append(item);
  });
  section.append(list);

  if (blockProps.allowAdd ?? true) {
    const add = button(ownerDocument, "Add color", "add", "Add color");
    add.dataset.part = "add-color";
    section.append(add);
  }
  return section;
}

function renderWheel<Metadata extends object>(
  ownerDocument: Document,
  state: PickerState<Metadata>,
  instanceId: string,
  blockProps: ColorwheelWheelBlockProps = {},
  ringSide: WheelRingSide = "right"
): HTMLElement {
  const showInstructions = blockProps.showInstructions ?? true;
  const showChannels = blockProps.showChannels ?? true;
  const showChannelRing = blockProps.showChannelRing ?? true;
  const section = makeElement(ownerDocument, "section", "wheel-block");
  section.className = "colorwheel-wheel";
  const titleId = `${instanceId}-wheel-title`;
  section.setAttribute("aria-labelledby", titleId);
  const header = makeElement(ownerDocument, "header", "block-header");
  const heading = makeElement(ownerDocument, "div");
  const title = makeElement(ownerDocument, "h2", "block-title");
  title.id = titleId;
  title.textContent = blockProps.title ?? "Color wheel";
  heading.append(title);
  if (blockProps.description) {
    const descriptionId = `${instanceId}-wheel-description`;
    const description = makeElement(ownerDocument, "div", "block-description");
    description.id = descriptionId;
    description.textContent = blockProps.description;
    heading.append(description);
    section.setAttribute("aria-describedby", descriptionId);
  }
  const instructionsId = `${instanceId}-wheel-instructions`;
  const active = state.palette.colors.find((entry) => entry.id === state.activeColorId);
  const activeIndex = Math.max(
    0,
    state.palette.colors.findIndex((entry) => entry.id === state.activeColorId)
  );
  const activeColor = makeElement(ownerDocument, "output", "active-color");
  activeColor.setAttribute("aria-live", "polite");
  activeColor.textContent = active === undefined ? "No color" : colorHex(active.color);
  header.append(heading, activeColor);
  section.append(header);

  const frame = makeElement(ownerDocument, "div", "wheel-frame");
  frame.dataset.model = state.wheel.wheelModel;
  const anchor = state.palette.colors.find((entry) => entry.id === state.anchorColorId);
  const ringEntry =
    state.wheel.interaction === "linked" ? anchor : (active ?? state.palette.colors[0]);
  const ringEditingColor =
    ringEntry === undefined ? undefined : resolveWheelEditingColor(state, ringEntry);
  const hasChannelRing = showChannelRing && ringEntry !== undefined;
  frame.dataset.ring = String(hasChannelRing);
  if (hasChannelRing && ringEntry !== undefined && ringEditingColor !== undefined) {
    const model = state.wheel.wheelModel;
    const channel = model === "oklch" ? "lightness" : "value";
    const channelValue = getWheelChannelValue(ringEditingColor, { model });
    const percentage = Math.round(channelValue * 100);
    const ringPoint = wheelChannelValueToRingPoint(channelValue, { side: ringSide });
    const ringEntryIndex = Math.max(
      0,
      state.palette.colors.findIndex((entry) => entry.id === ringEntry.id)
    );
    const editable = canEditColor(state, ringEntry);
    const ring = makeElement(ownerDocument, "div", "channel-ring");
    ring.dataset.colorId = ringEntry.id;
    ring.dataset.channel = channel;
    ring.dataset.model = model;
    ring.dataset.side = ringSide;
    ring.setAttribute("role", "slider");
    ring.setAttribute("aria-label", `${colorName(ringEntry, ringEntryIndex)} ${channel} ring`);
    ring.setAttribute("aria-valuemin", "0");
    ring.setAttribute("aria-valuemax", "100");
    ring.setAttribute("aria-valuenow", String(Math.round(channelValue * 1000) / 10));
    ring.setAttribute("aria-valuetext", `${percentage} percent`);
    ring.setAttribute("aria-orientation", "vertical");
    if (!editable) ring.setAttribute("aria-disabled", "true");
    ring.tabIndex = editable ? 0 : -1;
    frame.style.setProperty(
      "--colorwheel-channel-start",
      opaqueColorCss(setWheelChannelValue(ringEditingColor, 0, { model }))
    );
    frame.style.setProperty(
      "--colorwheel-channel-mid",
      opaqueColorCss(setWheelChannelValue(ringEditingColor, 0.5, { model }))
    );
    frame.style.setProperty(
      "--colorwheel-channel-end",
      opaqueColorCss(setWheelChannelValue(ringEditingColor, 1, { model }))
    );
    frame.style.setProperty("--colorwheel-channel-ring-x", `${ringPoint.x * 100}%`);
    frame.style.setProperty("--colorwheel-channel-ring-y", `${ringPoint.y * 100}%`);
    frame.style.setProperty(
      "--colorwheel-channel-ring-angle",
      `${Math.atan2(ringPoint.y - 0.5, ringPoint.x - 0.5)}rad`
    );
    frame.style.setProperty("--colorwheel-channel-color", opaqueColorCss(ringEditingColor));
    const track = makeElement(ownerDocument, "span", "channel-ring-track");
    track.setAttribute("aria-hidden", "true");
    const thumb = makeElement(ownerDocument, "span", "channel-ring-thumb");
    thumb.setAttribute("aria-hidden", "true");
    ring.append(track, thumb);
    frame.append(ring);
  }

  const surface = makeElement(ownerDocument, "div", "wheel");
  surface.className = "colorwheel-wheel-surface";
  surface.dataset.model = state.wheel.wheelModel;
  const wheelA11y = getWheelAccessibilityProps();
  surface.setAttribute("role", wheelA11y.role ?? "group");
  surface.setAttribute("aria-label", wheelA11y["aria-label"] ?? "Color wheel");
  if (showInstructions) {
    surface.setAttribute("aria-describedby", instructionsId);
  }
  const activeEditingColor =
    active === undefined ? undefined : resolveWheelEditingColor(state, active);
  const activeHsv =
    activeEditingColor === undefined ? undefined : convertColor(activeEditingColor, "hsv");
  surface.style.setProperty("--colorwheel-value", String(activeHsv?.v ?? 1));
  if (activeEditingColor !== undefined) {
    const activeOklch = convertColor(activeEditingColor, "oklch");
    surface.style.setProperty("--colorwheel-lightness", `${activeOklch.l * 100}%`);
  }
  const colorLayer = makeElement(ownerDocument, "div", "wheel-color");
  colorLayer.setAttribute("aria-hidden", "true");
  surface.append(colorLayer);

  const points: Array<{
    readonly entry: PaletteColor<Metadata>;
    readonly coordinates: { readonly x: number; readonly y: number };
  }> = [];
  for (const colorId of state.colorFocusOrder) {
    const entry = state.palette.colors.find((candidate) => candidate.id === colorId);
    if (entry !== undefined) {
      points.push({
        entry,
        coordinates: wheelCoordinates(state, resolveWheelEditingColor(state, entry))
      });
    }
  }
  if (points.length > 1) {
    const lines = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
    lines.setAttribute("data-part", "harmony-lines");
    lines.setAttribute("viewBox", "0 0 100 100");
    lines.setAttribute("aria-hidden", "true");
    points.forEach(({ coordinates }, index) => {
      const next = points[(index + 1) % points.length]?.coordinates;
      if (next === undefined) return;
      const line = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(coordinates.x));
      line.setAttribute("y1", String(coordinates.y));
      line.setAttribute("x2", String(next.x));
      line.setAttribute("y2", String(next.y));
      lines.append(line);
    });
    surface.append(lines);
  }

  const focusColorId = resolveWheelFocusColorId(state);

  points.forEach(({ entry, coordinates }) => {
    const handle = makeElement(ownerDocument, "button", "pointer");
    const editable = canEditColor(state, entry);
    handle.type = "button";
    handle.dataset.colorId = entry.id;
    if (editable) handle.dataset.editable = "";
    handle.disabled = !editable;
    const pointerA11y = getPointerAccessibilityProps(state, entry.id);
    handle.setAttribute("role", pointerA11y.role ?? "button");
    if (pointerA11y["aria-label"] !== undefined) {
      handle.setAttribute("aria-label", pointerA11y["aria-label"]);
    }
    handle.setAttribute("aria-pressed", String(Boolean(pointerA11y["aria-pressed"])));
    if (pointerA11y["aria-setsize"] !== undefined) {
      handle.setAttribute("aria-setsize", String(pointerA11y["aria-setsize"]));
    }
    if (pointerA11y["aria-posinset"] !== undefined) {
      handle.setAttribute("aria-posinset", String(pointerA11y["aria-posinset"]));
    }
    handle.dataset.active = String(entry.id === state.activeColorId);
    handle.dataset.anchor = String(entry.id === state.anchorColorId);
    handle.dataset.locked = String(Boolean(entry.locked));
    handle.tabIndex = entry.id === focusColorId ? 0 : -1;
    handle.style.setProperty("--colorwheel-pointer-x", `${coordinates.x}%`);
    handle.style.setProperty("--colorwheel-pointer-y", `${coordinates.y}%`);
    handle.style.setProperty("--colorwheel-pointer-color", colorCss(entry.color));
    const pointerColor = makeElement(ownerDocument, "span", "pointer-color");
    pointerColor.setAttribute("aria-hidden", "true");
    handle.append(pointerColor);
    if (entry.id === state.anchorColorId) {
      const anchor = makeElement(ownerDocument, "span", "pointer-anchor");
      anchor.setAttribute("aria-hidden", "true");
      handle.append(anchor);
    }
    surface.append(handle);
  });
  frame.append(surface);
  section.append(frame);

  if (showInstructions) {
    const instructions = makeElement(ownerDocument, "p", "wheel-instructions");
    instructions.id = instructionsId;
    const ringInstruction = hasChannelRing
      ? ` Drag the outer ring to adjust ${state.wheel.wheelModel === "oklch" ? "lightness" : "value"}.`
      : "";
    const keyboardTarget = hasChannelRing ? "a handle or ring" : "a handle";
    instructions.textContent = showChannels
      ? `Drag or tap the wheel.${ringInstruction} Use arrow keys on ${keyboardTarget}, or use the numeric channel controls.`
      : `Drag or tap the wheel.${ringInstruction} Use arrow keys on ${keyboardTarget}.`;
    section.append(instructions);
  }

  if (showChannels && active !== undefined) {
    const controls = makeElement(ownerDocument, "fieldset", "channels");
    controls.dataset.colorId = active.id;
    const legend = makeElement(ownerDocument, "legend", "field-label");
    legend.textContent = "Active color";
    controls.append(legend);
    const channels =
      state.wheel.wheelModel === "oklch"
        ? (["hue", "chroma", "lightness"] as const)
        : (["hue", "saturation", "value"] as const);
    const activeEditingColor = resolveWheelEditingColor(state, active);
    const value =
      state.wheel.wheelModel === "oklch"
        ? convertColor(activeEditingColor, "oklch")
        : convertColor(activeEditingColor, "hsv");
    for (const channel of channels) {
      const field = makeElement(ownerDocument, "label", "channel");
      field.dataset.channel = channel;
      const caption = makeElement(ownerDocument, "span", "channel-label");
      caption.textContent = channel[0]?.toUpperCase() + channel.slice(1);
      const input = makeElement(ownerDocument, "input", "channel-input");
      input.type = "range";
      input.dataset.channel = channel;
      input.dataset.colorId = active.id;
      if (channel === "hue") {
        input.min = "0";
        input.max = "359";
        input.step = "1";
        input.value = String(Math.round(value.h));
      } else if (channel === "chroma" && "c" in value) {
        input.min = "0";
        input.max = String(OKLCH_WHEEL_MAX_CHROMA);
        input.step = "0.001";
        input.value = String(Math.round(value.c * 1000) / 1000);
      } else {
        input.min = "0";
        input.max = "100";
        input.step = "1";
        const raw =
          channel === "saturation" && "s" in value
            ? value.s
            : channel === "value" && "v" in value
              ? value.v
              : "l" in value
                ? value.l
                : 0;
        input.value = String(Math.round(raw * 100));
      }
      input.disabled = !canEditColor(state, active);
      input.setAttribute("aria-label", `${colorName(active, activeIndex)} ${channel}`);
      const output = makeElement(ownerDocument, "output", "channel-value");
      output.value = input.value;
      output.textContent = `${input.value}${channel === "hue" ? "°" : channel === "chroma" ? "" : "%"}`;
      field.append(caption, input, output);
      controls.append(field);
    }
    section.append(controls);
  }
  return section;
}

function renderResultNode(result: PaletteRenderResult, ownerDocument: Document): Node | undefined {
  if (isNode(result, ownerDocument)) return result;
  if (typeof result === "object" && result !== null && "node" in result) {
    return isNode(result.node, ownerDocument) ? result.node : undefined;
  }
  return undefined;
}

function renderResultDestroy(
  result: PaletteRenderResult,
  ownerDocument: Document
): (() => void) | undefined {
  if (
    typeof result === "object" &&
    result !== null &&
    !isNode(result, ownerDocument) &&
    "destroy" in result &&
    typeof result.destroy === "function"
  ) {
    return result.destroy;
  }
  return undefined;
}

function renderResultUpdate(
  result: PaletteRenderResult,
  ownerDocument: Document
): (() => void) | undefined {
  if (
    typeof result === "object" &&
    result !== null &&
    !isNode(result, ownerDocument) &&
    "update" in result
  ) {
    const update = result.update;
    return typeof update === "function" ? update : undefined;
  }
  return undefined;
}

/** Mount an isolated, framework-free color wheel and palette editor. */
export function mountColorwheel<Metadata extends object = JsonObject>(
  container: HTMLElement,
  initialOptions: ColorwheelMountOptions<Metadata> = {}
): ColorwheelInstance<Metadata> {
  const candidateOwnerDocument = ownerDocumentOf(container);
  if (candidateOwnerDocument === undefined || !isHtmlElement(container, candidateOwnerDocument)) {
    throw new TypeError("mountColorwheel requires an HTMLElement container");
  }
  const ownerDocument: Document = candidateOwnerDocument;
  assertMountOptions(initialOptions);
  const instanceId = createInstanceId(ownerDocument);
  const owned = initialOptions.controller === undefined;
  let controller: PickerController<Metadata>;
  if (initialOptions.controller !== undefined) {
    controller = initialOptions.controller;
  } else {
    const palette = initialOptions.palette ?? (defaultPalette() as Palette<Metadata>);
    const initialState =
      initialOptions.state ??
      createPickerState({
        palette,
        wheel: {
          ...initialOptions.wheel,
          interaction:
            initialOptions.wheel?.interaction ??
            (palette.recipe?.type === "wheel" ? "linked" : "free")
        }
      });
    controller = createPickerController(initialState, initialOptions.controllerOptions);
  }
  let options: ColorwheelPresentationOptions<Metadata> = initialOptions;
  let destroyed = false;
  let drag: DragSession<Metadata> | undefined;
  let ringSide: WheelRingSide = "right";
  let paletteCleanup: (() => void) | undefined;
  let paletteUpdate: (() => void) | undefined;
  let mountedPaletteRenderer: RenderPalette<Metadata> | undefined;
  let unsubscribe: (() => void) | undefined;
  let previousPalette = controller.getPalette();
  const colorDrafts = new Map<string, ColorDraft>();

  const root = makeElement(ownerDocument, "div", "root");
  root.dataset.colorwheel = "";
  root.className = "colorwheel";
  root.setAttribute("role", "group");
  root.tabIndex = -1;
  const layout = makeElement(ownerDocument, "div", "picker-layout");
  const wheelContainer = makeElement(ownerDocument, "div", "wheel-slot");
  const paletteContainer = makeElement(ownerDocument, "div", "palette-slot");
  layout.append(wheelContainer, paletteContainer);
  root.append(layout);
  container.append(root);

  function assertAlive(): void {
    if (destroyed) throw new Error("This Colorwheel instance has been destroyed");
  }

  function applyPresentation(): void {
    root.className = ["colorwheel", options.className].filter(Boolean).join(" ");
    root.toggleAttribute("data-unstyled", Boolean(options.unstyled));
    root.setAttribute("aria-label", options.ariaLabel ?? "Color wheel and palette editor");
  }

  function activeElementInRoot(): Element | null {
    const rootNode = root.getRootNode();
    const ShadowRootConstructor = ownerDocument.defaultView?.ShadowRoot;
    const activeElement =
      ShadowRootConstructor !== undefined && rootNode instanceof ShadowRootConstructor
        ? rootNode.activeElement
        : ownerDocument.activeElement;
    return activeElement !== null && root.contains(activeElement) ? activeElement : null;
  }

  function unmountCustomPalette(): void {
    const cleanup = paletteCleanup;
    paletteCleanup = undefined;
    paletteUpdate = undefined;
    mountedPaletteRenderer = undefined;
    cleanup?.();
  }

  function mountCustomPalette(renderer: RenderPalette<Metadata>): void {
    reconcileChildren(paletteContainer, []);
    const context: PaletteRenderContext<Metadata> = {
      container: paletteContainer,
      controller,
      get state() {
        return controller.getState();
      },
      renderDefault: () =>
        renderPaletteBlock(
          ownerDocument,
          controller.getState(),
          instanceId,
          options.blockProps?.palette,
          colorDrafts
        )
    };
    const result = renderer(context);
    const node = renderResultNode(result, ownerDocument);
    const nextCleanup = renderResultDestroy(result, ownerDocument);
    try {
      if (node !== undefined && node.parentNode !== paletteContainer) paletteContainer.append(node);
    } catch (error) {
      try {
        nextCleanup?.();
      } catch {
        // Preserve the mounting failure after giving the renderer a cleanup chance.
      }
      throw error;
    }
    paletteCleanup = nextCleanup;
    paletteUpdate = renderResultUpdate(result, ownerDocument);
    mountedPaletteRenderer = renderer;
  }

  function render(): void {
    if (destroyed) return;
    const focused = activeElementInRoot();
    const focusedElement = isHtmlElement(focused, ownerDocument) ? focused : undefined;
    const focusedItem = focusedElement?.closest<HTMLElement>("[data-part='palette-item']");
    const paletteItems = [...paletteContainer.querySelectorAll("[data-part='palette-item']")];
    const paletteIndex =
      focusedItem === null || focusedItem === undefined ? -1 : paletteItems.indexOf(focusedItem);
    const focusedColorId = focusedElement?.closest<HTMLElement>("[data-color-id]")?.dataset.colorId;
    const state = controller.getState();
    for (const [colorId, draft] of colorDrafts) {
      const entry = state.palette.colors.find((candidate) => candidate.id === colorId);
      if (entry === undefined || colorHex(entry.color) !== draft.source)
        colorDrafts.delete(colorId);
    }
    applyPresentation();
    reconcileChildren(wheelContainer, [
      renderWheel(ownerDocument, state, instanceId, options.blockProps?.wheel, ringSide)
    ]);
    if (options.renderPalette === false) {
      unmountCustomPalette();
      reconcileChildren(paletteContainer, []);
      paletteContainer.hidden = true;
    } else if (options.renderPalette === undefined) {
      unmountCustomPalette();
      paletteContainer.hidden = false;
      reconcileChildren(paletteContainer, [
        renderPaletteBlock(
          ownerDocument,
          state,
          instanceId,
          options.blockProps?.palette,
          colorDrafts
        )
      ]);
    } else {
      paletteContainer.hidden = false;
      if (mountedPaletteRenderer !== options.renderPalette) {
        unmountCustomPalette();
        mountCustomPalette(options.renderPalette);
      } else {
        paletteUpdate?.();
      }
    }
    if (
      focusedElement !== undefined &&
      (!root.contains(focusedElement) ||
        focusedElement.closest("[hidden]") !== null ||
        ("disabled" in focusedElement && focusedElement.disabled === true))
    ) {
      const retainedColorId = state.palette.colors.some((entry) => entry.id === focusedColorId)
        ? focusedColorId
        : state.palette.colors[Math.min(paletteIndex, state.palette.colors.length - 1)]?.id;
      (findPart("swatch", retainedColorId) ?? findPart("add-color") ?? root).focus();
    }
  }

  function currentEntry(colorId: string): PaletteColor<Metadata> | undefined {
    return controller.getPalette().colors.find((entry) => entry.id === colorId);
  }

  function findPart(part: string, colorId?: string, channel?: string): HTMLElement | undefined {
    return [...root.querySelectorAll<HTMLElement>(`[data-part="${part}"]`)].find(
      (element) =>
        (colorId === undefined || element.dataset.colorId === colorId) &&
        (channel === undefined || element.dataset.channel === channel)
    );
  }

  function setColorFromChannel(input: HTMLInputElement): void {
    const colorId = input.dataset.colorId;
    const channel = input.dataset.channel;
    if (colorId === undefined || channel === undefined) return;
    const state = controller.getState();
    const entry = currentEntry(colorId);
    if (entry === undefined || !canEditColor(state, entry)) return;
    const next = channelColor(state, entry, channel, input.value);
    if (next !== undefined) {
      controller.commands.setColor(colorId, next, {
        action: "text-input",
        phase: "commit"
      });
    }
  }

  function commitColorInput(input: HTMLInputElement): void {
    const colorId = input.dataset.colorId;
    if (colorId === undefined) return;
    const state = controller.getState();
    const entry = currentEntry(colorId);
    if (entry === undefined || !canEditColor(state, entry)) return;
    const source = colorHex(entry.color);
    if (
      !colorDrafts.has(colorId) &&
      input.value === source &&
      input.getAttribute("aria-invalid") !== "true"
    ) {
      return;
    }
    try {
      const next = parseColor(input.value);
      colorDrafts.delete(colorId);
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
      input.parentElement?.querySelector("[data-part='field-error']")?.remove();
      controller.commands.setColor(colorId, next, {
        action: "text-input",
        phase: "commit"
      });
      input.value = colorHex(next);
    } catch {
      colorDrafts.set(colorId, { source, value: input.value, invalid: true });
      input.setAttribute("aria-invalid", "true");
      const errorId = `${instanceId}-color-error-${encodeURIComponent(colorId)}`;
      let error = input.parentElement?.querySelector<HTMLElement>("[data-part='field-error']");
      if (error === undefined || error === null) {
        error = makeElement(ownerDocument, "span", "field-error");
        error.setAttribute("role", "alert");
        input.parentElement?.append(error);
      }
      error.id = errorId;
      error.textContent = "Enter a supported CSS color.";
      input.setAttribute("aria-describedby", errorId);
    }
  }

  function onInput(event: Event): void {
    const input = event.target;
    if (!isInputElement(input, ownerDocument) || input.dataset.part !== "color-input") return;
    const colorId = input.dataset.colorId;
    const entry = colorId === undefined ? undefined : currentEntry(colorId);
    if (colorId === undefined || entry === undefined) return;
    colorDrafts.set(colorId, {
      source: colorHex(entry.color),
      value: input.value,
      invalid: false
    });
  }

  function onClick(event: MouseEvent): void {
    const actionElement = asElement(event.target, ownerDocument)?.closest<HTMLElement>(
      "[data-action]"
    );
    if (actionElement === undefined || actionElement === null || !root.contains(actionElement))
      return;
    const action = actionElement.dataset.action;
    const colorId = actionElement.dataset.colorId;
    if (action === "add") {
      const active = controller
        .getState()
        .palette.colors.find((entry) => entry.id === controller.getState().activeColorId);
      const id = controller.commands.addColor(
        { color: active?.color ?? { space: "hsv", h: 0, s: 0, v: 0.5 }, name: "New color" },
        undefined,
        { action: "add", phase: "commit" }
      );
      controller.commands.setActive(id, { action: "selection", phase: "commit" });
      return;
    }
    if (colorId === undefined) return;
    const state = controller.getState();
    const index = state.palette.colors.findIndex((entry) => entry.id === colorId);
    const entry = state.palette.colors[index];
    if (entry === undefined) return;
    if (action === "select") controller.commands.setActive(colorId, { action: "selection" });
    if (action === "lock")
      controller.commands.setLocked(colorId, !entry.locked, { action: "lock" });
    if (action === "move-earlier" && index > 0) {
      controller.commands.reorderColor(colorId, index - 1, { action: "reorder" });
    }
    if (action === "move-later" && index < state.palette.colors.length - 1) {
      controller.commands.reorderColor(colorId, index + 1, { action: "reorder" });
    }
    if (action === "remove") controller.commands.removeColor(colorId, { action: "remove" });
  }

  function onChange(event: Event): void {
    const input = event.target;
    if (!isInputElement(input, ownerDocument) || !root.contains(input)) return;
    if (input.dataset.part === "color-input") commitColorInput(input);
    if (input.dataset.part === "channel-input") setColorFromChannel(input);
    if (input.dataset.part === "name-input") {
      const colorId = input.dataset.colorId;
      if (colorId !== undefined) {
        controller.commands.setName(colorId, input.value || undefined, {
          action: "text-input",
          phase: "commit"
        });
      }
    }
  }

  function onBlur(event: FocusEvent): void {
    const input = event.target;
    if (isInputElement(input, ownerDocument) && input.dataset.part === "color-input") {
      commitColorInput(input);
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    const input = event.target;
    if (isInputElement(input, ownerDocument) && input.dataset.part === "color-input") {
      if (event.key === "Enter") {
        event.preventDefault();
        commitColorInput(input);
      } else if (event.key === "Escape") {
        event.preventDefault();
        const colorId = input.dataset.colorId;
        const entry = colorId === undefined ? undefined : currentEntry(colorId);
        if (entry !== undefined) input.value = colorHex(entry.color);
        if (colorId !== undefined) colorDrafts.delete(colorId);
        input.removeAttribute("aria-invalid");
        input.removeAttribute("aria-describedby");
        input.parentElement?.querySelector("[data-part='field-error']")?.remove();
      }
      return;
    }

    const channelRing = closestPart(event.target, "channel-ring", ownerDocument);
    const channelRingColorId = channelRing?.dataset.colorId;
    if (channelRing !== null && channelRingColorId !== undefined) {
      const state = controller.getState();
      const entry = currentEntry(channelRingColorId);
      if (entry === undefined || !canEditColor(state, entry)) return;
      const editingColor = resolveWheelEditingColor(state, entry);
      const current = getWheelChannelValue(editingColor, {
        model: state.wheel.wheelModel
      });
      const next = getSliderKeyboardValue(
        current * 100,
        {
          key: event.key,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey
        },
        {
          minimum: 0,
          maximum: 100,
          step: 1,
          coarseStep: 10,
          fineStep: 0.1,
          orientation: "vertical"
        }
      );
      if (next === undefined) return;
      event.preventDefault();
      controller.commands.setActive(channelRingColorId, {
        action: "selection",
        phase: "commit"
      });
      controller.commands.setColor(
        channelRingColorId,
        setWheelChannelValue(editingColor, next / 100, {
          model: state.wheel.wheelModel
        }),
        { action: "keyboard", phase: "commit" }
      );
      findPart("channel-ring", channelRingColorId)?.focus();
      return;
    }

    const handle = closestPart(event.target, "pointer", ownerDocument) as HTMLButtonElement | null;
    const colorId = handle?.dataset.colorId;
    if (handle === null || colorId === undefined || handle.disabled) return;
    const state = controller.getState();
    const entry = currentEntry(colorId);
    if (entry === undefined) return;
    const next = keyboardColor(
      state,
      entry,
      event.key,
      event.shiftKey || event.key.startsWith("Page")
    );
    if (next === undefined) return;
    event.preventDefault();
    controller.commands.setActive(colorId, { action: "selection", phase: "commit" });
    controller.commands.setColor(colorId, next, { action: "keyboard", phase: "commit" });
    findPart("pointer", colorId)?.focus();
  }

  function dragAction(
    session: DragSession<Metadata>,
    event: PointerEvent
  ): PickerAction<Metadata> | undefined {
    const state = controller.getState();
    const entry = currentEntry(session.colorId);
    if (entry === undefined || !canEditColor(state, entry)) return undefined;
    if (session.region === "channel-ring") {
      const pointerX = (event.clientX - session.rect.left) / session.rect.width;
      if (pointerX < 0.45) ringSide = "left";
      else if (pointerX > 0.55) ringSide = "right";
    }
    return {
      type: "set-color",
      colorId: session.colorId,
      color:
        session.region === "channel-ring"
          ? colorFromChannelRingPoint(state, entry, session.rect, event.clientX, event.clientY)
          : colorFromPoint(state, entry, session.rect, event.clientX, event.clientY)
    };
  }

  function finishDrag(cancelled: boolean, finalAction?: PickerAction<Metadata>): void {
    const session = drag;
    if (session === undefined) return;
    drag = undefined;
    try {
      if (session.captureTarget.hasPointerCapture?.(session.pointerId)) {
        session.captureTarget.releasePointerCapture(session.pointerId);
      }
    } catch {
      // The browser may have already released capture for this pointer.
    }
    if (cancelled) session.interaction.cancel();
    else {
      if (finalAction !== undefined) session.interaction.update(finalAction);
      session.interaction.commit();
    }
  }

  function onPointerMove(event: PointerEvent): void {
    const session = drag;
    if (session === undefined || event.pointerId !== session.pointerId) return;
    const action = dragAction(session, event);
    if (action !== undefined) session.interaction.update(action);
  }

  function onPointerUp(event: PointerEvent): void {
    const session = drag;
    if (session === undefined || event.pointerId !== session.pointerId) return;
    finishDrag(false, dragAction(session, event));
  }

  function onPointerCancel(event: PointerEvent): void {
    if (drag === undefined || event.pointerId !== drag.pointerId) return;
    finishDrag(true);
  }

  function onLostPointerCapture(event: PointerEvent): void {
    if (drag === undefined || event.pointerId !== drag.pointerId) return;
    finishDrag(true);
  }

  function onPointerDown(event: PointerEvent): void {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    const channelRing = closestPart(event.target, "channel-ring", ownerDocument);
    const wheel = closestPart(event.target, "wheel", ownerDocument);
    const surface = channelRing ?? wheel;
    if (surface === null || !root.contains(surface)) return;
    const handle = wheel === null ? null : closestPart(event.target, "pointer", ownerDocument);
    const state = controller.getState();
    const colorId =
      channelRing?.dataset.colorId ??
      handle?.dataset.colorId ??
      (state.wheel.interaction === "linked" ? state.anchorColorId : state.activeColorId) ??
      state.palette.colors.find((entry) => !entry.locked)?.id;
    if (colorId === undefined) return;
    const entry = currentEntry(colorId);
    if (entry === undefined || !canEditColor(state, entry)) return;
    event.preventDefault();
    finishDrag(true);
    const bounds = surface.getBoundingClientRect();
    const rect: WheelRect = {
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height
    };
    if (channelRing !== null) {
      const pointerX = (event.clientX - rect.left) / rect.width;
      if (pointerX < 0.45) ringSide = "left";
      else if (pointerX > 0.55) ringSide = "right";
    }
    try {
      root.setPointerCapture?.(event.pointerId);
    } catch {
      // Document listeners still keep the interaction continuous.
    }
    controller.commands.setActive(colorId, { action: "selection", phase: "commit" });
    const interaction = controller.beginInteraction({ action: "pointer", origin: "user" });
    const session: DragSession<Metadata> = {
      region: channelRing === null ? "wheel" : "channel-ring",
      pointerId: event.pointerId,
      colorId,
      captureTarget: root,
      rect,
      interaction
    };
    drag = session;
    const action = dragAction(session, event);
    if (action !== undefined) interaction.update(action);
  }

  function removeEventListeners(): void {
    root.removeEventListener("click", onClick);
    root.removeEventListener("input", onInput);
    root.removeEventListener("change", onChange);
    root.removeEventListener("blur", onBlur, true);
    root.removeEventListener("keydown", onKeyDown);
    root.removeEventListener("pointerdown", onPointerDown);
    ownerDocument.removeEventListener("pointermove", onPointerMove);
    ownerDocument.removeEventListener("pointerup", onPointerUp);
    ownerDocument.removeEventListener("pointercancel", onPointerCancel);
    root.removeEventListener("lostpointercapture", onLostPointerCapture);
  }

  function rollbackMount(): void {
    destroyed = true;
    const mountedUnsubscribe = unsubscribe;
    const mountedPaletteCleanup = paletteCleanup;
    const cleanupSteps: readonly (() => void)[] = [
      () => mountedUnsubscribe?.(),
      () => mountedPaletteCleanup?.(),
      removeEventListeners,
      () => root.remove(),
      () => {
        if (owned) controller.destroy();
      }
    ];
    paletteCleanup = undefined;
    paletteUpdate = undefined;
    mountedPaletteRenderer = undefined;
    unsubscribe = undefined;
    for (const cleanup of cleanupSteps) {
      try {
        cleanup();
      } catch {
        // Preserve the initialization error while completing every rollback step.
      }
    }
  }

  try {
    root.addEventListener("click", onClick);
    root.addEventListener("input", onInput);
    root.addEventListener("change", onChange);
    root.addEventListener("blur", onBlur, true);
    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("pointerdown", onPointerDown);
    ownerDocument.addEventListener("pointermove", onPointerMove);
    ownerDocument.addEventListener("pointerup", onPointerUp);
    ownerDocument.addEventListener("pointercancel", onPointerCancel);
    root.addEventListener("lostpointercapture", onLostPointerCapture);

    unsubscribe = controller.subscribe(
      (state) => state,
      (state, meta) => {
        const paletteChanged = previousPalette !== state.palette;
        previousPalette = state.palette;
        render();
        if (meta.origin !== "external") {
          options.onChange?.(state, meta);
          if (paletteChanged) options.onPaletteChange?.(state.palette, meta);
        }
      }
    );
    render();
  } catch (error) {
    rollbackMount();
    throw error;
  }

  const instance: ColorwheelInstance<Metadata> = {
    root,
    controller,
    setState(state) {
      assertAlive();
      controller.setState(state, { origin: "external", action: "programmatic" });
    },
    setPalette(palette) {
      assertAlive();
      controller.setPalette(palette, { origin: "external", action: "programmatic" });
    },
    update(next: ColorwheelUpdateOptions<Metadata>) {
      assertAlive();
      if (next.state !== undefined && next.palette !== undefined) {
        throw new TypeError("state and palette are alternative external updates");
      }
      options = { ...options, ...next };
      if (next.state !== undefined) {
        controller.setState(next.state, { origin: "external", action: "programmatic" });
      } else if (next.palette !== undefined) {
        controller.setPalette(next.palette, { origin: "external", action: "programmatic" });
      } else {
        render();
      }
    },
    focus(target = { type: "root" }) {
      assertAlive();
      if (target.type === "root") {
        root.focus();
        return;
      }
      if (target.type === "wheel") {
        const colorId = resolveWheelFocusColorId(controller.getState());
        (colorId === undefined ? root : (findPart("pointer", colorId) ?? root)).focus();
        return;
      }
      const element =
        target.type === "pointer"
          ? findPart("pointer", target.colorId)
          : target.type === "swatch"
            ? findPart("swatch", target.colorId)
            : target.type === "palette"
              ? findPart("swatch")
              : findPart("channel-input", target.colorId, target.channel);
      element?.focus();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      const mountedUnsubscribe = unsubscribe;
      unsubscribe = undefined;
      let firstError: Error | undefined;
      const cleanupSteps: readonly (() => void)[] = [
        () => mountedUnsubscribe?.(),
        () => finishDrag(true),
        unmountCustomPalette,
        removeEventListeners,
        () => root.remove(),
        () => {
          if (owned) controller.destroy();
        }
      ];
      for (const cleanup of cleanupSteps) {
        try {
          cleanup();
        } catch (error) {
          firstError ??= error instanceof Error ? error : new Error(String(error));
        }
      }
      if (firstError !== undefined) throw firstError;
    }
  };
  return instance;
}
