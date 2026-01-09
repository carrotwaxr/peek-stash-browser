// client/src/hooks/__tests__/useUrlState.test.jsx
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useUrlState } from "../../src/hooks/useUrlState.js";

// Wrapper to provide router context
const createWrapper = (initialEntries = ["/"]) => {
  return ({ children }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
};

describe("useUrlState", () => {
  describe("initialization", () => {
    it("parses initial URL params on mount", () => {
      const { result } = renderHook(
        () => useUrlState({ defaults: { page: 1, sort: "date" } }),
        { wrapper: createWrapper(["/?page=3&sort=rating"]) }
      );

      expect(result.current.values.page).toBe("3");
      expect(result.current.values.sort).toBe("rating");
    });

    it("uses defaults when URL params are missing", () => {
      const { result } = renderHook(
        () => useUrlState({ defaults: { page: 1, sort: "date" } }),
        { wrapper: createWrapper(["/"]) }
      );

      expect(result.current.values.page).toBe(1);
      expect(result.current.values.sort).toBe("date");
    });
  });

  describe("setValue", () => {
    it("updates URL with history push by default", () => {
      const { result } = renderHook(
        () => useUrlState({ defaults: { page: 1 } }),
        { wrapper: createWrapper(["/?page=1"]) }
      );

      act(() => {
        result.current.setValue("page", 2);
      });

      // Check internal state updated
      expect(result.current.values.page).toBe(2);
    });

    it("updates URL with replace when specified", () => {
      const { result } = renderHook(
        () => useUrlState({ defaults: { q: "" } }),
        { wrapper: createWrapper(["/"]) }
      );

      act(() => {
        result.current.setValue("q", "search", { replace: true });
      });

      expect(result.current.values.q).toBe("search");
    });

    it("deletes param when value is null", () => {
      const { result } = renderHook(
        () => useUrlState({ defaults: { filter: "" } }),
        { wrapper: createWrapper(["/?filter=active"]) }
      );

      act(() => {
        result.current.setValue("filter", null);
      });

      expect(result.current.values.filter).toBe(null);
    });

    it("deletes param when value is empty string", () => {
      const { result } = renderHook(
        () => useUrlState({ defaults: { q: "" } }),
        { wrapper: createWrapper(["/?q=test"]) }
      );

      act(() => {
        result.current.setValue("q", "");
      });

      expect(result.current.values.q).toBe("");
    });
  });

  describe("setValues", () => {
    it("updates multiple values at once", () => {
      const { result } = renderHook(
        () => useUrlState({ defaults: { page: 1, sort: "date", filter: "" } }),
        { wrapper: createWrapper(["/"]) }
      );

      act(() => {
        result.current.setValues({ page: 5, sort: "rating" });
      });

      expect(result.current.values.page).toBe(5);
      expect(result.current.values.sort).toBe("rating");
    });

    it("supports replace option", () => {
      const { result } = renderHook(
        () => useUrlState({ defaults: { a: "", b: "" } }),
        { wrapper: createWrapper(["/"]) }
      );

      act(() => {
        result.current.setValues({ a: "1", b: "2" }, { replace: true });
      });

      expect(result.current.values.a).toBe("1");
      expect(result.current.values.b).toBe("2");
    });
  });

  describe("hasUrlParams", () => {
    it("returns true when URL has params beyond defaults", () => {
      const { result } = renderHook(
        () => useUrlState({
          defaults: { page: 1 },
          ignoreKeys: ["page", "per_page"]
        }),
        { wrapper: createWrapper(["/?page=1&tagIds=123"]) }
      );

      expect(result.current.hasUrlParams).toBe(true);
    });

    it("returns false when URL only has ignored params", () => {
      const { result } = renderHook(
        () => useUrlState({
          defaults: { page: 1 },
          ignoreKeys: ["page", "per_page"]
        }),
        { wrapper: createWrapper(["/?page=2"]) }
      );

      expect(result.current.hasUrlParams).toBe(false);
    });

    it("returns false when URL is empty", () => {
      const { result } = renderHook(
        () => useUrlState({ defaults: { page: 1 } }),
        { wrapper: createWrapper(["/"]) }
      );

      expect(result.current.hasUrlParams).toBe(false);
    });
  });
});
