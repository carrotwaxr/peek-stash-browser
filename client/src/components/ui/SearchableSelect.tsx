import { useCallback, useEffect, useRef, useState } from "react";
import {
  type MinimalEntity,
  type MinimalRequest,
  type MinimalScope,
  Q_MAX_LENGTH,
} from "@peek/shared-types";
import { LucideChevronDown, LucideSearch, LucideX } from "lucide-react";
import { libraryApi } from "../../api";
import { useDebouncedValue } from "../../hooks/useDebounce";
import { makeCompositeKey } from "../../utils/compositeKey";
import Button from "./Button";

/**
 * Searchable select for performers, studios, tags, groups and galleries, in
 * single or multi-select mode. Its options come from the entity's `/minimal`
 * endpoint (one page in name order, searched on the server, with the user's
 * exclusions and instances applied): nothing loads until the dropdown opens,
 * each search aborts the one before it, and a response for a search that is
 * no longer current is dropped. Nothing is kept in the browser between
 * openings, so the list is always the current user's. The selected values'
 * names are resolved with one minimal request carrying their ids. With
 * `scope`, both kinds of request carry it: the Content Restrictions editor
 * sends "allEnabled" to list every enabled server's entities, including
 * what the admin hid for themselves (admins only).
 *
 * @param {Object} props
 * @param {"performers"|"studios"|"tags"|"groups"|"galleries"} props.entityType - Type of entity to search
 * @param {Array|string} props.value - Selected value(s) - array for multi, string for single
 * @param {Function} props.onChange - Callback when selection changes
 * @param {boolean} props.multi - Enable multi-select mode
 * @param {string} props.placeholder - Placeholder text
 * @param {"scenes"|"galleries"|"images"|"performers"|"groups"|null} props.countFilterContext - Filter entities to only those with content in this context
 * @param {"allEnabled"} [props.scope] - Every enabled server, not only the user's own, hidden items included (admins only)
 */

interface SelectOption {
  id: string;
  name: string;
}

type EntityType = "performers" | "studios" | "tags" | "groups" | "galleries";

/** Options listed per search: one page */
const PAGE_SIZE = 50;

/** Ids one request looks up: the server's limit (MINIMAL_IDS_MAX) */
const IDS_PER_REQUEST = 100;

type FindMinimal = (
  params: MinimalRequest,
  signal?: AbortSignal
) => Promise<MinimalEntity[]>;

/** The entity's `/minimal` endpoint; undefined for a type that has none */
function minimalFinder(entityType: string): FindMinimal | undefined {
  const finders: Record<EntityType, FindMinimal> = {
    performers: libraryApi.findPerformersMinimal,
    studios: libraryApi.findStudiosMinimal,
    tags: libraryApi.findTagsMinimal,
    groups: libraryApi.findGroupsMinimal,
    galleries: libraryApi.findGalleriesMinimal,
  };
  return Object.prototype.hasOwnProperty.call(finders, entityType)
    ? finders[entityType as EntityType]
    : undefined;
}

/** An entity as an option: its "id:instanceId" key and its name */
const toOption = (entity: MinimalEntity): SelectOption => ({
  id: makeCompositeKey(entity.id, entity.instanceId),
  name: entity.name || "Unknown",
});

interface Props {
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
}

