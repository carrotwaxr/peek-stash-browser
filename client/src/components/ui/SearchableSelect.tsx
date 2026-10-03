import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type MinimalEntity,
  type MinimalScope,
  Q_MAX_LENGTH,
} from "@peek/shared-types";
import {
  LucideBan,
  LucideChevronDown,
  LucideSearch,
  LucideX,
} from "lucide-react";
import { getPlaylists, getSharedPlaylists } from "../../api";
import { useDebouncedValue } from "../../hooks/useDebounce";
import { makeCompositeKey, parseCompositeKey } from "../../utils/compositeKey";
import Button from "./Button";
import { type MinimalEntityType, minimalFinder } from "./minimalFinder";

/**
 * Searchable select for scenes, performers, studios, tags, groups and
 * galleries, in single or multi-select mode. Its options come from the
 * entity's `/minimal` endpoint (one page in name order, searched on the
 * server, with the user's exclusions and instances applied; a scene's name
 * is its title): nothing loads until the dropdown opens, each search aborts
 * the one before it, and a response for a search that is no longer current
 * is dropped. Nothing is kept in the browser between openings, so the list
 * is always the current user's. The selected values' names are resolved
 * with one minimal request carrying their ids. With `scope`, both kinds of
 * request carry it: the Content Restrictions editor sends "allEnabled" to
 * list every enabled server's entities, including what the admin hid for
 * themselves (admins only). The scene endpoint takes no scope or count
 * filter.
 *
 * `entityType="playlists"` picks Peek playlists instead: the viewer's own,
 * then those shared with them marked "by <owner>", read from
 * `GET /api/playlists` and `GET /api/playlists/shared` once per opening and
 * searched in the browser. A value is the playlist's id, never joined with
 * an instance; an id neither list holds (deleted, or no longer shared)
 * shows as "Unavailable playlist" and stays selected.
 *
 * The trigger is a button (Enter or Space opens the list, focus moves to the
 * search box, Escape closes it and returns focus to the trigger, a focus that
 * leaves the picker closes it). The selected values' remove buttons and Clear
 * all sit beside the trigger, never inside it. In TV mode the trigger is an
 * ordinary focusable element, so the D-pad reaches it.
 *
 * With `onSelectionChange` (a filter field that takes exclusions) every
 * change reports both lists, the excluded values being `excluded`, and each
 * picked value has an include or exclude toggle beside its remove button,
 * a button pressed while the value is excluded (not under Has NONE, where
 * `excludeToggle` is false). The Content Restrictions editor never passes
 * it.
 *
 * @param {Object} props
 * @param {"scenes"|"performers"|"studios"|"tags"|"groups"|"galleries"|"playlists"} props.entityType - Type of entity to search
 * @param {Array|string} props.value - Selected value(s) - array for multi, string for single
 * @param {Function} props.onChange - Callback when selection changes
 * @param {boolean} props.multi - Enable multi-select mode
 * @param {string} props.placeholder - Placeholder text
 * @param {string} [props.label] - The field's name, which names the trigger ("Tags: Tag A, Tag B"); without it the placeholder does
 * @param {"scenes"|"galleries"|"images"|"performers"|"groups"|null} props.countFilterContext - Filter entities to only those with content in this context
 * @param {"allEnabled"} [props.scope] - Every enabled server, not only the user's own, hidden items included (admins only)
 */

interface SelectOption {
  id: string;
  name: string;
  /** A playlist shared with the viewer: its owner's name */
  owner?: string | undefined;
}

type EntityType = MinimalEntityType | "playlists";

/** Options listed per search: one page */
const PAGE_SIZE = 50;

/** Ids one request looks up: the server's limit (MINIMAL_IDS_MAX) */
const IDS_PER_REQUEST = 100;

/**
 * A pick's icon buttons draw in the pick's own text colour: the tertiary
 * button's accent would vanish on an included pick's accent background
 */
