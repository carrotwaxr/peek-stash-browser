/**
 * SearchInput: the search box holds what the server takes. A search longer
 * than Q_MAX_LENGTH is a 400 (item 38), so the input stops at it.
 */
import { Q_MAX_LENGTH } from "@peek/shared-types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SearchInput from "../../../src/components/ui/SearchInput";

describe("SearchInput", () => {
  it("the search box holds at most Q_MAX_LENGTH characters", () => {
    render(<SearchInput onSearch={vi.fn()} />);

    const input = screen.getByPlaceholderText("Search...");

    expect(input.getAttribute("maxLength")).toBe(String(Q_MAX_LENGTH));
  });
});
