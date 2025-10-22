/**
 * Reusable entity image component for Studios and Tags
 * Displays a rectangular image with fallback
 */
const EntityImage = ({ imagePath, name, fallbackIcon, fallbackBg = "var(--bg-secondary)", fallbackColor = "var(--text-primary)" }) => {
  if (imagePath) {
    return (
      <div
        className="w-24 h-16 rounded flex items-center justify-center flex-shrink-0 overflow-hidden p-1"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        <img
          src={imagePath}
          alt={name}
          className="max-w-full max-h-full object-contain rounded"
        />
      </div>
    );
  }

  return (
    <div
      className="w-24 h-16 rounded flex items-center justify-center flex-shrink-0"
      style={{
        backgroundColor: fallbackBg,
        color: fallbackColor,
      }}
    >
      {fallbackIcon}
    </div>
  );
};

export default EntityImage;