const ICON_ON_PICK = {
  backgroundColor: "transparent",
  borderColor: "transparent",
  color: "inherit",
} as const;

/** What a stale playlist id shows as: deleted, or no longer shared */
const UNAVAILABLE_PLAYLIST = "Unavailable playlist";

/**
 * The viewer's playlists as options: their own, then those shared with
 * them, each id once
 */
async function playlistOptions(): Promise<SelectOption[]> {
  const [own, shared] = await Promise.all([
    getPlaylists(),
    getSharedPlaylists(),
  ]);
  const seen = new Set<string>();
  const options: SelectOption[] = [];
  for (const playlist of own.playlists) {
    const id = String(playlist.id);
    if (seen.has(id)) continue;
    seen.add(id);
    options.push({ id, name: playlist.name });
  }
  for (const playlist of shared.playlists) {
    const id = String(playlist.id);
    if (seen.has(id)) continue;
    seen.add(id);
    options.push({ id, name: playlist.name, owner: playlist.owner.username });
  }
  return options;
}

/** An option as the picker writes it: a shared playlist with its owner */
const shownName = (option: SelectOption) =>
  option.owner === undefined
    ? option.name
    : `${option.name} by ${option.owner}`;

/** Whether an option matches the search text, its owner included */
const matchesSearch = (option: SelectOption, search: string) =>
  search.trim() === "" ||
  shownName(option).toLowerCase().includes(search.trim().toLowerCase());

/** An entity as an option: its "id:instanceId" key and its name */
const toOption = (entity: MinimalEntity): SelectOption => ({
  id: makeCompositeKey(entity.id, entity.instanceId),
  name: entity.name || "Unknown",
});

/**
 * Whether a stored value stands for the option: its "id:instanceId", or a bare
 * id (a bookmark or preset saved without its server), which stands for that id
 * on every server.
 */
const storedValueIs = (stored: string, optionId: string): boolean =>
  stored === optionId || stored === parseCompositeKey(optionId).id;

interface Props {
  /** The trigger's id, where a filter chip moves focus and a label points */
  id?: string | undefined;
  /** The field's name, which names the trigger button */
  label?: string | undefined;
  entityType: EntityType;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multi?: boolean;
  placeholder?: string;
  countFilterContext?:
    | "scenes"
    | "galleries"
    | "images"
    | "performers"
    | "groups"
    | null;
  /** Sent with every request; only the Content Restrictions editor sets it */
  scope?: MinimalScope;
  /** The picked values that exclude (multi only) */
  excluded?: readonly string[] | undefined;
  /**
   * Given, every change reports the included and the excluded values at
   * once, and each picked value has an include or exclude toggle
   */
  onSelectionChange?:
    | ((included: string[], excluded: string[]) => void)
    | undefined;
  /**
   * False hides the toggles (Has NONE, where every value excludes): the
   * excluded values show as picks
   */
  excludeToggle?: boolean | undefined;
  /**
   * Opens the list once mounted, focus in its search box (a filter chip's
   * editor on a picker). It opens after the first render, so a popover
   * around it moves focus in first and the list keeps it.
   */
  openOnMount?: boolean | undefined;
}

const NONE: readonly string[] = [];

