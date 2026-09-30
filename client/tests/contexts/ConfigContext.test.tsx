import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@tests/testUtils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invalidateInstanceQueries } from "../../src/api/hooks/useLibraryReady";
import { ConfigProvider, useConfig } from "../../src/contexts/ConfigContext";
import { jsonResponse, requestsTo, stubApi } from "../helpers/stubApi";

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

/** Answers GET /setup/status with this body */
const answerStatus = (body: Record<string, unknown>) =>
  stubApi({ "/setup/status": () => jsonResponse(200, body) });

const renderConfig = () => {
  const Wrapper = createQueryWrapper();
  return render(
    <Wrapper>
      <ConfigProvider>
        <ConfigDisplay />
      </ConfigProvider>
    </Wrapper>
  );
};

describe("ConfigContext", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("ConfigProvider", () => {
    it("has isLoading=true and hasMultipleInstances=false before fetch resolves", () => {
      // Never-resolving answer keeps the provider loading
      stubApi({ "/setup/status": () => new Promise<Response>(() => {}) });

      renderConfig();

      expect(screen.getByTestId("loading").textContent).toBe("true");
      expect(screen.getByTestId("multiple").textContent).toBe("false");
    });

    it("sets hasMultipleInstances=false when stashInstanceCount is 1", async () => {
      answerStatus({ stashInstanceCount: 1 });

      renderConfig();

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      });
      expect(screen.getByTestId("multiple").textContent).toBe("false");
    });

    it("sets hasMultipleInstances=true when stashInstanceCount > 1", async () => {
      answerStatus({ stashInstanceCount: 3 });

      renderConfig();

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      });
      expect(screen.getByTestId("multiple").textContent).toBe("true");
    });

    it("sets hasMultipleInstances=false when stashInstanceCount is 0", async () => {
      answerStatus({ stashInstanceCount: 0 });

      renderConfig();

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      });
      expect(screen.getByTestId("multiple").textContent).toBe("false");
    });

    it("sets hasMultipleInstances=false when stashInstanceCount is missing", async () => {
      answerStatus({});

      renderConfig();

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      });
      expect(screen.getByTestId("multiple").textContent).toBe("false");
    });

    it("stays loading while the status fails, with hasMultipleInstances=false", async () => {
      const fetchMock = stubApi({
        "/setup/status": () => jsonResponse(502, { error: "Bad Gateway" }),
      });
      const client = new QueryClient();

      render(
        <QueryClientProvider client={client}>
          <ConfigProvider>
            <ConfigDisplay />
          </ConfigProvider>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(requestsTo(fetchMock, "/setup/status").length).toBe(1);
      });
      expect(screen.getByTestId("loading").textContent).toBe("true");
      expect(screen.getByTestId("multiple").textContent).toBe("false");
      // Stops the retry
      client.clear();
    });

    it("renders children", async () => {
      const fetchMock = answerStatus({ stashInstanceCount: 1 });
      const Wrapper = createQueryWrapper();

      render(
        <Wrapper>
          <ConfigProvider>
            <div data-testid="child">Hello</div>
          </ConfigProvider>
        </Wrapper>
      );

      expect(screen.getByTestId("child").textContent).toBe("Hello");
      await waitFor(() => {
        expect(requestsTo(fetchMock, "/setup/status").length).toBe(1);
      });
    });

    it("hasMultipleInstances follows the setup-status query and changes when it is invalidated", async () => {
      let count = 1;
      const fetchMock = stubApi({
        "/setup/status": () =>
          jsonResponse(200, { setupComplete: true, stashInstanceCount: count }),
      });
      const client = new QueryClient();

      render(
        <QueryClientProvider client={client}>
          <ConfigProvider>
            <ConfigDisplay />
          </ConfigProvider>
        </QueryClientProvider>
      );
      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("false");
      });
      expect(screen.getByTestId("multiple").textContent).toBe("false");

      // An admin adds a second instance
      count = 2;
      await invalidateInstanceQueries(client);

      await waitFor(() => {
        expect(screen.getByTestId("multiple").textContent).toBe("true");
      });
      expect(requestsTo(fetchMock, "/setup/status")).toHaveLength(2);
      client.clear();
    });
  });

  describe("useConfig hook", () => {
    it("returns default context values when used outside a provider", () => {
      const { result } = renderHook(() => useConfig());

      expect(result.current.hasMultipleInstances).toBe(false);
      expect(result.current.isLoading).toBe(true);
    });

    it("returns fetched config values when used inside a provider", async () => {
      answerStatus({ stashInstanceCount: 2 });
      const QueryWrapper = createQueryWrapper();
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryWrapper>
          <ConfigProvider>{children}</ConfigProvider>
        </QueryWrapper>
      );

      const { result } = renderHook(() => useConfig(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.hasMultipleInstances).toBe(false);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.hasMultipleInstances).toBe(true);
    });
  });
});
