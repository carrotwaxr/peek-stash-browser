import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import Button from "../ui/Button.jsx";

/**
 * Format seconds to HH:MM:SS or MM:SS
 */
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

/**
 * Dialog for prompting user to resume from saved position or start from beginning
 */
const ResumeWatchDialog = ({ isOpen, onResume, onStartFromBeginning, resumeTime }) => {
  // Focus trap to keep keyboard navigation within modal
  const dialogRef = useFocusTrap(isOpen, () => {
    // Default action on Escape: start from beginning
    onStartFromBeginning();
  });

  if (!isOpen) return null;

  const formattedTime = formatTime(resumeTime);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
      onClick={onStartFromBeginning}
    >
      <div
        ref={dialogRef}
        className="rounded-lg shadow-lg max-w-md w-full m-4"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-color)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-dialog-title"
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b"
          style={{ borderColor: "var(--border-color)" }}
        >
          <h3
            id="resume-dialog-title"
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Continue Watching?
          </h3>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <p style={{ color: "var(--text-secondary)" }}>
            You previously stopped at <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{formattedTime}</span>.
          </p>
          <p className="mt-2" style={{ color: "var(--text-secondary)" }}>
            Would you like to resume from where you left off?
          </p>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 border-t flex justify-end gap-3"
          style={{ borderColor: "var(--border-color)" }}
        >
          <Button
            onClick={onStartFromBeginning}
            variant="secondary"
          >
            Start from Beginning
          </Button>
          <Button
            onClick={onResume}
            variant="primary"
            autoFocus
          >
            Resume
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ResumeWatchDialog;
