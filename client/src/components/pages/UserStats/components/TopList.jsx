// client/src/components/pages/UserStats/components/TopList.jsx

import { Link } from "react-router-dom";
import { Paper } from "../../../ui/index.js";

/**
 * Ranked list of top items
 */
const TopList = ({ title, items, linkPrefix, showImage = true }) => {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <Paper padding="none">
      <div
        className="px-4 py-3 border-b"
        style={{ borderColor: "var(--border-color)" }}
      >
        <h3
          className="font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h3>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--border-color)" }}>
        {items.map((item, index) => (
          <Link
            key={item.id}
            to={`${linkPrefix}/${item.id}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-secondary)]"
          >
            <span
              className="w-6 text-center font-bold"
              style={{ color: "var(--text-muted)" }}
            >
              {index + 1}
            </span>
            {showImage && (
              <div
                className="w-10 h-10 rounded overflow-hidden flex-shrink-0"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                {item.imageUrl ? (
                  <img
                    src={`/api/proxy/stash?url=${encodeURIComponent(item.imageUrl)}`}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs">
                    ?
                  </div>
                )}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div
                className="font-medium truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {item.name}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {item.playCount} plays • {item.oCount} Os
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Paper>
  );
};

export default TopList;
