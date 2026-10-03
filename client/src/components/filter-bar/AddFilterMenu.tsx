import {
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { PIN_LIMIT, WHERE_LIMITS } from "@peek/shared-types";
import { LucidePin, LucidePinOff, LucidePlus } from "lucide-react";
import type { ListFilters } from "../../hooks/useListFilters";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import {
  type FilterOption,
  treeCounts,
  withRefValue,
} from "../../utils/filterFields";
import { isPinnable } from "../../utils/filterFields/pins";
import Button from "../ui/Button";
import Popover from "../ui/Popover";
import { type ValueResult, useValueSearch } from "./useValueSearch";

interface AddFilterMenuProps {
  filters: ListFilters;
  /** The user's pinned fields, by key: listed first */
  pinnedFields?: readonly string[];
  /** The list holds as many pins as it keeps: an unpinned field's icon does nothing */
  pinCapped?: boolean;
  /** A field's pin icon was clicked: pin it, or unpin it */
  onTogglePin?: (key: string) => void;
  /** A field was picked: the bar opens its editor */
  onPick: (option: FilterOption) => void;
  /** "+ Filter" itself, for the bar to move focus to */
  triggerRef?: RefObject<HTMLButtonElement | null>;
  /** "+ Filter" opens something else (the sheet on a phone or a TV), not the menu */
  onOpen?: (() => void) | undefined;
  /** Drawn in place (in the sheet): the search box and the list, no button or popover */
  inline?: boolean;
}

/** A run of options under one heading: a panel section, or the pinned fields */
interface Section {
  readonly key: string;
  readonly label: string;
  readonly options: readonly FilterOption[];
}

/** A found entity as a menu option: the field it filters, its id and name */
interface ValueOption extends ValueResult {
  readonly key: string;
  readonly field: FilterOption;
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
 * Two characters or more also search the names of the entities the list's
 * ref fields take (tags, performers, studios, collections, galleries), under
 * a Values heading after the fields ("Tags: Outdoor"): picking one adds it
 * to that field's first root row and applies it at once (`useValueSearch`).
 *
 * At the row limit (`WHERE_LIMITS.rows`) the menu says so, and only fields
 * already in use at the root stay pickable: picking one opens its chip.
 *
 * `inline` draws the search box and the list in place, always open (the
 * filter sheet's field list, over the sheet's draft): a pick clears the
 * search, and a value picked applies to the draft. `onOpen` makes the
 * button open something else (the sheet) instead.
 *
 * Each field option carries a pin icon that pins or unpins the field
 * without picking it. It is a mouse affordance (`aria-hidden`, not
 * focusable): an option holds no control of its own, so keyboard and TV
 * users pin from the field's editor header.
 */
const AddFilterMenu = ({
  filters,
  pinnedFields = NO_PINS,
  pinCapped = false,
  onTogglePin,
  onPick,
  triggerRef,
  onOpen,
  inline = false,
}: AddFilterMenuProps) => {
  const [isOpen, setOpen] = useState(false);
  const open = inline || isOpen;
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const ownTriggerRef = useRef<HTMLButtonElement>(null);
  const anchorRef = triggerRef ?? ownTriggerRef;
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
  const valueGroups = useValueSearch(options, open ? query : "");
  const values = useMemo(
    () =>
      valueGroups.flatMap((group) =>
        group.results.map(
          (result): ValueOption => ({
            ...result,
            key: `${group.field.key}|${result.ref}`,
            field: group.field,
          })
        )
      ),
    [valueGroups]
  );
  const shown = [...sections.flatMap((section) => section.options), ...values];
  const isDisabled = (option: FilterOption) =>
    atLimit && !inUse.has(option.key);
  const isValueDisabled = (value: ValueOption) => isDisabled(value.field);
  const pinned = new Set(pinnedFields);
  const canPin = (key: string) =>
    onTogglePin !== undefined && isPinnable(filters.kind, key);

  const toggle = () => {
    if (onOpen !== undefined) {
      onOpen();
      return;
    }
    if (!isOpen) setQuery("");
    setOpen(!isOpen);
  };

  const pick = (option: FilterOption) => {
    if (isDisabled(option)) return;
    setOpen(false);
    if (inline) setQuery("");
    onPick(option);
  };

  const pickValue = (value: ValueOption) => {
    if (isValueDisabled(value)) return;
    setOpen(false);
    filters.commit(
      withRefValue(filters.kind, filters.filters, value.field.key, value.ref)
    );
    if (inline) {
      setQuery("");
      inputRef.current?.focus();
    } else {
      anchorRef.current?.focus();
    }
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
      const first = sections
        .flatMap((section) => section.options)
        .find((option) => !isDisabled(option));
      if (first !== undefined) pick(first);
      else {
        const value = values.find((each) => !isValueDisabled(each));
        if (value !== undefined) pickValue(value);
      }
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
    pickIt: () => void
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    pickIt();
  };

  const body = (
    <>
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
          className={inline ? "mt-2" : "mt-2 max-h-80 overflow-y-auto"}
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
                        handleOptionKeyDown(event, () => pick(option))
                      }
                      className={`px-2 py-1.5 rounded text-sm ${
                        disabled
                          ? "cursor-not-allowed opacity-50"
                          : "cursor-pointer hover:bg-[var(--bg-tertiary)] focus:bg-[var(--bg-tertiary)]"
                      }`}
                      style={{ color: "var(--text-primary)" }}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span>{labelOf(option)}</span>
                        {canPin(option.key) && (
                          <PinIcon
                            pinned={pinned.has(option.key)}
                            capped={pinCapped}
                            onClick={() => onTogglePin?.(option.key)}
                          />
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {values.length > 0 && (
            <div role="group" aria-labelledby={`add-filter-${id}-values`}>
              <div
                id={`add-filter-${id}-values`}
                role="presentation"
                className="px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--text-muted)" }}
              >
                Values
              </div>
              {values.map((value) => {
                const disabled = isValueDisabled(value);
                return (
                  <div
                    key={value.key}
                    role="option"
                    tabIndex={-1}
                    aria-selected={false}
                    aria-disabled={disabled || undefined}
                    onClick={() => pickValue(value)}
                    onKeyDown={(event) =>
                      handleOptionKeyDown(event, () => pickValue(value))
                    }
                    className={`px-2 py-1.5 rounded text-sm ${
                      disabled
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer hover:bg-[var(--bg-tertiary)] focus:bg-[var(--bg-tertiary)]"
                    }`}
                    style={{ color: "var(--text-primary)" }}
                  >
                    {`${labelOf(value.field)}: ${value.name || "Unknown"}`}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );

  if (inline) return <div>{body}</div>;

  return (
    <div className="relative" data-tv-search-item="add-filter">
      <Button
        ref={anchorRef}
        variant="secondary"
        size="sm"
        onClick={toggle}
        aria-label="Add filter"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="rounded-full"
        icon={<LucidePlus className="w-4 h-4" aria-hidden="true" />}
      >
        Filter
      </Button>
      <Popover
        anchorRef={anchorRef}
        open={isOpen}
        onClose={() => setOpen(false)}
        label="Choose a filter"
        className="w-72 max-w-[calc(100vw-2rem)] p-2"
      >
        {body}
      </Popover>
    </div>
  );
};

interface PinIconProps {
  pinned: boolean;
  capped: boolean;
  onClick: () => void;
}

/**
 * An option's pin icon: a click pins (or unpins) its field and does not
 * pick the option. Hidden from assistive technology and never focused.
 */
const PinIcon = ({ pinned, capped, onClick }: PinIconProps) => {
  const inert = capped && !pinned;
  return (
    <span
      data-pin-toggle=""
      aria-hidden="true"
      title={
        pinned ? "Unpin" : inert ? `Up to ${PIN_LIMIT} pins` : "Pin to the bar"
      }
      onClick={(event) => {
        event.stopPropagation();
        if (!inert) onClick();
      }}
      className={`p-0.5 rounded ${
        inert
          ? "opacity-30 cursor-not-allowed"
          : "cursor-pointer hover:opacity-70"
      }`}
      style={{
        color: pinned ? "var(--accent-primary)" : "var(--text-muted)",
      }}
    >
      {pinned ? (
        <LucidePinOff className="w-3.5 h-3.5" />
      ) : (
        <LucidePin className="w-3.5 h-3.5" />
      )}
    </span>
  );
};

export default AddFilterMenu;
