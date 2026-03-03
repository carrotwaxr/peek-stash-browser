/**
 * Test Utilities
 *
 * Common wrappers and utilities for testing React components and hooks.
 * Provides context providers and helper functions used across tests.
 */
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import type { ReactNode } from "react";

// ============================================================================
// Query Client Wrapper
// ============================================================================

/**
 * Creates a wrapper with a fresh QueryClient for testing hooks that use
 * TanStack Query (useQuery, useMutation, useQueryClient).
 *
 * Each call returns a new wrapper with an isolated QueryClient to prevent
 * cross-test state leakage.
 *
 * @example
 * const { result } = renderHook(() => useMyQueryHook(), {
 *   wrapper: createQueryWrapper()
 * });
 */
export const createQueryWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

// ============================================================================
// Router Wrapper
// ============================================================================

/**
 * Creates a wrapper component with MemoryRouter for testing hooks/components
 * that use react-router hooks (useNavigate, useSearchParams, etc.)
 *
 * @param {string[]} initialEntries - Initial URL entries for the router
 * @returns {React.FC} Wrapper component
 *
 * @example
 * const { result } = renderHook(() => useMyHook(), {
 *   wrapper: createRouterWrapper(["/?page=2&sort=rating"])
 * });
 */
export const createRouterWrapper = (initialEntries = ["/"]) => {
  return function RouterWrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    );
  };
};

// ============================================================================
// Custom Render
// ============================================================================

/**
 * Custom render function that wraps components with common providers
 *
 * @param {React.ReactElement} ui - Component to render
 * @param {object} options - Render options
 * @param {string} options.route - Initial route (default: "/")
 * @param {object} options.renderOptions - Additional options passed to render
 * @returns {RenderResult & { history: MemoryHistory }}
 *
 * @example
 * const { getByText } = renderWithProviders(<MyComponent />, {
 *   route: "/scenes?page=2"
 * });
 */
export const renderWithProviders = (
  ui: React.ReactElement,
  { route = "/", ...renderOptions } = {}
) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
  );

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
};

// ============================================================================
// API Mock Helpers
// ============================================================================

/**
 * Creates a mock API module with common endpoint mocks
 * Use with vi.mock() to provide consistent API behavior
 *
 * @returns {object} Mock API object
 *
 * @example
 * vi.mock("../api", () => createMockApi());
 */
export const createMockApi = () => ({
  apiGet: vi.fn().mockResolvedValue({}),
  apiPost: vi.fn().mockResolvedValue({}),
  apiPut: vi.fn().mockResolvedValue({}),
  apiPatch: vi.fn().mockResolvedValue({}),
  apiDelete: vi.fn().mockResolvedValue({}),
  libraryApi: {
    findScenes: vi.fn().mockResolvedValue({ findScenes: { count: 0, scenes: [] } }),
    findPerformers: vi.fn().mockResolvedValue({ findPerformers: { count: 0, performers: [] } }),
    findStudios: vi.fn().mockResolvedValue({ findStudios: { count: 0, studios: [] } }),
    findTags: vi.fn().mockResolvedValue({ findTags: { count: 0, tags: [] } }),
    findGroups: vi.fn().mockResolvedValue({ findGroups: { count: 0, groups: [] } }),
    findGalleries: vi.fn().mockResolvedValue({ findGalleries: { count: 0, galleries: [] } }),
    findImages: vi.fn().mockResolvedValue({ findImages: { count: 0, images: [] } }),
    getScene: vi.fn().mockResolvedValue(null),
    updateRating: vi.fn().mockResolvedValue({}),
    updateFavorite: vi.fn().mockResolvedValue({}),
  },
});

/**
 * Sets up preset API mocks for useFilterState tests
 *
 * @param {object} apiGet - The mocked apiGet function
 * @param {object} options - Configuration options
 * @param {object} options.presets - Presets by artifact type
 * @param {object} options.defaults - Default preset IDs by artifact type
 */
export const setupPresetMocks = (
  apiGet: any,
  { presets = {}, defaults = {} } = {}
) => {
  apiGet.mockImplementation((url: any) => {
    if (url === "/user/filter-presets") {
      return Promise.resolve({ presets });
    }
    if (url === "/user/default-presets") {
      return Promise.resolve({ defaults });
    }
    return Promise.resolve({});
  });
};

// ============================================================================
// Event Simulation Helpers
// ============================================================================

/**
 * Simulates keyboard navigation events
 *
 * @param {HTMLElement} element - Element to dispatch event on
 * @param {string} key - Key to simulate (e.g., "ArrowRight", "Enter")
 * @param {object} options - Additional event options
 */
export const simulateKeyDown = (element: HTMLElement, key: string, options = {}) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  element.dispatchEvent(event);
};

/**
 * Simulates a click event
 */
export const simulateClick = (element: HTMLElement) => {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
};

// ============================================================================
// Async Helpers
// ============================================================================

/**
 * Waits for a condition to be true
 * Useful for waiting on async state updates
 *
 * @param {() => boolean} condition - Function that returns true when ready
 * @param {number} timeout - Max time to wait in ms
 * @returns {Promise<void>}
 */
export const waitForCondition = async (condition: () => boolean, timeout = 1000) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error("waitForCondition timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

/**
 * Flushes all pending promises
 * Useful after triggering async operations
 */
export const flushPromises = () =>
  new Promise((resolve) => setTimeout(resolve, 0));

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Checks if an element is visible (not hidden by CSS)
 */
export const isVisible = (element: HTMLElement | null) => {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
};

/**
 * Gets all visible text content from an element
 */
export const getVisibleText = (element: HTMLElement | null) => {
  if (!element) return "";
  return element.textContent?.trim() ?? "";
};
