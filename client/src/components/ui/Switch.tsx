/**
 * Toggle switch component
 * A styled checkbox that looks like a toggle switch
 */
export default function Switch({
  checked = false,
  onChange,
  disabled = false,
  id,
  className = "",
  ...props
}) {
  const handleChange = (e) => {
    if (onChange) {
      onChange(e.target.checked);
    }
  };

  return (
    <label
      className={`relative inline-flex items-center cursor-pointer ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      } ${className}`}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        className="sr-only peer"
        {...props}
      />
      <div
        className="w-11 h-6 rounded-full relative"
        style={{
          backgroundColor: checked
            ? "var(--accent-primary)"
            : "var(--bg-tertiary)",
        }}
      >
        <div
          className="absolute top-[2px] left-[2px] h-5 w-5 rounded-full transition-transform"
          style={{
            backgroundColor: "white",
            transform: checked ? "translateX(20px)" : "translateX(0)",
          }}
        />
      </div>
    </label>
  );
}
