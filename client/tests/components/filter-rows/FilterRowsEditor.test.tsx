/**
 * The row editor over an editing tree (Contract 12): a waiting row at the
 * end of every container, Match all or any per container, boxed groups,
 * the merge hint, the limits, kept rows, Move to, and focus that never
 * falls to the page.
 */
import { useState } from "react";
import { PANEL_FIELDS, PANEL_GROUP_LABELS } from "@peek/shared-types";
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/api/queryClient";
import FilterRowsEditor from "@/components/filter-rows/FilterRowsEditor";
import {
  type EditRow,
  type EditTree,
  type KeptLeaf,
  type PanelState,
  editTreeOf,
  panelTreeOf,
  treeOf,
} from "@/utils/filterFields";
import { jsonResponse, stubApi } from "../../helpers/stubApi";

const TAGS = [
  { id: "1", instanceId: "a", name: "Tag A" },
  { id: "2", instanceId: "a", name: "Tag B" },
  { id: "3", instanceId: "a", name: "Tag C" },
  { id: "4", instanceId: "a", name: "Tag D" },
];

/** An editing tree of the scene list from a flat prefixed state */
const editTree = (state: PanelState, kept: readonly KeptLeaf[] = []) =>
  editTreeOf("scene", treeOf("scene", state), kept);

/** The editable rows of a container, in order */
const rowsOf = (items: EditTree["rows"]): EditRow[] =>
  items.filter((item): item is EditRow => item.kind === "row");

/** The editor over `tree`, holding each change as its host would */
function renderEditor(
  tree: EditTree,
  props: { allowGroups?: boolean; focusGroupId?: string } = {}
) {
  const onChange = vi.fn<(next: EditTree) => void>();
  const Host = () => {
    const [current, setCurrent] = useState(tree);
    return (
      <FilterRowsEditor
        kind="scene"
        allowGroups={props.allowGroups ?? true}
        {...(props.focusGroupId === undefined
          ? {}
          : { focusGroupId: props.focusGroupId })}
        tree={current}
        onChange={(next) => {
          onChange(next);
          setCurrent(next);
        }}
      />
    );
  };
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Host />
    </QueryClientProvider>
  );
  const last = () => must(onChange.mock.calls.at(-1), "a change")[0];
  return { onChange, last };
}

/** Tabs (or shift-tabs) until `matches` holds for the focused element */
async function tabTo(
  user: ReturnType<typeof userEvent.setup>,
  matches: (el: Element) => boolean,
  shift = false
) {
  for (let step = 0; step < 60; step += 1) {
    if (document.activeElement && matches(document.activeElement)) return;
    await user.tab({ shift });
  }
  throw new Error("tabbed 60 times without reaching the control");
}

const named = (name: string) => (el: Element) =>
  el.getAttribute("aria-label") === name ||
  (el.id !== "" &&
    document.querySelector(`label[for="${el.id}"]`)?.textContent === name) ||
  el.textContent === name;

