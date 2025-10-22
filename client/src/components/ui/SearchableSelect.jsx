import { useState, useEffect, useRef, useCallback } from "react";
import { LucideX, LucideSearch, LucideChevronDown } from "lucide-react";
import { libraryApi } from "../../services/api.js";
import { getCache, setCache } from "../../utils/filterCache.js";
import Button from "./Button.jsx";

/**
 * Searchable select component with caching and debounced search
 * Supports both single and multi-select modes
 *
 * @param {Object} props
 * @param {"performers"|"studios"|"tags"} props.entityType - Type of entity to search
 * @param {Array|string} props.value - Selected value(s) - array for multi, string for single
 * @param {Function} props.onChange - Callback when selection changes
 * @param {boolean} props.multi - Enable multi-select mode
 * @param {string} props.placeholder - Placeholder text
 */
const SearchableSelect = ({
  entityType,
  value,
  onChange,
  multi = false,
  placeholder = "Select...",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // API method mapping
  const apiMethods = {
    performers: libraryApi.findPerformersMinimal,
    studios: libraryApi.findStudiosMinimal,
    tags: libraryApi.findTagsMinimal,
  };

  // Load selected items' names when value changes
  useEffect(() => {
    if (!value) {
      setSelectedItems([]);
      return;
    }

    const loadSelectedNames = async () => {
      // If we have options loaded, use those
      if (options.length > 0) {
        const valueArray = multi ? value : [value];
        const selected = options.filter((opt) => valueArray.includes(opt.id));
        setSelectedItems(selected);
        return;
      }

      // Otherwise try to load from cache or API
      try {
        const cached = getCache(entityType);
        if (cached?.data) {
          const valueArray = multi ? value : [value];
          const selected = cached.data.filter((opt) => valueArray.includes(opt.id));
          setSelectedItems(selected);
        }
      } catch (error) {
        console.error("Error loading selected names:", error);
      }
    };

    loadSelectedNames();
  }, [value, options, entityType, multi]);

  // Load options from cache or API
  const loadOptions = useCallback(async (search = "") => {
    try {
      setLoading(true);

      // If no search term, try cache first
      if (!search) {
        const cached = getCache(entityType);
        if (cached?.data) {
          setOptions(cached.data);
          setLoading(false);
          return;
        }
      }

      // Fetch from API
      const apiMethod = apiMethods[entityType];
      const filter = search
        ? { q: search, per_page: 50 } // Limited results for search
        : { per_page: -1, sort: "name", direction: "ASC" }; // All results, sorted

      const results = await apiMethod({ filter });

      // Cache if we fetched all (no search)
      if (!search && results.length > 0) {
        setCache(entityType, results);
      }

      setOptions(results);
    } catch (error) {
      console.error(`Error loading ${entityType}:`, error);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [entityType]);

  // Debounced search
  useEffect(() => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      loadOptions(searchTerm);
    }, 300);

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchTerm, loadOptions]);

  // Load initial options when dropdown opens
  useEffect(() => {
    if (isOpen && options.length === 0) {
      loadOptions("");
    }
  }, [isOpen, options.length, loadOptions]);

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
        className="w-full px-4 py-2 rounded-lg cursor-pointer border flex items-center justify-between gap-2"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
          minHeight: "42px",
        }}
      >
        <div className="flex flex-wrap gap-1 flex-1">
          {selectedItems.length === 0 ? (
            <span style={{ color: "var(--text-muted)" }}>{placeholder}</span>
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
        <LucideChevronDown
          size={18}
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute z-50 w-full mt-1 rounded-lg shadow-lg border overflow-hidden"
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
                placeholder={`Search ${entityType}...`}
                className="w-full pl-9 pr-3 py-2 rounded border"
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
              <div className="p-4 text-center" style={{ color: "var(--text-muted)" }}>
                Loading...
              </div>
            ) : options.length === 0 ? (
              <div className="p-4 text-center" style={{ color: "var(--text-muted)" }}>
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
                    color: isSelected(option.id) ? "white" : "var(--text-primary)",
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
