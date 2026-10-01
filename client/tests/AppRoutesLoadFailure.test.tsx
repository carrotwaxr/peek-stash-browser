/**
 * The setup wizard and the password recovery page are their own chunks
 * (D4) and render outside the layout's route boundary. When one fails to
 * load, the page says so with a Reload, in place; the error never reaches
 * the app's root boundary.
 */
import { Suspense } from "react";
import { MemoryRouter } from "react-router-dom";
import type { GetSetupStatusResponse } from "@peek/shared-types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AppRoutes from "@/AppRoutes";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false, user: null }),
}));
vi.mock("@/components/pages/Login", () => ({
  default: () => <div data-testid="page-login" />,
}));
// Neither chunk can be fetched
vi.mock("@/components/pages/SetupWizard", () => {
  throw new Error("The setup wizard's chunk failed to load");
});
vi.mock("@/components/pages/ForgotPasswordPage", () => {
  throw new Error("The password recovery chunk failed to load");
});

const renderAt = (path: string, setupComplete: boolean) => {
  const status: GetSetupStatusResponse = {
    setupComplete,
    hasUsers: setupComplete,
    hasStashInstance: setupComplete,
    stashInstanceCount: setupComplete ? 1 : 0,
  };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Suspense fallback={<div>loading</div>}>
        <AppRoutes setupStatus={status} onSetupComplete={() => {}} />
      </Suspense>
    </MemoryRouter>
  );
};

describe("a lazy page outside the layout that fails to load", () => {
  it.each([
    ["/setup", false],
    ["/forgot-password", true],
  ])("%s shows the error with a Reload in place", async (path, complete) => {
    renderAt(path, complete);

    const panel = await screen.findByRole("alert");
    expect(panel).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });
});
