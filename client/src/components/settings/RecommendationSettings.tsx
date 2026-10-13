import { useId, useRef } from "react";
import {
  type GetUserSettingsResponse,
  PERFORMER_GENDERS,
  type PerformerGender,
  type RecommendationPreferences,
} from "@peek/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import { getErrorMessage } from "../../api";
import {
  useUpdateUserSettings,
  useUserSettings,
} from "../../api/hooks/useUserSettings";
import { invalidateExclusionDependents } from "../../api/invalidateExclusionDependents";
import { queryKeys } from "../../api/queryKeys";
import { showError } from "../../utils/toast";
import SearchableSelect from "../ui/SearchableSelect";

const GENDER_LABELS: Record<PerformerGender, string> = {
  FEMALE: "Female",
  MALE: "Male",
  TRANSGENDER_FEMALE: "Trans female",
  TRANSGENDER_MALE: "Trans male",
  INTERSEX: "Intersex",
  NON_BINARY: "Non-binary",
};

const NO_PARTNER_OPTIONS: {
  id: RecommendationPreferences["noPartnerScenes"];
  label: string;
}[] = [
  { id: "normal", label: "Show normally" },
  {
    id: "less",
    label: "Show less often, unless every performer is a favorite",
  },
];

const DISCOVERY_OPTIONS: {
  id: RecommendationPreferences["discovery"];
  label: string;
}[] = [
  { id: "new", label: "Mostly new scenes" },
  { id: "balanced", label: "A balance" },
  { id: "rewatch", label: "Favorites again" },
];

const fieldStyle = {
  backgroundColor: "var(--bg-secondary)",
  border: "1px solid var(--border-color)",
  color: "var(--text-primary)",
} as const;

interface GenderGroupProps {
  legend: string;
  help: string;
  selected: readonly PerformerGender[];
  /** Genders that cannot be ticked here (ticked in the other list) */
  taken?: readonly PerformerGender[];
  /** Nothing can be ticked */
  disabled?: boolean;
  onToggle: (gender: PerformerGender, checked: boolean) => void;
}

const GenderGroup = ({
  legend,
  help,
  selected,
  taken = [],
  disabled = false,
  onToggle,
}: GenderGroupProps) => {
  const helpId = useId();
  return (
    <fieldset aria-describedby={helpId}>
      <legend
        className="text-sm font-medium mb-1"
        style={{ color: "var(--text-secondary)" }}
      >
        {legend}
      </legend>
      <p
        id={helpId}
        className="text-sm mb-2"
        style={{ color: "var(--text-muted)" }}
      >
        {help}
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {PERFORMER_GENDERS.map((gender) => (
          <label
            key={gender}
            className={`flex items-center gap-2 ${
              disabled || taken.includes(gender)
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer"
            }`}
            style={{ color: "var(--text-primary)" }}
          >
            <input
              type="checkbox"
              checked={selected.includes(gender)}
              disabled={disabled || taken.includes(gender)}
              onChange={(e) => onToggle(gender, e.target.checked)}
              className="w-4 h-4 rounded"
              style={{ accentColor: "var(--accent-primary)" }}
            />
            {GENDER_LABELS[gender]}
          </label>
        ))}
      </div>
    </fieldset>
  );
};

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  disabled?: boolean;
  help?: string;
  onChange: (value: T) => void;
}

function SelectField<T extends string>({
  label,
  value,
  options,
  disabled = false,
  help,
  onChange,
}: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium mb-2"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full px-4 py-2 rounded-lg disabled:opacity-50"
        style={fieldStyle}
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
      {help && (
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          {help}
        </p>
      )}
    </div>
  );
}

type Change = (
  current: RecommendationPreferences
) => Partial<RecommendationPreferences>;

