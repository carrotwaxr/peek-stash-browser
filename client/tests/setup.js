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

// Mock window.matchMedia (not available in happy-dom)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
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
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver = MockIntersectionObserver;

// Mock ResizeObserver (used by some UI components)
class MockResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver;

// Mock scrollIntoView (not implemented in happy-dom)
Element.prototype.scrollIntoView = vi.fn();
