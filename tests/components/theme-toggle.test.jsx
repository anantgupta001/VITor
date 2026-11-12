import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import * as NextThemesModule from "next-themes";

vi.mock("next-themes", () => ({
  useTheme: vi.fn(),
}));

describe("ThemeToggle Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial rendering and theme switching calls", () => {
    it("renders both mobile and desktop toggle buttons with accessible label", () => {
      NextThemesModule.useTheme.mockReturnValue({
        theme: "light",
        setTheme: vi.fn(),
      });

      render(<ThemeToggle />);

      const toggleButtons = screen.getAllByRole("button", { name: "Toggle theme" });
      expect(toggleButtons).toHaveLength(2);

      const [mobileBtn, desktopBtn] = toggleButtons;
      expect(mobileBtn).toHaveClass("md:hidden");
      expect(desktopBtn).toHaveClass("hidden", "md:flex");
    });

    it("switches theme to dark when clicked in light mode", async () => {
      const user = userEvent.setup();
      const mockSetTheme = vi.fn();
      NextThemesModule.useTheme.mockReturnValue({
        theme: "light",
        setTheme: mockSetTheme,
      });

      render(<ThemeToggle />);

      const [, desktopBtn] = screen.getAllByRole("button", { name: "Toggle theme" });
      await user.click(desktopBtn);

      expect(mockSetTheme).toHaveBeenCalledTimes(1);
      expect(mockSetTheme).toHaveBeenCalledWith("dark");
    });

    it("switches theme back to light when clicked in dark mode", async () => {
      const user = userEvent.setup();
      const mockSetTheme = vi.fn();
      NextThemesModule.useTheme.mockReturnValue({
        theme: "dark",
        setTheme: mockSetTheme,
      });

      render(<ThemeToggle />);

      const [, desktopBtn] = screen.getAllByRole("button", { name: "Toggle theme" });
      await user.click(desktopBtn);

      expect(mockSetTheme).toHaveBeenCalledTimes(1);
      expect(mockSetTheme).toHaveBeenCalledWith("light");
    });

    it("mobile toggle button also triggers theme switch", async () => {
      const user = userEvent.setup();
      const mockSetTheme = vi.fn();
      NextThemesModule.useTheme.mockReturnValue({
        theme: "light",
        setTheme: mockSetTheme,
      });

      render(<ThemeToggle />);

      const [mobileBtn] = screen.getAllByRole("button", { name: "Toggle theme" });
      await user.click(mobileBtn);

      expect(mockSetTheme).toHaveBeenCalledTimes(1);
      expect(mockSetTheme).toHaveBeenCalledWith("dark");
    });
  });

  describe("State reflection through full toggle cycle", () => {
    // Harness component that manages theme state to test sequential clicks and UI reflection
    function StatefulThemeHarness() {
      const [theme, setTheme] = useState("light");
      NextThemesModule.useTheme.mockReturnValue({
        theme,
        setTheme: (newTheme) => setTheme(newTheme),
      });

      return (
        <div>
          <span data-testid="current-theme">{theme}</span>
          <ThemeToggle />
        </div>
      );
    }

    it("toggles theme back and forth on repeated clicks and reflects in UI and theme state", async () => {
      const user = userEvent.setup();
      render(<StatefulThemeHarness />);

      const currentThemeEl = screen.getByTestId("current-theme");
      const [, desktopBtn] = screen.getAllByRole("button", { name: "Toggle theme" });
      const sliderSpan = desktopBtn.querySelector("span");

      // 1. Initial State: Light Mode
      expect(currentThemeEl).toHaveTextContent("light");
      expect(sliderSpan).toHaveClass("translate-x-0");
      expect(sliderSpan).not.toHaveClass("translate-x-6");

      // 2. Click 1: Switch to Dark Mode
      await user.click(desktopBtn);

      expect(currentThemeEl).toHaveTextContent("dark");
      expect(sliderSpan).toHaveClass("translate-x-6");
      expect(sliderSpan).not.toHaveClass("translate-x-0");

      // 3. Click 2: Switch back to Light Mode
      await user.click(desktopBtn);

      expect(currentThemeEl).toHaveTextContent("light");
      expect(sliderSpan).toHaveClass("translate-x-0");
      expect(sliderSpan).not.toHaveClass("translate-x-6");
    });
  });
});
