import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { DetailType } from "../../api/library";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext";
import { useNavigationState } from "../../hooks/useNavigationState";
import { usePageTitle } from "../../hooks/usePageTitle";
import Button from "../ui/Button";
import DetailCard from "./DetailCard";
import DetailHeader from "./DetailHeader";
import DetailTabs from "./DetailTabs";
import type { FoundEntityDetail } from "./EntityDetailPage";
import IncludeSubToggle, {
  type IncludeSubToggleProps,
} from "./IncludeSubToggle";
import {
  type DetailCounts,
  DetailTabContext,
  type DetailTabSpec,
  useDetailTabState,
} from "./detailTabState";

/** The hero column's width beside the aside on wide screens */
const HERO_WIDTHS = {
  quarter: "lg:w-1/4",
  third: "lg:w-1/3",
  twoFifths: "lg:w-2/5",
} as const;

export interface EntityDetailLayoutProps<T extends DetailType> {
  type: T;
  detail: FoundEntityDetail<T>;
  /** The name, with any fallback; also the page's title */
  title: string;
  /** Beside the name (the performer's gender icon) */
  titleExtras?: ReactNode;
  /** Under the name (aliases, the gallery's meta line) */
  subtitle?: ReactNode;
  /** Beside the header (the gallery's Play Slideshow) */
  actions?: ReactNode;
  /** The main image (`EntityHeroImage`, the collection's cover flipper) */
  hero?: ReactNode;
  heroWidth?: keyof typeof HERO_WIDTHS;
  /** Beside the hero, above the description (the performer's attributes) */
  aside?: ReactNode;
  /**
   * The entity's text, shown once, beside the hero, while the viewer's
   * display settings show descriptions on detail pages
   */
  description?: ReactNode;
  /** The description card's title */
  descriptionTitle?: string;
  /** Full-width cards under the hero (`DetailStats` and the page's own) */
  sections?: ReactNode;
  /** Include sub-tags or sub-studios, on the tabs that take it */
  subToggle?: IncludeSubToggleProps;
  tabs: readonly DetailTabSpec[];
  /** The page's `useRelationCounts` result */
  counts: DetailCounts;
  /** The tab that opens when no tab has content */
  fallbackTab: string;
  /** What the page says once every count is 0 */
  emptyText: string;
}

/**
 * The shared shape of a detail page: Back, the header with the viewer's
 * rating and favorite (written through the detail hook), the hero beside
 * the aside and description, the sections, then the tabs with the Include
 * sub-* toggle on the tabs that take it.
 */
const EntityDetailLayout = <T extends DetailType>({
  type,
  detail,
  title,
  titleExtras,
  subtitle,
  actions,
  hero,
  heroWidth = "third",
  aside,
  description,
  descriptionTitle = "Details",
  sections,
  subToggle,
  tabs,
  counts,
  fallbackTab,
  emptyText,
}: EntityDetailLayoutProps<T>) => {
  const { goBack, backButtonText } = useNavigationState();
  const { getSettings } = useCardDisplaySettings();
  const tabState = useDetailTabState(tabs, counts, fallbackTab);
  usePageTitle(title);

  const showDescription =
    !!description && !!getSettings(type).showDescriptionOnDetail;
  const hasAsideColumn = Boolean(aside) || showDescription;
  const hasHeroRow = Boolean(hero) || hasAsideColumn;
  const openTakesToggle =
    tabs.find((tab) => tab.id === tabState.activeTab)?.takesSubToggle === true;

  return (
    <div className="min-h-screen px-4 lg:px-6 xl:px-8">
      <div className="max-w-none">
        <div className="mt-6 mb-6">
          <Button
            onClick={goBack}
            variant="secondary"
            icon={<ArrowLeft size={16} className="sm:w-4 sm:h-4" />}
            title={backButtonText}
            aria-label={backButtonText}
          >
            <span className="hidden sm:inline">{backButtonText}</span>
          </Button>
        </div>

        <DetailHeader
          type={type}
          title={title}
          titleExtras={titleExtras}
          subtitle={subtitle}
          actions={actions}
          stashUrl={detail.entity.stashUrl}
          rating={detail.rating}
          favorite={detail.favorite}
          onRatingChange={detail.setRating}
          onFavoriteChange={detail.setFavorite}
        />

        <DetailTabContext.Provider value={tabState}>
          {hasHeroRow && (
            <div className="flex flex-col lg:flex-row gap-6 mb-8">
              {hero && (
                <div
                  className={`w-full ${HERO_WIDTHS[heroWidth]} flex-shrink-0`}
                >
                  {hero}
                </div>
              )}
              {hasAsideColumn && (
                <div className="flex-1 min-w-0 space-y-6 lg:overflow-y-auto lg:max-h-[80vh]">
                  {aside}
                  {showDescription && (
                    <DetailCard title={descriptionTitle}>
                      <p
                        className="text-sm whitespace-pre-wrap"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {description}
                      </p>
                    </DetailCard>
                  )}
                </div>
              )}
            </div>
          )}

          {sections && <div className="space-y-6 mb-8">{sections}</div>}

          <div className="mt-8">
            {subToggle && openTakesToggle && (
              <IncludeSubToggle {...subToggle} />
            )}
            <DetailTabs
              tabs={tabs}
              counts={counts}
              fallbackTab={fallbackTab}
              emptyText={emptyText}
            />
          </div>
        </DetailTabContext.Provider>
      </div>
    </div>
  );
};

export default EntityDetailLayout;