const SearchableSelect = ({
  id,
  label,
  entityType,
  value,
  onChange,
  multi = false,
  placeholder = "Select...",
  countFilterContext = null,
  scope,
  excluded: excludedProp,
  onSelectionChange,
  excludeToggle = true,
  openOnMount = false,
}: Props) => {
  // A stable list while its ids do not change: the names effect depends on it
  const excludedText = multi ? (excludedProp ?? NONE).join("\n") : "";
  const excluded = useMemo(
    () => (excludedText === "" ? NONE : excludedText.split("\n")),
    [excludedText]
  );
  const toggleable = multi && onSelectionChange !== undefined && excludeToggle;
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [options, setOptions] = useState<SelectOption[]>([]);
  const isPlaylists = entityType === "playlists";
  // The viewer's playlists, read once per opening and searched here
  const [playlists, setPlaylists] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  // Filled by the selected-names effect once it knows their names
  const [selectedItems, setSelectedItems] = useState<SelectOption[]>([]);
  // The names resolved so far, read by the selected-names effect
  const selectedItemsRef = useRef<SelectOption[]>([]);
  useEffect(() => {
    selectedItemsRef.current = selectedItems;
  }, [selectedItems]);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const prevEntityTypeRef = useRef(entityType);
  const prevCountFilterContextRef = useRef(countFilterContext);
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  // The selected values' names: one minimal request carrying their ids
  // ("id:instanceId", or a bare id for that id on every instance), 100 at a
  // time; no count filter, so a selection that no longer has content keeps
  // its name
  const fetchItemsByIds = useCallback(
    async (
      compositeKeys: string[],
      signal: AbortSignal
    ): Promise<SelectOption[]> => {
      const ids = [...new Set(compositeKeys)];
      if (entityType === "playlists" && ids.length > 0) {
        const listed = await playlistOptions();
        return ids.map(
          (id) =>
            listed.find((option) => option.id === id) ?? {
              id,
              name: UNAVAILABLE_PLAYLIST,
            }
        );
      }
      const find = minimalFinder(entityType);
      if (!find || ids.length === 0) return [];

      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) {
        chunks.push(ids.slice(i, i + IDS_PER_REQUEST));
      }
      const pages = await Promise.all(
        chunks.map((chunk) =>
          find(
            {
              ids: chunk,
              filter: { per_page: IDS_PER_REQUEST },
              ...(scope ? { scope } : {}),
            },
            signal
          )
        )
      );
      return pages.flat().map(toOption);
    },
    [entityType, scope]
  );

  // Load the selected items' names when the value changes
  useEffect(() => {
    const valueArray: string[] = multi
      ? [...((value || []) as string[]), ...excluded]
      : value
        ? [value as string]
        : [];

    // Nothing picked: clear selected items
    if (valueArray.length === 0) {
      setSelectedItems([]);
      setIsLoadingInitial(false);
      return;
    }

    // Names already known: resolved before, or in the options listed now
    const known = new Map<string, SelectOption>();
    for (const option of [
      ...selectedItemsRef.current,
      ...options,
      ...playlists,
    ]) {
      known.set(option.id, option);
    }
    const found = valueArray.flatMap((id) => {
      const option = known.get(id);
      return option ? [option] : [];
    });
    if (found.length === valueArray.length) {
      setSelectedItems(found);
      setIsLoadingInitial(false);
      return;
    }

    // Else ask the server; a newer value aborts this request
    const controller = new AbortController();
    const { signal } = controller;
    setIsLoadingInitial(true);
    fetchItemsByIds(valueArray, signal)
      .then((results) => {
        if (!signal.aborted && results.length > 0) setSelectedItems(results);
      })
      .catch((error: unknown) => {
        if (!signal.aborted) {
          console.error("Error loading selected names:", error);
        }
      })
      .finally(() => {
        if (!signal.aborted) setIsLoadingInitial(false);
      });
    return () => controller.abort();
  }, [value, excluded, options, playlists, entityType, multi, fetchItemsByIds]);

  // Build count_filter based on context
  const getCountFilter = useCallback(() => {
    if (!countFilterContext) return undefined;

    const filterMap = {
      scenes: { min_scene_count: 1 },
      galleries: { min_gallery_count: 1 },
      images: { min_image_count: 1 },
      performers: { min_performer_count: 1 },
      groups: { min_group_count: 1 },
    };
    return filterMap[countFilterContext];
  }, [countFilterContext]);

  // Load one page of options. A response that arrives after `signal` was
  // aborted (the search changed, the dropdown closed) is dropped.
  const loadOptions = useCallback(
    async (search: string, signal: AbortSignal) => {
      const find = minimalFinder(entityType);
      if (!find) {
        setOptions([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const count_filter = getCountFilter();
        const rows = await find(
          {
            filter: { per_page: PAGE_SIZE, ...(search ? { q: search } : {}) },
            ...(count_filter ? { count_filter } : {}),
            ...(scope ? { scope } : {}),
          },
          signal
        );
        if (signal.aborted) return;
        setOptions(rows.map(toOption));
        setLoading(false);
      } catch (error) {
        if (signal.aborted) return;
        console.error(`Error loading ${entityType}:`, error);
        setOptions([]);
        setLoading(false);
      }
    },
    [entityType, getCountFilter, scope]
  );

  // Options load only while the dropdown is open: when it opens and after
  // each (debounced) change of the search text. Each run aborts the request
  // of the run before it.
  useEffect(() => {
    if (!isOpen || isPlaylists) return;
    const controller = new AbortController();
    void loadOptions(debouncedSearchTerm, controller.signal);
    return () => controller.abort();
  }, [isOpen, isPlaylists, debouncedSearchTerm, loadOptions]);

  // The playlists load once per opening; the search filters what was read.
  // An answer that arrives after the list closed is dropped.
  useEffect(() => {
    if (!isOpen || !isPlaylists) return;
    let current = true;
    setLoading(true);
    playlistOptions()
      .then((rows) => {
        if (!current) return;
        setPlaylists(rows);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!current) return;
        console.error("Error loading playlists:", error);
        setPlaylists([]);
        setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [isOpen, isPlaylists]);

  // What the list shows: the playlists matching the search, else the page
  // the endpoint answered
  const shown = isPlaylists
    ? playlists.filter((option) => matchesSearch(option, searchTerm))
    : options;

  // Reset options when entityType or countFilterContext changes
  useEffect(() => {
    if (
      prevEntityTypeRef.current !== entityType ||
      prevCountFilterContextRef.current !== countFilterContext
    ) {
      // Clear options to force reload
      setOptions([]);
      setPlaylists([]);
      setSelectedItems([]);
      setSearchTerm("");

      // Update refs
      prevEntityTypeRef.current = entityType;
      prevCountFilterContextRef.current = countFilterContext;
    }
  }, [entityType, countFilterContext]);

  // Close dropdown when clicking outside,
  // in the capture phase: a Modal stops the press bubbling past its backdrop
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside, true);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (openOnMount) setIsOpen(true);
  }, [openOnMount]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const closeList = () => {
    setIsOpen(false);
    setSearchTerm("");
  };

  /** The included values, as stored */
  const includedOf = () => (multi ? ((value || []) as string[]) : []);

  /** Whether a stored value is among the excluded ones */
  const isExcluded = (optionId: string) =>
    excluded.some((stored) => storedValueIs(stored, optionId));

  /** Reports a multi picker's lists: both with a toggle, else the included */
  const changeMulti = (included: string[], nextExcluded: string[]) => {
    if (onSelectionChange) onSelectionChange(included, nextExcluded);
    else onChange(included);
  };

  /** Both lists without the option: picked again, or removed */
  const without = (optionId: string) =>
    [
      includedOf().filter((stored) => !storedValueIs(stored, optionId)),
      excluded.filter((stored) => !storedValueIs(stored, optionId)),
    ] as const;

  const handleSelect = (option: SelectOption) => {
    if (multi) {
      if (isSelected(option.id)) {
        changeMulti(...without(option.id));
      } else {
        changeMulti([...includedOf(), option.id], [...excluded]);
      }
    } else {
      // Focus moves before the option that has it unmounts
      triggerRef.current?.focus();
      onChange(option.id);
      closeList();
    }
  };

  const handleRemove = (optionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Focus moves before the button that has it unmounts: to the next
    // value's remove button, else the trigger
    const removeButtons = Array.from(
      dropdownRef.current?.querySelectorAll<HTMLElement>("[data-remove]") ?? []
    );
    const index = removeButtons.indexOf(e.currentTarget as HTMLElement);
    (removeButtons[index + 1] ?? triggerRef.current)?.focus();
    if (multi) {
      changeMulti(...without(optionId));
    } else {
      onChange("");
    }
  };

  // A picked value moves between the included and the excluded ones
  const handleToggle = (optionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const [included, rest] = without(optionId);
    const stored =
      [...includedOf(), ...excluded].find((each) =>
        storedValueIs(each, optionId)
      ) ?? optionId;
    if (isExcluded(optionId)) {
      onSelectionChange?.([...included, stored], rest);
    } else {
      onSelectionChange?.(included, [...rest, stored]);
    }
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't toggle dropdown
    triggerRef.current?.focus();
    if (multi) changeMulti([], []);
    else onChange("");
  };

  // Escape while the list is open closes it and is handled: the dialog around
  // the picker stays. On a closed list it is nobody's here, so the dialog's.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape" || !isOpen) return;
    e.preventDefault();
    closeList();
    triggerRef.current?.focus();
  };

  // Focus moving to something outside the picker (Tab, a TV arrow) closes
  // the list, which would otherwise cover the fields below it. A blur to
  // nothing (a press on a non-focusable spot) is the outside-press listener's.
  const handleBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget;
    if (
      isOpen &&
      next instanceof Node &&
      !dropdownRef.current?.contains(next)
    ) {
      closeList();
    }
  };

  // A press on a chip's name toggles the list like the trigger; the buttons
  // act for themselves
  const handleRowClick = (e: React.MouseEvent) => {
    if (e.target instanceof Element && e.target.closest("button")) return;
    setIsOpen((open) => !open);
  };

  function isSelected(optionId: string) {
    if (multi) {
      return (
        includedOf().some((stored) => storedValueIs(stored, optionId)) ||
        isExcluded(optionId)
      );
    }
    return typeof value === "string" && storedValueIs(value, optionId);
  }

  // The trigger's name: the field, then what is picked (or the placeholder),
  // an excluded value as "not <name>"
  const pickedNames = selectedItems
    .map((item) =>
      toggleable && isExcluded(item.id)
        ? `not ${shownName(item)}`
        : shownName(item)
    )
    .join(", ");
  const triggerName = label
    ? `${label}: ${pickedNames || placeholder}`
    : pickedNames
      ? `${placeholder}: ${pickedNames}`
      : placeholder;

  return (
    <div
      ref={dropdownRef}
      className="relative w-full"
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      {/* The row: the trigger button, with the values' remove buttons beside it */}
      <div
        onClick={handleRowClick}
        className="w-full pl-3 pr-[2px] py-2 rounded-md cursor-pointer border text-sm flex flex-wrap items-center gap-1"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        {multi &&
          selectedItems.map((item) => {
            const out = toggleable && isExcluded(item.id);
            return (
              <span
                key={item.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm border"
                style={
                  out
                    ? {
                        backgroundColor: "var(--status-error-bg)",
                        borderColor: "var(--status-error-border)",
                        color: "var(--status-error)",
                      }
                    : {
                        backgroundColor: "var(--accent-primary)",
                        borderColor: "transparent",
                        color: "white",
                      }
                }
              >
                {toggleable && (
                  <Button
                    onClick={(e) => handleToggle(item.id, e)}
                    variant="tertiary"
                    // On every pick: an included one's is quiet until
                    // hovered or focused, an excluded one's at full strength
                    className={`!p-0 !border-0 rounded ${
                      out
                        ? "hover:opacity-70"
                        : "opacity-60 hover:!opacity-100 focus-visible:!opacity-100"
                    }`}
                    style={ICON_ON_PICK}
                    aria-pressed={out}
                    aria-label={`Exclude ${shownName(item)}`}
                    title={
                      out
                        ? `Include ${shownName(item)}`
                        : `Exclude ${shownName(item)}`
                    }
                    icon={<LucideBan size={14} />}
                  />
                )}
                <span className={out ? "line-through" : undefined}>
                  {shownName(item)}
                </span>
                <Button
                  data-remove
                  onClick={(e) => handleRemove(item.id, e)}
                  variant="tertiary"
                  className="hover:opacity-70 !p-0 !border-0"
                  style={ICON_ON_PICK}
                  aria-label={`Remove ${shownName(item)}`}
                  icon={<LucideX size={14} />}
                />
              </span>
            );
          })}
        <button
          ref={triggerRef}
          id={id}
          type="button"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-label={triggerName}
          onClick={() => setIsOpen(!isOpen)}
          className="flex flex-1 items-center justify-between gap-2 min-w-[6rem] py-0.5 text-left bg-transparent border-0 cursor-pointer rounded focus-visible:outline focus-visible:outline-2"
          style={{ color: "var(--text-primary)" }}
        >
          <span
            className="flex-1 min-w-0"
            style={
              selectedItems.length === 0 || multi
                ? { color: "var(--text-muted)" }
                : undefined
            }
          >
            {selectedItems.length === 0
              ? isLoadingInitial
                ? "Loading..."
                : placeholder
              : multi
                ? "Add more..."
                : selectedItems[0] && shownName(selectedItems[0])}
          </span>
          <LucideChevronDown
            size={14}
            className="flex-shrink-0"
            style={{
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
              color: "var(--text-muted)",
            }}
          />
        </button>
        {!multi && selectedItems[0] && (
          <Button
            data-remove
            onClick={(e) => {
              const selected = selectedItems[0];
              if (selected) handleRemove(selected.id, e);
            }}
            variant="tertiary"
            className="hover:opacity-70 !p-1 !border-0"
            aria-label={`Remove ${shownName(selectedItems[0])}`}
            icon={<LucideX size={16} />}
          />
        )}
        {selectedItems.length > 0 && (
          <Button
            onClick={handleClearAll}
            variant="tertiary"
            className="hover:opacity-70 !p-1 !border-0"
            aria-label="Clear all selections"
            title="Clear all"
            icon={<LucideX size={16} style={{ color: "var(--text-muted)" }} />}
          />
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          id={listId}
          className="absolute z-50 w-full mt-1 rounded-md shadow-lg border overflow-hidden"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            maxHeight: "300px",
          }}
        >
          {/* Search input */}
          <div
            className="p-2 border-b"
            style={{ borderColor: "var(--border-color)" }}
          >
            <div className="relative">
              <LucideSearch
                size={16}
                className="absolute left-3 top-1/2 transform -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Type to search..."
                maxLength={Q_MAX_LENGTH}
                className="w-full pl-9 pr-3 py-2 rounded-md border text-sm"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          </div>

          {/* Options list */}
          <div className="overflow-y-auto" style={{ maxHeight: "250px" }}>
            {loading ? (
              <div
                className="p-4 text-center"
                style={{ color: "var(--text-muted)" }}
              >
                Loading...
              </div>
            ) : shown.length === 0 ? (
              <div
                className="p-4 text-center"
                style={{ color: "var(--text-muted)" }}
              >
                No {entityType} found
              </div>
            ) : (
              shown.map((option) => (
                <Button
                  key={option.id}
                  onClick={() => handleSelect(option)}
                  aria-pressed={isSelected(option.id)}
                  variant="tertiary"
                  fullWidth
                  className="text-left px-4 py-2 flex items-center justify-between"
                  style={{
                    backgroundColor: isSelected(option.id)
                      ? "var(--accent-primary)"
                      : "transparent",
                    color: isSelected(option.id)
                      ? "white"
                      : "var(--text-primary)",
                  }}
                >
                  <span>
                    {option.name}
                    {option.owner !== undefined && (
                      <span
                        className="text-sm"
                        style={{
                          color: isSelected(option.id)
                            ? "inherit"
                            : "var(--text-muted)",
                        }}
                      >
                        {` by ${option.owner}`}
                      </span>
                    )}
                  </span>
                  {isSelected(option.id) && <span className="text-sm">✓</span>}
                </Button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
