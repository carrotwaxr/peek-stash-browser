import { PASSWORD_RULES_TEXT } from "@peek/shared-types/password.js";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CreateUserModal from "../../../src/components/settings/CreateUserModal";
import { ShortcutScopeProvider } from "../../../src/contexts/ShortcutScopeContext";

const { mockApiPost } = vi.hoisted(() => ({ mockApiPost: vi.fn() }));
vi.mock("../../../src/api", () => ({ apiPost: mockApiPost }));

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

  const fill = (username: string, password: string) => {
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: username },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: password },
    });
  };

  // The field's minLength stops a click in a real browser; submitting the
  // form shows the rule's own message
  const submit = () => {
    const form = screen
      .getByRole("button", { name: "Create User" })
      .closest("form");
    if (!form) throw new Error("the Create User button is not in a form");
    fireEvent.submit(form);
  };

  it("states the password rule next to the field", () => {
    renderModal();

    expect(screen.getByText(PASSWORD_RULES_TEXT)).toBeInTheDocument();
  });

  it("a 6-character password shows the rules and sends nothing", () => {
    renderModal();

    fill("newuser", "abc123");
    submit();

    expect(
      screen.getByText("Password must be at least 8 characters")
    ).toBeInTheDocument();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("a password without a number is refused", () => {
    renderModal();

    fill("newuser", "abcdefgh");
    submit();

    expect(
      screen.getByText("Password must contain at least one number")
    ).toBeInTheDocument();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("a valid password is sent", async () => {
    mockApiPost.mockResolvedValue({});
    renderModal();

    fill("newuser", "Pass1234");
    submit();

    await waitFor(() =>
      expect(mockApiPost).toHaveBeenCalledWith("/user/create", {
        username: "newuser",
        password: "Pass1234",
        role: "USER",
      })
    );
  });
});
