import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function openShowcase(page: Page): Promise<void> {
  await page.goto("./", { waitUntil: "networkidle" });
}

async function expectNoPageOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
}

function frameworkTab(tablist: Locator, label: string): Locator {
  return tablist.getByRole("tab", { name: label, exact: true });
}

function paletteRelationshipOption(listbox: Locator, label: string): Locator {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return listbox.getByRole("option", { name: new RegExp(`^${escapedLabel}(?:\\s|$)`) });
}

async function selectExampleFramework(page: Page, label: string): Promise<Locator> {
  const tablist = page.getByRole("tablist", { name: "Example framework" });
  const tab = frameworkTab(tablist, label);
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  return page.locator("#examples-panel");
}

async function selectExampleDisplay(page: Page, label: "Preview" | "Code"): Promise<void> {
  const display = page.getByRole("group", { name: "Example display" });
  const button = display.getByRole("button", { name: label, exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

async function choosePaletteRelationship(page: Page, label: string): Promise<void> {
  const relationship = page.getByRole("combobox", { name: "Palette relationship" });
  await relationship.click();
  const listbox = page.getByRole("listbox", { name: "Palette relationship options" });
  await expect(listbox).toBeVisible();
  await paletteRelationshipOption(listbox, label).click();
  await expect(relationship).toHaveAttribute("aria-expanded", "false");
  await expect(relationship).toContainText(label);
}

async function expectActiveRelationshipInsidePopup(relationship: Locator): Promise<void> {
  await expect
    .poll(() =>
      relationship.evaluate((trigger) => {
        const activeId = trigger.getAttribute("aria-activedescendant");
        const activeOption =
          activeId === null ? null : trigger.ownerDocument.getElementById(activeId);
        const popup = activeOption?.closest(".relationship-picker__popover");
        if (activeOption === null || popup === null || popup === undefined) return false;
        const optionBounds = activeOption.getBoundingClientRect();
        const popupBounds = popup.getBoundingClientRect();
        return (
          optionBounds.top >= popupBounds.top - 1 && optionBounds.bottom <= popupBounds.bottom + 1
        );
      })
    )
    .toBe(true);
}

async function compactPickerGeometry(studio: Locator): Promise<{
  readonly rootHeight: number;
  readonly frameSize: number;
  readonly wheelSize: number;
  readonly wheelTop: number;
  readonly wheelBlockTop: number;
  readonly paletteTop: number;
}> {
  return studio.locator("[data-colorwheel]").evaluate((root) => {
    const bounds = (selector: string): DOMRect => {
      const element = root.querySelector<HTMLElement>(selector);
      if (element === null) throw new Error(`Missing compact picker part: ${selector}`);
      return element.getBoundingClientRect();
    };
    const rootBounds = root.getBoundingClientRect();
    const frame = bounds('[data-part="wheel-frame"]');
    const wheel = bounds('[data-part="wheel"]');
    const wheelBlock = bounds('[data-part="wheel-block"]');
    const palette = bounds('[data-part="palette"]');
    return {
      rootHeight: rootBounds.height,
      frameSize: frame.width,
      wheelSize: wheel.width,
      wheelTop: wheel.top - rootBounds.top,
      wheelBlockTop: wheelBlock.top - rootBounds.top,
      paletteTop: palette.top - rootBounds.top
    };
  });
}

async function renderedWheelCenterRgb(
  page: Page,
  studio: Locator
): Promise<{ readonly red: number; readonly green: number; readonly blue: number }> {
  const wheelColor = studio.locator('[data-part="wheel-color"]');
  const screenshot = await wheelColor.screenshot({ animations: "disabled" });

  return page.evaluate(
    async (source) => {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener(
          "error",
          () => reject(new Error("Could not decode wheel screenshot")),
          {
            once: true
          }
        );
        image.src = source;
      });

      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("Could not create screenshot sampling context");
      context.drawImage(image, 0, 0);
      const pixel = context.getImageData(
        Math.floor(canvas.width / 2),
        Math.floor(canvas.height / 2),
        1,
        1
      ).data;
      return { red: pixel[0] ?? 0, green: pixel[1] ?? 0, blue: pixel[2] ?? 0 };
    },
    `data:image/png;base64,${screenshot.toString("base64")}`
  );
}

async function expectDarkPaletteOnVisibleWheel(page: Page, studio: Locator): Promise<void> {
  const paletteValues = await studio
    .locator('[data-part="color-input"]')
    .evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value.toLowerCase())
    );
  expect(paletteValues).toHaveLength(3);
  for (const value of paletteValues) {
    const channels = value
      .slice(1)
      .match(/.{2}/g)
      ?.map((channel) => Number.parseInt(channel, 16));
    expect(channels).toBeDefined();
    // Wide-gamut conversion and hex rounding differ by one channel unit in
    // Firefox; values through 3/255 remain the same near-black invariant.
    expect(Math.max(...(channels ?? []))).toBeLessThanOrEqual(3);
  }

  const wheel = studio.locator('[data-part="wheel"]');
  await expect(wheel).toHaveAttribute("data-model", "hsv");
  const dataValue = await wheel.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).getPropertyValue("--colorwheel-value"))
  );
  expect(dataValue).toBeLessThan(0.01);

  const center = await renderedWheelCenterRgb(page, studio);
  expect(Math.max(center.red, center.green, center.blue)).toBeGreaterThanOrEqual(48);
}

async function ringPresentation(studio: Locator): Promise<{
  readonly x: number;
  readonly y: number;
  readonly side: string | null;
}> {
  const frame = studio.locator('[data-part="wheel-frame"]');
  const ring = studio.locator('[data-part="channel-ring"]');
  return {
    x: await frame.evaluate((element) =>
      Number.parseFloat(element.style.getPropertyValue("--colorwheel-channel-ring-x"))
    ),
    y: await frame.evaluate((element) =>
      Number.parseFloat(element.style.getPropertyValue("--colorwheel-channel-ring-y"))
    ),
    side: await ring.getAttribute("data-side")
  };
}

