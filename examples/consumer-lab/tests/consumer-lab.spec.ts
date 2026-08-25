import { expect, test, type Page } from "@playwright/test";

interface ConsumerPage {
  readonly name: string;
  readonly path: string;
  readonly ready: string;
}

const consumers: readonly ConsumerPage[] = [
  { name: "React", path: "/react/", ready: "react-consumer-lab" },
  { name: "Vanilla", path: "/vanilla/", ready: "vanilla-consumer-lab" },
  { name: "Vue", path: "/vue/", ready: "vue-app" },
  { name: "Angular", path: "/angular/", ready: "angular-app" }
];

function captureRuntimeErrors(page: Page): readonly string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      errors.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  return errors;
}

async function openConsumer(page: Page, consumer: ConsumerPage): Promise<void> {
  await page.goto(consumer.path);
  const root = page.locator(`[data-test="${consumer.ready}"]`);
  await expect(root).toBeVisible();
  await expect(root).toHaveCSS("font-family", /Inter/);
}

function expectNoPageErrors(errors: readonly string[]): void {
  expect(errors, `Unexpected uncaught page errors:\n${errors.join("\n\n")}`).toEqual([]);
}

test.describe("published-package consumer runtimes", () => {
  test("React composes controlled blocks, reports events, and exports CSS", async ({ page }) => {
    const errors = captureRuntimeErrors(page);
    await openConsumer(page, consumers[0]);

    const triadicPreset = page.locator('[data-test="react-recipe-triadic"]');
    await triadicPreset.click();
    await expect(triadicPreset).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-test="react-custom-block"]')).toContainText("triadic");
    await expect(page.locator('[data-test="react-event-log"] li').first()).toContainText(
      "external · commit · triadic"
    );

    await page.locator('[data-test="react-swatch-1"] [data-part="swatch"]').click();
    await expect(page.locator('[data-test="react-event-log"] li').first()).toContainText(
      "selection"
    );
    await expect(page.locator('[data-test="react-event-log"] li').first()).toContainText(
      "user · commit"
    );

    const reactAnchorValue = page.locator('[data-test="react-swatch-0"] code');
    const initialReactAnchor = await reactAnchorValue.textContent();
    await page.getByRole("button", { name: /wheel handle, anchor/ }).press("ArrowRight");
    await expect(reactAnchorValue).not.toHaveText(initialReactAnchor ?? "");
    await expect(page.locator('[data-test="react-event-log"] li').first()).toContainText(
      "keyboard"
    );

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "CSS variables" }).click()
    ]);
    expect(download.suggestedFilename()).toBe("palette.css");
    await expect(page.locator('[data-test="react-export-status"]')).toContainText(
      "Prepared css: palette.css"
    );
    expectNoPageErrors(errors);
  });

  test("Vanilla updates data and blocks, focuses a target, and remounts safely", async ({
    page
  }) => {
    const errors = captureRuntimeErrors(page);
    await openConsumer(page, consumers[1]);

    await expect(page.locator('[data-test="vanilla-instance-state"]')).toHaveText("Running");
    await page.locator('[data-test="vanilla-update-palette"]').click();
    await expect(page.locator('[data-test="vanilla-palette-summary"]')).toContainText(
      "Launch campaign"
    );
    await expect(page.locator('[data-test="vanilla-event-log"] li').first()).toContainText(
      "callbacks intentionally silent"
    );

    const colorInput = page
      .locator('[data-test="vanilla-picker-host"] [data-part="color-input"]:not(:disabled)')
      .first();
    await colorInput.fill("#336699");
    await colorInput.press("Enter");
    await expect(page.locator('[data-test="vanilla-event-log"] li').first()).toContainText(
      "text-input"
    );

    await page.locator('[data-test="vanilla-update-blocks"]').click();
    await expect(page.locator('[data-test="vanilla-update-blocks"]')).toHaveText(
      "Use detailed blocks"
    );
    await expect(page.locator('[data-test="vanilla-picker-host"]')).toContainText("Quick adjust");
    await expect(
      page.locator('[data-test="vanilla-picker-host"] [data-part="channel-ring"]')
    ).toHaveCount(0);

    await page.locator('[data-test="vanilla-focus"]').click();
    await expect(
      page.locator('[data-test="vanilla-picker-host"] [data-part="pointer"]:focus')
    ).toHaveCount(1);

    await page.locator('[data-test="vanilla-destroy"]').click();
    await expect(page.locator('[data-test="vanilla-instance-state"]')).toHaveText("Stopped");
    await expect(page.locator('[data-test="vanilla-picker-host"]')).toBeEmpty();
    await page.locator('[data-test="vanilla-mount"]').click();
    await expect(page.locator('[data-test="vanilla-instance-state"]')).toHaveText("Running");
    await expect(page.locator('[data-test="vanilla-palette-summary"]')).toContainText(
      "Launch campaign"
    );
    expectNoPageErrors(errors);
  });

  test("Vue replaces a controlled preset and reports a palette edit", async ({ page }) => {
    const errors = captureRuntimeErrors(page);
    await openConsumer(page, consumers[2]);

    const warmPreset = page.locator('[data-test="vue-preset-warm"]');
    await warmPreset.click();
    await expect(warmPreset).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-test="vue-slot-summary"]')).toContainText("3 colors");
    await expect(page.locator('[data-test="vue-event-log"] li').first()).toContainText(
      "Warm split loaded"
    );

    const colorInput = page
      .locator('[data-test="vue-colorwheel"] [data-part="color-input"]:not(:disabled)')
      .first();
    await colorInput.fill("#336699");
    await colorInput.press("Enter");
    await expect(page.locator('[data-test="vue-event-log"] li').first()).toContainText(
      "text-input:commit"
    );
    await expect(page.locator('[data-test="vue-event-log"] li').first()).toContainText("user");
    expectNoPageErrors(errors);
  });

  test("Angular replaces a controlled preset and emits template selection metadata", async ({
    page
  }) => {
    const errors = captureRuntimeErrors(page);
    await openConsumer(page, consumers[3]);

    const greenPreset = page.locator('[data-test="angular-preset-green"]');
    await greenPreset.click();
    await expect(greenPreset).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-test="angular-palette-template"] li')).toHaveCount(2);
    await expect(page.locator('[data-test="angular-event-log"] li').first()).toContainText(
      "Green pair loaded"
    );

    await page.locator('[data-test="angular-swatch-1"]').click();
    await expect(page.locator('[data-test="angular-event-log"] li').first()).toContainText(
      "selection:commit"
    );
    await expect(page.locator('[data-test="angular-event-log"] li').first()).toContainText("user");

    const angularSummary = page.locator('[data-test="angular-palette-summary"]');
    const initialAngularSummary = await angularSummary.textContent();
    await page.getByRole("button", { name: /wheel handle, anchor/ }).press("ArrowRight");
    await expect(angularSummary).not.toHaveText(initialAngularSummary ?? "");
    await expect(page.locator('[data-test="angular-event-log"] li').first()).toContainText(
      "keyboard:commit"
    );
    expectNoPageErrors(errors);
  });
});

test.describe("390px responsive layout", () => {
  for (const consumer of consumers) {
    test(`${consumer.name} has no horizontal page overflow`, async ({ page }) => {
      const errors = captureRuntimeErrors(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await openConsumer(page, consumer);

      const dimensions = await page.evaluate(() => ({
        body: document.body.scrollWidth,
        document: document.documentElement.scrollWidth,
        viewport: window.innerWidth
      }));
      expect(
        Math.max(dimensions.body, dimensions.document),
        `${consumer.name} page is wider than its 390px viewport`
      ).toBeLessThanOrEqual(dimensions.viewport);
      expectNoPageErrors(errors);
    });
  }
});
