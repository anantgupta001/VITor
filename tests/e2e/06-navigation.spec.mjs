// @ts-check
import { test, expect } from "@playwright/test";

test.describe("Journey 6: Navigation and Campus Switching", () => {
  test("campus switcher dropdown lists all campuses and navigates correctly", async ({
    page,
  }) => {
    await page.goto("/vit-v");
    await expect(page.getByText(/loading faculty members/i)).not.toBeVisible({
      timeout: 15_000,
    });

    // Navbar should show campus dropdown button
    const campusBtn = page.getByRole("button", { name: /vellore/i });
    await expect(campusBtn).toBeVisible();

    // Open campus dropdown
    await campusBtn.click();

    // Should see all campus links in dropdown
    await expect(page.getByRole("link", { name: /ap campus|^AP$/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /chennai/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /bhopal/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Choose campus" })).toBeVisible();
  });

  test("switching campus via dropdown navigates to the new campus directory", async ({
    page,
  }) => {
    await page.goto("/vit-v");
    await expect(page.getByText(/loading faculty members/i)).not.toBeVisible({
      timeout: 15_000,
    });

    // Open dropdown and click Chennai
    await page.getByRole("button", { name: /vellore/i }).click();
    await page.getByRole("link", { name: /chennai/i }).first().click();

    // Should navigate to /vit-c
    await page.waitForURL("**/vit-c**");
    expect(page.url()).toContain("/vit-c");
  });

  test("browser back navigation after campus switch returns to previous campus", async ({
    page,
  }) => {
    // Start at Vellore
    await page.goto("/vit-v");
    await expect(page.getByText(/loading faculty members/i)).not.toBeVisible({
      timeout: 15_000,
    });

    // Switch to Chennai
    await page.getByRole("button", { name: /vellore/i }).click();
    await page.getByRole("link", { name: /chennai/i }).first().click();
    await page.waitForURL("**/vit-c**");

    // Go back
    await page.goBack();
    await page.waitForURL("**/vit-v**");
    expect(page.url()).toContain("/vit-v");
  });

  test("browser forward navigation works after going back", async ({
    page,
  }) => {
    // Start at Vellore
    await page.goto("/vit-v");
    await expect(page.getByText(/loading faculty members/i)).not.toBeVisible({
      timeout: 15_000,
    });

    // Switch to Chennai
    await page.getByRole("button", { name: /vellore/i }).click();
    await page.getByRole("link", { name: /chennai/i }).first().click();
    await page.waitForURL("**/vit-c**");

    // Back to Vellore
    await page.goBack();
    await page.waitForURL("**/vit-v**");

    // Forward to Chennai
    await page.goForward();
    await page.waitForURL("**/vit-c**");
    expect(page.url()).toContain("/vit-c");
  });

  test("Choose campus link returns to the campus selection page", async ({
    page,
  }) => {
    await page.goto("/vit-v");
    await expect(page.getByText(/loading faculty members/i)).not.toBeVisible({
      timeout: 15_000,
    });

    // Open dropdown
    await page.getByRole("button", { name: /vellore/i }).click();

    // Click "Choose campus"
    await page.getByRole("link", { name: "Choose campus" }).click();
    await page.waitForURL("**/");

    // Should show the campus selection page
    await expect(
      page.getByRole("heading", { name: /choose your campus/i })
    ).toBeVisible();
  });

  test("VITor logo navigates to home page from any campus", async ({
    page,
  }) => {
    await page.goto("/vit-v/fac-e2e-001");
    await expect(page.getByText("Loading...")).not.toBeVisible({
      timeout: 15_000,
    });

    // Click VITor logo
    await page.getByRole("link", { name: "VITor" }).click();

    // Should be on home page
    await page.waitForURL(/\/$/);
    await expect(
      page.getByRole("heading", { name: /choose your campus/i })
    ).toBeVisible();
  });
});
