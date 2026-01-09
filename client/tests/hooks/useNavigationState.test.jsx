// client/src/hooks/__tests__/useNavigationState.test.jsx
import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useNavigationState } from "../../src/hooks/useNavigationState.js";

// Wrapper to provide router context with location state
const createWrapper = (initialEntries = ["/"], state = null) => {
  const entries = state
    ? [{ pathname: initialEntries[0], state }]
    : initialEntries;
  return ({ children }) => (
    <MemoryRouter initialEntries={entries}>{children}</MemoryRouter>
  );
};

describe("useNavigationState", () => {
  describe("backButtonText", () => {
    it("returns 'Back to {title}' when fromPageTitle is present", () => {
      const { result } = renderHook(() => useNavigationState(), {
        wrapper: createWrapper(["/performer/123"], { fromPageTitle: "Scenes" }),
      });

      expect(result.current.backButtonText).toBe("Back to Scenes");
    });

    it("returns 'Back' when fromPageTitle is missing", () => {
      const { result } = renderHook(() => useNavigationState(), {
        wrapper: createWrapper(["/performer/123"]),
      });

      expect(result.current.backButtonText).toBe("Back");
    });

    it("returns 'Back' when fromPageTitle is empty string", () => {
      const { result } = renderHook(() => useNavigationState(), {
        wrapper: createWrapper(["/performer/123"], { fromPageTitle: "" }),
      });

      expect(result.current.backButtonText).toBe("Back");
    });

    it("handles detail page names", () => {
      const { result } = renderHook(() => useNavigationState(), {
        wrapper: createWrapper(["/scene/456"], { fromPageTitle: "Jane Doe" }),
      });

      expect(result.current.backButtonText).toBe("Back to Jane Doe");
    });
  });

  describe("fromPageTitle", () => {
    it("exposes raw fromPageTitle from location state", () => {
      const { result } = renderHook(() => useNavigationState(), {
        wrapper: createWrapper(["/tag/789"], { fromPageTitle: "Performers" }),
      });

      expect(result.current.fromPageTitle).toBe("Performers");
    });

    it("returns undefined when not present", () => {
      const { result } = renderHook(() => useNavigationState(), {
        wrapper: createWrapper(["/tag/789"]),
      });

      expect(result.current.fromPageTitle).toBeUndefined();
    });
  });

  describe("goBack", () => {
    it("returns a function", () => {
      const { result } = renderHook(() => useNavigationState(), {
        wrapper: createWrapper(["/performer/123"]),
      });

      expect(typeof result.current.goBack).toBe("function");
    });
  });
});
