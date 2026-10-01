import { useSearchParams } from "react-router-dom";

export interface IncludeSubToggleProps {
  /** The URL param the page's tabs and counts read */
  param: "includeSubTags" | "includeSubStudios";
  /** "Include sub-tags" */
  label: string;
  /** How many sub-entities the toggle adds */
  count: number;
}

/**
 * Include sub-tags or sub-studios: a URL param the tabs and counts read.
 * Either way the tab's list starts again, since a page from the other
 * setting may not exist.
 */
const IncludeSubToggle = ({ param, label, count }: IncludeSubToggleProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const checked = searchParams.get(param) === "true";

  const onChange = (next: boolean) => {
    const params = new URLSearchParams(searchParams);
    params.delete("page");
    if (next) params.set(param, "true");
    else params.delete(param);
    setSearchParams(params);
  };

  return (
    <div className="mb-4 flex items-center gap-2">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 rounded border-2 cursor-pointer"
          style={{
            borderColor: "var(--border-color)",
            accentColor: "var(--accent-primary)",
          }}
        />
        <span
          className="text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {label} ({count})
        </span>
      </label>
    </div>
  );
};

export default IncludeSubToggle;
