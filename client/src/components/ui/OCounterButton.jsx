import { useState, useEffect } from 'react';
import { apiPost } from '../../services/api.js';

/**
 * Interactive O Counter button component
 * Displays current O counter value and increments on click
 *
 * @param {string} sceneId - Stash scene ID
 * @param {number} initialCount - Initial O counter value
 * @param {Function} onIncrement - Optional callback after successful increment (receives new count)
 * @param {string} className - Optional additional CSS classes
 * @param {boolean} disabled - Whether button is disabled
 */
const OCounterButton = ({
  sceneId,
  initialCount = 0,
  onIncrement,
  className = '',
  disabled = false
}) => {
  const [count, setCount] = useState(initialCount);
  const [isIncrementing, setIsIncrementing] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [error, setError] = useState(null);

  // Sync count when initialCount changes (e.g., from parent callback)
  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  const handleClick = async (e) => {
    // Stop propagation to prevent triggering parent click handlers (like navigating to scene)
    e.preventDefault();
    e.stopPropagation();

    if (disabled || isIncrementing || !sceneId) {
      return;
    }

    try {
      setIsIncrementing(true);
      setError(null);

      const response = await apiPost('/watch-history/increment-o', { sceneId });

      if (response.success) {
        const newCount = response.oCount;
        setCount(newCount);

        // Show visual feedback
        setShowFeedback(true);
        setTimeout(() => setShowFeedback(false), 1000);

        // Call optional callback
        if (onIncrement) {
          onIncrement(newCount);
        }
      }
    } catch (err) {
      console.error('Error incrementing O counter:', err);
      setError('Failed to increment');

      // Clear error after 2 seconds
      setTimeout(() => setError(null), 2000);
    } finally {
      // Keep button disabled for 1 second to prevent double-clicks
      setTimeout(() => setIsIncrementing(false), 1000);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isIncrementing}
      className={`flex items-center gap-1 transition-all ${className}`}
      style={{
        cursor: disabled || isIncrementing ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        position: 'relative',
      }}
      title={error || (isIncrementing ? 'Incrementing...' : 'Click to increment O counter')}
      aria-label={`O counter: ${count}. Click to increment.`}
    >
      <span
        className={`transition-transform ${showFeedback ? 'scale-125' : 'scale-100'}`}
        style={{
          display: 'inline-block',
          transitionDuration: '200ms',
        }}
      >
        💦
      </span>
      <span className={showFeedback ? 'font-bold' : ''}>
        {count}
      </span>

      {/* Visual feedback animation */}
      {showFeedback && (
        <span
          style={{
            position: 'absolute',
            top: '-10px',
            right: '-10px',
            fontSize: '12px',
            fontWeight: 'bold',
            color: 'var(--accent-success)',
            animation: 'fadeOut 1s ease-out',
          }}
        >
          +1
        </span>
      )}

      {/* Error feedback */}
      {error && (
        <span
          style={{
            position: 'absolute',
            bottom: '-20px',
            left: '0',
            fontSize: '10px',
            color: 'var(--accent-error)',
            whiteSpace: 'nowrap',
          }}
        >
          {error}
        </span>
      )}

      {/* CSS for fade out animation */}
      <style>{`
        @keyframes fadeOut {
          0% {
            opacity: 1;
            transform: translateY(0);
          }
          100% {
            opacity: 0;
            transform: translateY(-10px);
          }
        }
      `}</style>
    </button>
  );
};

export default OCounterButton;
