import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { getErrorMessage } from "../../api/client";
import {
  isChunkLoadError,
  reloadOnceForNewVersion,
} from "../../utils/reloadOnce";
import Button from "./Button";

const reloadPage = () => window.location.reload();

interface PanelProps {
  error: unknown;
}

/** What a failed page shows: the error, and a way to reload or go home */
export const ErrorPanel = ({ error }: PanelProps) => {
  const updated = isChunkLoadError(error);
  return (
    <div
      role="alert"
      className="max-w-xl mx-auto my-16 px-6 py-8 rounded-lg border text-center"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--status-error)",
        color: "var(--text-primary)",
      }}
    >
      <h1 className="text-2xl font-semibold mb-2">
        {updated ? "Peek was updated" : "Something went wrong"}
      </h1>
      <p className="mb-4" style={{ color: "var(--text-secondary)" }}>
        {updated
          ? "A newer version of Peek is available. Reload to continue."
          : "This page could not be shown. Reloading usually fixes it."}
      </p>
      {!updated && (
        <details
          className="mb-4 text-sm text-left"
          style={{ color: "var(--text-muted)" }}
        >
          <summary className="cursor-pointer">Details</summary>
          <p className="mt-2 break-words">{getErrorMessage(error)}</p>
        </details>
      )}
      <div className="flex justify-center gap-3">
        <Button variant="primary" onClick={reloadPage}>
          Reload
        </Button>
        <Link
          to="/"
          className="inline-flex items-center px-4 py-2 rounded-lg border hover:opacity-80"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
        >
          Home
        </Link>
      </div>
    </div>
  );
};

interface RouteProps {
  children: ReactNode;
  /** The panel clears when this changes (the path) */
  resetKey: string;
}

interface State {
  error: unknown;
  failed: boolean;
  /** The panel is shown once componentDidCatch has decided not to reload */
  shown: boolean;
}

const CLEAR: State = { error: null, failed: false, shown: false };

/**
 * Catches a render error or a failed page chunk under the layout, so the
 * sidebar stays and the panel offers Reload. A failed chunk after an upgrade
 * reloads once by itself first.
 */
export class RouteErrorBoundary extends Component<RouteProps, State> {
  override state: State = CLEAR;

  static getDerivedStateFromError(error: unknown): State {
    return { error, failed: true, shown: false };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[route]", error, info.componentStack);
    // A page that is reloading shows nothing rather than flash a panel
    const reloading = isChunkLoadError(error) && reloadOnceForNewVersion();
    if (!reloading) this.setState({ shown: true });
  }

  override componentDidUpdate(prev: RouteProps) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState(CLEAR);
    }
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return this.state.shown ? <ErrorPanel error={this.state.error} /> : null;
  }
}

/** The plain panel for the app's outermost boundary: no router, no theme */
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  override state: State = CLEAR;

  static getDerivedStateFromError(error: unknown): State {
    return { error, failed: true, shown: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[app]", error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          maxWidth: "36rem",
          margin: "4rem auto",
          padding: "2rem",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          color: "#e5e5e5",
          background: "#19191b",
          border: "1px solid #b91c1c",
          borderRadius: "0.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
          Something went wrong
        </h1>
        <p style={{ marginBottom: "1rem" }}>
          Peek could not start. Reloading usually fixes it; if it does not,
          check the browser console and report the message.
        </p>
        <button
          type="button"
          onClick={reloadPage}
          style={{ marginRight: "0.75rem", padding: "0.5rem 1rem" }}
        >
          Reload
        </button>
        <a href="/" style={{ color: "inherit" }}>
          Home
        </a>
      </div>
    );
  }
}
