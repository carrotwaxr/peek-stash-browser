// client/src/hooks/__tests__/useUrlState.test.jsx
import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useUrlState } from "../useUrlState.js";

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
});
