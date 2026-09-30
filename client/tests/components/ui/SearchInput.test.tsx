/**
 * SearchInput: the search box holds what the server takes. A search longer
 * than Q_MAX_LENGTH is a 400 (item 38), so the input stops at it. It
 * debounces once: onSearch fires 300 ms after the last key, and a value from
 * outside (Back across a search) is shown without searching again.
 */
import { Q_MAX_LENGTH } from "@peek/shared-types";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SearchInput from "../../../src/components/ui/SearchInput";

describe("SearchInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("the search box holds at most Q_MAX_LENGTH characters", () => {
    render(<SearchInput onSearch={vi.fn()} />);

    const input = screen.getByPlaceholderText("Search...");

    expect(input.getAttribute("maxLength")).toBe(String(Q_MAX_LENGTH));
  });

  it("onSearch fires once, 300 ms after the last key", async () => {
    const onSearch = vi.fn<(query: string) => void>();
    render(<SearchInput onSearch={onSearch} value="" />);
    const input = screen.getByPlaceholderText("Search...");

    for (const text of ["b", "be", "beach"]) {
      fireEvent.change(input, { target: { value: text } });
      await act(() => vi.advanceTimersByTimeAsync(200));
    }
    await act(() => vi.advanceTimersByTimeAsync(99));
    expect(onSearch).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("beach");
  });

  it("a value from outside is shown without calling onSearch", async () => {
    const onSearch = vi.fn<(query: string) => void>();
    const { rerender } = render(
      <SearchInput onSearch={onSearch} value="beach" />
    );

    rerender(<SearchInput onSearch={onSearch} value="forest" />);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByPlaceholderText("Search...")).toHaveValue("forest");

    rerender(<SearchInput onSearch={onSearch} value="" />);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByPlaceholderText("Search...")).toHaveValue("");
    expect(onSearch).not.toHaveBeenCalled();
  });
});
