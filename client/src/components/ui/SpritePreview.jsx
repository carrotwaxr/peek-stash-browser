import { useState, useEffect } from 'react';

/**
 * Display a sprite sheet thumbnail at a specific position
 *
 * @param {string} spriteUrl - URL to the sprite sheet image
 * @param {Object} position - Sprite position { x, y, width, height }
 * @param {number} displayWidth - Width to display the thumbnail (maintains aspect ratio)
 * @param {string} className - Additional CSS classes
 */
const SpritePreview = ({ spriteUrl, position, displayWidth = 160, className = '' }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!spriteUrl) return;

    // Preload the sprite sheet image
    const img = new Image();
    img.onload = () => {
      setImageLoaded(true);
    };
    img.onerror = (e) => {
      console.error('[SpritePreview] Failed to load sprite image:', e);
      setImageError(true);
    };
    img.src = spriteUrl;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [spriteUrl]);

  if (!spriteUrl || !position || imageError) {
    return null;
  }

  // Calculate display height maintaining aspect ratio
  const aspectRatio = position.height / position.width;
  const displayHeight = displayWidth * aspectRatio;

  return (
    <div
      className={`sprite-preview ${className}`}
      style={{
        width: `${displayWidth}px`,
        height: `${displayHeight}px`,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: imageLoaded ? 'transparent' : '#1f2937',
      }}
    >
      {imageLoaded ? (
        <img
          src={spriteUrl}
          alt="Sprite preview"
          style={{
            position: 'absolute',
            left: `-${position.x}px`,
            top: `-${position.y}px`,
            maxWidth: 'none',
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className="animate-pulse w-8 h-8 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
};

export default SpritePreview;
