/* eslint-disable @next/next/no-img-element */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Navbar from "@/components/Navbar";
import * as AuthContextModule from "@/context/auth-context";
import * as NavigationModule from "next/navigation";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

// Mock next/image for LoginButton
vi.mock("next/image", () => ({
  default: ({ src, alt, ...props }) => <img src={src} alt={alt} {...props} />,
}));

// Mock next-themes
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

describe("Navbar Component", () => {
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    NavigationModule.usePathname.mockReturnValue("/");
    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      user: null,
      logout: mockLogout,
    });
  });

  describe("Brand and static navigation", () => {
    it("renders VITor logo link pointing to home page", () => {
      render(<Navbar />);

      const logoLink = screen.getByRole("link", { name: "VITor" });
      expect(logoLink).toBeInTheDocument();
      expect(logoLink).toHaveAttribute("href", "/");
    });

    it("renders 'Choose campus' link when at root route with no campus selected", () => {
      NavigationModule.usePathname.mockReturnValue("/");

      render(<Navbar />);

      const chooseCampusLink = screen.getByRole("link", { name: /choose campus/i });
      expect(chooseCampusLink).toBeInTheDocument();
      expect(chooseCampusLink).toHaveAttribute("href", "/");
    });
  });

  describe("Campus dropdown navigation on campus routes", () => {
    beforeEach(() => {
      NavigationModule.usePathname.mockReturnValue("/vit-v");
    });

    it("renders active campus button when navigating within a campus", () => {
      render(<Navbar />);

      // Campus button indicates active campus (Vellore Campus)
      const campusBtn = screen.getByRole("button", { name: /vellore campus/i });
      expect(campusBtn).toBeInTheDocument();
      // Dropdown menu is closed initially
      expect(screen.queryByRole("link", { name: /chennai campus/i })).not.toBeInTheDocument();
    });

    it("toggles campus menu dropdown on click and lists all campus links", async () => {
      const user = userEvent.setup();
      render(<Navbar />);

      const campusBtn = screen.getByRole("button", { name: /vellore campus/i });
      await user.click(campusBtn);

      // Dropdown opens and lists all campuses
      expect(screen.getByRole("link", { name: /ap campus/i })).toHaveAttribute("href", "/vit-ap");
      expect(screen.getByRole("link", { name: /vellore campus/i })).toHaveAttribute("href", "/vit-v");
      expect(screen.getByRole("link", { name: /chennai campus/i })).toHaveAttribute("href", "/vit-c");
      expect(screen.getByRole("link", { name: /bhopal campus/i })).toHaveAttribute("href", "/vit-b");
      expect(screen.getByRole("link", { name: "Choose campus" })).toHaveAttribute("href", "/");
    });

    it("closes campus dropdown when a campus link is clicked", async () => {
      const user = userEvent.setup();
      render(<Navbar />);

      const campusBtn = screen.getByRole("button", { name: /vellore campus/i });
      await user.click(campusBtn);

      const chennaiLink = screen.getByRole("link", { name: /chennai campus/i });
      await user.click(chennaiLink);

      // Dropdown closes after clicking link
      expect(screen.queryByRole("link", { name: /chennai campus/i })).not.toBeInTheDocument();
    });

    it("closes campus dropdown when clicking outside", async () => {
      const user = userEvent.setup();
      render(<Navbar />);

      const campusBtn = screen.getByRole("button", { name: /vellore campus/i });
      await user.click(campusBtn);

      expect(screen.getByRole("link", { name: /chennai campus/i })).toBeInTheDocument();

      // Click outside dropdown
      fireEvent.click(document.body);

      expect(screen.queryByRole("link", { name: /chennai campus/i })).not.toBeInTheDocument();
    });
  });

  describe("Authentication state UI", () => {
    it("renders LoginButton when user is logged out", () => {
      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        user: null,
        logout: mockLogout,
      });

      render(<Navbar />);

      expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^logout$/i })).not.toBeInTheDocument();
    });

    it("renders Logout button when user is authenticated and invokes logout on click", async () => {
      const user = userEvent.setup();
      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        user: { uid: "user-123", email: "student@vitstudent.ac.in" },
        logout: mockLogout,
      });

      render(<Navbar />);

      const logoutBtn = screen.getByRole("button", { name: /logout/i });
      expect(logoutBtn).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /sign in with google/i })).not.toBeInTheDocument();

      await user.click(logoutBtn);
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });
});
