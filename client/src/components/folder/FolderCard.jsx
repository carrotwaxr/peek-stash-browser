// client/src/components/folder/FolderCard.jsx
import { Folder } from "lucide-react";
import { ENTITY_ICONS } from "../../constants/entityIcons.js";
import { UNTAGGED_FOLDER_ID } from "../../utils/buildFolderTree.js";

/**
 * Card component for displaying a folder (tag) in folder view.
 * Shows thumbnail and folder name.
 */
const FolderCard = ({ folder, onClick, className = "" }) => {
  const { name, thumbnail, id } = folder;
  const isUntagged = id === UNTAGGED_FOLDER_ID;

  return (
    <button
      type="button"
      onClick={() => onClick(folder)}
      className={`group relative rounded-lg overflow-hidden transition-all hover:ring-2 hover:ring-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] ${className}`}
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {/* Thumbnail area */}
      <div className="aspect-video relative overflow-hidden">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={name}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            {isUntagged ? (
              <ENTITY_ICONS.tag size={48} style={{ color: "var(--text-tertiary)" }} />
            ) : (
              <Folder size={48} style={{ color: "var(--text-tertiary)" }} />
            )}
          </div>
        )}

        {/* Folder overlay icon */}
        <div
          className="absolute bottom-2 right-2 p-1.5 rounded-md"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <Folder size={16} className="text-white" />
        </div>
      </div>

      {/* Label area */}
      <div className="p-3">
        <h3
          className="font-medium truncate text-left"
          style={{ color: "var(--text-primary)" }}
        >
          {name}
        </h3>
      </div>
    </button>
  );
};

export default FolderCard;
