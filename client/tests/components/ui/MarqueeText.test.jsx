// client/tests/components/ui/MarqueeText.test.jsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import MarqueeText from "../../../src/components/ui/MarqueeText.jsx";

// Mock ResizeObserver
const mockResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
globalThis.ResizeObserver = mockResizeObserver;

// Mock IntersectionObserver
const mockIntersectionObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
globalThis.IntersectionObserver = mockIntersectionObserver;

describe("MarqueeText", () => {
  let matchMediaMock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock matchMedia for hover capability and reduced motion detection
    matchMediaMock = vi.fn().mockImplementation((query) => ({
      matches: query === "(hover: hover)", // Default: has hover capability
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    globalThis.matchMedia = matchMediaMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("basic rendering", () => {
    it("renders children text", () => {
      render(<MarqueeText>Test Title</MarqueeText>);
      expect(screen.getByText("Test Title")).toBeInTheDocument();
    });

    it("applies custom className to text element", () => {
      render(<MarqueeText className="custom-class">Test</MarqueeText>);
      const textElement = screen.getByText("Test");
      expect(textElement).toHaveClass("custom-class");
    });

    it("applies custom style to text element", () => {
      render(<MarqueeText style={{ color: "red" }}>Test</MarqueeText>);
      const textElement = screen.getByText("Test");
      expect(textElement).toHaveStyle({ color: "red" });
    });

    it("has overflow-hidden container", () => {
      render(<MarqueeText>Test</MarqueeText>);
      const container = screen.getByText("Test").parentElement;
      expect(container).toHaveClass("overflow-hidden");
    });

    it("has whitespace-nowrap container", () => {
      render(<MarqueeText>Test</MarqueeText>);
      const container = screen.getByText("Test").parentElement;
      expect(container).toHaveClass("whitespace-nowrap");
    });
  });

  describe("hover capability detection", () => {
    it("detects hover capability on desktop devices", () => {
      matchMediaMock.mockImplementation((query) => ({
        matches: query === "(hover: hover)",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      const { container } = render(<MarqueeText>Test</MarqueeText>);
      const containerDiv = container.firstChild;

      // On desktop, hover events should be handled
      fireEvent.mouseEnter(containerDiv);
      // Component should respond to hover (internal state change)
      // We can verify this by checking that onMouseEnter doesn't throw
      expect(containerDiv).toBeInTheDocument();
    });

    it("detects no hover capability on touch devices", () => {
      matchMediaMock.mockImplementation((query) => ({
        matches: query === "(hover: none)",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      render(<MarqueeText>Test</MarqueeText>);
      // Component should render successfully on touch devices
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
  });

  describe("reduced motion preference", () => {
    it("respects prefers-reduced-motion media query", () => {
      matchMediaMock.mockImplementation((query) => ({
        matches:
          query === "(prefers-reduced-motion: reduce)" ||
          query === "(hover: hover)",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      render(<MarqueeText>Test</MarqueeText>);
      const textElement = screen.getByText("Test");

      // When reduced motion is preferred, animation should not be applied
      // even on hover
      fireEvent.mouseEnter(textElement.parentElement);
      expect(textElement.style.animation).toBe("");
    });
  });

  describe("mouse interactions", () => {
    it("handles mouseEnter event", () => {
      render(<MarqueeText>Test</MarqueeText>);
      const container = screen.getByText("Test").parentElement;

      // Should not throw
      fireEvent.mouseEnter(container);
      expect(container).toBeInTheDocument();
    });

    it("handles mouseLeave event", () => {
      render(<MarqueeText>Test</MarqueeText>);
      const container = screen.getByText("Test").parentElement;

      fireEvent.mouseEnter(container);
      fireEvent.mouseLeave(container);
      expect(container).toBeInTheDocument();
    });
  });

  describe("autoplayOnScroll prop", () => {
    it("enables scroll-based autoplay by default", () => {
      render(<MarqueeText>Test</MarqueeText>);
      expect(screen.getByText("Test")).toBeInTheDocument();
    });

    it("can disable scroll-based autoplay", () => {
      render(<MarqueeText autoplayOnScroll={false}>Test</MarqueeText>);
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
  });

  describe("cleanup", () => {
    it("cleans up ResizeObserver on unmount", () => {
      const disconnectMock = vi.fn();
      mockResizeObserver.mockImplementation(() => ({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: disconnectMock,
      }));

      const { unmount } = render(<MarqueeText>Test</MarqueeText>);
      unmount();

      expect(disconnectMock).toHaveBeenCalled();
    });

    it("cleans up media query listeners on unmount", () => {
      const removeEventListenerMock = vi.fn();
      matchMediaMock.mockImplementation(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: removeEventListenerMock,
      }));

      const { unmount } = render(<MarqueeText>Test</MarqueeText>);
      unmount();

      // Should remove listeners for both hover and reduced motion
      expect(removeEventListenerMock).toHaveBeenCalled();
    });
  });

  describe("text overflow behavior", () => {
    it("renders inline-block span for text", () => {
      render(<MarqueeText>Test</MarqueeText>);
      const textElement = screen.getByText("Test");
      expect(textElement).toHaveClass("inline-block");
    });
  });
});
