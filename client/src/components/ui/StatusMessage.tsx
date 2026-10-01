import type { ReactNode } from "react";
import Button from "./Button";

type Variant = "error" | "warning" | "success" | "info";

interface Props {
  variant: Variant;
  /** Shown bold before the message; defaults to the variant's name, null hides it */
  title?: string | null;
  /** The text, or an Error whose message is shown; nothing renders without it */
  message?: ReactNode | Error;
  /** Rich content in place of `message` */
  children?: ReactNode;
  /** Shows a close button (a toast passes one that dismisses it) */
  onClose?: () => void;
  /** Shows a Retry button (error variant, inline only) */
  onRetry?: () => void;
  mode?: "inline" | "toast";
  className?: string;
}

const DEFAULT_TITLES: Record<Variant, string> = {
  error: "Error",
  warning: "Warning",
  success: "Success",
  info: "Info",
};

const ICON_PATHS: Record<Variant, string> = {
  error:
    "M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z",
  warning:
    "M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z",
  success:
    "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z",
  info: "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z",
};

/**
 * The one banner and toast body for errors, warnings, successes and notes.
 * Inline mode is a card edged in the theme's status colour; toast mode uses
 * the theme's toast colours. An error is announced as an alert, the others
 * politely as a status.
 */
const StatusMessage = ({
  variant,
  title,
  message,
  children,
  onClose,
  onRetry,
  mode = "inline",
  className = "",
}: Props) => {
  const text = message instanceof Error ? message.message : message;
  const content = children ?? text;
  if (content === null || content === undefined || content === "") {
    return null;
  }

  const heading = title === undefined ? DEFAULT_TITLES[variant] : title;
  const isToast = mode === "toast";

  const containerStyle = isToast
    ? {
        backgroundColor: `var(--toast-${variant}-bg)`,
        borderWidth: "2px",
        borderStyle: "solid",
        borderColor: `var(--toast-${variant}-border)`,
        color: "white",
        boxShadow: `0 10px 25px -5px var(--toast-${variant}-shadow), 0 8px 10px -6px var(--toast-${variant}-shadow)`,
      }
    : {
        backgroundColor: "var(--bg-card)",
        borderColor: `var(--status-${variant})`,
        color: "var(--text-primary)",
      };

  return (
    <div
      className={`px-4 py-3 rounded-lg ${isToast ? "" : "border"} ${className}`}
      style={containerStyle}
      role={variant === "error" ? "alert" : "status"}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2 flex-1">
          <svg
            aria-hidden="true"
            className="w-5 h-5 flex-shrink-0 mt-0.5"
            style={{ color: isToast ? "white" : `var(--status-${variant})` }}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d={ICON_PATHS[variant]}
              clipRule="evenodd"
            />
          </svg>
          <div className="min-w-0">
            {!isToast && heading && (
              <strong
                className="font-semibold"
                style={{ color: `var(--status-${variant})` }}
              >
                {heading}:{" "}
              </strong>
            )}
            <div className="block sm:inline">{content}</div>
          </div>
        </div>
        {variant === "error" && onRetry && (
          <Button
            onClick={onRetry}
            variant="destructive"
            size="sm"
            className="ml-2 flex-shrink-0"
          >
            Retry
          </Button>
        )}
        {onClose && (
          <Button
            onClick={onClose}
            variant="tertiary"
            className="ml-2 hover:opacity-70 !p-0 !border-0 flex-shrink-0"
            style={{
              color: isToast ? "rgba(255, 255, 255, 0.8)" : "var(--text-muted)",
            }}
            aria-label="Close"
            icon={
              <svg
                aria-hidden="true"
                className="w-4 h-4"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            }
          />
        )}
      </div>
    </div>
  );
};

export default StatusMessage;
