/**
 * Reusable search input component with debouncing
 */
import { useEffect, useRef, useState } from "react";
import { Q_MAX_LENGTH } from "@peek/shared-types";
import { useDebouncedValue } from "../../hooks/useDebounce";
import Button from "./Button";

interface Props {
  placeholder?: string;
  onSearch: (query: string) => void;
  value?: string;
  debounceMs?: number;
  className?: string;
  autoFocus?: boolean;
  clearOnSearch?: boolean;
}

const SearchInput = ({
  placeholder = "Search...",
  onSearch,
  value,
  debounceMs = 300,
  className = "",
  autoFocus = false,
  clearOnSearch = false,
}: Props) => {
  const [query, setQuery] = useState(value || "");
  const debouncedQuery = useDebouncedValue(query, debounceMs);
  // Last value we sent to onSearch, to avoid duplicate calls
  const lastSearchedRef = useRef(value || "");
  // Values sent whose echo through `value` has not come back yet, oldest
  // first. An echo of our own write is not a change from outside: it must
  // not overwrite what has been typed since.
  const pendingEchoesRef = useRef<string[]>([]);
  // Store onSearch in ref to avoid effect re-running when callback changes
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  const send = (text: string) => {
    lastSearchedRef.current = text;
    // The parent may never echo (clearOnSearch): keep the list short
    pendingEchoesRef.current = [...pendingEchoesRef.current, text].slice(-8);
    onSearchRef.current?.(text);
  };

  // Sync internal state when external value changes
  useEffect(() => {
    if (value === undefined) return;
    const echoed = pendingEchoesRef.current.indexOf(value);
    if (echoed >= 0) {
      // Our own write coming back (and any older one it overtook)
      pendingEchoesRef.current = pendingEchoesRef.current.slice(echoed + 1);
      return;
    }
    // A value from outside (Back across a search, a cleared chip) is already
    // searched: the debounce must not send it back
    pendingEchoesRef.current = [];
    lastSearchedRef.current = value;
    setQuery(value);
  }, [value]); // Only sync when external value changes, not when query changes (would cause loop)

  useEffect(() => {
    // Skip if we already sent this value (prevents duplicate calls when onSearch changes)
    if (debouncedQuery === lastSearchedRef.current) {
      return;
    }
    send(debouncedQuery);
    if (clearOnSearch && debouncedQuery) {
      setQuery("");
    }
  }, [debouncedQuery, clearOnSearch]);

  const handleClear = () => {
    setQuery("");
    send("");
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
        maxLength={Q_MAX_LENGTH}
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
