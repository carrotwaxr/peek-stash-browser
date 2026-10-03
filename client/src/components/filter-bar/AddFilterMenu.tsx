import {
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { WHERE_LIMITS } from "@peek/shared-types";
import { LucidePlus } from "lucide-react";
import type { ListFilters } from "../../hooks/useListFilters";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { type FilterOption, treeCounts } from "../../utils/filterFields";
import Button from "../ui/Button";
import Popover from "../ui/Popover";

interface AddFilterMenuProps {
  filters: ListFilters;
  /** The user's pinned fields, by key: listed first (B6 fills them) */
  pinnedFields?: readonly string[];
  /** A field was picked: the bar opens its editor */
  onPick: (option: FilterOption) => void;
  /** "+ Filter" itself, for the bar to move focus to */
  triggerRef: RefObject<HTMLButtonElement | null>;
}

/** A run of options under one heading: a panel section, or the pinned fields */
interface Section {
  readonly key: string;
  readonly label: string;
  readonly options: readonly FilterOption[];
}

const NO_PINS: readonly string[] = [];

const OPTION = '[role="option"]';

const labelOf = (option: FilterOption) => option.label ?? option.key;

/** The list's fields in their panel sections, pinned fields first in a section of their own */
function sectionsOf(
  options: readonly FilterOption[],
  pinned: readonly string[]
): Section[] {
  const isPinned = new Set(pinned);
  const sections: { key: string; label: string; options: FilterOption[] }[] =
    [];
  for (const option of options) {
    if (option.type === "section-header") {
      sections.push({
        key: option.key,
        label: option.label ?? option.key,
        options: [],
      });
    } else if (!isPinned.has(option.key)) {
      sections.at(-1)?.options.push(option);
    }
  }
  const pins = pinned.flatMap((key) => {
    const option = options.find((each) => each.key === key);
    return option === undefined || option.type === "section-header"
      ? []
      : [option];
  });
  return [
    ...(pins.length > 0
      ? [{ key: "pinned", label: "Pinned", options: pins }]
      : []),
    ...sections,
  ];
}

/**
 * "+ Filter": a button that opens a search box (`role="combobox"`) over a
 * listbox of the list's fields, grouped under their panel sections, pinned
 * fields first. Typing narrows the fields by label; Enter in the box picks
 * the first. ArrowDown moves focus into the list, where the arrows move
 * among the options (so TV focus works inside the open list) and Up from
 * the first goes back to the box; Enter or a click picks one, and Escape
 * closes the menu with focus back on "+ Filter".
 *
 * At the row limit (`WHERE_LIMITS.rows`) the menu says so, and only fields
 * already in use at the root stay pickable: picking one opens its chip.
 */
const AddFilterMenu = ({
  filters,
  pinnedFields = NO_PINS,
  onPick,
  triggerRef,
}: AddFilterMenuProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, "");
  const listboxId = `add-filter-${id}-list`;
  const roving = useRovingFocus(listRef, { itemSelector: OPTION });

  const { tree, options } = filters;
  const atLimit = treeCounts(tree).rows >= WHERE_LIMITS.rows;
  const inUse = useMemo(
    () => new Set(tree.rows.map((row) => row.field.key)),
    [tree]
  );

  const sections = useMemo(() => {
    const typed = query.trim().toLowerCase();
    return sectionsOf(options, pinnedFields)
      .map((section) => ({
        ...section,
        options: section.options.filter((option) =>
          labelOf(option).toLowerCase().includes(typed)
        ),
      }))
      .filter((section) => section.options.length > 0);
  }, [options, pinnedFields, query]);
  const shown = sections.flatMap((section) => section.options);
  const isDisabled = (option: FilterOption) =>
    atLimit && !inUse.has(option.key);

  const toggle = () => {
    if (!open) setQuery("");
    setOpen(!open);
  };

  const pick = (option: FilterOption) => {
    if (isDisabled(option)) return;
    setOpen(false);
    onPick(option);
  };

  const enabledOptions = () =>
    Array.from(
      listRef.current?.querySelectorAll<HTMLElement>(OPTION) ?? []
    ).filter((option) => option.getAttribute("aria-disabled") !== "true");

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      enabledOptions()[0]?.focus();
    } else if (event.key === "Enter") {
      event.preventDefault();
      const first = shown.find((option) => !isDisabled(option));
      if (first !== undefined) pick(first);
    }
  };

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp" && enabledOptions()[0] === event.target) {
      event.preventDefault();
      inputRef.current?.focus();
      return;
    }
    roving(event);
  };

  const handleOptionKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    option: FilterOption
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    pick(option);
  };

  return (
    <div className="relative" data-tv-search-item="add-filter">
      <Button
        ref={triggerRef}
        variant="secondary"
        size="sm"
        onClick={toggle}
        aria-label="Add filter"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="rounded-full"
        icon={<LucidePlus className="w-4 h-4" aria-hidden="true" />}
      >
        Filter
      </Button>
      <Popover
        anchorRef={triggerRef}
        open={open}
        onClose={() => setOpen(false)}
        label="Choose a filter"
        className="w-72 max-w-[calc(100vw-2rem)] p-2"
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Find a filter"
          aria-expanded={shown.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          placeholder="Find a filter..."
          value={query}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setQuery(event.target.value)
          }
          onKeyDown={handleInputKeyDown}
          data-popover-focus=""
          className="w-full px-3 py-1.5 rounded-md text-sm border"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
        />
        {atLimit && (
          <p
            className="px-2 pt-2 text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            {WHERE_LIMITS.rows} filters is the most a list takes: remove one to
            add another.
          </p>
        )}
        {shown.length === 0 ? (
          <p
            className="px-2 py-3 text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            No filter matches “{query.trim()}”
          </p>
        ) : (
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="Filters"
            onKeyDown={handleListKeyDown}
            className="mt-2 max-h-80 overflow-y-auto"
          >
            {sections.map((section) => {
              const headingId = `add-filter-${id}-${section.key}`;
              return (
                <div key={section.key} role="group" aria-labelledby={headingId}>
                  <div
                    id={headingId}
                    role="presentation"
                    className="px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {section.label}
                  </div>
                  {section.options.map((option) => {
                    const disabled = isDisabled(option);
                    return (
                      <div
                        key={option.key}
                        role="option"
                        tabIndex={-1}
                        aria-selected={false}
                        aria-disabled={disabled || undefined}
                        onClick={() => pick(option)}
                        onKeyDown={(event) =>
                          handleOptionKeyDown(event, option)
                        }
                        className={`px-2 py-1.5 rounded text-sm ${
                          disabled
                            ? "cursor-not-allowed opacity-50"
                            : "cursor-pointer hover:bg-[var(--bg-tertiary)] focus:bg-[var(--bg-tertiary)]"
                        }`}
                        style={{ color: "var(--text-primary)" }}
                      >
                        {labelOf(option)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </Popover>
    </div>
  );
};

export default AddFilterMenu;
