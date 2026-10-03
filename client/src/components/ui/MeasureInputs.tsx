/**
 * The Performers panel's body-measure editors for an imperial viewer:
 * Height in feet and inches, Weight in lbs, Penis Length in inches. The
 * state, the URL, presets and requests hold metric (whole cm and kg for
 * Height and Weight, cm with two decimals for Penis Length); these convert
 * what is typed and show the state in the viewer's units. `ShownRange` does
 * the same for a range shown in another scale (a rating100 as 0 to 10).
 *
 * An input keeps the text typed into it while it is being edited ("5." stays
 * "5." on the way to "5.5"): it takes text from the state only on mount and
 * when the state changes from outside (the URL, a preset, Clear).
 */
import { type CSSProperties, useId, useState } from "react";
import {
  type NumberDisplay,
  shownBound,
  storedBound,
} from "../../utils/filterFields";
import {
  type RangeSide,
  cmToFeetInches,
  cmToLengthInches,
  heightBoundToCm,
  kgToLbs,
  lengthInchesToCm,
  weightBoundToKg,
} from "../../utils/unitConversions";

/** A range as the panel holds it: bounds as text or numbers */
export interface MeasureRange {
  min?: string | number;
  max?: string | number;
  [key: string]: unknown;
}

interface MeasureInputsProps {
  /** The first input's id, where a filter chip moves focus */
  id?: string | undefined;
  value: unknown;
  onChange: (value: unknown) => void;
  inputClasses: string;
  inputStyle: CSSProperties;
}

const SIDES: readonly RangeSide[] = ["min", "max"];

/** A bound as the state holds it: its text, "" for none */
const boundText = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

const rangeOf = (value: unknown): MeasureRange =>
  typeof value === "object" && value !== null ? (value as MeasureRange) : {};

/** Text of whole digits, or a number with decimals */
const WHOLE = /^\d*$/;
const DECIMAL = /^\d*\.?\d*$/;

/**
 * The text an input shows for a bound the state holds, kept while the state
 * is what the input itself wrote. `metric` is the state's bound; `show`
 * writes it as the viewer reads it.
 */
function useTypedText(metric: string, show: (metric: string) => string) {
  const [text, setText] = useState(() => show(metric));
  const [seen, setSeen] = useState(metric);
  if (metric !== seen) {
    // Changed from outside: take the state's text
    setSeen(metric);
    setText(show(metric));
  }
  return {
    text,
    /** The input's own edit: its text stays, the state it wrote is seen */
    typed: (next: string, written: string) => {
      setText(next);
      setSeen(written);
    },
    /** Leaving the input: its text, tidied ("5." is "5", "007" is "7", "6,5" is "6.5") */
    tidy: () => {
      const number = Number(text.replace(",", "."));
      setText(
        text.trim() !== "" && Number.isFinite(number) ? String(number) : ""
      );
    },
  };
}

interface UnitInputProps {
  id?: string | undefined;
  side: RangeSide;
  label: string;
  /** What the state holds for this bound */
  metric: string;
  /** What the viewer reads for a metric bound */
  show: (metric: string) => string;
  /** The text that is allowed to be typed */
  allowed: RegExp | ((typed: string) => boolean);
  /** The metric bound for the typed text, "" for none */
  toMetric: (typed: string, side: RangeSide) => string;
  /** The state with this bound set */
  onWrite: (metric: string) => void;
  inputClasses: string;
  inputStyle: CSSProperties;
  inputMode: "numeric" | "decimal";
}

function UnitInput({
  id,
  side,
  label,
  metric,
  show,
  allowed,
  toMetric,
  onWrite,
  inputClasses,
  inputStyle,
  inputMode,
}: UnitInputProps) {
  const { text, typed, tidy } = useTypedText(metric, show);
  return (
    <input
      id={id}
      type="text"
      inputMode={inputMode}
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        const ok =
          typeof allowed === "function" ? allowed(next) : allowed.test(next);
        if (!ok) return;
        const written = toMetric(next, side);
        typed(next, written);
        onWrite(written);
      }}
      onBlur={tidy}
      placeholder={side === "min" ? "Min" : "Max"}
      aria-label={`${side === "min" ? "Minimum" : "Maximum"} ${label}`}
      className={inputClasses}
      style={inputStyle}
    />
  );
}

