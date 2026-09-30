// client/src/components/folder/FolderCard.jsx
import { Folder } from "lucide-react";
import { ENTITY_ICONS } from "../../constants/entityIcons";
import { UNTAGGED_FOLDER_ID } from "../../utils/buildFolderTree";

interface FolderData {
  id: string;
  name: string;
  thumbnail?: string | null;
  /** The items of the page's type that carry the folder's tag itself */
  count?: number;
}

interface Props {
  folder: FolderData;
  onClick: (folder: FolderData) => void;
  /** The count in words ("3 galleries"); no badge without it */
  countLabel?: (count: number) => string;
  className?: string;
}

/**
 * Card component for displaying a folder (tag) in folder view.
 * Shows thumbnail, folder name and its item count.
 */
const FolderCard = ({ folder, onClick, countLabel, className = "" }: Props) => {
  const { name, thumbnail, id, count } = folder;
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
              <ENTITY_ICONS.tag
                size={48}
                style={{ color: "var(--text-tertiary)" }}
              />
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
      <div className="p-3 flex items-center gap-2">
        <h3
          className="font-medium truncate text-left flex-1 min-w-0"
          style={{ color: "var(--text-primary)" }}
        >
          {name}
        </h3>
        {countLabel !== undefined && count !== undefined && (
          <span
            aria-label={countLabel(count)}
            title={`${countLabel(count)} directly in this folder`}
            className="flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
            }}
          >
            {count}
          </span>
        )}
      </div>
    </button>
  );
};

export default FolderCard;
