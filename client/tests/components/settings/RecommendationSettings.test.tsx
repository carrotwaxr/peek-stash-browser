/**
 * RecommendationSettings: each change saves the full preferences object
 * at once, a failure shows an error toast, and a save refreshes what the
 * preferences shape (Recommended, My Stats).
 */
import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  type RecommendationPreferences,
} from "@peek/shared-types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { within as rtlWithin } from "@testing-library/react";
import { SignedInWithQuery } from "@tests/helpers/SignedInWithQuery";
import { userSettingsResponse } from "@tests/helpers/userSettings";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/api";
import { invalidateExclusionDependents } from "@/api/invalidateExclusionDependents";
import RecommendationSettings from "@/components/settings/RecommendationSettings";
import { showError } from "@/utils/toast";

const { mockApiGet, mockApiPut } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPut: vi.fn(),
}));

vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  apiGet: mockApiGet,
  apiPut: mockApiPut,
}));

vi.mock("@/api/invalidateExclusionDependents", () => ({
  invalidateExclusionDependents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

// The picker's own behavior is tested with it; here it reports a pick
vi.mock("@/components/ui/SearchableSelect", () => ({
  default: ({
    value,
    onChange,
    label,
  }: {
    value: string[];
    onChange: (ids: string[]) => void;
    label?: string;
  }) => (
    <div>
      <span data-testid="picked">{value.join(",")}</span>
      <button type="button" onClick={() => onChange([...value, "7:a"])}>
        Pick a tag for {label}
      </button>
    </div>
  ),
}));

const prefs = (
  overrides: Partial<RecommendationPreferences> = {}
): RecommendationPreferences => ({
  ...DEFAULT_RECOMMENDATION_PREFERENCES,
  ...overrides,
});

const renderSection = async (
  stored: Partial<RecommendationPreferences> = {}
) => {
  mockApiGet.mockResolvedValue(
    userSettingsResponse({ recommendationPreferences: prefs(stored) })
  );
  render(
    <SignedInWithQuery>
      <RecommendationSettings />
    </SignedInWithQuery>
  );
  await screen.findByRole("group", { name: "Performers I follow" });
};

const follow = (name: string) =>
  within("Performers I follow").getByRole<HTMLInputElement>("checkbox", {
    name,
  });
const partner = (name: string) =>
  within("Partners who matter").getByRole<HTMLInputElement>("checkbox", {
    name,
  });

function within(group: string) {
  return rtlWithin(screen.getByRole("group", { name: group }));
}

/** The nth PUT's recommendationPreferences */
const sent = (n = 0) =>
  (mockApiPut.mock.calls[n]?.[1] as { recommendationPreferences: unknown })
    .recommendationPreferences;

describe("RecommendationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiPut.mockResolvedValue({ success: true });
  });

  it("shows the stored preferences", async () => {
    await renderSection({
      leadGenders: ["FEMALE"],
      partnerGenders: ["MALE"],
      noPartnerScenes: "less",
      discovery: "new",
      ignoredTagIds: ["3:a"],
    });

    expect(follow("Female")).toBeChecked();
    expect(follow("Male")).not.toBeChecked();
    expect(partner("Male")).toBeChecked();
    expect(screen.getByLabelText("Scenes without a partner")).toHaveValue(
      "less"
    );
    expect(screen.getByLabelText("Recommend")).toHaveValue("new");
    expect(screen.getByTestId("picked")).toHaveTextContent("3:a");
  });

  it("ticking Male under partners saves the full object with it", async () => {
    await renderSection({ leadGenders: ["FEMALE"] });

    fireEvent.click(partner("Male"));

    await waitFor(() => expect(mockApiPut).toHaveBeenCalledTimes(1));
    expect(mockApiPut.mock.calls[0]?.[0]).toBe("/user/settings");
    expect(sent()).toEqual(
      prefs({ leadGenders: ["FEMALE"], partnerGenders: ["MALE"] })
    );
    await waitFor(() =>
      expect(invalidateExclusionDependents).toHaveBeenCalled()
    );
  });

  it("disables a followed gender under partners", async () => {
    await renderSection({ leadGenders: ["FEMALE"] });

    expect(partner("Female")).toBeDisabled();
    expect(partner("Male")).toBeEnabled();
  });

  it("disables the partner choices while no gender is followed", async () => {
    await renderSection();

    expect(partner("Male")).toBeDisabled();
    expect(screen.getByLabelText("Scenes without a partner")).toBeDisabled();
  });

  it("enables 'Scenes without a partner' once a partner gender is ticked", async () => {
    await renderSection({ leadGenders: ["FEMALE"], partnerGenders: ["MALE"] });

    expect(screen.getByLabelText("Scenes without a partner")).toBeEnabled();
  });

  it("following a gender that was a partner moves it", async () => {
    await renderSection({ leadGenders: ["FEMALE"], partnerGenders: ["MALE"] });

    fireEvent.click(follow("Male"));

    await waitFor(() => expect(mockApiPut).toHaveBeenCalled());
    expect(sent()).toEqual(
      prefs({ leadGenders: ["FEMALE", "MALE"], partnerGenders: [] })
    );
  });

  it("unticking the last followed gender clears the partners", async () => {
    await renderSection({
      leadGenders: ["FEMALE"],
      partnerGenders: ["MALE"],
      noPartnerScenes: "less",
    });

    fireEvent.click(follow("Female"));

    await waitFor(() => expect(mockApiPut).toHaveBeenCalled());
    expect(sent()).toEqual(
      prefs({
        leadGenders: [],
        partnerGenders: [],
        noPartnerScenes: "less",
      })
    );
  });

  it("saves the discovery choice and the no-partner choice", async () => {
    await renderSection({ leadGenders: ["FEMALE"], partnerGenders: ["MALE"] });

    fireEvent.change(screen.getByLabelText("Recommend"), {
      target: { value: "rewatch" },
    });
    await waitFor(() => expect(mockApiPut).toHaveBeenCalledTimes(1));
    expect(sent(0)).toEqual(
      prefs({
        leadGenders: ["FEMALE"],
        partnerGenders: ["MALE"],
        discovery: "rewatch",
      })
    );

    fireEvent.change(screen.getByLabelText("Scenes without a partner"), {
      target: { value: "less" },
    });
    await waitFor(() => expect(mockApiPut).toHaveBeenCalledTimes(2));
    expect(sent(1)).toEqual(
      prefs({
        leadGenders: ["FEMALE"],
        partnerGenders: ["MALE"],
        discovery: "rewatch",
        noPartnerScenes: "less",
      })
    );
  });

  it("saves the ignored tags the picker reports", async () => {
    await renderSection({ ignoredTagIds: ["3:a"] });

    fireEvent.click(screen.getByRole("button", { name: /Pick a tag/ }));

    await waitFor(() => expect(mockApiPut).toHaveBeenCalled());
    expect(sent()).toEqual(prefs({ ignoredTagIds: ["3:a", "7:a"] }));
  });

  it("a refused save shows an error toast and does not refresh Recommended", async () => {
    mockApiPut.mockRejectedValue(new api.ApiError("Database busy", 503));
    await renderSection({ leadGenders: ["FEMALE"] });

    fireEvent.click(partner("Male"));

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith("Database busy")
    );
    expect(invalidateExclusionDependents).not.toHaveBeenCalled();
  });
});
