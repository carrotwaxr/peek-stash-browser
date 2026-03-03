import toast from "react-hot-toast";
import {
  ErrorMessage,
  InfoMessage,
  SuccessMessage,
  WarningMessage,
} from "../components/ui/index";

/**
 * Toast utility functions for showing notifications
 * Uses react-hot-toast with custom components
 */

type ToastPosition = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

interface ToastOptions {
  duration?: number;
  position?: ToastPosition;
  onRetry?: () => void;
  [key: string]: unknown;
}

interface PromiseMessages {
  loading?: string;
  success?: string;
  error?: string;
}

export const showSuccess = (message: string, options: ToastOptions = {}) => {
  return toast.custom(
    (t) => (
      <SuccessMessage
        message={message}
        mode="toast"
        onClose={() => toast.dismiss(t.id)}
      />
    ),
    {
      duration: options.duration || 3000,
      position: options.position || "bottom-center",
      ...options,
    }
  );
};

export const showError = (error: any, options: ToastOptions = {}) => {
  return toast.custom(
    () => (
      <ErrorMessage
        error={error}
        mode="toast"
        showRetry={false}
        onRetry={options.onRetry}
      />
    ),
    {
      duration: options.duration || 4000,
      position: options.position || "bottom-center",
      ...options,
    }
  );
};

export const showWarning = (message: string, options: ToastOptions = {}) => {
  return toast.custom(
    (t) => (
      <WarningMessage
        message={message}
        mode="toast"
        onClose={() => toast.dismiss(t.id)}
      />
    ),
    {
      duration: options.duration || 3500,
      position: options.position || "bottom-center",
      ...options,
    }
  );
};

const showInfo = (message: string, options: ToastOptions = {}) => {
  return toast.custom(
    (t) => (
      <InfoMessage
        message={message}
        mode="toast"
        onClose={() => toast.dismiss(t.id)}
      />
    ),
    {
      duration: options.duration || 3000,
      position: options.position || "bottom-center",
      ...options,
    }
  );
};

/**
 * Promise-based toast for async operations
 * Example: showPromise(fetchData(), { loading: 'Saving...', success: 'Saved!', error: 'Failed' })
 */
const showPromise = (promise: Promise<any>, messages: PromiseMessages, options: ToastOptions = {}) => {
  return toast.promise(
    promise,
    {
      loading: messages.loading || "Loading...",
      success: messages.success || "Success!",
      error: messages.error || "An error occurred",
    },
    {
      position: options.position || "bottom-center",
      ...options,
    }
  );
};

export default {
  success: showSuccess,
  error: showError,
  warning: showWarning,
  info: showInfo,
  promise: showPromise,
};
