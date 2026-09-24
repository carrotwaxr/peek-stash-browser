import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createAuthValue } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "@/contexts/AuthContextProvider";
import { useUnitPreference } from "@/contexts/UnitPreferenceContext";
import { UnitPreferenceProvider } from "@/contexts/UnitPreferenceProvider";
import { UNITS } from "@/utils/unitConversions";

const { mockGet, mockPut } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
}));

vi.mock("@/api", () => ({
  apiGet: (...args: unknown[]) => mockGet(...args),
  apiPut: (...args: unknown[]) => mockPut(...args),
}));

/** Renders useUnitPreference under a provider whose auth state can change. */
function renderUnits(initialAuth: AuthContextValue) {
  let auth = initialAuth;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={auth}>
      <UnitPreferenceProvider>{children}</UnitPreferenceProvider>
    </AuthContext.Provider>
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
    expect(mockGet).toHaveBeenCalledWith("/user/settings");
  });

  it("stays loading without a request while auth is loading", async () => {
    const { result } = renderUnits(
      createAuthValue({ isAuthenticated: false, isLoading: true })
    );

    await act(async () => {});
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);
  });
});
