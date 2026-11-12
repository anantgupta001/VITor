import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { AuthService } from "@/services/auth/auth.service";
import { UserRepository } from "@/repositories/user.repository";

// Mock external service dependencies
vi.mock("@/services/auth/auth.service", () => ({
  AuthService: {
    subscribeAuthState: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock("@/repositories/user.repository", () => ({
  UserRepository: {
    getUserProfile: vi.fn(),
    updateUserCampus: vi.fn(),
  },
}));

function TestConsumer() {
  const { user, userCampus, setUserCampus, logout, loading } = useAuth();

  return (
    <div>
      <span data-testid="loading-state">{String(loading)}</span>
      <span data-testid="user-state">{user ? user.email : "anonymous"}</span>
      <span data-testid="campus-state">{userCampus ?? "none"}</span>
      <button type="button" onClick={() => setUserCampus("vit-c")}>
        Select Chennai
      </button>
      <button type="button" onClick={() => setUserCampus("vit-v")}>
        Select Vellore
      </button>
      <button type="button" onClick={logout}>
        Trigger Logout
      </button>
    </div>
  );
}

describe("AuthContext and AuthProvider", () => {
  let authSubscriberCallback = null;
  const mockUnsubscribe = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    authSubscriberCallback = null;

    AuthService.subscribeAuthState.mockImplementation((callback) => {
      authSubscriberCallback = callback;
      return mockUnsubscribe;
    });

    UserRepository.getUserProfile.mockResolvedValue(null);
    UserRepository.updateUserCampus.mockResolvedValue();
    AuthService.logout.mockResolvedValue();
  });

  describe("Subscription lifecycle and loading state", () => {
    it("starts with loading=true until auth state callback fires", () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      expect(screen.getByTestId("loading-state")).toHaveTextContent("true");
      expect(screen.getByTestId("user-state")).toHaveTextContent("anonymous");
      expect(screen.getByTestId("campus-state")).toHaveTextContent("none");
      expect(AuthService.subscribeAuthState).toHaveBeenCalledTimes(1);
    });

    it("transitions loading=false and user=null when subscriber reports logged out user", async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      // Simulate Firebase Auth notifying logged-out state wrapped in act
      await act(async () => {
        authSubscriberCallback(null);
      });

      expect(screen.getByTestId("loading-state")).toHaveTextContent("false");
      expect(screen.getByTestId("user-state")).toHaveTextContent("anonymous");
      expect(screen.getByTestId("campus-state")).toHaveTextContent("none");
    });

    it("cleans up auth state subscription on unmount", () => {
      const { unmount } = render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      expect(mockUnsubscribe).not.toHaveBeenCalled();

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe("Authenticated state and campus resolution", () => {
    it("resolves campus from campus-specific email domain when no profile preference exists", async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      // Bhopal student email wrapped in act
      await act(async () => {
        authSubscriberCallback({
          uid: "user-bhopal",
          email: "student@vitbhopal.ac.in",
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId("loading-state")).toHaveTextContent("false");
        expect(screen.getByTestId("user-state")).toHaveTextContent("student@vitbhopal.ac.in");
        expect(screen.getByTestId("campus-state")).toHaveTextContent("vit-b");
      });
    });

    it("resolves userCampus from user profile document when available", async () => {
      UserRepository.getUserProfile.mockResolvedValueOnce({
        campusSlug: "vit-c",
      });

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      await act(async () => {
        authSubscriberCallback({
          uid: "user-dual",
          email: "student@vitstudent.ac.in",
        });
      });

      await waitFor(() => {
        expect(UserRepository.getUserProfile).toHaveBeenCalledWith("user-dual");
        expect(screen.getByTestId("campus-state")).toHaveTextContent("vit-c");
      });
    });

    it("prefers profile campus preference over email domain fallback", async () => {
      // Email domain says vit-b, but profile preference specifies vit-v
      UserRepository.getUserProfile.mockResolvedValueOnce({
        campusSlug: "vit-v",
      });

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      await act(async () => {
        authSubscriberCallback({
          uid: "user-override",
          email: "student@vitbhopal.ac.in",
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId("campus-state")).toHaveTextContent("vit-v");
      });
    });

    it("updates campus preference via setUserCampus and saves to UserRepository", async () => {
      const user = userEvent.setup();
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      await act(async () => {
        authSubscriberCallback({
          uid: "user-dual-preference",
          email: "student@vitstudent.ac.in",
        });
      });

      expect(screen.getByTestId("campus-state")).toHaveTextContent("none");

      const selectBtn = screen.getByRole("button", { name: "Select Chennai" });
      await user.click(selectBtn);

      expect(UserRepository.updateUserCampus).toHaveBeenCalledWith("user-dual-preference", "vit-c");

      await waitFor(() => {
        expect(screen.getByTestId("campus-state")).toHaveTextContent("vit-c");
      });
    });

    it("invokes AuthService.logout when logout function is called", async () => {
      const user = userEvent.setup();
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      await act(async () => {
        authSubscriberCallback({
          uid: "user-123",
          email: "student@vitstudent.ac.in",
        });
      });

      const logoutBtn = screen.getByRole("button", { name: "Trigger Logout" });
      await user.click(logoutBtn);

      expect(AuthService.logout).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error handling", () => {
    it("handles UserRepository.getUserProfile rejection gracefully without crashing", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      UserRepository.getUserProfile.mockRejectedValueOnce(new Error("Firestore offline"));

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      await act(async () => {
        authSubscriberCallback({
          uid: "user-err",
          email: "student@vitstudent.ac.in",
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId("campus-state")).toHaveTextContent("none");
      });
      expect(console.error).toHaveBeenCalled();
    });

    it("handles UserRepository.updateUserCampus rejection gracefully without crashing", async () => {
      const user = userEvent.setup();
      vi.spyOn(console, "error").mockImplementation(() => {});
      UserRepository.updateUserCampus.mockRejectedValueOnce(new Error("Write permission denied"));

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );

      await act(async () => {
        authSubscriberCallback({
          uid: "user-write-err",
          email: "student@vitstudent.ac.in",
        });
      });

      const selectBtn = screen.getByRole("button", { name: "Select Vellore" });
      await user.click(selectBtn);

      expect(UserRepository.updateUserCampus).toHaveBeenCalledWith("user-write-err", "vit-v");
      await waitFor(() => {
        expect(console.error).toHaveBeenCalled();
      });
    });
  });
});
