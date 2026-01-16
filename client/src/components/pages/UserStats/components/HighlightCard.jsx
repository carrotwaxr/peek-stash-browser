// client/src/components/pages/UserStats/components/HighlightCard.jsx

import { Link } from "react-router-dom";
import { Paper } from "../../../ui/index.js";

/**
 * Feature card for highlight stats (most watched, etc.)
 */
const HighlightCard = ({ title, item, linkPrefix, statLabel, statValue }) => {
  if (!item) {
    return null;
  }

  const displayName = item.name || item.title || "Unknown";

  return (
    <Paper padding="none" className="overflow-hidden">
      <div
        className="px-4 py-2 border-b"
        style={{ borderColor: "var(--border-color)" }}
      >
        <h3
          className="text-sm font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          {title}
        </h3>
      </div>
      <Link
        to={`${linkPrefix}/${item.id}`}
        className="block hover:bg-[var(--bg-secondary)] transition-colors"
      >
        <div className="aspect-video relative overflow-hidden">
          {item.imageUrl ? (
            <img
              src={`/api/proxy/stash?url=${encodeURIComponent(item.imageUrl)}`}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ backgroundColor: "var(--bg-secondary)" }}
            >
              <span style={{ color: "var(--text-muted)" }}>No image</span>
            </div>
          )}
        </div>
        <div className="p-3">
          <div
            className="font-medium truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {displayName}
          </div>
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            {statValue.toLocaleString()} {statLabel}
          </div>
        </div>
      </Link>
    </Paper>
  );
};

export default HighlightCard;
