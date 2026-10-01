import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createAuthValue } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "@/contexts/AuthContextProvider";
import { useUnitPreference } from "@/contexts/UnitPreferenceContext";
import { UnitPreferenceProvider } from "@/contexts/UnitPreferenceProvider";
import { showError } from "@/utils/toast";
import { UNITS } from "@/utils/unitConversions";

const { mockGet, mockPut } = vi.hoisted(() => ({
  mockGet: vi.fn<(...args: unknown[]) => unknown>(),
  mockPut: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock("@/api", () => ({
  apiGet: (...args: unknown[]) => mockGet(...args),
  apiPut: (...args: unknown[]) => mockPut(...args),
}));

vi.mock("@/utils/toast", () => ({ showError: vi.fn() }));

/** Renders useUnitPreference under a provider whose auth state can change. */
function renderUnits(initialAuth: AuthContextValue) {
  let auth = initialAuth;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <UnitPreferenceProvider>{children}</UnitPreferenceProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  const view = renderHook(() => useUnitPreference(), { wrapper });
  return {
    ...view,
    setAuth: (next: AuthContextValue) => {
      auth = next;
      view.rerender();
    },
  };
}

describe("UnitPreferenceProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({
      settings: { unitPreference: UNITS.IMPERIAL },
    });
  });

  it("does not ask for user settings while signed out", async () => {
    const { result } = renderUnits(
      createAuthValue({ isAuthenticated: false, isLoading: false })
    );

    // Let any request the mount started settle before checking.
    await act(async () => {});
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.unitPreference).toBe(UNITS.METRIC);
    expect(result.current.isLoading).toBe(false);
  });

  it("loads user settings once the user signs in", async () => {
    const { result, setAuth } = renderUnits(
      createAuthValue({ isAuthenticated: false, isLoading: false })
    );

    setAuth(createAuthValue({ isAuthenticated: true, isLoading: false }));

    await waitFor(() => {
      expect(result.current.unitPreference).toBe(UNITS.IMPERIAL);
    });
    expect(result.current.isLoading).toBe(false);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/user/settings", expect.anything());
  });

  it("stays loading without a request while auth is loading", async () => {
    const { result } = renderUnits(
      createAuthValue({ isAuthenticated: false, isLoading: true })
    );

    await act(async () => {});
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);
  });

  it("switching units shows at once; a failed save shows the server's unit again", async () => {
    let refuse: (error: Error) => void = () => {};
    mockPut.mockReturnValue(
      new Promise((_resolve, reject) => {
        refuse = reject;
      })
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderUnits(
      createAuthValue({ isAuthenticated: true, isLoading: false })
    );
    await waitFor(() =>
      expect(result.current.unitPreference).toBe(UNITS.IMPERIAL)
    );

    let saved: Promise<void> = Promise.resolve();
    act(() => {
      saved = result.current.setUnitPreference(UNITS.METRIC);
    });

    // The server has not answered yet
    await waitFor(() =>
      expect(result.current.unitPreference).toBe(UNITS.METRIC)
    );
    expect(mockPut).toHaveBeenCalledWith("/user/settings", {
      unitPreference: UNITS.METRIC,
    });

    refuse(new Error("Database busy"));
    await act(async () => {
      await saved;
    });

    await waitFor(() =>
      expect(result.current.unitPreference).toBe(UNITS.IMPERIAL)
    );
    expect(showError).toHaveBeenCalledWith("Failed to save unit preference");
  });
});
