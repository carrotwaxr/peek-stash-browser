import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CreateUserModal from "../../../src/components/settings/CreateUserModal";
import { ShortcutScopeProvider } from "../../../src/contexts/ShortcutScopeContext";

vi.mock("../../../src/api", () => ({ apiPost: vi.fn() }));

describe("CreateUserModal", () => {
  beforeEach(() => vi.clearAllMocks());

  const renderModal = () => {
    const onClose = vi.fn();
    render(
      <ShortcutScopeProvider>
        <CreateUserModal onClose={onClose} onUserCreated={vi.fn()} />
      </ShortcutScopeProvider>
    );
    return onClose;
  };

  it("opens as a dialog named Create New User", () => {
    renderModal();

    expect(
      screen.getByRole("dialog", { name: "Create New User" })
    ).toBeInTheDocument();
  });

  it("focuses the username field on open", () => {
    renderModal();

    expect(screen.getByLabelText("Username")).toHaveFocus();
  });

  it("Escape closes it", () => {
    const onClose = renderModal();

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
