import { useEffect, useId, useLayoutEffect, useMemo, useRef } from "react";
import {
  type ListKind,
  type Match,
  PANEL_GROUP_LABELS,
  type PanelField,
  WHERE_LIMITS,
} from "@peek/shared-types";
import { Plus, Trash2 } from "lucide-react";
import { useRefNames } from "../../api/hooks";
import { useFilterOptions } from "../../hooks/useListOptions";
import {
  type ContainerId,
  type EditItem,
  type EditTree,
  type FilterOption,
  type MergeNote,
  type PanelTable,
  addGroup,
  addRow,
  canAddGroup,
  canAddRow,
  countGroups,
  countRows,
  mergeNotes,
  moveRow,
  panelTableOf,
  removeGroup,
  removeRow,
  setMatch,
  setRowField,
  updateRow,
  valuesOf,
} from "../../utils/filterFields";
import { Button, StatusMessage } from "../ui/index";
import FilterRow, { type FieldSection, type MoveTarget } from "./FilterRow";
import { matchSelectId, rowControlIds, waitingSelectId } from "./controlIds";

export interface FilterRowsEditorProps {
  kind: ListKind;
  /** The rows a row may pick: the list's table, or the carousel's */
  table?: PanelTable;
  tree: EditTree;
  onChange: (next: EditTree) => void;
  /** False only for A4's interim carousel; every list takes groups (resolution 15) */
  allowGroups: boolean;
  /** Scroll to and focus this group's switch on mount (a group chip opened the view) */
  focusGroupId?: string;
  /** A carousel's picks list everything the user sees, not only what the list holds */
  pickFromAll?: boolean;
}

const ROOT: ContainerId = "root";
const ROOT_LABEL = "top level";

/** The field select's sections: each run of a section in the table's order */
function sectionsOf(
  rows: readonly PanelField[],
  options: ReadonlyMap<string, FilterOption>
): FieldSection[] {
  const sections: Array<{
    label: string;
    fields: FieldSection["fields"][number][];
  }> = [];
  for (const row of rows) {
    const label = PANEL_GROUP_LABELS[row.group];
    const field = {
      key: row.key,
      label: options.get(row.key)?.label ?? row.label,
    };
    const run = sections.at(-1);
    if (run?.label === label) run.fields.push(field);
    else sections.push({ label, fields: [field] });
  }
  return sections;
}

/** The names a merge line lists: entity names, else the option's labels */
const MergeLine = ({
  note,
  option,
  values,
}: {
  note: MergeNote;
  option: FilterOption | undefined;
  values: readonly string[];
}) => {
  const { data } = useRefNames(option?.entityType, values);
  const label = option?.label ?? note.key;
  const named =
    option?.entityType === undefined
      ? values.map(
          (value) =>
            option?.options?.find((each) => each.value === value)?.label ??
            value
        )
      : (data?.names ?? []);
  const list =
    named.length > 0
      ? named.join(", ")
      : `${values.length} ${values.length === 1 ? "value" : "values"}`;
  return (
    <StatusMessage
      variant="info"
      title={null}
      message={`These ${label} rows combine into one: any of ${list}`}
    />
  );
};

/**
 * The row editor: an editing tree (Contract 12) drawn as rows, with a
 * waiting row at the end of each container, "Match all / Match any" per
 * container, boxed groups (one level), the merge hint of an any container,
 * kept rows (carousels), and the limits. Every change is handed back whole
 * through `onChange`; the host owns the tree. Each container's rows are a
 * TV cell grid, so Up and Down move between rows by column.
 */
