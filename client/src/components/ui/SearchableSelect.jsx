import { useCallback, useEffect, useRef, useState } from "react";
import { LucideChevronDown, LucideSearch, LucideX } from "lucide-react";
import { useDebouncedValue } from "../../hooks/useDebounce.js";
import { libraryApi } from "../../services/api.js";
import { getCache, setCache } from "../../utils/filterCache.js";
import Button from "./Button.jsx";

/**
 * Searchable select component with caching and debounced search
 * Supports both single and multi-select modes
 *
 * @param {Object} props
 * @param {"performers"|"studios"|"tags"|"groups"|"galleries"} props.entityType - Type of entity to search
 * @param {Array|string} props.value - Selected value(s) - array for multi, string for single
 * @param {Function} props.onChange - Callback when selection changes
 * @param {boolean} props.multi - Enable multi-select mode
 * @param {string} props.placeholder - Placeholder text
 * @param {"scenes"|"galleries"|"images"|"performers"|"groups"|null} props.countFilterContext - Filter entities to only those with content in this context
 */
/**
 * Create a composite key from entity ID and instance ID.
 * Format: "entityId:instanceId" when instanceId exists, otherwise just "entityId"
 */
const makeCompositeKey = (id, instanceId) =>
  instanceId ? `${id}:${instanceId}` : id;

/**
 * Parse a composite key back to {id, instanceId}.
 * Handles both "entityId:instanceId" and bare "entityId" formats.
 */
const parseCompositeKey = (key) => {
  if (!key) return { id: key, instanceId: undefined };
  const colonIdx = key.indexOf(":");
  if (colonIdx === -1) return { id: key, instanceId: undefined };
  return { id: key.substring(0, colonIdx), instanceId: key.substring(colonIdx + 1) };
};

