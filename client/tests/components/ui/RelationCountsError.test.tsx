import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import RelationCountsError from "@/components/ui/RelationCountsError";

describe("RelationCountsError", () => {
  it("shows nothing while there is no error", () => {
    const { container } = render(
      <RelationCountsError error={null} onRetry={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("names the failure and asks again on Retry", () => {
    const onRetry = vi.fn();
    render(
      <RelationCountsError
        error={new ApiError("Server exploded", 500)}
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Server exploded");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("treats a library that is still initializing as loading, not an error", () => {
    const initializing = new ApiError("Not ready", 503, { ready: false });
    const { container } = render(
      <RelationCountsError error={initializing} onRetry={vi.fn()} />
    );

    expect(initializing.isInitializing).toBe(true);
    expect(container).toBeEmptyDOMElement();
  });
});