const FilterRowsEditor = ({
  kind,
  table,
  tree,
  onChange,
  allowGroups,
  focusGroupId,
  pickFromAll = false,
}: FilterRowsEditorProps) => {
  const allOptions = useFilterOptions(kind);
  const rows = (table ?? panelTableOf(kind)).rows;
  const options = useMemo(
    () =>
      new Map(
        allOptions
          .filter((option) => option.type !== "section-header")
          .map((option) => [option.key, option])
      ),
    [allOptions]
  );
  const sections = useMemo(() => sectionsOf(rows, options), [rows, options]);
  const limitId = useId();

  // Where focus goes once the change it follows has rendered
  const pendingFocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (id === null) return;
    pendingFocus.current = null;
    const target = document.getElementById(id);
    if (target === null) return;
    const focusable = target.matches("button, input, select, textarea")
      ? target
      : target.querySelector<HTMLElement>("button, input, select, textarea");
    (focusable ?? target).focus();
  });

  // Opened at a group: its switch, in view (on mount only)
  const openedAt = useRef(focusGroupId);
  useEffect(() => {
    if (openedAt.current === undefined) return;
    const target = document.getElementById(matchSelectId(openedAt.current));
    target?.scrollIntoView({ block: "nearest" });
    target?.focus();
  }, []);

  const rowCount = countRows(tree, kind);
  const groupCount = countGroups(tree);
  const roomForRow = canAddRow(tree, kind);
  const roomForGroup = canAddGroup(tree);
  const notes = mergeNotes(tree, kind);

  const change = (next: EditTree, focus?: string) => {
    if (focus !== undefined) pendingFocus.current = focus;
    onChange(next);
  };

  const containers: Array<{ id: ContainerId; label: string }> = [
    { id: ROOT, label: ROOT_LABEL },
    ...tree.groups.map((group, at) => ({
      id: group.id,
      label: `group ${at + 1}`,
    })),
  ];

  /** Removes an item; focus goes to the next item of its container, else its waiting row */
  const remove = (
    containerId: ContainerId,
    items: readonly EditItem[],
    itemId: string
  ) => {
    const at = items.findIndex((item) => item.id === itemId);
    const next = items[at + 1];
    const focus =
      next === undefined
        ? waitingSelectId(containerId)
        : next.kind === "row"
          ? rowControlIds(next.id).field
          : `filter-${next.id}-remove`;
    change(removeRow(tree, itemId), focus);
  };

  const renderItems = (
    containerId: ContainerId,
    containerLabel: string,
    items: readonly EditItem[]
  ) => {
    const targets: MoveTarget[] = allowGroups
      ? containers.filter((each) => each.id !== containerId)
      : [];
    return (
      <div className="space-y-3" data-tv-cells="">
        {items.map((item) =>
          item.kind === "kept" ? (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--bg-primary)",
                borderColor: "var(--border-color)",
                color: "var(--text-secondary)",
              }}
            >
              <span>A rule this editor can&apos;t show</span>
              <Button
                id={`filter-${item.id}-remove`}
                variant="secondary"
                size="sm"
                onClick={() => remove(containerId, items, item.id)}
              >
                Remove
              </Button>
            </div>
          ) : (
            <div
              key={item.id}
              className="rounded-lg border p-3"
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderColor: "var(--border-color)",
              }}
            >
              <FilterRow
                sections={sections}
                row={{
                  id: item.id,
                  key: item.field.key,
                  option: options.get(item.field.key),
                  state: item.state,
                }}
                containerId={containerId}
                containerLabel={containerLabel}
                pickFromAll={pickFromAll}
                onFieldChange={(key) =>
                  change(
                    setRowField(tree, item.id, key, kind),
                    rowControlIds(item.id).value
                  )
                }
                onChange={(state) => change(updateRow(tree, item.id, state))}
                moveTargets={targets}
                onMove={(to) =>
                  change(
                    moveRow(tree, item.id, to),
                    rowControlIds(item.id).field
                  )
                }
                onRemove={() => remove(containerId, items, item.id)}
              />
            </div>
          )
        )}
        {roomForRow ? (
          <div>
            <FilterRow
              sections={sections}
              containerId={containerId}
              containerLabel={containerLabel}
              onFieldChange={(key) => {
                const next = addRow(tree, containerId, key, kind);
                const added =
                  containerId === ROOT
                    ? next.rows.at(-1)
                    : next.groups
                        .find((group) => group.id === containerId)
                        ?.rows.at(-1);
                change(
                  next,
                  added === undefined
                    ? undefined
                    : rowControlIds(added.id).value
                );
              }}
            />
          </div>
        ) : (
          <StatusMessage
            variant="info"
            title={null}
            message={`${rowCount} of ${WHERE_LIMITS.rows} rules. Remove one to add another.`}
          />
        )}
      </div>
    );
  };

  const renderNotes = (containerId: ContainerId) =>
    notes
      .filter((note) => note.containerId === containerId)
      .map((note) => {
        const items =
          containerId === ROOT
            ? tree.rows
            : (tree.groups.find((group) => group.id === containerId)?.rows ??
              []);
        const option = options.get(note.key);
        const values = [
          ...new Set(
            items.flatMap((item) =>
              item.kind === "row" && note.rowIds.includes(item.id)
                ? valuesOf(item.state[note.key])
                : []
            )
          ),
        ];
        return (
          <MergeLine
            key={`${note.containerId}-${note.rowIds.join(",")}`}
            note={note}
            option={option}
            values={values}
          />
        );
      });

  const matchSelect = (
    containerId: ContainerId,
    match: Match,
    name: string,
    noun: string
  ) => (
    <select
      id={matchSelectId(containerId)}
      aria-label={`Match for ${name}`}
      value={match}
      onChange={(event) =>
        change(
          setMatch(
            tree,
            containerId,
            event.target.value === "any" ? "any" : "all"
          )
        )
      }
      className="px-3 py-2 rounded-lg border text-sm"
      style={{
        backgroundColor: "var(--bg-primary)",
        borderColor: "var(--border-color)",
        color: "var(--text-primary)",
      }}
    >
      <option value="all">{`Match all of ${noun}`}</option>
      <option value="any">{`Match any of ${noun}`}</option>
    </select>
  );

  const addGroupButton = () => (
    <div className="space-y-2">
      <Button
        id="filter-add-group"
        variant="secondary"
        icon={<Plus className="w-4 h-4" />}
        aria-disabled={roomForGroup ? undefined : "true"}
        aria-describedby={roomForGroup ? undefined : limitId}
        onClick={() => {
          if (!roomForGroup) return;
          const next = addGroup(tree);
          const added = next.groups.at(-1);
          change(
            next,
            added === undefined ? undefined : matchSelectId(added.id)
          );
        }}
        className={roomForGroup ? "" : "opacity-50 cursor-not-allowed"}
      >
        Add group
      </Button>
      {!roomForGroup && (
        <div id={limitId}>
          <StatusMessage
            variant="info"
            title={null}
            message={`${groupCount} of ${WHERE_LIMITS.groups} groups. Remove one to add another.`}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {allowGroups && (
        <div>{matchSelect(ROOT, tree.match, ROOT_LABEL, "these rules")}</div>
      )}

      {renderItems(ROOT, ROOT_LABEL, tree.rows)}
      {renderNotes(ROOT)}

      {tree.groups.map((group, at) => {
        const name = `Group ${at + 1}`;
        const headingId = `filter-group-${group.id}`;
        return (
          <div
            key={group.id}
            role="group"
            aria-labelledby={headingId}
            className="rounded-lg border p-3 space-y-3"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-color)",
            }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <h3
                id={headingId}
                className="text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {name}
              </h3>
              {matchSelect(group.id, group.match, name, "these")}
              <Button
                variant="secondary"
                size="sm"
                icon={<Trash2 className="w-4 h-4" />}
                className="ml-auto"
                onClick={() => {
                  const after = tree.groups[at + 1] ?? tree.groups[at - 1];
                  change(
                    removeGroup(tree, group.id),
                    after === undefined
                      ? waitingSelectId(ROOT)
                      : matchSelectId(after.id)
                  );
                }}
              >
                Remove group
              </Button>
            </div>
            {renderItems(group.id, name, group.rows)}
            {renderNotes(group.id)}
          </div>
        );
      })}

      {allowGroups && addGroupButton()}

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {allowGroups
          ? `${rowCount} of ${WHERE_LIMITS.rows} rules · ${groupCount} of ${WHERE_LIMITS.groups} groups`
          : `${rowCount} of ${WHERE_LIMITS.rows} rules`}
      </p>
    </div>
  );
};

export default FilterRowsEditor;