const SearchableSelect = ({
  entityType,
  value,
  onChange,
  multi = false,
  placeholder = "Select...",
  countFilterContext = null,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  // Initialize selectedItems as empty - will be populated by useEffect when value has items
  const [selectedItems, setSelectedItems] = useState(() => {
    // Ensure we start with empty array if value is empty/undefined
    if (!value || (Array.isArray(value) && value.length === 0)) {
      return [];
    }
    // If value exists but we don't have names yet, return empty
    // The useEffect will fetch the names
    return [];
  });

  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const prevEntityTypeRef = useRef(entityType);
  const prevCountFilterContextRef = useRef(countFilterContext);
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  // Fetch items by specific IDs (use full endpoints which support ID filtering)
  // Groups composite "id:instanceId" keys by instanceId and makes instance-scoped
  // API calls to avoid ambiguous lookups when the same entity ID exists across
  // multiple Stash instances.
  const fetchItemsByIds = useCallback(
    async (compositeKeys) => {
      // Guard: don't fetch if no IDs provided
      if (!compositeKeys || compositeKeys.length === 0) {
        return [];
      }

      // Parse composite keys and group by instanceId
      const parsed = compositeKeys.map(parseCompositeKey);
      const groups = new Map(); // instanceId (or "__bare__") -> [bareId, ...]
      for (const { id, instanceId } of parsed) {
        const groupKey = instanceId || "__bare__";
        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey).push(id);
      }

      // Entity filter key per entity type
      const filterKeyMap = {
        performers: "performer_filter",
        studios: "studio_filter",
        tags: "tag_filter",
        groups: "group_filter",
        galleries: "gallery_filter",
      };

      // Response extractor per entity type
      const extractResults = {
        performers: (r) => r?.findPerformers?.performers || [],
        studios: (r) => r?.findStudios?.studios || [],
        tags: (r) => r?.findTags?.tags || [],
        groups: (r) => r?.findGroups?.groups || [],
        galleries: (r) => r?.findGalleries?.galleries || [],
      };

      // API method per entity type
      const apiMethodMap = {
        performers: libraryApi.findPerformers,
        studios: libraryApi.findStudios,
        tags: libraryApi.findTags,
        groups: libraryApi.findGroups,
        galleries: libraryApi.findGalleries,
      };

      const apiMethod = apiMethodMap[entityType];
      const filterKey = filterKeyMap[entityType];
      const extract = extractResults[entityType];

      if (!apiMethod || !extract) {
        return [];
      }

      // Make one API call per instance group, using allSettled so a single
      // failing instance doesn't prevent results from healthy instances
      const promises = [...groups.entries()].map(
        async ([groupKey, bareIds]) => {
          const uniqueIds = [...new Set(bareIds)];
          const params = { ids: uniqueIds };

          // Add instance filter for non-bare groups
          if (groupKey !== "__bare__" && filterKey) {
            params[filterKey] = { instance_id: groupKey };
          }

          const response = await apiMethod(params);
          return extract(response);
        }
      );

      const settled = await Promise.allSettled(promises);
      const allResults = [];
      for (const result of settled) {
        if (result.status === "fulfilled") {
          allResults.push(...result.value);
        } else {
          console.error(`Error fetching ${entityType} by IDs:`, result.reason);
        }
      }

      // Extract minimal fields with composite key
      return allResults.map((item) => ({
        id: makeCompositeKey(item.id, item.instanceId),
        name: item.name || item.title || "Unknown",
      }));
    },
    [entityType]
  );

  // Load selected items' names immediately when value exists (lazy load on page load)
  useEffect(() => {
    // Handle empty/null/undefined values - clear selected items
    if (!value || (Array.isArray(value) && value.length === 0)) {
      setSelectedItems([]);
      return;
    }

    const loadSelectedNames = async () => {
      const valueArray = multi ? value : [value];

      // First, try to find in already-loaded options
      if (options.length > 0) {
        const selected = options.filter((opt) => valueArray.includes(opt.id));
        if (selected.length === valueArray.length) {
          setSelectedItems(selected);
          return;
        }
      }

      // Try localStorage cache
      try {
        const cached = getCache(entityType);
        if (cached?.data) {
          const selected = cached.data.filter((opt) =>
            valueArray.includes(opt.id)
          );

          // If we found all items in cache, use them
          if (selected.length === valueArray.length) {
            setSelectedItems(selected);
            return;
          }
        }

        // Cache miss or incomplete - fetch by IDs from API in background
        setIsLoadingInitial(true);
        try {
          const results = await fetchItemsByIds(valueArray);
          if (results && results.length > 0) {
            setSelectedItems(results);
          }
        } finally {
          setIsLoadingInitial(false);
        }
      } catch (error) {
        console.error("Error loading selected names:", error);
      }
    };

    // Run immediately (lazy load in background)
    loadSelectedNames();
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

  // Load options from cache or API
  const loadOptions = useCallback(
    async (search = "") => {
      try {
        setLoading(true);

        // Build cache key including count filter context
        const cacheKey = countFilterContext
          ? `${entityType}_${countFilterContext}`
          : entityType;

        // If no search term, try cache first
        if (!search) {
          const cached = getCache(cacheKey);
          if (cached?.data) {
            setOptions(cached.data);
            setLoading(false);
            return;
          }
        }

        // API method mapping
        const apiMethods = {
          performers: libraryApi.findPerformersMinimal,
          studios: libraryApi.findStudiosMinimal,
          tags: libraryApi.findTagsMinimal,
          groups: libraryApi.findGroupsMinimal,
          galleries: libraryApi.findGalleriesMinimal,
        };

        // Fetch from API
        const apiMethod = apiMethods[entityType];
        const filter = {
          per_page: 50,
          sort: "name",
          direction: "ASC",
          ...(search ? { q: search } : {}),
        };

        const count_filter = getCountFilter();
        const rawResults = await apiMethod({ filter, count_filter });

        // Transform results to use composite id:instanceId keys
        const results = rawResults.map((item) => ({
          id: makeCompositeKey(item.id, item.instanceId),
          name: item.name || item.title || "Unknown",
        }));

        // Cache first page of results (no search = initial batch)
        if (!search && results.length > 0) {
          setCache(cacheKey, results);
        }

        setOptions(results);
      } catch (error) {
        console.error(`Error loading ${entityType}:`, error);
        setOptions([]);
      } finally {
        setLoading(false);
      }
    },
    [entityType, countFilterContext, getCountFilter]
  );

  // Debounced search - triggers loadOptions after 300ms of no typing
  useEffect(() => {
    loadOptions(debouncedSearchTerm);
  }, [debouncedSearchTerm, loadOptions]);

  // Load initial options when dropdown opens
  useEffect(() => {
    if (isOpen && options.length === 0) {
      loadOptions("");
    }
  }, [isOpen, options.length, loadOptions]);

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
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
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

  const handleSelect = (option) => {
    if (multi) {
      const currentValue = value || [];
      const isSelected = currentValue.includes(option.id);

      if (isSelected) {
        onChange(currentValue.filter((id) => id !== option.id));
      } else {
        onChange([...currentValue, option.id]);
      }
    } else {
      onChange(option.id);
      setIsOpen(false);
      setSearchTerm("");
    }
  };

  const handleRemove = (optionId, e) => {
    e.stopPropagation();
    if (multi) {
      onChange((value || []).filter((id) => id !== optionId));
    } else {
      onChange("");
    }
  };

  const handleClearAll = (e) => {
    e.stopPropagation(); // Don't toggle dropdown
    onChange(multi ? [] : "");
  };

  const isSelected = (optionId) => {
    if (multi) {
      return (value || []).includes(optionId);
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
                onClick={(e) => handleRemove(selectedItems[0]?.id, e)}
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
              icon={<LucideX size={16} style={{ color: "var(--text-muted)" }} />}
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
