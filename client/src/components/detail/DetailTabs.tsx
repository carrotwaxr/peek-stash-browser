import RelationCountsError from "../ui/RelationCountsError";
import TabNavigation, { TAB_COUNT_LOADING } from "../ui/TabNavigation";
import {
  type DetailCounts,
  type DetailTabSpec,
  useDetailTabState,
} from "./detailTabState";

interface Props {
  tabs: readonly DetailTabSpec[];
  /** The page's `useRelationCounts` result */
  counts: DetailCounts;
  /** The tab that opens when no tab has content ("scenes", the gallery's "images") */
  fallbackTab: string;
  /** What the page says once every count is 0 */
  emptyText: string;
}

/**
 * A detail page's tabs and the open tab's content. Until the counts answer,
 * every tab shows without a badge and none opens unless the URL names it;
 * then the first tab with content opens, a tab with none is not offered,
 * and a page with no content at all says so. A counts error shows under
 * the tabs with Retry.
 */
const DetailTabs = ({ tabs, counts, fallbackTab, emptyText }: Props) => {
  const { activeTab, defaultTab } = useDetailTabState(
    tabs,
    counts,
    fallbackTab
  );
  const answered = counts.data !== undefined;

  if (answered && tabs.every((tab) => tab.count === 0)) {
    return (
      <div className="py-16 text-center" style={{ color: "var(--text-muted)" }}>
        {emptyText}
      </div>
    );
  }

  const open = tabs.find((tab) => tab.id === activeTab);
  return (
    <>
      <TabNavigation
        tabs={tabs.map(({ id, label, count }) => ({
          id,
          label,
          count: count ?? TAB_COUNT_LOADING,
        }))}
        defaultTab={defaultTab}
      />
      <RelationCountsError
        error={answered ? null : counts.error}
        onRetry={() => void counts.refetch()}
      />
      {open?.render()}
    </>
  );
};

export default DetailTabs;