interface WeightLengthProps extends MeasureInputsProps {
  label: string;
}

/** Weight in lbs: whole pounds, stored as the whole kg that display as typed */
export function ImperialWeightRange({
  id,
  value,
  onChange,
  label,
  inputClasses,
  inputStyle,
}: WeightLengthProps) {
  const range = rangeOf(value);
  return (
    <div className="flex space-x-2">
      {SIDES.map((side) => (
        <UnitInput
          key={side}
          id={side === "min" ? id : undefined}
          side={side}
          label={label}
          metric={boundText(range[side])}
          show={(metric) =>
            metric === "" ? "" : String(kgToLbs(Number(metric)))
          }
          allowed={WHOLE}
          toMetric={(typed, each) => {
            const kg = weightBoundToKg(parseInt(typed, 10), each);
            return kg === undefined ? "" : String(kg);
          }}
          onWrite={(metric) => onChange({ ...range, [side]: metric })}
          inputClasses={inputClasses}
          inputStyle={inputStyle}
          inputMode="numeric"
        />
      ))}
    </div>
  );
}

/** Penis Length in inches: stored in cm, two decimals */
export function ImperialLengthRange({
  id,
  value,
  onChange,
  label,
  inputClasses,
  inputStyle,
}: WeightLengthProps) {
  const range = rangeOf(value);
  return (
    <div className="flex space-x-2">
      {SIDES.map((side) => (
        <UnitInput
          key={side}
          id={side === "min" ? id : undefined}
          side={side}
          label={label}
          metric={boundText(range[side])}
          show={(metric) =>
            metric === "" ? "" : String(cmToLengthInches(Number(metric)))
          }
          allowed={DECIMAL}
          toMetric={(typed) => {
            const cm = lengthInchesToCm(Number(typed));
            return cm === undefined ? "" : String(cm);
          }}
          onWrite={(metric) => onChange({ ...range, [side]: metric })}
          inputClasses={inputClasses}
          inputStyle={inputStyle}
          inputMode="decimal"
        />
      ))}
    </div>
  );
}

interface ShownRangeProps extends WeightLengthProps {
  display: NumberDisplay;
  /** The largest bound, as shown (a rating's 10); more is not taken */
  max?: number | undefined;
}

/**
 * A range shown in another scale than it is stored: a rating100 typed and
 * shown as 0 to 10 with one decimal, as the rating slider shows it. A comma
 * is taken as the decimal point (a comma locale's decimal keyboard), and a
 * bound past `max` is not taken.
 */
export function ShownRange({
  id,
  value,
  onChange,
  label,
  display,
  max,
  inputClasses,
  inputStyle,
}: ShownRangeProps) {
  const range = rangeOf(value);
  const pattern =
    display.decimals > 0
      ? new RegExp(`^\\d*[.,]?\\d{0,${display.decimals}}$`)
      : WHOLE;
  const shownNumber = (typed: string) => Number(typed.replace(",", "."));
  const allowed = (typed: string) => {
    if (!pattern.test(typed)) return false;
    const shown = shownNumber(typed);
    // "" and a lone "." are on the way to a number
    return max === undefined || !Number.isFinite(shown) || shown <= max;
  };
  return (
    <div className="flex space-x-2">
      {SIDES.map((side) => (
        <UnitInput
          key={side}
          id={side === "min" ? id : undefined}
          side={side}
          label={label}
          metric={boundText(range[side])}
          show={(stored) => {
            const number = Number(stored);
            return stored === "" || !Number.isFinite(number)
              ? stored
              : String(shownBound(number, display));
          }}
          allowed={allowed}
          toMetric={(typed) => {
            const shown = shownNumber(typed);
            return typed === "" || !Number.isFinite(shown)
              ? ""
              : String(storedBound(shown, display));
          }}
          onWrite={(stored) => onChange({ ...range, [side]: stored })}
          inputClasses={inputClasses}
          inputStyle={inputStyle}
          inputMode={display.decimals > 0 ? "decimal" : "numeric"}
        />
      ))}
    </div>
  );
}