describe("FilterRowsEditor", () => {
  beforeEach(() => {
    stubApi({
      "/library/tags/minimal": () => jsonResponse(200, { tags: TAGS }),
      "/library/performers/minimal": () =>
        jsonResponse(200, {
          performers: [{ id: "2", instanceId: "a", name: "Performer B" }],
        }),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("an empty row always waits at the end of each container", () => {
    const { last } = renderEditor(editTree({}));

    const waiting = screen.getByRole("combobox", {
      name: "Add a filter to top level",
    });
    expect(waiting).toHaveDisplayValue("Add a filter…");
    fireEvent.change(waiting, { target: { value: "tagIds" } });

    const row = must(rowsOf(last().rows)[0], "the new row");
    expect(row.field.key).toBe("tagIds");
    const tags = screen.getByRole("combobox", { name: "Filter" });
    expect(tags).toHaveValue("tagIds");
    const next = screen.getByRole("combobox", {
      name: "Add a filter to top level",
    });
    expect(next).toHaveDisplayValue("Add a filter…");
    expect(
      tags.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // Focus is on the new row's first value control
    expect(document.activeElement).toHaveAttribute("id", `filter-${row.id}`);
  });

  it("the root and each group have their own waiting row", () => {
    renderEditor(editTree({ "g1.tagIds": ["1:a"] }));

    expect(
      screen.getByRole("combobox", { name: "Add a filter to top level" })
    ).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Group 1" });
    expect(
      within(group).getByRole("combobox", { name: "Add a filter to Group 1" })
    ).toHaveDisplayValue("Add a filter…");
  });

  it("the field select lists the table's fields by section and a field already used can be chosen again", () => {
    const { last } = renderEditor(editTree({ tagIds: ["1:a"] }));

    const waiting = screen.getByRole("combobox", {
      name: "Add a filter to top level",
    });
    // One optgroup per run of a section, in the table's order
    const runs: Array<{ label: string; keys: string[] }> = [];
    for (const row of PANEL_FIELDS.scene) {
      const label = PANEL_GROUP_LABELS[row.group];
      const run = runs.at(-1);
      if (run?.label === label) run.keys.push(row.key);
      else runs.push({ label, keys: [row.key] });
    }
    const optgroups = [...waiting.querySelectorAll("optgroup")];
    expect(
      optgroups.map((group) => ({
        label: group.label,
        keys: [...group.querySelectorAll("option")].map((each) => each.value),
      }))
    ).toEqual(runs);

    fireEvent.change(waiting, { target: { value: "tagIds" } });
    expect(rowsOf(last().rows).map((row) => row.field.key)).toEqual([
      "tagIds",
      "tagIds",
    ]);
    expect(
      screen
        .getAllByRole("combobox", { name: "Filter" })
        .map((select) => (select as HTMLSelectElement).value)
    ).toEqual(["tagIds", "tagIds"]);
  });

  it("Match all / Match any per container", () => {
    const { last } = renderEditor(
      editTree({ tagIds: ["1:a"], g1: "any", "g1.performerIds": ["2:a"] })
    );

    const root = screen.getByRole("combobox", { name: "Match for top level" });
    expect(root).toHaveDisplayValue("Match all of these rules");
    expect(
      screen.getByRole("combobox", { name: "Match for Group 1" })
    ).toHaveDisplayValue("Match any of these");

    fireEvent.change(root, { target: { value: "any" } });
    expect(last().match).toBe("any");
    expect(root).toHaveDisplayValue("Match any of these rules");
  });

  it("Add group adds a boxed group with its own switch, waiting row and Remove group; a group has no Add group inside", () => {
    const { last } = renderEditor(editTree({}));

    fireEvent.click(screen.getByRole("button", { name: "Add group" }));
    expect(last().groups).toHaveLength(1);
    const group = screen.getByRole("group", { name: "Group 1" });
    expect(
      within(group).getByRole("combobox", { name: "Match for Group 1" })
    ).toHaveDisplayValue("Match all of these");
    expect(
      within(group).getByRole("combobox", { name: "Add a filter to Group 1" })
    ).toBeInTheDocument();
    expect(
      within(group).queryByRole("button", { name: "Add group" })
    ).toBeNull();
    // Focus is on the new group's switch
    expect(document.activeElement).toBe(
      within(group).getByRole("combobox", { name: "Match for Group 1" })
    );

    fireEvent.click(
      within(group).getByRole("button", { name: "Remove group" })
    );
    expect(last().groups).toHaveLength(0);
    expect(screen.queryByRole("group", { name: "Group 1" })).toBeNull();
  });

  it("same-field rows in an any group show that they combine", async () => {
    const rows = {
      "g1.tagIds": ["1:a"],
      "g1.tagIdsModifier": "INCLUDES",
      "g1.2.tagIds": ["2:a"],
      "g1.2.tagIdsModifier": "INCLUDES",
    };
    renderEditor(editTree({ g1: "any", ...rows }));

    const group = screen.getByRole("group", { name: "Group 1" });
    expect(
      await within(group).findByText(
        "These Tags rows combine into one: any of Tag A, Tag B"
      )
    ).toBeVisible();
  });

  it("same-field rows in an all group show no combine line", () => {
    renderEditor(
      editTree({
        g1: "all",
        "g1.tagIds": ["1:a"],
        "g1.tagIdsModifier": "INCLUDES",
        "g1.2.tagIds": ["2:a"],
        "g1.2.tagIdsModifier": "INCLUDES",
      })
    );

    expect(screen.queryByText(/combine into one/)).toBeNull();
  });

  describe("limits show", () => {
    it("a footer counts rules and groups", () => {
      renderEditor(
        editTree({
          tagIds: ["1:a"],
          performerIds: ["2:a"],
          "g1.tagIds": ["3:a"],
        })
      );

      expect(screen.getByText("3 of 20 rules · 1 of 5 groups")).toBeVisible();
    });

    it("merged rows count once", () => {
      renderEditor(
        editTree({
          performerIds: ["2:a"],
          g1: "any",
          "g1.tagIds": ["1:a"],
          "g1.tagIdsModifier": "INCLUDES",
          "g1.2.tagIds": ["2:a"],
          "g1.2.tagIdsModifier": "INCLUDES",
        })
      );

      expect(screen.getByText("2 of 20 rules · 1 of 5 groups")).toBeVisible();
    });

    it("at 20 rules the waiting rows are replaced by the limit", () => {
      const state: Record<string, unknown> = { tagIds: ["1:a"] };
      for (let n = 2; n <= 20; n += 1) state[`${n}.tagIds`] = ["1:a"];
      renderEditor(editTree(state));

      expect(
        screen.queryAllByRole("combobox", { name: /^Add a filter to/ })
      ).toHaveLength(0);
      expect(
        screen.getByText("20 of 20 rules. Remove one to add another.")
      ).toBeVisible();
    });

    it("at 5 groups Add group is aria-disabled, focusable, guarded and described", () => {
      const state: Record<string, unknown> = {};
      for (let n = 1; n <= 5; n += 1) state[`g${n}.tagIds`] = [`${n}:a`];
      const { onChange } = renderEditor(editTree(state));

      const add = screen.getByRole("button", { name: "Add group" });
      expect(add).toHaveAttribute("aria-disabled", "true");
      expect(add).not.toBeDisabled();
      fireEvent.click(add);
      expect(onChange).not.toHaveBeenCalled();
      add.focus();
      expect(document.activeElement).toBe(add);
      expect(add).toHaveAccessibleDescription(
        "5 of 5 groups. Remove one to add another."
      );
    });
  });

  it("a kept row shows as read-only with Remove", () => {
    const { last } = renderEditor(
      editTree({}, [{ group: 0, leaf: { o_counter: { value: 1 } } }])
    );

    expect(screen.getByText("A rule this editor can't show")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(last().rows).toEqual([]);
    expect(screen.queryByText("A rule this editor can't show")).toBeNull();
  });

  it("Move to moves a row between the root and a group", () => {
    const tree = editTree({
      tagIds: ["1:a"],
      g1: "all",
      "g1.performerIds": ["2:a"],
    });
    const tagRow = must(rowsOf(tree.rows)[0]);
    const { last } = renderEditor(tree);

    fireEvent.click(
      screen.getByRole("button", { name: "Row actions for Tags" })
    );
    const menu = screen.getByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent)
    ).toEqual(["Move to group 1", "Remove"]);
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Move to group 1" })
    );
    expect(last().rows).toEqual([]);
    expect(must(last().groups[0]).rows.map((row) => row.id)).toContain(
      tagRow.id
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Row actions for Performers" })
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Move to top level" })
    );
    expect(rowsOf(last().rows).map((row) => row.field.key)).toEqual([
      "performerIds",
    ]);
  });

  it("ArrowDown and Enter in Row actions move a row to group 1; Escape returns focus to the button", async () => {
    const user = userEvent.setup();
    const tree = editTree({
      tagIds: ["1:a"],
      g1: "all",
      "g1.performerIds": ["2:a"],
    });
    const tagRow = must(rowsOf(tree.rows)[0]);
    const { last } = renderEditor(tree);

    const button = screen.getByRole("button", { name: "Row actions for Tags" });
    button.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);

    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toHaveTextContent("Move to group 1");
    await user.keyboard("{Enter}");
    expect(must(last().groups[0]).rows.map((row) => row.id)).toContain(
      tagRow.id
    );
  });

  it("two Tags rows have distinct control ids and each label names its own input", () => {
    const tree = editTree({
      tagIds: ["1:a"],
      tagIdsModifier: "INCLUDES",
      "2.tagIds": ["2:a"],
      "2.tagIdsModifier": "INCLUDES",
    });
    const [first, second] = rowsOf(tree.rows);
    renderEditor(tree);

    const values = screen.getAllByLabelText("Tags");
    expect(values.map((each) => each.id)).toEqual([
      `filter-${must(first).id}`,
      `filter-${must(second).id}`,
    ]);
    for (const name of ["Filter", "Condition"]) {
      const ids = screen.getAllByLabelText(name).map((each) => each.id);
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2);
    }
  });

  it("removing a row returns focus to the next row's field select, or the waiting row's", () => {
    renderEditor(editTree({ performerIds: ["2:a"], tagIds: ["1:a"] }));

    fireEvent.click(
      screen.getByRole("button", { name: "Row actions for Performers" })
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    expect(document.activeElement).toBe(
      screen.getByRole("combobox", { name: "Filter" })
    );
    expect(document.activeElement).toHaveValue("tagIds");

    fireEvent.click(
      screen.getByRole("button", { name: "Row actions for Tags" })
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    expect(document.activeElement).toBe(
      screen.getByRole("combobox", { name: "Add a filter to top level" })
    );
  });

  it("lists without groups", () => {
    renderEditor(editTree({ tagIds: ["1:a"] }), { allowGroups: false });

    expect(screen.queryByRole("button", { name: "Add group" })).toBeNull();
    expect(
      screen.queryByRole("combobox", { name: "Match for top level" })
    ).toBeNull();
    expect(screen.getByText("1 of 20 rules")).toBeVisible();
  });

  it("opened at a group, focus lands on that group's switch", () => {
    const tree = editTree({ tagIds: ["1:a"], g1: "any", "g1.tagIds": ["2:a"] });
    renderEditor(tree, { focusGroupId: must(tree.groups[0]).id });

    expect(document.activeElement).toBe(
      screen.getByRole("combobox", { name: "Match for Group 1" })
    );
  });

  it("two Tags rows in one group", async () => {
    const user = userEvent.setup();
    const { last } = renderEditor(editTree({}));

    /** Picks tags in the focused row's picker by keyboard */
    const pickTags = async (names: readonly string[]) => {
      await user.keyboard("{Enter}");
      for (const name of names) {
        await tabTo(user, named(name));
        await user.keyboard("{Enter}");
      }
      await user.keyboard("{Escape}");
    };
    /** Chooses a value in the focused native select */
    const choose = async (value: string) => {
      const select = document.activeElement;
      if (!(select instanceof HTMLSelectElement)) {
        throw new Error("focus is not on a select");
      }
      await user.selectOptions(select, value);
    };

    await tabTo(user, named("Add group"));
    await user.keyboard("{Enter}");
    // Focus is on Group 1's switch; its waiting row comes next
    await tabTo(user, named("Add a filter to Group 1"));
    await choose("tagIds");
    // Focus is on the new row's picker
    await pickTags(["Tag A", "Tag B"]);

    await tabTo(user, named("Add a filter to Group 1"));
    await choose("tagIds");
    // The condition select sits just before the picker
    await tabTo(user, named("Condition"), true);
    await choose("INCLUDES");
    await tabTo(
      user,
      (el) => el.getAttribute("aria-label")?.startsWith("Tags") ?? false
    );
    await pickTags(["Tag C", "Tag D"]);

    const { tree } = panelTreeOf(last());
    expect(tree.rows).toEqual([]);
    expect(tree.groups).toHaveLength(1);
    const group = must(tree.groups[0]);
    expect(group.match).toBe("all");
    expect(group.rows.map((row) => row.state)).toEqual([
      { tagIds: ["1:a", "2:a"], tagIdsModifier: "INCLUDES_ALL" },
      { tagIds: ["3:a", "4:a"], tagIdsModifier: "INCLUDES" },
    ]);
  });
});
