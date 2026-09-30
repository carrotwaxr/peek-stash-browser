/**
 * SetupStatusGate: the app's routes wait for GET /setup/status. While it
 * fails (the server restarting or migrating) the page says Peek is
 * starting and keeps asking; a failure never opens the setup wizard.
 */
import type { GetSetupStatusResponse } from "@peek/shared-types";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/api/queryClient";
import { SetupStatusGate } from "@/components/guards/SetupStatusGate";
import { jsonResponse, stubApi } from "../../helpers/stubApi";

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const STATUS: GetSetupStatusResponse = {
  setupComplete: true,
  hasUsers: true,
  hasStashInstance: true,
  stashInstanceCount: 1,
};

/** What AppContent does with the status, reduced to one line */
const routes = (status: GetSetupStatusResponse) =>
  status.setupComplete ? <div>Home page</div> : <div>Setup wizard</div>;

describe("SetupStatusGate", () => {
  let client: QueryClient;

  const renderGate = () =>
    render(
      <QueryClientProvider client={client}>
        <SetupStatusGate>{routes}</SetupStatusGate>
      </QueryClientProvider>
    );

  beforeEach(() => {
    vi.useFakeTimers();
    client = createQueryClient();
  });

  afterEach(() => {
    client.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("while the status fails, shows Peek is starting (with the last HTTP status), never the setup wizard", async () => {
    const answers = [502, 503];
    stubApi({
      "/setup/status": () => {
        const status = answers.shift();
        if (status === undefined) throw new TypeError("Failed to fetch");
        return jsonResponse(status, { error: "down" });
      },
    });

    renderGate();
    // Before the first answer: the plain spinner
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    await advance(50);
    expect(
      screen.getByText("Peek is starting. Waiting for the server (HTTP 502)...")
    ).toBeInTheDocument();
    expect(screen.queryByText("Setup wizard")).not.toBeInTheDocument();
    expect(screen.queryByText("Home page")).not.toBeInTheDocument();

    await advance(1_000);
    expect(
      screen.getByText("Peek is starting. Waiting for the server (HTTP 503)...")
    ).toBeInTheDocument();

    // A network error has no status
    await advance(2_000);
    expect(
      screen.getByText("Peek is starting. Waiting for the server...")
    ).toBeInTheDocument();
    expect(screen.queryByText("Setup wizard")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it("after a minute adds the still-waiting hint", async () => {
    stubApi({
      "/setup/status": () => jsonResponse(500, { error: "down" }),
    });

    renderGate();
    await advance(50);
    expect(screen.getByText(/Peek is starting/)).toBeInTheDocument();
    expect(screen.queryByText(/Still waiting/)).not.toBeInTheDocument();

    await advance(58_000);
    expect(screen.queryByText(/Still waiting/)).not.toBeInTheDocument();
    await advance(2_000);
    expect(
      screen.getByText("Still waiting. If this lasts, check the server's log.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Setup wizard")).not.toBeInTheDocument();
  });

  it("renders the app once the status loads", async () => {
    const answers = [502, 200];
    stubApi({
      "/setup/status": () =>
        answers.shift() === 200
          ? jsonResponse(200, STATUS)
          : jsonResponse(502, { error: "down" }),
    });

    renderGate();
    await advance(50);
    expect(screen.getByText(/Peek is starting/)).toBeInTheDocument();

    await advance(1_000);
    expect(screen.getByText("Home page")).toBeInTheDocument();
    expect(screen.queryByText(/Peek is starting/)).not.toBeInTheDocument();
  });

  it("an incomplete setup reaches the wizard only from a loaded status", async () => {
    stubApi({
      "/setup/status": () =>
        jsonResponse(200, { ...STATUS, setupComplete: false, hasUsers: false }),
    });

    renderGate();
    await advance(50);
    expect(screen.getByText("Setup wizard")).toBeInTheDocument();
  });
});
