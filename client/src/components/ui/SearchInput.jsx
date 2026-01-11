/**
 * Reusable search input component with debouncing
 */
import { useEffect, useState } from "react";
import { useDebouncedValue } from "../../hooks/useDebounce.js";
import Button from "./Button.jsx";

const SearchInput = ({
  placeholder = "Search...",
  onSearch,
  value,
  debounceMs = 300,
  className = "",
  autoFocus = false,
  clearOnSearch = false,
}) => {
  const [query, setQuery] = useState(value || "");
  const debouncedQuery = useDebouncedValue(query, debounceMs);

  // Sync internal state when external value changes
  useEffect(() => {
    if (value !== undefined && value !== query) {
      setQuery(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]); // Only sync when external value changes, not when query changes (would cause loop)

  useEffect(() => {
    onSearch?.(debouncedQuery);
    if (clearOnSearch && debouncedQuery) {
      setQuery("");
    }
  }, [debouncedQuery, onSearch, clearOnSearch]);

  const handleClear = () => {
    setQuery("");
    onSearch?.("");
  };

  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg
          className="h-5 w-5"
          style={{ color: "var(--text-muted)" }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`
          block w-full pl-10 pr-10 py-1 border rounded-md
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          transition-colors duration-200
        `}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      />

      {query && (
        <Button
          onClick={handleClear}
          variant="tertiary"
          className="absolute inset-y-0 right-0 pr-3 flex items-center hover:opacity-70 !p-0 !border-0"
          icon={
            <svg
              className="h-5 w-5"
              style={{ color: "var(--text-muted)" }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          }
        />
      )}
    </div>
  );
};

export default SearchInput;
