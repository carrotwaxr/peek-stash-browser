import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useOpenTabAndScroll } from "../../hooks/useOpenTabAndScroll";
import DetailCard from "./DetailCard";
import { useDetailTab } from "./detailTabState";

/** One statistic: a label and its value, which may open a tab or a page */
export interface DetailStat {
  label: string;
  /** Nothing (null, undefined or "") hides the statistic */
  value: number | string | null | undefined;
  /** The tab a value above 0 opens */
  tab?: string;
  /** The page a value above 0 opens (the tag's Markers: the Clips list) */
  to?: string;
}

interface StatFieldProps {
  stat: DetailStat;
  activeTab: string;
  onTab: (tab: string) => void;
  onPath: (path: string) => void;
}

const StatField = ({ stat, activeTab, onTab, onPath }: StatFieldProps) => {
  const { label, value, tab, to } = stat;
  if (value === null || value === undefined || value === "") return null;

  const opens = Number(value) > 0 && (tab !== undefined || to !== undefined);
  const isActive = tab !== undefined && tab === activeTab;
  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      {opens ? (
        <button
          type="button"
          onClick={() => {
            if (tab !== undefined) onTab(tab);
            else if (to !== undefined) onPath(to);
          }}
          className="font-medium transition-opacity hover:opacity-70"
          style={{
            color: "var(--accent-primary)",
            cursor: "pointer",
            textDecoration: isActive ? "underline" : "none",
          }}
        >
          {value}
        </button>
      ) : (
        <span
          className="font-medium"
          style={{ color: "var(--accent-primary)" }}
        >
          {value}
        </span>
      )}
    </div>
  );
};

/** A labelled bar out of 100 */
const RatingBar = ({ rating }: { rating: number }) => (
  <div className="mt-6">
    <div className="flex items-center justify-between mb-2">
      <span
        className="text-sm font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        Rating
      </span>
      <span
        className="text-2xl font-bold"
        style={{ color: "var(--accent-primary)" }}
      >
        {rating}/100
      </span>
    </div>
    <div
      className="w-full h-3 rounded-full overflow-hidden"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      <div
        className="h-full rounded-full transition-all duration-200"
        style={{
          width: `${Math.min(rating, 100)}%`,
          backgroundColor: "var(--accent-primary)",
        }}
      />
    </div>
  </div>
);

interface Props {
  stats: readonly DetailStat[];
  /** The viewer's rating (the detail hook's, so a write moves it); a bar above 0 */
  rating?: number | null;
  /** The page's own figures, below the statistics (the performer's O-count rate) */
  children?: ReactNode;
}

/**
 * The Statistics card: each count, the ones with a tab opening it (its
 * list starts again on page 1, and the page scrolls to the tabs), and the
 * viewer's rating as a bar.
 */
const DetailStats = ({ stats, rating, children }: Props) => {
  const navigate = useNavigate();
  const { activeTab, defaultTab } = useDetailTab();
  const openTab = useOpenTabAndScroll(defaultTab);
  const openPath = (path: string) => {
    void navigate(path);
  };

  return (
    <DetailCard title="Statistics">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <StatField
            key={stat.label}
            stat={stat}
            activeTab={activeTab}
            onTab={openTab}
            onPath={openPath}
          />
        ))}
      </div>
      {!!rating && rating > 0 && <RatingBar rating={rating} />}
      {children && <div className="mt-6">{children}</div>}
    </DetailCard>
  );
};

export default DetailStats;
