import { useState } from "react";
import { getSiteInfo, getDomainFromUrl } from "../../utils/siteInfo.js";

/**
 * External link component with site icon/favicon
 * Shows site-specific icons for known sites, attempts favicon for unknown sites
 */
const SectionLink = ({ url }) => {
  const [faviconError, setFaviconError] = useState(false);

  if (!url) return null;

  const { name, icon: Icon, color, useFavicon } = getSiteInfo(url);
  const domain = getDomainFromUrl(url);
  const faviconUrl = domain ? `${domain}/favicon.ico` : null;

  // Show favicon for unknown sites, fall back to icon if favicon fails
  const showFavicon = useFavicon && faviconUrl && !faviconError;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:opacity-80"
      style={{
        backgroundColor: "var(--bg-secondary)",
        color: "var(--text-primary)",
        border: "1px solid var(--border-color)",
      }}
    >
      {showFavicon ? (
        <img
          src={faviconUrl}
          alt=""
          width={16}
          height={16}
          onError={() => setFaviconError(true)}
          style={{ borderRadius: 2 }}
        />
      ) : (
        <Icon size={16} style={{ color }} />
      )}
      <span>{name}</span>
    </a>
  );
};

export default SectionLink;
