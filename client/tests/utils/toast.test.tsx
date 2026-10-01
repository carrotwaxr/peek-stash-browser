import { act, render, screen, waitFor } from "@testing-library/react";
import rhtToast, { Toaster } from "react-hot-toast";
import { afterEach, describe, expect, it } from "vitest";
import { showError } from "@/utils/toast";

describe("showError", () => {
  afterEach(() => {
    act(() => {
      rhtToast.remove();
    });
  });

  it("an error toast has a close button that dismisses it", async () => {
    render(<Toaster />);

    act(() => {
      showError("Something broke", { duration: Infinity });
    });
    expect(await screen.findByText("Something broke")).toBeInTheDocument();

    act(() => {
      screen.getByRole("button", { name: "Close" }).click();
    });

    // The toast animates out before it is removed
    await waitFor(
      () =>
        expect(screen.queryByText("Something broke")).not.toBeInTheDocument(),
      { timeout: 3000 }
    );
  });

  it("two showError calls with the same id show one toast", async () => {
    render(<Toaster />);

    act(() => {
      showError("Offline", { id: "same", duration: Infinity });
      showError("Offline", { id: "same", duration: Infinity });
    });

    expect(await screen.findAllByText("Offline")).toHaveLength(1);
  });
});
