interface CheckboxGroupProps {
  /** The group's accessible name (the filter's label) */
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** The checked values */
  value: readonly string[];
  /** The checked values after a change, in the options' order */
  onChange: (value: string[]) => void;
  /** The id of the first box, where a chip moves focus */
  id?: string | undefined;
}

/**
 * A small fixed list of values, any number of which may be picked: a box
 * for each (Orientation's Landscape, Portrait, Square). Plain checkboxes,
 * so Tab, Space and TV mode's arrows work as on any other box.
 */
const CheckboxGroup = ({
  label,
  options,
  value,
  onChange,
  id,
}: CheckboxGroupProps) => (
  <div role="group" aria-label={label} className="flex flex-col gap-1">
    {options.map((option, index) => {
      const checked = value.includes(option.value);
      return (
        <label
          key={option.value}
          className="flex items-center cursor-pointer text-sm"
          style={{ color: "var(--text-primary)" }}
        >
          <input
            id={index === 0 ? id : undefined}
            type="checkbox"
            checked={checked}
            onChange={() =>
              onChange(
                options
                  .map((each) => each.value)
                  .filter((each) =>
                    each === option.value ? !checked : value.includes(each)
                  )
              )
            }
            className="w-4 h-4 rounded border cursor-pointer"
            style={{ accentColor: "var(--accent-primary)" }}
          />
          <span className="ml-2">{option.label}</span>
        </label>
      );
    })}
  </div>
);

export default CheckboxGroup;
