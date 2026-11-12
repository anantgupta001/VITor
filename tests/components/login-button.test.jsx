/* eslint-disable @next/next/no-img-element */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginButton from "@/components/LoginButton";
import * as AuthContextModule from "@/context/auth-context";
import { AuthService } from "@/services/auth/auth.service";

// Mock next/image to render standard img tag
vi.mock("next/image", () => ({
  default: ({ src, alt, ...props }) => <img src={src} alt={alt} {...props} />,
}));

// Mock AuthService
vi.mock("@/services/auth/auth.service", () => ({
  AuthService: {
    signInWithGoogle: vi.fn(),
  },
}));

describe("LoginButton Component", () => {
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Logged-out state", () => {
    beforeEach(() => {
      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        user: null,
        logout: mockLogout,
      });
    });

    it("renders 'Sign in with Google' button with icon when logged out", () => {
      render(<LoginButton />);

      const button = screen.getByRole("button", { name: /sign in with google/i });
      expect(button).toBeInTheDocument();
      expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "Google" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /logout/i })).not.toBeInTheDocument();
    });

    it("invokes AuthService.signInWithGoogle when clicked", async () => {
      const user = userEvent.setup();
      AuthService.signInWithGoogle.mockResolvedValueOnce({ success: true, user: { uid: "u1" } });

      render(<LoginButton />);
      const button = screen.getByRole("button", { name: /sign in with google/i });
      await user.click(button);

      expect(AuthService.signInWithGoogle).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("displays error alert when signInWithGoogle returns failure with error message", async () => {
      const user = userEvent.setup();
      const errorMessage = "Please use your official college email address.";
      AuthService.signInWithGoogle.mockResolvedValueOnce({
        success: false,
        error: errorMessage,
      });

      render(<LoginButton />);
      const button = screen.getByRole("button", { name: /sign in with google/i });
      await user.click(button);

      const alert = await screen.findByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent(errorMessage);
    });

    it("displays fallback error alert when signInWithGoogle throws an exception", async () => {
      const user = userEvent.setup();
      vi.spyOn(console, "error").mockImplementation(() => {});
      AuthService.signInWithGoogle.mockRejectedValueOnce(new Error("Network connection lost"));

      render(<LoginButton />);
      const button = screen.getByRole("button", { name: /sign in with google/i });
      await user.click(button);

      const alert = await screen.findByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent("Login failed. Please try again.");
    });
  });

  describe("Logged-in state", () => {
    beforeEach(() => {
      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        user: { uid: "test-user-123", email: "student@vitstudent.ac.in" },
        logout: mockLogout,
      });
    });

    it("renders 'Logout' button and omits sign-in button when logged in", () => {
      render(<LoginButton />);

      expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /sign in with google/i })).not.toBeInTheDocument();
    });

    it("invokes logout function from auth context when Logout button is clicked", async () => {
      const user = userEvent.setup();
      render(<LoginButton />);

      const logoutBtn = screen.getByRole("button", { name: /logout/i });
      await user.click(logoutBtn);

      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });
});
