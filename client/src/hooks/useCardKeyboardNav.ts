import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Hook for card keyboard navigation (TV mode support)
 * @param {Object} options
 * @param {string} options.linkTo - Navigation URL
 * @param {Function} options.onCustomAction - Optional override action
 * @returns {Object} - { onKeyDown }
 */
export const useCardKeyboardNav = ({ linkTo, onCustomAction }) => {
  const navigate = useNavigate();

  const onKeyDown = useCallback(
    (e) => {
      // Only handle if card (or child) is focused
      if (
        e.currentTarget !== document.activeElement &&
        !e.currentTarget.contains(document.activeElement)
      ) {
        return;
      }

      // Ignore if in input field
      const target = e.target;
      const isInputField =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      if (isInputField) return;

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();

        if (onCustomAction) {
          onCustomAction();
        } else if (linkTo) {
          navigate(linkTo);
        }
      }
    },
    [linkTo, onCustomAction, navigate]
  );

  return { onKeyDown };
};
