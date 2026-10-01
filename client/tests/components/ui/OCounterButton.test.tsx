import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "../../../src/api/client";
import OCounterButton from "../../../src/components/ui/OCounterButton";
import {
  MOUSE_QUERIES,
  TOUCH_QUERIES,
  matchMediaQueries,
} from "../../helpers/matchMedia";
import { createQueryWrapper } from "../../testUtils";

vi.mock("../../../src/api/client", () => ({
  apiPost: vi.fn(),
  // The query client registers its library-stamp listener here
  setLibraryStampListener: vi.fn(),
}));

describe("OCounterButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiPost).mockResolvedValue({ success: true, oCount: 4 });
  });

  it("a scene button posts the scene's instance to /watch-history/increment-o", async () => {
    render(
      <OCounterButton sceneId="7" instanceId="inst-a" initialCount={3} />,
      {
        wrapper: createQueryWrapper(),
      }
    );

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/watch-history/increment-o", {
      sceneId: "7",
      instanceId: "inst-a",
    });
  });

  it("an image button posts the image's instance to /image-view-history/increment-o", async () => {
    render(<OCounterButton imageId="9" instanceId="inst-b" />, {
      wrapper: createQueryWrapper(),
    });

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/image-view-history/increment-o", {
      imageId: "9",
      instanceId: "inst-b",
    });
  });

  it("a button without an instance sends no press", () => {
    render(<OCounterButton sceneId="7" initialCount={3} />, {
      wrapper: createQueryWrapper(),
    });

    fireEvent.click(screen.getByRole("button"));

    expect(apiPost).not.toHaveBeenCalled();
    expect(screen.getByLabelText("O Counter: 3")).toBeTruthy();
  });

  it("a press shows the server's count until the count passed in moves on", async () => {
    const { rerender } = render(
      <OCounterButton sceneId="7" instanceId="inst-a" initialCount={3} />,
      { wrapper: createQueryWrapper() }
    );

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(
        screen.getByLabelText("Increment O counter (current: 4)")
      ).toBeTruthy()
    );

    // The caller has not caught up yet
    rerender(
      <OCounterButton sceneId="7" instanceId="inst-a" initialCount={3} />
    );
    expect(
      screen.getByLabelText("Increment O counter (current: 4)")
    ).toBeTruthy();

    // A count from elsewhere replaces the press
    rerender(
      <OCounterButton sceneId="7" instanceId="inst-a" initialCount={9} />
    );
    expect(
      screen.getByLabelText("Increment O counter (current: 9)")
    ).toBeTruthy();
  });

  it("a press that fails shows the count passed in again", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(apiPost).mockRejectedValue(new Error("offline"));
    render(
      <OCounterButton sceneId="7" instanceId="inst-a" initialCount={3} />,
      { wrapper: createQueryWrapper() }
    );

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(
      screen.getByLabelText("Increment O counter (current: 3)")
    ).toBeTruthy();
    consoleError.mockRestore();
  });
});

describe("OCounterButton hit area", () => {
  let restoreMedia: (() => void) | null = null;
  afterEach(() => {
    restoreMedia?.();
    restoreMedia = null;
  });

  it("on a coarse pointer the O button has a 44 px hit area", () => {
    restoreMedia = matchMediaQueries(TOUCH_QUERIES);
    render(<OCounterButton sceneId="7" instanceId="inst-a" />, {
      wrapper: createQueryWrapper(),
    });

    const { className } = screen.getByRole("button");

    // A small button is 32 px: 6 px out on each side
    expect(className).toContain("before:absolute");
    expect(className).toContain("before:-inset-[6px]");
  });

  it("with a mouse the O button has no extra hit area", () => {
    restoreMedia = matchMediaQueries(MOUSE_QUERIES);
    render(<OCounterButton sceneId="7" instanceId="inst-a" />, {
      wrapper: createQueryWrapper(),
    });

    expect(screen.getByRole("button").className).not.toContain("before:");
  });
});
