import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StatusMessage from "@/components/ui/StatusMessage";

const VARIANTS = ["error", "warning", "success", "info"] as const;

describe("StatusMessage", () => {
  it("error is role alert, others role status", () => {
    const { rerender } = render(<StatusMessage variant="error" message="x" />);
    expect(screen.getByRole("alert")).toHaveTextContent("x");

    for (const variant of ["warning", "success", "info"] as const) {
      rerender(<StatusMessage variant={variant} message="x" />);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent("x");
    }
  });

  it.each(VARIANTS)("%s uses its theme variable", (variant) => {
    render(<StatusMessage variant={variant} message="Note" />);
    const box = screen.getByText("Note").closest("[role]") as HTMLElement;

    expect(box.style.borderColor).toBe(`var(--status-${variant})`);
    expect(box.style.backgroundColor).toBe("var(--bg-card)");
    const title = screen.getByText(/:/, { selector: "strong" });
    expect(title.style.color).toBe(`var(--status-${variant})`);
  });

  it("Retry shows only with onRetry, and only for an error", () => {
    const onRetry = vi.fn();
    const { rerender } = render(<StatusMessage variant="error" message="x" />);
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();

    rerender(<StatusMessage variant="error" message="x" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(<StatusMessage variant="info" message="x" onRetry={onRetry} />);
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("toast mode has the toast colours and no title", () => {
    render(<StatusMessage variant="success" message="Saved" mode="toast" />);
    const box = screen.getByRole("status");

    expect(box.style.backgroundColor).toBe("var(--toast-success-bg)");
    expect(box.style.borderColor).toBe("var(--toast-success-border)");
    expect(box.style.boxShadow).toContain("var(--toast-success-shadow)");
    expect(screen.queryByText("Success:", { exact: false })).toBeNull();
  });

  it("the title defaults to the variant's name and can be replaced or hidden", () => {
    const { rerender } = render(
      <StatusMessage variant="warning" message="x" />
    );
    expect(screen.getByText("Warning:")).toBeInTheDocument();

    rerender(<StatusMessage variant="warning" title="Careful" message="x" />);
    expect(screen.getByText("Careful:")).toBeInTheDocument();

    rerender(<StatusMessage variant="warning" title={null} message="x" />);
    expect(screen.queryByText(/:/, { selector: "strong" })).toBeNull();
  });

  it("an Error shows its message; children replace the message", () => {
    const { rerender } = render(
      <StatusMessage variant="error" message={new Error("Boom")} />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");

    rerender(
      <StatusMessage variant="info">
        <b>Rich</b> text
      </StatusMessage>
    );
    expect(screen.getByRole("status")).toHaveTextContent("Rich text");
  });

  it("renders nothing without a message", () => {
    const { container, rerender } = render(
      <StatusMessage variant="error" message={null} />
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<StatusMessage variant="error" message="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("onClose adds a Close button", () => {
    const onClose = vi.fn();
    render(<StatusMessage variant="info" message="x" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
