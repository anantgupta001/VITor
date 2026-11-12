// @ts-check
import { test, expect } from "@playwright/test";

test.describe("Journey 1: Campus Selection", () => {
  test("displays the campus selection page with all four campuses", async ({
    page,
  }) => {
    await page.goto("/");

    // Page heading
    await expect(
      page.getByRole("heading", { name: /choose your campus/i })
    ).toBeVisible();
    await expect(
      page.getByText(/select your vit campus to view and rate faculty/i)
    ).toBeVisible();

    // All four campus links
    const campuses = [
      { name: /ap campus/i, href: "/vit-ap" },
      { name: /vellore campus|vellore/i, href: "/vit-v" },
      { name: /chennai campus|chennai/i, href: "/vit-c" },
      { name: /bhopal campus|bhopal/i, href: "/vit-b" },
    ];

    for (const campus of campuses) {
      const link = page.getByRole("link", { name: campus.name }).first();
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", campus.href);
    }
  });

  test("selecting a campus navigates to the campus directory", async ({
    page,
  }) => {
    await page.goto("/");

    // Click the Vellore campus link
    await page.getByRole("link", { name: /vellore/i }).first().click();

    // Should navigate to /vit-v
    await page.waitForURL("**/vit-v**");
    expect(page.url()).toContain("/vit-v");

    // The search input should be visible (campus directory loaded)
    await expect(
      page.getByPlaceholder(/search by faculty name or department/i)
    ).toBeVisible();
  });

  test("navbar reflects the selected campus after navigation", async ({
    page,
  }) => {
    await page.goto("/vit-v");

    // Navbar should show the campus dropdown button
    await expect(
      page.getByRole("button", { name: /vellore/i })
    ).toBeVisible();
  });
});
