/* eslint-disable @next/next/no-img-element */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginButton from "@/components/LoginButton";
import * as AuthContextModule from "@/context/auth-context";

// Mock next/image to render standard img tag
vi.mock("next/image", () => ({
  default: ({ src, alt, ...props }) => <img src={src} alt={alt} {...props} />,
}));

describe("LoginButton Component", () => {
  const mockLogout = vi.fn();
  const mockSignIn = vi.fn();
  const mockClearAuthError = vi.fn();

  function mockAuth(overrides = {}) {
    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      user: null,
      logout: mockLogout,
      signIn: mockSignIn,
      authError: "",
      clearAuthError: mockClearAuthError,
      ...overrides,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Logged-out state", () => {
    beforeEach(() => mockAuth());

    it("renders 'Sign in with Google' button with icon when logged out", () => {
      render(<LoginButton />);

      const button = screen.getByRole("button", { name: /sign in with google/i });
      expect(button).toBeInTheDocument();
      expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "Google" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /logout/i })).not.toBeInTheDocument();
    });

    it("invokes signIn from the auth context when clicked", async () => {
      const user = userEvent.setup();

      render(<LoginButton />);
      await user.click(screen.getByRole("button", { name: /sign in with google/i }));

      expect(mockSignIn).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("displays the auth error from the context as an alert", () => {
      mockAuth({ authError: "Please use your VIT college email ID to sign in." });

      render(<LoginButton />);

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("Please use your VIT college email ID to sign in.");
    });

    it("clears the auth error after the display duration", () => {
      vi.useFakeTimers();
      mockAuth({ authError: "Login failed. Please try again." });

      render(<LoginButton />);
      expect(mockClearAuthError).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(4000);
      });

      expect(mockClearAuthError).toHaveBeenCalledTimes(1);
    });
  });

  describe("Logged-in state", () => {
    beforeEach(() =>
      mockAuth({ user: { uid: "test-user-123", email: "student@vitstudent.ac.in" } })
    );

    it("renders 'Logout' button and omits sign-in button when logged in", () => {
      render(<LoginButton />);

      expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /sign in with google/i })).not.toBeInTheDocument();
    });

    it("invokes logout function from auth context when Logout button is clicked", async () => {
      const user = userEvent.setup();
      render(<LoginButton />);

      await user.click(screen.getByRole("button", { name: /logout/i }));

      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });
});
