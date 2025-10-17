import toast from 'react-hot-toast';
import SuccessMessage from '../components/ui/SuccessMessage.jsx';
import ErrorMessage from '../components/ui/ErrorMessage.jsx';
import WarningMessage from '../components/ui/WarningMessage.jsx';
import InfoMessage from '../components/ui/InfoMessage.jsx';

/**
 * Toast utility functions for showing notifications
 * Uses react-hot-toast with custom components
 */

export const showSuccess = (message, options = {}) => {
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
      position: options.position || 'bottom-center',
      ...options,
    }
  );
};

export const showError = (error, options = {}) => {
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
      position: options.position || 'bottom-center',
      ...options,
    }
  );
};

export const showWarning = (message, options = {}) => {
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
      position: options.position || 'bottom-center',
      ...options,
    }
  );
};

export const showInfo = (message, options = {}) => {
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
      position: options.position || 'bottom-center',
      ...options,
    }
  );
};

/**
 * Promise-based toast for async operations
 * Example: showPromise(fetchData(), { loading: 'Saving...', success: 'Saved!', error: 'Failed' })
 */
export const showPromise = (promise, messages, options = {}) => {
  return toast.promise(
    promise,
    {
      loading: messages.loading || 'Loading...',
      success: messages.success || 'Success!',
      error: messages.error || 'An error occurred',
    },
    {
      position: options.position || 'bottom-center',
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