/**
 * How Recommended, Scenes Like This and My Stats are tuned for this user.
 * Every change saves the whole preferences object (the server takes no
 * partial one), then refreshes what the preferences shape. Saves go one at
 * a time, each built from the cached preferences when its turn comes, so
 * two quick changes both land and a slower first save cannot overwrite the
 * second.
 */
const RecommendationSettings = () => {
  const queryClient = useQueryClient();
  const { data } = useUserSettings();
  const save = useUpdateUserSettings();
  const tagsId = useId();
  /** The last save queued: the next one starts once it settles */
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  // The tab holds back its sections until the settings load; a save before
  // then would replace the stored preferences with defaults
  const prefs = data?.settings.recommendationPreferences;
  if (!prefs) return null;
  const { leadGenders, partnerGenders } = prefs;

  const update = async (change: Change) => {
    const saved = queue.current.then(async () => {
      // The cache holds every earlier save (each patches it as it starts)
      const latest = queryClient.getQueryData<GetUserSettingsResponse>(
        queryKeys.user.settings()
      )?.settings.recommendationPreferences;
      if (!latest) return false;
      try {
        await save.mutateAsync({
          recommendationPreferences: { ...latest, ...change(latest) },
        });
        return true;
      } catch (err) {
        showError(
          getErrorMessage(err, "Failed to save recommendation settings")
        );
        return false;
      }
    });
    queue.current = saved;
    if (await saved) await invalidateExclusionDependents(queryClient);
  };

  const toggleLead = (gender: PerformerGender, checked: boolean) => {
    void update((current) => {
      const next = checked
        ? [...current.leadGenders, gender]
        : current.leadGenders.filter((g) => g !== gender);
      // A partner needs a followed performer, and a gender is only one of them
      return {
        leadGenders: next,
        partnerGenders:
          next.length === 0
            ? []
            : current.partnerGenders.filter((g) => g !== gender),
      };
    });
  };

  const togglePartner = (gender: PerformerGender, checked: boolean) => {
    void update((current) => ({
      partnerGenders: checked
        ? [...current.partnerGenders, gender]
        : current.partnerGenders.filter((g) => g !== gender),
    }));
  };

  return (
    <div>
      <h3
        className="text-lg font-semibold mb-4"
        style={{ color: "var(--text-primary)" }}
      >
        Recommendations
      </h3>
      <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
        Tune what Recommended and Scenes Like This favor. My Stats follows the
        performer choices too.
      </p>

      <div className="space-y-5">
        <GenderGroup
          legend="Performers I follow"
          help="Leave all unticked to treat everyone alike."
          selected={leadGenders}
          onToggle={toggleLead}
        />
        <GenderGroup
          legend="Partners who matter"
          help="Their presence makes a scene better or worse for you, rather than counting as someone you follow."
          selected={partnerGenders}
          taken={leadGenders}
          disabled={leadGenders.length === 0}
          onToggle={togglePartner}
        />
        <SelectField
          label="Scenes without a partner"
          value={prefs.noPartnerScenes}
          options={NO_PARTNER_OPTIONS}
          disabled={partnerGenders.length === 0}
          onChange={(noPartnerScenes) =>
            void update(() => ({ noPartnerScenes }))
          }
        />
        <SelectField
          label="Recommend"
          value={prefs.discovery}
          options={DISCOVERY_OPTIONS}
          onChange={(discovery) => void update(() => ({ discovery }))}
        />
        <div>
          <label
            htmlFor={tagsId}
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Tags that aren&apos;t about taste
          </label>
          <SearchableSelect
            id={tagsId}
            label="Tags that aren't about taste"
            entityType="tags"
            multi
            value={prefs.ignoredTagIds}
            onChange={(ids) =>
              void update(() => ({
                ignoredTagIds: Array.isArray(ids) ? ids : ids ? [ids] : [],
              }))
            }
            placeholder="Pick tags to ignore..."
          />
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Technical or bookkeeping tags, such as resolution or upscaled.
            Recommended and My Stats ignore them.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RecommendationSettings;