async function expectRingThumbCenteredOnTrack(studio: Locator): Promise<void> {
  const geometry = await studio.locator('[data-part="wheel-frame"]').evaluate((frame) => {
    const thumb = frame.querySelector<HTMLElement>('[data-part="channel-ring-thumb"]');
    const track = frame.querySelector<HTMLElement>('[data-part="channel-ring-track"]');
    if (thumb === null) throw new Error("Missing channel-ring thumb");
    if (track === null) throw new Error("Missing channel-ring track");
    const frameRect = frame.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const frameCenterX = frameRect.left + frameRect.width / 2;
    const frameCenterY = frameRect.top + frameRect.height / 2;
    const thumbCenterX = thumbRect.left + thumbRect.width / 2;
    const thumbCenterY = thumbRect.top + thumbRect.height / 2;
    const ringWidth = Number.parseFloat(getComputedStyle(track, "::after").inset);
    return {
      actualRadius: Math.hypot(thumbCenterX - frameCenterX, thumbCenterY - frameCenterY),
      expectedRadius: frameRect.width / 2 - ringWidth / 2
    };
  });
  expect(geometry.actualRadius).toBeCloseTo(geometry.expectedRadius, 1);
}

async function expectRingThumbBorderVisible(page: Page, studio: Locator): Promise<void> {
  const capture = studio.locator('[data-part="wheel-block"]');
  const geometry = await capture.evaluate((element) => {
    const thumb = element.querySelector<HTMLElement>('[data-part="channel-ring-thumb"]');
    if (thumb === null) throw new Error("Missing channel-ring thumb");
    const captureRect = element.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const centerX = thumbRect.left - captureRect.left + thumbRect.width / 2;
    const centerY = thumbRect.top - captureRect.top + thumbRect.height / 2;
    return {
      captureWidth: captureRect.width,
      captureHeight: captureRect.height,
      points: {
        top: { x: centerX, y: thumbRect.top - captureRect.top + 1.5 },
        right: { x: thumbRect.right - captureRect.left - 1.5, y: centerY },
        bottom: { x: centerX, y: thumbRect.bottom - captureRect.top - 1.5 },
        left: { x: thumbRect.left - captureRect.left + 1.5, y: centerY }
      }
    };
  });
  const screenshot = await capture.screenshot({ animations: "disabled" });
  const whiteness = await page.evaluate(
    async ({ source, geometry: sampleGeometry }) => {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener(
          "error",
          () => reject(new Error("Could not decode ring screenshot")),
          {
            once: true
          }
        );
        image.src = source;
      });
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("Could not create ring screenshot sampling context");
      context.drawImage(image, 0, 0);
      const scaleX = image.naturalWidth / sampleGeometry.captureWidth;
      const scaleY = image.naturalHeight / sampleGeometry.captureHeight;
      return Object.fromEntries(
        Object.entries(sampleGeometry.points).map(([side, point]) => {
          const centerX = Math.round(point.x * scaleX);
          const centerY = Math.round(point.y * scaleY);
          let brightestNeutral = 0;
          for (let y = centerY - 1; y <= centerY + 1; y += 1) {
            for (let x = centerX - 1; x <= centerX + 1; x += 1) {
              const pixel = context.getImageData(x, y, 1, 1).data;
              brightestNeutral = Math.max(
                brightestNeutral,
                Math.min(pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0)
              );
            }
          }
          return [side, brightestNeutral];
        })
      );
    },
    {
      source: `data:image/png;base64,${screenshot.toString("base64")}`,
      geometry
    }
  );
  for (const value of Object.values(whiteness)) expect(value).toBeGreaterThanOrEqual(210);
}

async function expectRingThumbOwnsHitTarget(studio: Locator): Promise<void> {
  const thumb = studio.locator('[data-part="channel-ring-thumb"]');
  await thumb.scrollIntoViewIfNeeded();
  const hitPart = await thumb.evaluate((thumbElement) => {
    const bounds = thumbElement.getBoundingClientRect();
    const hit = thumbElement.ownerDocument.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2
    );
    return hit instanceof HTMLElement
      ? (hit.closest<HTMLElement>("[data-part]")?.dataset.part ?? null)
      : null;
  });
  expect(hitPart).toBe("channel-ring-thumb");
}

function expectDarkCyanHex(value: string): void {
  expect(value).toMatch(/^#[\da-f]{6}$/i);
  const red = Number.parseInt(value.slice(1, 3), 16);
  const green = Number.parseInt(value.slice(3, 5), 16);
  const blue = Number.parseInt(value.slice(5, 7), 16);
  expect(Math.max(green, blue)).toBeGreaterThan(red);
  expect(Math.max(green, blue)).toBeGreaterThan(0);
}

const FRAMEWORK_CONTRACTS = [
  {
    label: "Vanilla",
    id: "vanilla",
    install: "npm install @s9rg/colorwheel",
    importPath: "@s9rg/colorwheel/vanilla"
  },
  {
    label: "React",
    id: "react",
    install: "npm install @s9rg/colorwheel react react-dom",
    importPath: "@s9rg/colorwheel/react"
  },
  {
    label: "Vue",
    id: "vue",
    install: "npm install @s9rg/colorwheel vue",
    importPath: "@s9rg/colorwheel/vue"
  },
  {
    label: "Angular",
    id: "angular",
    install: "npm install @s9rg/colorwheel @angular/core rxjs",
    importPath: "@s9rg/colorwheel/angular"
  },
  {
    label: "React Native",
    id: "react-native",
    install: "npm install @s9rg/colorwheel react-native-svg",
    importPath: "@s9rg/colorwheel/react-native"
  }
] as const;

test("serves the production page at the GitHub Pages path without runtime errors", async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`response: ${response.status()} ${response.url()}`);
  });

  const response = await page.goto("./", { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/colorwheel/");
  await expect(
    page.getByRole("heading", { name: "A color wheel that treats the palette as data." })
  ).toBeVisible();
  await expect(page.getByTestId("default-studio")).toBeVisible();
  await testInfo.attach("colorwheel-page", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png"
  });
  expect(errors).toEqual([]);
});

