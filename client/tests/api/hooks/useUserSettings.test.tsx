/**
 * The user's settings are one query (item 52, CS-22): every reader shares
 * one request, and a save updates every reader from the cache, without a
 * refetch or a page reload.
 */
import { MemoryRouter } from "react-router-dom";
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
import GlobalLayout from "@/components/ui/GlobalLayout";
import { CardDisplaySettingsProvider } from "@/contexts/CardDisplaySettingsContext";
import { UnitPreferenceProvider } from "@/contexts/UnitPreferenceProvider";

const { mockApiGet, mockApiPut } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPut: vi.fn(),
}));

vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  apiGet: mockApiGet,
  apiPut: mockApiPut,
}));

vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false }),
}));
vi.mock("@/hooks/useGlobalNavigation", () => ({
  useGlobalNavigation: vi.fn(),
}));
vi.mock("@/hooks/useScrollRestoration", () => ({ default: vi.fn() }));
vi.mock("@/components/ui/TVNavigator", () => ({ default: () => null }));
vi.mock("@/components/ui/TopBar", () => ({ default: () => null }));
vi.mock("@/components/ui/Sidebar", () => ({ default: () => null }));

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
      onClick={() => save.mutate({ wallPlayback: "hover" })}
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

  it("a save before the first read answers still loads the settings, with the save in them", async () => {
    // The first read is slow; the server holds the save by the next one
    let answerFirst: (value: unknown) => void = () => {};
    mockApiGet.mockReturnValueOnce(
      new Promise((resolve) => {
        answerFirst = resolve;
      })
    );
    mockApiGet.mockResolvedValue(
      userSettingsResponse({ wallPlayback: "hover" })
    );
    render(
      <SignedInWithQuery>
        <Reader name="a" />
        <SaveHover />
      </SignedInWithQuery>
    );
    await waitFor(() => expect(settingsRequests()).toBe(1));

    fireEvent.click(screen.getByRole("button", { name: "Save hover" }));
    await waitFor(() => expect(mockApiPut).toHaveBeenCalled());
    answerFirst(userSettingsResponse({ wallPlayback: "static" }));

    await waitFor(() =>
      expect(screen.getByTestId("a")).toHaveTextContent("hover")
    );
    expect(settingsRequests()).toBe(2);
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

  it("a save shows in every reader before the server answers, and a refused save shows the server's value again", async () => {
    let refuse: (error: Error) => void = () => {};
    mockApiPut.mockReturnValue(
      new Promise((_resolve, reject) => {
        refuse = reject;
      })
    );
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

    // The server has not answered: both readers already show the save
    await waitFor(() =>
      expect(screen.getByTestId("a")).toHaveTextContent("hover")
    );
    expect(screen.getByTestId("b")).toHaveTextContent("hover");
    expect(settingsRequests()).toBe(1);

    refuse(new Error("Database busy"));

    // The server still holds the old value: the readers show it again
    await waitFor(() =>
      expect(screen.getByTestId("a")).toHaveTextContent("static")
    );
    expect(screen.getByTestId("b")).toHaveTextContent("static");
    expect(settingsRequests()).toBe(2);
  });

  it("a signed-in app with every provider and the layout mounted sends one GET /user/settings", async () => {
    render(
      <MemoryRouter>
        <SignedInWithQuery>
          <UnitPreferenceProvider>
            <CardDisplaySettingsProvider>
              <GlobalLayout>
                <Reader name="page" />
              </GlobalLayout>
            </CardDisplaySettingsProvider>
          </UnitPreferenceProvider>
        </SignedInWithQuery>
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(screen.getByTestId("page")).toHaveTextContent("static")
    );
    await flushPromises();
    expect(settingsRequests()).toBe(1);
  });
});
