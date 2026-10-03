/**
 * The View name dialog: what it shows, and what Save, Enter, Cancel and
 * Escape do with the name typed. The name is trimmed and an empty one is
 * never saved; a refusal shows in the dialog; a write in flight locks it.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ViewNameDialog from "@/components/filter-bar/ViewNameDialog";

type Props = Parameters<typeof ViewNameDialog>[0];

function setup(props: Partial<Props> = {}) {
  const onSave = vi.fn<(name: string, setAsDefault: boolean) => void>();
  const onCancel = vi.fn<() => void>();
  render(
    <ViewNameDialog
      isOpen
      title="Save view"
      saving={false}
      error={null}
      onCancel={onCancel}
      onSave={onSave}
      {...props}
    />
  );
  return { onSave, onCancel, user: userEvent.setup() };
}

describe("ViewNameDialog", () => {
  it("starts with the given name in the field", () => {
    setup({ title: "Rename view", initialName: "Fave Ladies" });

    expect(screen.getByRole("dialog", { name: "Rename view" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
      "Fave Ladies"
    );
  });

  it("Save sends the typed name trimmed, with the default off", async () => {
    const { user, onSave } = setup();

    await user.type(screen.getByRole("textbox", { name: "Name" }), "  Night  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledExactlyOnceWith("Night", false);
  });

  it("Enter in the field saves the same way", async () => {
    const { user, onSave } = setup();

    await user.type(
      screen.getByRole("textbox", { name: "Name" }),
      " Night {Enter}"
    );

    expect(onSave).toHaveBeenCalledExactlyOnceWith("Night", false);
  });

  it("an empty or blank name disables Save and Enter saves nothing", async () => {
    const { user, onSave } = setup();
    const field = screen.getByRole("textbox", { name: "Name" });

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.type(field, "   {Enter}");

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("the field takes at most 100 characters", async () => {
    const { user, onSave } = setup();

    await user.click(screen.getByRole("textbox", { name: "Name" }));
    await user.paste("a".repeat(120));
    await user.keyboard("{Enter}");

    expect(onSave).toHaveBeenCalledExactlyOnceWith("a".repeat(100), false);
  });

  it("offers Set as default for the context label only when one is given, and sends the choice", async () => {
    const { user, onSave } = setup({
      defaultLabel: "Scenes",
      initialName: "Night",
    });

    await user.click(
      screen.getByRole("checkbox", { name: "Set as default for Scenes" })
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledExactlyOnceWith("Night", true);
  });

  it("offers no default without a context label", () => {
    setup({ initialName: "Night" });

    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("shows the refusal and stays open", () => {
    const { onCancel } = setup({
      initialName: "Night",
      error: "A view with that name already exists",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "A view with that name already exists"
    );
    expect(screen.getByRole("dialog", { name: "Save view" })).toBeVisible();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Cancel and Escape close without saving", async () => {
    const { user, onSave, onCancel } = setup({ initialName: "Night" });

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("while saving, Save and Cancel are disabled, Enter and Escape do nothing", async () => {
    const { user, onSave, onCancel } = setup({
      initialName: "Night",
      saving: true,
    });

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();

    await user.click(screen.getByRole("textbox", { name: "Name" }));
    await user.keyboard("{Enter}{Escape}");

    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
