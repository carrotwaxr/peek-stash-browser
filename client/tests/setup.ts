/**
 * Test setup file - imported by vitest before running tests
 *
 * Provides:
 * - Common test utilities and wrappers
 * - Global mocks for browser APIs not available in happy-dom
 * - Re-exports from testing-library for convenience
 */
import { vi } from "vitest";
import "@testing-library/jest-dom";

// Mock window.matchMedia (not available in happy-dom). The implementation
// is the mock's own, so `vi.restoreAllMocks()` in a test file keeps it (a
// `mockImplementation` would be dropped, and every `useMediaQuery` reader,
// the list controls among them, would then throw)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver (used by lazy loading)
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver =
  MockIntersectionObserver as unknown as typeof IntersectionObserver;

// Mock ResizeObserver (used by some UI components)
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver =
  MockResizeObserver as unknown as typeof ResizeObserver;

// Mock scrollIntoView (not implemented in happy-dom)
Element.prototype.scrollIntoView = vi.fn();
