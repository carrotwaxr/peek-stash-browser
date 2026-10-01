/**
 * Module mocks the detail-page tests share: the children that are not the
 * subject (the Scenes tab's `SceneSearch` and the entity grids), each
 * capturing its props so a case can read a tab's lock, and the contexts the
 * pages read, which the detail-page rewrite does not change.
 *
 * `vi.mock` registers only in the test file, so each file names the modules
 * and takes the factories from here:
 *
 *     vi.mock("@/components/grids/index", () =>
 *       import("./detail/detailPageMocks").then((m) => m.gridsModule)
 *     );
 *
 * This file imports nothing from `src/`, so a factory loading it never
 * loads the module it stands in for.
 */
import type { ReactElement } from "react";
import { vi } from "vitest";

export interface GridProps {
  lockedFilters?: Record<string, Record<string, unknown>>;
}
export interface SceneSearchProps {
  permanentFilters?: Record<string, unknown>;
}

const grid = (name: string) =>
  vi.fn<(props: GridProps) => ReactElement>(() => <div data-testid={name} />);

/** The entity grids, by export name; each renders a `data-testid` of its name */
export const grids = {
  GalleryGrid: grid("GalleryGrid"),
  GroupGrid: grid("GroupGrid"),
  PerformerGrid: grid("PerformerGrid"),
  StudioGrid: grid("StudioGrid"),
};
export const gridsModule = grids;

/** The Scenes tab; renders `data-testid="SceneSearch"` */
export const sceneSearch = vi.fn<(props: SceneSearchProps) => ReactElement>(
  () => <div data-testid="SceneSearch" />
);
export const sceneSearchModule = { default: sceneSearch };

/** What `useCardDisplaySettings().getSettings()` answers */
export const cardSettings = { current: {} as Record<string, unknown> };
export const cardDisplaySettingsModule = {
  useCardDisplaySettings: () => ({ getSettings: () => cardSettings.current }),
};

/** What `useConfig()` answers */
export const config = { current: { hasMultipleInstances: true } };
export const configModule = { useConfig: () => config.current };

/** What `useUnitPreference()` answers */
export const unit = { current: "metric" };
export const unitPreferenceModule = {
  useUnitPreference: () => ({ unitPreference: unit.current }),
};
export const navigationStateModule = {
  useNavigationState: () => ({ goBack: vi.fn(), backButtonText: "Back" }),
};
/** The signed-in user `useAuth()` answers (none by default; an admin sees View in Stash) */
export const auth = { current: { user: null as { role: string } | null } };
export const authModule = { useAuth: () => auth.current };
export const pageTitleModule = { usePageTitle: vi.fn() };
export const themeModule = { useTheme: () => ({ theme: undefined }) };

/** Puts the shared state back between cases */
export function resetDetailPageMocks(): void {
  for (const mock of Object.values(grids)) mock.mockClear();
  sceneSearch.mockClear();
  cardSettings.current = {};
  config.current = { hasMultipleInstances: true };
  unit.current = "metric";
  auth.current = { user: null };
}
