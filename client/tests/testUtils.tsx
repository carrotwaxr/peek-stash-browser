/**
 * Test Utilities
 *
 * Common wrappers and utilities for testing React components and hooks.
 * Provides context providers and helper functions used across tests.
 */
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

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
  return function RouterWrapper({ children }) {
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
  ui,
  { route = "/", ...renderOptions } = {}
) => {
  const Wrapper = ({ children }) => (
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
 * vi.mock("../services/api.js", () => createMockApi());
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
    incrementOCounter: vi.fn().mockResolvedValue({}),
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
  apiGet,
  { presets = {}, defaults = {} } = {}
) => {
  apiGet.mockImplementation((url) => {
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
export const simulateKeyDown = (element, key, options = {}) => {
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
export const simulateClick = (element) => {
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
export const waitForCondition = async (condition, timeout = 1000) => {
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
export const isVisible = (element) => {
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
export const getVisibleText = (element) => {
  if (!element) return "";
  return element.textContent?.trim() ?? "";
};
