import type { ReactNode } from "react";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { actAsync } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { markLibraryNotReady } from "@/api/hooks/useLibraryReady";
import { createQueryClient } from "@/api/queryClient";
import LibraryInitializingBanner from "@/components/ui/LibraryInitializingBanner";

describe("LibraryInitializingBanner", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    client = createQueryClient();
  });

  afterEach(() => {
    client.clear();
  });

  it("shows nothing while the library is ready", () => {
    render(<LibraryInitializingBanner />, { wrapper });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the syncing notice once a request finds the library initializing", async () => {
    render(<LibraryInitializingBanner />, { wrapper });

    await actAsync(() => markLibraryNotReady(client));

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(
      "Server is syncing library, please wait..."
    );
    expect(notice).toHaveTextContent("Checking again every 5 seconds");
  });
});