interface HeightBoundProps {
  /** The feet input's id, in place of its own */
  id?: string | undefined;
  side: RangeSide;
  metric: string;
  onWrite: (metric: string) => void;
  inputClasses: string;
  inputStyle: CSSProperties;
}

/** One height bound: feet and inches inputs over one whole-cm bound */
function HeightBound({
  id,
  side,
  metric,
  onWrite,
  inputClasses,
  inputStyle,
}: HeightBoundProps) {
  const word = side === "min" ? "Minimum" : "Maximum";
  // Ids of this editor's own: two height editors on a page never share one
  const own = useId();
  const feetId = id ?? `${own}feet`;
  const inchesId = `${own}inches`;
  const shown = (each: string) => {
    const cm = Number(each);
    return each === "" || !Number.isFinite(cm) ? null : cmToFeetInches(cm);
  };
  const [feet, setFeet] = useState(() => String(shown(metric)?.feet ?? ""));
  const [inches, setInches] = useState(() =>
    String(shown(metric)?.inches ?? "")
  );
  const [seen, setSeen] = useState(metric);
  if (metric !== seen) {
    // Changed from outside: take the state's feet and inches
    setSeen(metric);
    setFeet(String(shown(metric)?.feet ?? ""));
    setInches(String(shown(metric)?.inches ?? ""));
  }

  const write = (nextFeet: string, nextInches: string) => {
    const cm = heightBoundToCm(
      parseInt(nextFeet || "0", 10),
      parseInt(nextInches || "0", 10),
      side
    );
    const written = cm === undefined ? "" : String(cm);
    setFeet(nextFeet);
    setInches(nextInches);
    setSeen(written);
    onWrite(written);
  };

  return (
    <fieldset>
      <legend className="text-xs" style={{ color: "var(--text-muted)" }}>
        {side === "min" ? "Min Height:" : "Max Height:"}
      </legend>
      <div className="flex space-x-2 mt-1">
        <div className="flex-1">
          <label htmlFor={feetId} className="sr-only">
            {word} height feet
          </label>
          <input
            id={feetId}
            type="text"
            inputMode="numeric"
            value={feet}
            onChange={(event) => {
              if (WHOLE.test(event.target.value)) {
                write(event.target.value, inches);
              }
            }}
            placeholder="Feet"
            aria-label={`${word} height in feet`}
            className={inputClasses}
            style={inputStyle}
          />
        </div>
        <div className="flex-1">
          <label htmlFor={inchesId} className="sr-only">
            {word} height inches
          </label>
          <input
            id={inchesId}
            type="text"
            inputMode="numeric"
            value={inches}
            onChange={(event) => {
              if (WHOLE.test(event.target.value)) {
                write(feet, event.target.value);
              }
            }}
            placeholder="Inches"
            aria-label={`${word} height in inches`}
            className={inputClasses}
            style={inputStyle}
          />
        </div>
      </div>
    </fieldset>
  );
}

/** Height in feet and inches: each bound stored as the whole cm that display as typed */
export function ImperialHeightRange({
  id,
  value,
  onChange,
  inputClasses,
  inputStyle,
}: MeasureInputsProps) {
  const range = rangeOf(value);
  return (
    <div className="space-y-2">
      {SIDES.map((side) => (
        <HeightBound
          key={side}
          id={side === "min" ? id : undefined}
          side={side}
          metric={boundText(range[side])}
          onWrite={(metric) => onChange({ ...range, [side]: metric })}
          inputClasses={inputClasses}
          inputStyle={inputStyle}
        />
      ))}
    </div>
  );
}
