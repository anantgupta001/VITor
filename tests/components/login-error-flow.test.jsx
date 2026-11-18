/* eslint-disable @next/next/no-img-element */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Navbar from "@/components/Navbar";
import { AuthProvider } from "@/context/auth-context";
import { AuthService } from "@/services/auth/auth.service";
import { UserRepository } from "@/repositories/user.repository";

// Regression: Navbar swaps <LoginButton/> for its Logout button whenever the auth
// state reports a user, so LoginButton unmounts mid sign-in. The error message must
// still be visible once the (rejected) sign-in finishes and LoginButton is back.

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next/image", () => ({
  default: ({ src, alt, ...props }) => <img src={src} alt={alt} {...props} />,
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));
vi.mock("@/services/auth/auth.service", () => ({
  AuthService: {
    subscribeAuthState: vi.fn(),
    signInWithGoogle: vi.fn(),
    logout: vi.fn(),
  },
}));
vi.mock("@/repositories/user.repository", () => ({
  UserRepository: { getUserProfile: vi.fn(), updateUserCampus: vi.fn() },
}));

const MESSAGE = "Please use your VIT college email ID to sign in.";

describe("Login error survives the Navbar auth-state swap", () => {
  let emitAuth;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    AuthService.subscribeAuthState.mockImplementation((cb) => {
      emitAuth = cb;
      return vi.fn();
    });
    UserRepository.getUserProfile.mockResolvedValue(null);
  });

  // The sign-in click handler already runs inside the user-event act scope, so auth
  // events fired from the mocked service must not open a second (overlapping) act().
  async function emitDuringSignIn(authUser) {
    emitAuth(authUser);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  async function renderApp() {
    render(
      <AuthProvider>
        <Navbar />
      </AuthProvider>
    );
    await act(async () => {
      emitAuth(null);
    });
  }

  it("shows the error for a non-college account without ever showing Logout or fetching a profile", async () => {
    const user = userEvent.setup();
    AuthService.signInWithGoogle.mockImplementation(async () => {
      // Firebase reports the (non-college) account, then the service signs it out.
      await emitDuringSignIn({ uid: "outsider", email: "person@gmail.com" });
      await emitDuringSignIn(null);
      return { success: false, user: null, error: MESSAGE };
    });

    await renderApp();
    await user.click(screen.getByRole("button", { name: /sign in with google/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(MESSAGE);
    expect(screen.queryByRole("button", { name: /logout/i })).not.toBeInTheDocument();
    expect(UserRepository.getUserProfile).not.toHaveBeenCalled();
  });

  it("still shows the error when LoginButton is unmounted and remounted during sign-in", async () => {
    const user = userEvent.setup();
    AuthService.signInWithGoogle.mockImplementation(async () => {
      // A college account momentarily appears (LoginButton unmounts), then is rejected.
      await emitDuringSignIn({ uid: "u1", email: "student@vitstudent.ac.in" });
      expect(screen.queryByRole("button", { name: /sign in with google/i })).not.toBeInTheDocument();
      await emitDuringSignIn(null);
      return { success: false, user: null, error: MESSAGE };
    });

    await renderApp();
    await user.click(screen.getByRole("button", { name: /sign in with google/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(MESSAGE);
  });

  it("shows nothing when the user simply closes the popup", async () => {
    const user = userEvent.setup();
    const err = Object.assign(new Error("closed"), { code: "auth/popup-closed-by-user" });
    AuthService.signInWithGoogle.mockRejectedValueOnce(err);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await renderApp();
    await user.click(screen.getByRole("button", { name: /sign in with google/i }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
});
