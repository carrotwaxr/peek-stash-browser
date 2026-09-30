import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "../../../src/api/client";
import OCounterButton from "../../../src/components/ui/OCounterButton";
import { createQueryWrapper } from "../../testUtils";

vi.mock("../../../src/api/client", () => ({
  apiPost: vi.fn(),
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
});
