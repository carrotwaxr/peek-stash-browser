import { render, screen, waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/services/api.js", () => ({
  setupApi: {
    getSetupStatus: vi.fn(),
  },
}));

import { setupApi } from "../../src/services/api.js";
import {
  ConfigProvider,
  useConfig,
} from "../../src/contexts/ConfigContext.jsx";

/**
 * Helper component that renders config values as text for assertion.
 */
function ConfigDisplay() {
  const { hasMultipleInstances, isLoading } = useConfig();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="multiple">{String(hasMultipleInstances)}</span>
    </div>
  );
}

describe("ConfigContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ConfigProvider", () => {
    it("has isLoading=true and hasMultipleInstances=false before fetch resolves", () => {
      // Never-resolving promise to keep the provider in loading state
      setupApi.getSetupStatus.mockReturnValue(new Promise(() => {}));

      render(
        <ConfigProvider>
          <ConfigDisplay />
        </ConfigProvider>
      );

      expect(screen.getByTestId("loading").textContent).toBe("true");
      expect(screen.getByTestId("multiple").textContent).toBe("false");
    });

    it("sets hasMultipleInstances=false when stashInstanceCount is 1", async () => {
      setupApi.getSetupStatus.mockResolvedValue({ stashInstanceCount: 1 });

      render(
        <ConfigProvider>
          <ConfigDisplay />
        </ConfigProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      });

      expect(screen.getByTestId("multiple").textContent).toBe("false");
    });

    it("sets hasMultipleInstances=true when stashInstanceCount > 1", async () => {
      setupApi.getSetupStatus.mockResolvedValue({ stashInstanceCount: 3 });

      render(
        <ConfigProvider>
          <ConfigDisplay />
        </ConfigProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      });

      expect(screen.getByTestId("multiple").textContent).toBe("true");
    });

    it("sets hasMultipleInstances=false when stashInstanceCount is 0", async () => {
      setupApi.getSetupStatus.mockResolvedValue({ stashInstanceCount: 0 });

      render(
        <ConfigProvider>
          <ConfigDisplay />
        </ConfigProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      });

      expect(screen.getByTestId("multiple").textContent).toBe("false");
    });

    it("sets hasMultipleInstances=false when stashInstanceCount is undefined", async () => {
      setupApi.getSetupStatus.mockResolvedValue({});

      render(
        <ConfigProvider>
          <ConfigDisplay />
        </ConfigProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      });

      expect(screen.getByTestId("multiple").textContent).toBe("false");
    });

    it("sets hasMultipleInstances=false when stashInstanceCount is null", async () => {
      setupApi.getSetupStatus.mockResolvedValue({
        stashInstanceCount: null,
      });

      render(
        <ConfigProvider>
          <ConfigDisplay />
        </ConfigProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      });

      expect(screen.getByTestId("multiple").textContent).toBe("false");
    });

    it("handles API error gracefully and sets isLoading=false", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      setupApi.getSetupStatus.mockRejectedValue(new Error("Network error"));

      render(
        <ConfigProvider>
          <ConfigDisplay />
        </ConfigProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      });

      expect(screen.getByTestId("multiple").textContent).toBe("false");
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to fetch config:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it("renders children correctly", async () => {
      setupApi.getSetupStatus.mockResolvedValue({ stashInstanceCount: 1 });

      render(
        <ConfigProvider>
          <div data-testid="child">Hello</div>
        </ConfigProvider>
      );

      expect(screen.getByTestId("child").textContent).toBe("Hello");

      // Wait for the async fetch to settle to avoid act() warning
      await waitFor(() => {
        expect(setupApi.getSetupStatus).toHaveBeenCalled();
      });
    });
  });

  describe("useConfig hook", () => {
    it("returns default context values when used outside a provider", () => {
      const { result } = renderHook(() => useConfig());

      expect(result.current.hasMultipleInstances).toBe(false);
      expect(result.current.isLoading).toBe(true);
    });

    it("returns fetched config values when used inside a provider", async () => {
      setupApi.getSetupStatus.mockResolvedValue({ stashInstanceCount: 2 });

      const wrapper = ({ children }) => (
        <ConfigProvider>{children}</ConfigProvider>
      );

      const { result } = renderHook(() => useConfig(), { wrapper });

      // Initially loading
      expect(result.current.isLoading).toBe(true);
      expect(result.current.hasMultipleInstances).toBe(false);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMultipleInstances).toBe(true);
    });
  });
});