const SearchableSelect = ({
  entityType,
  value,
  onChange,
  multi = false,
  placeholder = "Select...",
  countFilterContext = null,
  scope,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [options, setOptions] = useState<SelectOption[]>([]);
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
      const find = minimalFinder(entityType);
      const ids = [...new Set(compositeKeys)];
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
    // Handle empty/null/undefined values - clear selected items
    if (!value || (Array.isArray(value) && value.length === 0)) {
      setSelectedItems([]);
      setIsLoadingInitial(false);
      return;
    }

    const valueArray: string[] = multi
      ? (value as string[])
      : [value as string];

    // Names already known: resolved before, or in the options listed now
    const known = new Map<string, SelectOption>();
    for (const option of [...selectedItemsRef.current, ...options]) {
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
  }, [value, options, entityType, multi, fetchItemsByIds]);

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
    if (!isOpen) return;
    const controller = new AbortController();
    void loadOptions(debouncedSearchTerm, controller.signal);
    return () => controller.abort();
  }, [isOpen, debouncedSearchTerm, loadOptions]);

  // Reset options when entityType or countFilterContext changes
  useEffect(() => {
    if (
      prevEntityTypeRef.current !== entityType ||
      prevCountFilterContextRef.current !== countFilterContext
    ) {
      // Clear options to force reload
      setOptions([]);
      setSelectedItems([]);
      setSearchTerm("");

      // Update refs
      prevEntityTypeRef.current = entityType;
      prevCountFilterContextRef.current = countFilterContext;
    }
  }, [entityType, countFilterContext]);

  // Close dropdown when clicking outside
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
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (option: SelectOption) => {
    if (multi) {
      const currentValue = (value || []) as string[];
      const isAlreadySelected = currentValue.includes(option.id);

      if (isAlreadySelected) {
        onChange(currentValue.filter((id: string) => id !== option.id));
      } else {
        onChange([...currentValue, option.id]);
      }
    } else {
      onChange(option.id);
      setIsOpen(false);
      setSearchTerm("");
    }
  };

  const handleRemove = (optionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (multi) {
      onChange(
        ((value || []) as string[]).filter((id: string) => id !== optionId)
      );
    } else {
      onChange("");
    }
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't toggle dropdown
    onChange(multi ? [] : "");
  };

  const isSelected = (optionId: string) => {
    if (multi) {
      return ((value || []) as string[]).includes(optionId);
    }
    return value === optionId;
  };

  return (
    <div ref={dropdownRef} className="relative w-full">
      {/* Selected items display / Trigger button */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full pl-3 pr-[2px] py-2 rounded-md cursor-pointer border text-sm flex items-center justify-between gap-2"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        <div className="flex flex-wrap gap-1 flex-1">
          {selectedItems.length === 0 ? (
            isLoadingInitial ? (
              <span style={{ color: "var(--text-muted)" }}>Loading...</span>
            ) : (
              <span style={{ color: "var(--text-muted)" }}>{placeholder}</span>
            )
          ) : multi ? (
            selectedItems.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm"
                style={{
                  backgroundColor: "var(--accent-primary)",
                  color: "white",
                }}
              >
                {item.name}
                <Button
                  onClick={(e) => handleRemove(item.id, e)}
                  variant="tertiary"
                  className="hover:opacity-70 !p-0 !border-0"
                  aria-label={`Remove ${item.name}`}
                  icon={<LucideX size={14} />}
                />
              </span>
            ))
          ) : (
            <div className="flex items-center justify-between w-full">
              <span>{selectedItems[0]?.name}</span>
              <Button
                onClick={(e) => {
                  const selected = selectedItems[0];
                  if (selected) handleRemove(selected.id, e);
                }}
                variant="tertiary"
                className="hover:opacity-70 !p-1 !border-0"
                aria-label={`Remove ${selectedItems[0]?.name}`}
                icon={<LucideX size={16} />}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {selectedItems.length > 0 && (
            <Button
              onClick={handleClearAll}
              variant="tertiary"
              className="hover:opacity-70 !p-1 !border-0"
              aria-label="Clear all selections"
              title="Clear all"
              icon={
                <LucideX size={16} style={{ color: "var(--text-muted)" }} />
              }
            />
          )}
          <LucideChevronDown
            size={14}
            style={{
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
              color: "var(--text-muted)",
            }}
          />
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
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
            ) : options.length === 0 ? (
              <div
                className="p-4 text-center"
                style={{ color: "var(--text-muted)" }}
              >
                No {entityType} found
              </div>
            ) : (
              options.map((option) => (
                <Button
                  key={option.id}
                  onClick={() => handleSelect(option)}
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
                  <span>{option.name}</span>
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