test("starts with a linked complementary palette and a dependency-free seed picker", async ({
  page
}) => {
  await openShowcase(page);
  const studio = page.getByTestId("default-studio");
  const seedTrigger = page.getByRole("button", { name: /Base color: #00C4CC/ });
  await expect(seedTrigger).toBeVisible();
  await expect(page.locator('input[type="color"]')).toHaveCount(0);
  await expect(studio.locator('[data-part="palette-item"]')).toHaveCount(2);
  await expect(studio.getByRole("textbox", { name: "Base value" })).toHaveValue("#00c4cc");
  await expect(studio.getByRole("textbox", { name: "Complement value" })).toHaveValue("#f28a8b");

  await seedTrigger.click();
  const dialog = page.getByRole("dialog", { name: "Base color" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("group", { name: /Saturation and brightness field/ })
  ).toBeVisible();
  await expect(dialog.getByRole("slider", { name: "Hue" })).toBeVisible();
  await expect(dialog.getByRole("slider", { name: "Saturation" })).toBeVisible();
  await expect(dialog.getByRole("slider", { name: "Brightness" })).toBeVisible();

  const hex = dialog.getByRole("textbox", { name: "Hex" });
  await hex.fill("invalid");
  await dialog.getByRole("slider", { name: "Hue" }).focus();
  await expect(hex).toHaveValue("invalid");
  await expect(hex).toHaveAttribute("aria-invalid", "true");
  const hexErrorId = await hex.getAttribute("aria-describedby");
  expect(hexErrorId).not.toBeNull();
  await expect(page.locator(`#${hexErrorId}`)).toHaveText("Enter a 3- or 6-digit hex color.");

  await hex.fill("#7c3aed");
  await hex.press("Enter");
  await expect(page.getByRole("button", { name: /Base color: #7C3AED/ })).toBeVisible();
  await expect(studio.getByRole("textbox", { name: "Base value" })).toHaveValue("#7c3aed");
  await expect(studio.getByRole("textbox", { name: "Complement value" })).not.toHaveValue(
    "#f28a8b"
  );
  await expect(page.getByText("Palette checks", { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-part="diagnostics"]')).toHaveCount(0);
});

test("switches palette relationships and preserves the selected relationship after a seed edit", async ({
  page
}) => {
  await openShowcase(page);
  const studio = page.getByTestId("default-studio");
  const relationship = page.getByRole("combobox", { name: "Palette relationship" });

  await expect(relationship).toBeVisible();
  await expect(relationship).toHaveAccessibleName("Palette relationship");
  await expect(relationship).toHaveAttribute("aria-haspopup", "listbox");
  await expect(relationship).toHaveAttribute("aria-expanded", "false");
  expect(await relationship.getAttribute("aria-controls")).toBeNull();
  await expect(relationship).toContainText("Complementary");

  await relationship.click();
  const listbox = page.getByRole("listbox", { name: "Palette relationship options" });
  await expect(listbox).toBeVisible();
  await expect(relationship).toHaveAttribute("aria-expanded", "true");
  expect(await relationship.getAttribute("aria-controls")).toBe(await listbox.getAttribute("id"));
  const options = listbox.getByRole("option");
  await expect(options).toHaveCount(8);
  for (const label of [
    "Complementary",
    "Monochromatic",
    "Analogous",
    "Triadic",
    "Tetradic",
    "Split complementary",
    "Tonal scale",
    "Single color"
  ]) {
    await expect(paletteRelationshipOption(listbox, label)).toHaveCount(1);
  }
  await expect(paletteRelationshipOption(listbox, "Complementary")).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await relationship.press("Escape");
  expect(await relationship.getAttribute("aria-controls")).toBeNull();

  for (const [label, colorCount] of [
    ["Single color", 1],
    ["Complementary", 2],
    ["Analogous", 3],
    ["Tetradic", 4],
    ["Monochromatic", 5],
    ["Tonal scale", 7]
  ] as const) {
    await choosePaletteRelationship(page, label);
    await expect(studio.locator('[data-part="palette-item"]')).toHaveCount(colorCount);
  }

  await expect(page.getByRole("button", { name: /Base color: #00C4CC/ })).toBeVisible();

  await choosePaletteRelationship(page, "Triadic");
  await expect(studio.locator('[data-part="palette-item"]')).toHaveCount(3);
  await expect(studio.getByRole("textbox", { name: "Triadic 2 value" })).toBeDisabled();

  await page.getByRole("button", { name: /Base color:/ }).click();
  const seedDialog = page.getByRole("dialog", { name: "Base color" });
  await expect(
    seedDialog.getByRole("group", { name: /Saturation and brightness field/ })
  ).toBeFocused();
  const hex = seedDialog.getByRole("textbox", { name: "Hex" });
  await hex.fill("#7c3aed");
  await expect(hex).toHaveValue(/^#7c3aed$/i);
  await hex.press("Enter");
  await expect(page.getByRole("button", { name: /Base color: #7C3AED/ })).toBeVisible();

  await expect(relationship).toContainText("Triadic");
  await expect(studio.locator('[data-part="palette-item"]')).toHaveCount(3);
  await expect(studio.getByRole("textbox", { name: "Base value" })).toHaveValue("#7c3aed");
});

test("supports the palette relationship combobox keyboard contract", async ({ page }) => {
  await openShowcase(page);
  const relationship = page.getByRole("combobox", { name: "Palette relationship" });
  const studio = page.getByTestId("default-studio");

  await relationship.focus();
  await relationship.press("ArrowDown");
  const listbox = page.getByRole("listbox", { name: "Palette relationship options" });
  await expect(listbox).toBeVisible();
  await expect(relationship).toBeFocused();
  await expect(relationship).toHaveAttribute("aria-expanded", "true");
  await expect(relationship).toHaveAttribute("aria-activedescendant", /-option-complementary$/);

  await relationship.press("ArrowDown");
  await expect(relationship).toHaveAttribute("aria-activedescendant", /-option-monochromatic$/);
  await relationship.press("ArrowUp");
  await expect(relationship).toHaveAttribute("aria-activedescendant", /-option-complementary$/);
  await relationship.press("ArrowUp");
  await expect(relationship).toHaveAttribute("aria-activedescendant", /-option-single$/);

  await relationship.press("Escape");
  await expect(relationship).toHaveAttribute("aria-expanded", "false");
  await expect(relationship).toContainText("Complementary");
  await expect(relationship).toBeFocused();
  await expect(studio.locator('[data-part="palette-item"]')).toHaveCount(2);

  await relationship.press("Home");
  await expect(relationship).toHaveAttribute("aria-activedescendant", /-option-complementary$/);
  await relationship.press("End");
  await expect(relationship).toHaveAttribute("aria-activedescendant", /-option-single$/);
  await relationship.press("Enter");
  await expect(relationship).toHaveAttribute("aria-expanded", "false");
  await expect(relationship).toContainText("Single color");
  await expect(relationship).toBeFocused();
  await expect(studio.locator('[data-part="palette-item"]')).toHaveCount(1);
});

test("supports printable typeahead and repeated-initial cycling", async ({ page }) => {
  await openShowcase(page);
  const relationship = page.getByRole("combobox", { name: "Palette relationship" });

  await relationship.focus();
  await relationship.press("t");
  await expect(relationship).toHaveAttribute("aria-expanded", "true");
  await expect(relationship).toHaveAttribute("aria-activedescendant", /-option-triadic$/);
  await relationship.press("t");
  await expect(relationship).toHaveAttribute("aria-activedescendant", /-option-tetradic$/);
  await relationship.press("t");
  await expect(relationship).toHaveAttribute("aria-activedescendant", /-option-tonal$/);
  await relationship.press("Enter");
  await expect(relationship).toContainText("Tonal scale");

  await relationship.pressSequentially("sp", { delay: 20 });
  await expect(relationship).toHaveAttribute(
    "aria-activedescendant",
    /-option-split-complementary$/
  );
  await relationship.press("Escape");
  await expect(relationship).toContainText("Tonal scale");
});

test("keeps the keyboard-active option visible in the mobile relationship popup", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await openShowcase(page);
  const relationship = page.getByRole("combobox", { name: "Palette relationship" });

  await relationship.focus();
  await relationship.press("ArrowDown");
  await relationship.press("End");
  await expect(relationship).toHaveAttribute("aria-activedescendant", /-option-single$/);
  await expectActiveRelationshipInsidePopup(relationship);

  await relationship.press("ArrowDown");
  await expect(relationship).toHaveAttribute("aria-activedescendant", /-option-complementary$/);
  await expectActiveRelationshipInsidePopup(relationship);
});

test("keeps the relationship popup and seed dialog mutually exclusive for programmatic clicks", async ({
  page
}) => {
  await openShowcase(page);
  const relationship = page.getByRole("combobox", { name: "Palette relationship" });
  const listbox = page.getByRole("listbox", { name: "Palette relationship options" });
  const seedTrigger = page.getByRole("button", { name: /Base color:/ });
  const seedDialog = page.getByRole("dialog", { name: "Base color" });

  await relationship.click();
  await expect(listbox).toBeVisible();
  await seedTrigger.evaluate((trigger) => (trigger as HTMLButtonElement).click());
  await expect(listbox).toBeHidden();
  await expect(relationship).toHaveAttribute("aria-expanded", "false");
  expect(await relationship.getAttribute("aria-controls")).toBeNull();
  await expect(seedDialog).toBeVisible();

  await relationship.evaluate((trigger) => (trigger as HTMLButtonElement).click());
  await expect(seedDialog).toBeHidden();
  await expect(relationship).toHaveAttribute("aria-expanded", "true");
  await expect(listbox).toBeVisible();
  expect(await relationship.getAttribute("aria-controls")).toBe(await listbox.getAttribute("id"));
});

test("commits a real pointer drag and updates the linked companion color", async ({
  page
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile-chrome" || testInfo.project.name === "mobile-safari",
    "Touch projects exercise the same editor through text and harmony controls; mouse drag is covered in every desktop engine."
  );
  await openShowcase(page);
  const studio = page.getByTestId("default-studio");
  const wheel = studio.locator('[data-part="wheel"]');
  const handle = studio.getByRole("button", { name: /Base wheel handle/ });
  const seed = studio.getByRole("textbox", { name: "Base value" });
  const companion = studio.getByRole("textbox", { name: "Complement value" });
  const beforeSeed = await seed.inputValue();
  const beforeCompanion = await companion.inputValue();
  await handle.scrollIntoViewIfNeeded();
  const box = await wheel.boundingBox();
  const handleBox = await handle.boundingBox();
  expect(box).not.toBeNull();
  expect(handleBox).not.toBeNull();
  if (box === null || handleBox === null) return;

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.87, box.y + box.height * 0.48, { steps: 8 });
  await page.mouse.up();

  await expect(seed).not.toHaveValue(beforeSeed);
  await expect(companion).not.toHaveValue(beforeCompanion);
  await expect(handle).toHaveAttribute("aria-pressed", "true");

  const beforePlaneDrag = await seed.inputValue();
  await page.getByRole("button", { name: /Base color:/ }).click();
  const plane = page
    .getByRole("dialog", { name: "Base color" })
    .locator(".seed-color-picker__plane");
  const planeBox = await plane.boundingBox();
  expect(planeBox).not.toBeNull();
  if (planeBox === null) return;
  await page.mouse.move(planeBox.x + planeBox.width * 0.7, planeBox.y + planeBox.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(planeBox.x + planeBox.width * 0.3, planeBox.y + planeBox.height * 0.7, {
    steps: 6
  });
  await page.mouse.up();
  await expect(seed).not.toHaveValue(beforePlaneDrag);
});

test("documents one package and all five adapter entry points", async ({ page }) => {
  await openShowcase(page);
  const tablist = page.getByRole("tablist", { name: "Installation framework" });
  const command = page.getByTestId("install-command");
  const panel = page.locator("#installation-panel");
  await expect(tablist.getByRole("tab")).toHaveCount(5);

  for (const contract of FRAMEWORK_CONTRACTS) {
    const tab = frameworkTab(tablist, contract.label);
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(panel).toHaveAttribute("aria-labelledby", `installation-tab-${contract.id}`);
    await expect(command).toHaveText(contract.install);
    await expect(page.locator("#installation .entry-point code")).toHaveText(contract.importPath);
  }

  const react = frameworkTab(tablist, "React");
  const vue = frameworkTab(tablist, "Vue");
  const vanilla = frameworkTab(tablist, "Vanilla");
  const native = frameworkTab(tablist, "React Native");
  await react.click();
  await react.focus();
  await react.press("ArrowRight");
  await expect(vue).toBeFocused();
  await vue.press("Home");
  await expect(vanilla).toBeFocused();
  await vanilla.press("End");
  await expect(native).toBeFocused();
  await native.press("ArrowRight");
  await expect(vanilla).toBeFocused();
});

test("switches every adapter between the live preview and accurate integration code", async ({
  page
}) => {
  await openShowcase(page);
  const preview = page.getByRole("group", { name: "Example display" }).getByRole("button", {
    name: "Preview",
    exact: true
  });
  await expect(preview).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("default-studio")).toBeVisible();
  await selectExampleDisplay(page, "Code");

  for (const contract of FRAMEWORK_CONTRACTS) {
    const panel = await selectExampleFramework(page, contract.label);
    await expect(panel).toHaveAttribute("aria-labelledby", `examples-tab-${contract.id}`);
    await expect(page.getByTestId("example-code").getByRole("code")).toContainText(
      contract.importPath
    );
  }

  await selectExampleFramework(page, "Vanilla");
  await expect(page.getByTestId("example-code").getByRole("code")).toContainText("blockProps");
  await expect(page.getByTestId("example-code").getByRole("code")).toContainText(
    "showChannels: false"
  );
  await selectExampleFramework(page, "React");
  await expect(page.getByTestId("example-code").getByRole("code")).toContainText("Picker.Root");
  await selectExampleFramework(page, "Vue");
  await expect(page.getByTestId("example-code").getByRole("code")).toContainText("v-model:palette");
  await selectExampleFramework(page, "Angular");
  await expect(page.getByTestId("example-code").getByRole("code")).toContainText("s9rg-colorwheel");
  await selectExampleFramework(page, "React Native");
  await expect(page.getByTestId("example-code").getByRole("code")).toContainText("blockProps");

  await selectExampleDisplay(page, "Preview");
  const nativeEvidence = page.getByTestId("react-native-evidence");
  await expect(nativeEvidence).toBeVisible();
  await expect(nativeEvidence).toContainText("Browser previewNot applicable");
  await expect(nativeEvidence).toContainText("Device verificationStill required before release");
});

test("mounts the native Vue and Angular adapters and shares their palette edits", async ({
  page
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  await openShowcase(page);

  await selectExampleFramework(page, "Vue");
  const vue = page.getByTestId("vue-studio");
  const vueRoot = vue.locator('[data-colorwheel-vue][data-part="root"]');
  await expect(vueRoot).toHaveCount(1);
  await expect(vueRoot).toHaveAttribute("aria-label", "Vue Colorwheel example");
  await expect(vueRoot.locator('[data-part="wheel-block"]')).toHaveCount(1);
  await expect(vueRoot.locator('[data-part="palette"]')).toHaveCount(1);
  const vueBase = vue.getByRole("textbox", { name: "Base value" });
  await vueBase.fill("#336699");
  await vueBase.press("Enter");
  await expect(vueBase).toHaveValue("#336699");

  await selectExampleFramework(page, "Angular");
  const angular = page.getByTestId("angular-studio");
  const angularHost = angular.locator("[data-colorwheel-angular]");
  const angularRoot = angular.locator('[data-colorwheel][data-part="root"]');
  await expect(angularHost).toHaveCount(1);
  await expect(angularRoot).toHaveCount(1);
  await expect(angularRoot).toHaveAttribute("aria-label", "Angular Colorwheel example");
  await expect(angularRoot.locator('[data-part="wheel-block"]')).toHaveCount(1);
  await expect(angularRoot.locator('[data-part="palette"]')).toHaveCount(1);
  const angularBase = angular.getByRole("textbox", { name: "Base value" });
  await expect(angularBase).toHaveValue("#336699");
  await angularBase.fill("#7c3aed");
  await angularBase.press("Enter");
  await expect(angularBase).toHaveValue(/^#7c3aed$/i);

  await selectExampleFramework(page, "React");
  await expect(
    page.getByTestId("default-studio").getByRole("textbox", { name: "Base value" })
  ).toHaveValue(/^#7c3aed$/i);

  await selectExampleFramework(page, "Vue");
  await expect(
    page.getByTestId("vue-studio").getByRole("textbox", { name: "Base value" })
  ).toHaveValue(/^#7c3aed$/i);
  expect(runtimeErrors).toEqual([]);
});

test("mounts and interacts with the live vanilla adapter", async ({ page }) => {
  await openShowcase(page);
  await selectExampleFramework(page, "Vanilla");
  const studio = page.getByTestId("dom-studio");
  const root = studio.locator("[data-colorwheel]");

  await expect(root).toHaveAttribute("role", "group");
  await expect(root).toHaveAttribute("aria-label", "Vanilla Colorwheel example");
  await expect(studio.locator('[data-part="diagnostics"]')).toHaveCount(0);

  const base = studio.getByRole("button", { name: /Select Base/i });
  await base.click();
  await expect(base).toHaveAttribute("aria-pressed", "true");

  const activeColor = studio.locator('[data-part="active-color"]');
  const before = await activeColor.textContent();
  const handle = studio.getByRole("button", { name: /Base wheel handle/ });
  await handle.focus();
  await handle.press("ArrowRight");
  await expect(activeColor).not.toHaveText(before ?? "");
});

test("keeps the compact Vanilla and React previews visually and behaviorally aligned", async ({
  page
}) => {
  await openShowcase(page);

  const react = page.getByTestId("default-studio");
  await expect(react.locator('[data-part="wheel-frame"]')).toHaveCount(1);
  await expect(react.locator('[data-part="channel-ring"]')).toHaveCount(1);
  await expect(react.locator('[data-part="channel-ring-track"]')).toHaveCount(1);
  await expect(react.locator('[data-part="channel-ring-thumb"]')).toHaveCount(1);
  await expect(react.getByRole("slider", { name: "Base value ring" })).toHaveAttribute(
    "data-model",
    "hsv"
  );
  await expect(react.locator('[data-part="harmony-lines"]')).toHaveCount(1);
  await expect(react.locator('[data-part="block-description"]')).toHaveCount(2);
  await expect(react.locator('[data-part="anchor-mark"]')).toHaveCount(1);
  const reactBase = react.getByRole("textbox", { name: "Base value" });
  const reactComplement = react.getByRole("textbox", { name: "Complement value" });
  await expect(reactBase).toBeEnabled();
  await expect(reactComplement).toBeDisabled();
  const initialBase = await reactBase.inputValue();
  const initialComplement = await reactComplement.inputValue();
  const reactGeometry = await compactPickerGeometry(react);

  await selectExampleFramework(page, "Vanilla");
  const vanilla = page.getByTestId("dom-studio");
  await expect(vanilla.locator('[data-part="wheel-frame"]')).toHaveCount(1);
  await expect(vanilla.locator('[data-part="channel-ring"]')).toHaveCount(1);
  await expect(vanilla.locator('[data-part="channel-ring-track"]')).toHaveCount(1);
  await expect(vanilla.locator('[data-part="channel-ring-thumb"]')).toHaveCount(1);
  await expect(vanilla.getByRole("slider", { name: "Base value ring" })).toHaveAttribute(
    "data-model",
    "hsv"
  );
  await expect(vanilla.locator('[data-part="pointer"]')).toHaveCount(2);
  await expect(vanilla.locator('[data-part="palette-item"]')).toHaveCount(2);
  await expect(vanilla.locator('[data-part="swatch"]')).toHaveCount(2);
  await expect(vanilla.locator('[data-part="color-input"]')).toHaveCount(2);
  await expect(vanilla.locator('[data-part="harmony-lines"]')).toHaveCount(1);
  await expect(vanilla.locator('[data-part="block-description"]')).toHaveCount(2);
  await expect(vanilla.locator('[data-part="anchor-mark"]')).toHaveCount(1);
  await expect(vanilla.locator('[data-part="wheel-instructions"]')).toHaveCount(0);
  await expect(vanilla.locator('[data-part="channels"]')).toHaveCount(0);
  await expect(vanilla.locator('[data-part="name-input"]')).toHaveCount(0);
  await expect(vanilla.locator('[data-part="palette-item-actions"]')).toHaveCount(0);
  await expect(vanilla.locator('[data-part="add-color"]')).toHaveCount(0);

  const vanillaBase = vanilla.getByRole("textbox", { name: "Base value" });
  const vanillaComplement = vanilla.getByRole("textbox", { name: "Complement value" });
  await expect(vanillaBase).toHaveValue(initialBase);
  await expect(vanillaComplement).toHaveValue(initialComplement);
  await expect(vanillaBase).toBeEnabled();
  await expect(vanillaComplement).toBeDisabled();

  const vanillaGeometry = await compactPickerGeometry(vanilla);
  for (const key of Object.keys(reactGeometry) as Array<keyof typeof reactGeometry>) {
    expect(Math.abs(reactGeometry[key] - vanillaGeometry[key]), key).toBeLessThanOrEqual(3);
  }

  await vanillaBase.fill("#336699");
  await vanillaBase.press("Enter");
  await selectExampleFramework(page, "React");
  await expect(
    page.getByTestId("default-studio").getByRole("textbox", { name: "Base value" })
  ).toHaveValue("#336699");

  const nextReactBase = page.getByTestId("default-studio").getByRole("textbox", {
    name: "Base value"
  });
  await nextReactBase.fill("#7c3aed");
  await nextReactBase.press("Enter");
  await selectExampleFramework(page, "Vanilla");
  await expect(
    page.getByTestId("dom-studio").getByRole("textbox", { name: "Base value" })
  ).toHaveValue("#7c3aed");
});

test("edits the real HSV value through the outer ring and keeps adapter state aligned", async ({
  page
}) => {
  await openShowcase(page);
  const react = page.getByTestId("default-studio");
  const reactRing = react.getByRole("slider", { name: "Base value ring" });
  const reactBase = react.getByRole("textbox", { name: "Base value" });
  const reactCompanion = react.getByRole("textbox", { name: "Complement value" });
  const initialBase = await reactBase.inputValue();
  const initialCompanion = await reactCompanion.inputValue();

  await expect(reactRing).toHaveAttribute("aria-valuemin", "0");
  await expect(reactRing).toHaveAttribute("aria-valuemax", "100");
  await expect(reactRing).toHaveAttribute("aria-orientation", "vertical");
  await expect(reactRing).toHaveAttribute("aria-valuenow", "80");
  await expectRingThumbCenteredOnTrack(react);
  await reactRing.focus();
  const beforeArrow = await ringPresentation(react);
  await reactRing.press("ArrowUp");
  await expect(reactRing).toHaveAttribute("aria-valuenow", "81");
  const afterArrow = await ringPresentation(react);
  expect(afterArrow.y).toBeLessThan(beforeArrow.y);
  await reactRing.press("End");
  await expect(reactRing).toHaveAttribute("aria-valuenow", "100");
  await expectRingThumbCenteredOnTrack(react);
  await expectRingThumbBorderVisible(page, react);
  await expect(reactBase).not.toHaveValue(initialBase);
  await expect(reactCompanion).not.toHaveValue(initialCompanion);
  const fullValueBase = await reactBase.inputValue();
  const fullValueCompanion = await reactCompanion.inputValue();

  await selectExampleFramework(page, "Vanilla");
  const vanilla = page.getByTestId("dom-studio");
  const vanillaRing = vanilla.getByRole("slider", { name: "Base value ring" });
  await expect(vanillaRing).toHaveAttribute("aria-valuenow", "100");
  await expectRingThumbCenteredOnTrack(vanilla);
  await expectRingThumbBorderVisible(page, vanilla);
  await expect(vanilla.getByRole("textbox", { name: "Base value" })).toHaveValue(fullValueBase);
  await expect(vanilla.getByRole("textbox", { name: "Complement value" })).toHaveValue(
    fullValueCompanion
  );

  await vanillaRing.focus();
  await vanillaRing.press("ArrowDown");
  await expect(vanillaRing).toHaveAttribute("aria-valuenow", "99");
  const loweredValueBase = await vanilla.getByRole("textbox", { name: "Base value" }).inputValue();
  expect(loweredValueBase).not.toBe(fullValueBase);

  await selectExampleFramework(page, "React");
  await expect(
    page.getByTestId("default-studio").getByRole("textbox", { name: "Base value" })
  ).toHaveValue(loweredValueBase);
  await expect(
    page.getByTestId("default-studio").getByRole("slider", { name: "Base value ring" })
  ).toHaveAttribute("aria-valuenow", "99");
});

test("keeps real pointer drags on the touched ring side in React and Vanilla", async ({ page }) => {
  await openShowcase(page);

  const dragLeftArc = async (
    studio: Locator,
    fromValue: number,
    toValue: number
  ): Promise<void> => {
    const ring = studio.locator('[data-part="channel-ring"]');
    await ring.scrollIntoViewIfNeeded();
    const bounds = await ring.boundingBox();
    if (bounds === null) throw new Error("Missing visible channel ring bounds");
    const point = (value: number) => {
      const angle = Math.PI / 2 - Math.PI * value;
      // Stay a few CSS pixels inside the antialiased outer edge while still
      // landing on the visible 14px annulus at every supported preview size.
      const radius = 0.47;
      return {
        x: bounds.x + bounds.width * (0.5 - Math.cos(angle) * radius),
        y: bounds.y + bounds.height * (0.5 + Math.sin(angle) * radius)
      };
    };
    const start = point(fromValue);
    const end = point(toValue);
    expect(
      await page.evaluate(({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return hit instanceof HTMLElement
          ? (hit.closest<HTMLElement>("[data-part]")?.dataset.part ?? null)
          : null;
      }, start)
    ).toBe("channel-ring");
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
  };

  const react = page.getByTestId("default-studio");
  await dragLeftArc(react, 0.25, 0.75);
  const reactDraggedValue = Number.parseFloat(
    (await react.getByRole("slider", { name: "Base value ring" }).getAttribute("aria-valuenow")) ??
      "NaN"
  );
  expect(reactDraggedValue).toBeCloseTo(75, 0);
  const reactPresentation = await ringPresentation(react);
  expect(reactPresentation.side).toBe("left");
  expect(reactPresentation.x).toBeLessThan(50);
  expect(reactPresentation.y).toBeLessThan(50);
  await expectRingThumbCenteredOnTrack(react);

  await selectExampleFramework(page, "Vanilla");
  const vanilla = page.getByTestId("dom-studio");
  await dragLeftArc(vanilla, 0.75, 0.4);
  const vanillaDraggedValue = Number.parseFloat(
    (await vanilla
      .getByRole("slider", { name: "Base value ring" })
      .getAttribute("aria-valuenow")) ?? "NaN"
  );
  expect(vanillaDraggedValue).toBeCloseTo(40, 0);
  const vanillaPresentation = await ringPresentation(vanilla);
  expect(vanillaPresentation.side).toBe("left");
  expect(vanillaPresentation.x).toBeLessThan(50);
  expect(vanillaPresentation.y).toBeGreaterThan(50);
  await expectRingThumbCenteredOnTrack(vanilla);
});

test("recovers the linked hue after the outer ring reaches black", async ({ page }) => {
  const recover = async (studio: Locator): Promise<void> => {
    const ring = studio.getByRole("slider", { name: "Base value ring" });
    const base = studio.getByRole("textbox", { name: "Base value" });
    await ring.focus();
    await ring.press("Home");
    await expect(ring).toHaveAttribute("aria-valuenow", "0");
    await expectRingThumbOwnsHitTarget(studio);
    await ring.press("ArrowUp");
    await expect(ring).toHaveAttribute("aria-valuenow", "1");
    expectDarkCyanHex(await base.inputValue());
  };

  await openShowcase(page);
  await recover(page.getByTestId("default-studio"));

  await openShowcase(page);
  await selectExampleFramework(page, "Vanilla");
  await recover(page.getByTestId("dom-studio"));
});

test("keeps near-black palette data intact without blacking out the React or Vanilla HSV wheel", async ({
  page
}) => {
  await openShowcase(page);
  await choosePaletteRelationship(page, "Analogous");
  const seed = page.getByTestId("default-studio").getByRole("textbox", {
    name: "Base value"
  });
  await seed.fill("#010001");
  await seed.press("Enter");

  await expectDarkPaletteOnVisibleWheel(page, page.getByTestId("default-studio"));
  await selectExampleFramework(page, "Vanilla");
  await expectDarkPaletteOnVisibleWheel(page, page.getByTestId("dom-studio"));
});

test("provides semantic framework-specific API tables", async ({ page }) => {
  await openShowcase(page);
  const tablist = page.getByRole("tablist", { name: "API framework" });
  const contracts = [
    ["Vanilla", "mountColorwheel(container, options)", "renderPalette"],
    ["React", "<Picker /> and <Picker.Root />", "blocks"],
    ["Vue", "<Colorwheel />", "update:palette"],
    ["Angular", "<s9rg-colorwheel />", "colorwheelChange"],
    ["React Native", "<Picker />", "renderLayout"]
  ] as const;

  for (const [label, signature, row] of contracts) {
    await frameworkTab(tablist, label).click();
    await expect(page.locator("#api .api-signature > code")).toContainText(signature);
    const table = page.getByTestId("api-props-table");
    await expect(table).toHaveAccessibleName(`${label} public options and props`);
    await expect(table.getByRole("rowheader", { name: row, exact: true })).toHaveCount(1);
    await expect(table.getByRole("rowheader", { name: "palette", exact: true })).toHaveCount(1);
  }
});

test("exports the live palette as JSON, CSS, and design tokens", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(text: string) {
          window.sessionStorage.setItem("colorwheel-copied", text);
          return Promise.resolve();
        }
      }
    });
  });
  await openShowcase(page);
  await page.getByRole("button", { name: /Base color: #00C4CC/ }).click();
  const seed = page.getByRole("dialog", { name: "Base color" }).getByRole("textbox", {
    name: "Hex"
  });
  await seed.fill("#3366ff");
  await seed.press("Enter");
  await expect(page.getByRole("button", { name: /Base color: #3366FF/ })).toBeVisible();
  await page.keyboard.press("Escape");

  const tablist = page.getByRole("tablist", { name: "Export format" });
  const panel = page.locator("#export-panel");
  const filename = page.getByTestId("export-filename");
  const output = page.getByTestId("export-output");
  const contracts = [
    ["JSON", "json", "palette.json", '"schema": "color-palette"'],
    ["CSS variables", "css", "palette.css", "--palette-base: #3366ff"],
    ["Design tokens", "tokens", "palette.tokens.json", '"colorSpace"']
  ] as const;

  for (const [label, id, expectedFile, expectedOutput] of contracts) {
    const tab = tablist.getByRole("tab", { name: label, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(panel).toHaveAttribute("aria-labelledby", `export-tab-${id}`);
    await expect(filename).toHaveText(expectedFile);
    await expect(output).toContainText(expectedOutput);
  }

  const actions = panel.getByRole("group", { name: "Export actions" });
  const copy = actions.getByRole("button", { name: "Copy output" });
  const download = actions.getByRole("button", { name: "Download" });
  await expect(copy).toBeVisible();
  await expect(download).toBeVisible();
  await expect(page.locator(".export-summary .export-actions")).toHaveCount(0);

  await copy.click();
  await expect(copy).toHaveAttribute("data-status", "copied");
  await expect(actions.getByRole("status")).toHaveText("Copied");

  await tablist.getByRole("tab", { name: "Design tokens", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await download.click();
  expect((await downloadEvent).suggestedFilename()).toBe("palette.tokens.json");
});

test("exposes complete navigation and tab semantics", async ({ page }) => {
  await openShowcase(page);
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  for (const [label, target] of [
    ["Install", "#installation"],
    ["Examples", "#examples"],
    ["API", "#api"],
    ["Export", "#export"]
  ] as const) {
    await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveAttribute(
      "href",
      target
    );
  }

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(page.locator("a.skip-link")).toHaveAttribute("href", "#main-content");
  await expect(page.getByRole("tablist")).toHaveCount(4);
  await expect(page.getByRole("tabpanel")).toHaveCount(4);

  for (const tablist of await page.getByRole("tablist").all()) {
    await expect(tablist.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
  }
  for (const tab of await page.getByRole("tab").all()) {
    const controls = await tab.getAttribute("aria-controls");
    expect(controls).not.toBeNull();
    if (controls !== null) await expect(page.locator(`#${controls}`)).toHaveCount(1);
  }
});

test("has no automated accessibility findings in dialogs and popovers", async ({ page }) => {
  await openShowcase(page);
  await page.getByRole("button", { name: /Base color: #00C4CC/ }).click();
  const dialog = page.getByRole("dialog", { name: "Base color" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("opacity", "1");
  const dialogResults = await new AxeBuilder({ page }).analyze();
  expect(dialogResults.violations).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("combobox", { name: "Palette relationship" }).click();
  await expect(page.getByRole("listbox", { name: "Palette relationship options" })).toBeVisible();
  const relationshipResults = await new AxeBuilder({ page }).analyze();
  expect(relationshipResults.violations).toEqual([]);
});

test("has no automated accessibility findings in the Vanilla adapter", async ({ page }) => {
  await openShowcase(page);
  await selectExampleFramework(page, "Vanilla");
  const vanillaStudio = page.getByTestId("dom-studio");
  await expect(vanillaStudio.locator("[data-colorwheel]")).toBeVisible();
  const vanillaResults = await new AxeBuilder({ page })
    .include('[data-testid="dom-studio"]')
    .analyze();
  expect(vanillaResults.violations).toEqual([]);
});

test("has no automated accessibility findings in the Vue adapter", async ({ page }) => {
  await openShowcase(page);
  await selectExampleFramework(page, "Vue");
  const vueStudio = page.getByTestId("vue-studio");
  await expect(vueStudio.locator("[data-colorwheel-vue]")).toBeVisible();
  const vueResults = await new AxeBuilder({ page }).include('[data-testid="vue-studio"]').analyze();
  expect(vueResults.violations).toEqual([]);
});

test("has no automated accessibility findings in the Angular adapter", async ({ page }) => {
  await openShowcase(page);
  await selectExampleFramework(page, "Angular");
  const angularStudio = page.getByTestId("angular-studio");
  await expect(angularStudio.locator("[data-colorwheel-angular]")).toBeVisible({ timeout: 15_000 });
  const angularResults = await new AxeBuilder({ page })
    .include('[data-testid="angular-studio"]')
    .analyze();
  expect(angularResults.violations).toEqual([]);
});

test("exposes a complete manual accessibility test surface", async ({ page }) => {
  await page.goto("./?accessibility=1", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "Colorwheel accessibility test surface", level: 1 })
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Colorwheel accessibility test picker" })
  ).toBeVisible();
  await expect(page.getByRole("slider", { name: "Hue", exact: true })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Saturation", exact: true })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Value", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lock Background" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move Background later" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Background" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add color" })).toBeVisible();

  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityResults.violations).toEqual([]);
  await expectNoPageOverflow(page);
});

test("keeps the React and Vanilla pickers contained at a narrow component width", async ({
  page
}) => {
  await openShowcase(page);
  for (const [framework, testId] of [
    ["React", "default-studio"],
    ["Vanilla", "dom-studio"]
  ] as const) {
    await selectExampleFramework(page, framework);
    const studio = page.getByTestId(testId);
    await studio.evaluate((element) => {
      element.style.width = "320px";
      element.style.maxWidth = "100%";
    });
    const dimensions = await studio.locator("[data-colorwheel]").evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
    const ringBounds = await studio.locator('[data-part="wheel-frame"]').evaluate((frame) => {
      const ring = frame.querySelector<HTMLElement>('[data-part="channel-ring"]');
      if (ring === null) throw new Error("Missing compact channel ring");
      const frameRect = frame.getBoundingClientRect();
      const ringRect = ring.getBoundingClientRect();
      return {
        frameWidth: frameRect.width,
        frameHeight: frameRect.height,
        ringWidth: ringRect.width,
        ringHeight: ringRect.height
      };
    });
    expect(ringBounds.ringWidth).toBeCloseTo(ringBounds.frameWidth, 1);
    expect(ringBounds.ringHeight).toBeCloseTo(ringBounds.frameHeight, 1);
  }
});

test("does not overflow configured desktop, phone, or tablet viewports", async ({ page }) => {
  await openShowcase(page);
  await expectNoPageOverflow(page);
  await expect(page.getByTestId("default-studio")).toBeVisible();
  await selectExampleFramework(page, "Vanilla");
  await expect(page.getByTestId("dom-studio")).toBeVisible();
  await expectNoPageOverflow(page);
  await selectExampleDisplay(page, "Code");
  await expect(page.getByTestId("example-code")).toBeVisible();
  await expectNoPageOverflow(page);
  await selectExampleFramework(page, "Angular");
  await expectNoPageOverflow(page);

  await selectExampleDisplay(page, "Preview");
  await page.getByRole("button", { name: /Base color:/ }).click();
  await expect(page.getByRole("dialog", { name: "Base color" })).toBeVisible();
  await expectNoPageOverflow(page);

  await page.keyboard.press("Escape");
  await page.locator("#export-panel").scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("group", { name: "Export actions" }).getByRole("button", { name: "Copy output" })
  ).toBeVisible();
  await expectNoPageOverflow(page);
});

test("fits the explicit 320px minimum viewport", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "One engine is sufficient for the explicit minimum-width layout check."
  );
  await page.setViewportSize({ width: 320, height: 760 });
  await openShowcase(page);
  await expectNoPageOverflow(page);
  await expect(
    page.getByRole("heading", { name: "A color wheel that treats the palette as data." })
  ).toBeVisible();
  await expect(page.getByTestId("default-studio")).toBeVisible();
  await selectExampleDisplay(page, "Code");
  await expect(page.getByTestId("example-code")).toBeVisible();
  await expectNoPageOverflow(page);

  await selectExampleDisplay(page, "Preview");
  const relationship = page.getByRole("combobox", { name: "Palette relationship" });
  await relationship.click();
  await expect(page.getByRole("listbox", { name: "Palette relationship options" })).toBeVisible();
  await expectNoPageOverflow(page);
  await relationship.press("Escape");

  await page.getByRole("button", { name: /Base color:/ }).click();
  await expect(page.getByRole("dialog", { name: "Base color" })).toBeVisible();
  await expectNoPageOverflow(page);
});
