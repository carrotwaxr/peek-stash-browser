/**
 * The user's settings are one query (item 52, CS-22): every reader shares
 * one request, and a save updates every reader from the cache, without a
 * refetch or a page reload.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignedInWithQuery } from "@tests/helpers/SignedInWithQuery";
import { userSettingsResponse } from "@tests/helpers/userSettings";
import { flushPromises } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as api from "@/api";
import {
  useUpdateUserSettings,
  useUserSettings,
} from "@/api/hooks/useUserSettings";

const { mockApiGet, mockApiPut } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPut: vi.fn(),
}));

vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  apiGet: mockApiGet,
  apiPut: mockApiPut,
}));

const settingsRequests = () =>
  mockApiGet.mock.calls.filter(([path]) => path === "/user/settings").length;

/** A reader that shows one setting. */
function Reader({ name }: { name: string }) {
  const { data } = useUserSettings();
  return <p data-testid={name}>{data?.settings.wallPlayback ?? "loading"}</p>;
}

function SaveHover() {
  const save = useUpdateUserSettings();
  return (
    <button
      type="button"
      onClick={() => void save.mutateAsync({ wallPlayback: "hover" })}
    >
      Save hover
    </button>
  );
}

describe("useUserSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue(
      userSettingsResponse({ wallPlayback: "static" })
    );
    mockApiPut.mockResolvedValue({ success: true });
  });

  it("one request serves every reader", async () => {
    const { rerender } = render(
      <SignedInWithQuery>
        <Reader name="a" />
        <Reader name="b" />
      </SignedInWithQuery>
    );

    expect(
      await screen.findByText("static", { selector: "[data-testid=a]" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("b")).toHaveTextContent("static");

    // A reader mounted later reads the cache
    rerender(
      <SignedInWithQuery>
        <Reader name="a" />
        <Reader name="b" />
        <Reader name="c" />
      </SignedInWithQuery>
    );
    expect(screen.getByTestId("c")).toHaveTextContent("static");
    await flushPromises();
    expect(settingsRequests()).toBe(1);
  });

  it("a save updates every reader without a refetch", async () => {
    render(
      <SignedInWithQuery>
        <Reader name="a" />
        <Reader name="b" />
        <SaveHover />
      </SignedInWithQuery>
    );
    await waitFor(() =>
      expect(screen.getByTestId("a")).toHaveTextContent("static")
    );

    fireEvent.click(screen.getByRole("button", { name: "Save hover" }));

    await waitFor(() =>
      expect(screen.getByTestId("a")).toHaveTextContent("hover")
    );
    expect(screen.getByTestId("b")).toHaveTextContent("hover");
    expect(mockApiPut).toHaveBeenCalledWith("/user/settings", {
      wallPlayback: "hover",
    });
    await flushPromises();
    expect(settingsRequests()).toBe(1);
  });

  it("asks nothing while signed out", async () => {
    render(
      <SignedInWithQuery signedIn={false}>
        <Reader name="a" />
      </SignedInWithQuery>
    );
    await flushPromises();

    expect(screen.getByTestId("a")).toHaveTextContent("loading");
    expect(settingsRequests()).toBe(0);
  });
});
