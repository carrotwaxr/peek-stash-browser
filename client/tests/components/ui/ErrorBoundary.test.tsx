import { Suspense, lazy } from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignedInWithQuery } from "@tests/helpers/SignedInWithQuery";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppErrorBoundary,
  RouteErrorBoundary,
} from "../../../src/components/ui/ErrorBoundary";
import GlobalLayout from "../../../src/components/ui/GlobalLayout";
import { TVModeProvider } from "../../../src/contexts/TVModeProvider";

const reloadOnceForNewVersion = vi.hoisted(() => vi.fn());

vi.mock("../../../src/utils/reloadOnce", () => ({
  isChunkLoadError: (error: unknown) =>
    error instanceof TypeError &&
    error.message.includes("dynamically imported module"),
  reloadOnceForNewVersion,
}));

vi.mock("../../../src/api", () => ({
  apiGet: vi.fn().mockResolvedValue({ settings: {} }),
}));

vi.mock("../../../src/components/ui/Sidebar", () => ({
  default: () => <nav aria-label="Main">sidebar</nav>,
}));
vi.mock("../../../src/components/ui/TopBar", () => ({ default: () => null }));
vi.mock("../../../src/hooks/useGlobalNavigation", () => ({
  useGlobalNavigation: vi.fn(),
}));
vi.mock("../../../src/hooks/useScrollRestoration", () => ({
  default: vi.fn(),
}));

const Boom = (): never => {
  throw new Error("kaboom");
};

const renderLayout = (child: React.ReactNode) =>
  render(
    <MemoryRouter>
      <SignedInWithQuery>
        <TVModeProvider>
          <GlobalLayout>{child}</GlobalLayout>
        </TVModeProvider>
      </SignedInWithQuery>
    </MemoryRouter>
  );

describe("error boundaries", () => {
  beforeEach(() => {
    reloadOnceForNewVersion.mockReset();
    reloadOnceForNewVersion.mockReturnValue(false);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("a page that throws during render shows the error panel inside the layout, with Reload and the sidebar still rendered", () => {
    renderLayout(<Boom />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(reloadOnceForNewVersion).not.toHaveBeenCalled();
  });

  it("the panel clears when the path changes", () => {
    const { rerender } = render(
      <MemoryRouter>
        <RouteErrorBoundary resetKey="/a">
          <Boom />
        </RouteErrorBoundary>
      </MemoryRouter>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <RouteErrorBoundary resetKey="/b">
          <div>healthy page</div>
        </RouteErrorBoundary>
      </MemoryRouter>
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("healthy page")).toBeInTheDocument();
  });

  it("a failed chunk import shows 'Peek was updated' and calls reloadOnceForNewVersion", async () => {
    const Broken = lazy(() =>
      Promise.reject(
        new TypeError(
          "Failed to fetch dynamically imported module: /assets/Performers-abc.js"
        )
      )
    );

    renderLayout(<Broken />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Peek was updated")
    );
    expect(reloadOnceForNewVersion).toHaveBeenCalled();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("a failed chunk import shows no panel while the guarded reload is under way", async () => {
    reloadOnceForNewVersion.mockReturnValue(true);
    const Broken = lazy(() =>
      Promise.reject(
        new TypeError("Failed to fetch dynamically imported module: /a.js")
      )
    );

    render(
      <MemoryRouter>
        <RouteErrorBoundary resetKey="/">
          <Suspense fallback="loading">
            <Broken />
          </Suspense>
        </RouteErrorBoundary>
      </MemoryRouter>
    );

    await waitFor(() => expect(reloadOnceForNewVersion).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("Reload reloads the page", async () => {
    const reload = vi.fn();
    const realLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload },
    });

    renderLayout(<Boom />);
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
  });

  it("AppErrorBoundary shows a plain panel when a provider throws", () => {
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/"
    );
  });
});
