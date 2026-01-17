import { useState, useCallback } from "react";
import { useAuth } from "./useAuth.js";
import { apiPost, apiPut, apiDelete, apiGet } from "../services/api.js";
import { showSuccess, showError } from "../utils/toast.jsx";

/**
 * Hook for managing hidden entities
 */
export const useHiddenEntities = () => {
  const { user, updateUser } = useAuth();
  const [isHiding, setIsHiding] = useState(false);

  /**
   * Hide an entity
   * @param {Object} params - Hide parameters
   * @param {string} params.entityType - Type of entity (scene, performer, etc.)
   * @param {string} params.entityId - Entity ID
   * @param {string} params.entityName - Entity name (for display)
   * @param {boolean} params.skipConfirmation - Skip confirmation dialog
   */
  const hideEntity = useCallback(
    async ({ entityType, entityId, entityName, skipConfirmation = false }) => {
      setIsHiding(true);
      try {
        await apiPost("/user/hidden-entities", {
          entityType,
          entityId,
        });

        showSuccess(`${entityName} has been hidden`);

        // If "don't ask again" was checked, update user preference
        if (skipConfirmation && !user?.hideConfirmationDisabled) {
          await apiPut("/user/hide-confirmation", {
            hideConfirmationDisabled: true,
          });
          // Update user context
          updateUser?.({ hideConfirmationDisabled: true });
        }

        return true;
      } catch (error) {
        console.error("Failed to hide entity:", error);
        showError(
          error.data?.error || "Failed to hide entity. Please try again."
        );
        return false;
      } finally {
        setIsHiding(false);
      }
    },
    [user, updateUser]
  );

  /**
   * Hide multiple entities at once
   * @param {Object} params - Hide parameters
   * @param {Array} params.entities - Array of {entityType, entityId} objects
   * @param {boolean} params.skipConfirmation - Skip confirmation dialog
   * @returns {Object} Result with successCount and failCount
   */
  const hideEntities = useCallback(
    async ({ entities, skipConfirmation = false }) => {
      setIsHiding(true);
      try {
        const response = await apiPost("/user/hidden-entities/bulk", {
          entities,
        });

        // If "don't ask again" was checked, update user preference
        if (skipConfirmation && !user?.hideConfirmationDisabled) {
          await apiPut("/user/hide-confirmation", {
            hideConfirmationDisabled: true,
          });
          updateUser?.({ hideConfirmationDisabled: true });
        }

        return {
          success: true,
          successCount: response.successCount,
          failCount: response.failCount,
        };
      } catch (error) {
        console.error("Failed to hide entities:", error);
        return {
          success: false,
          successCount: 0,
          failCount: entities.length,
        };
      } finally {
        setIsHiding(false);
      }
    },
    [user, updateUser]
  );

  /**
   * Unhide (restore) an entity
   */
  const unhideEntity = useCallback(
    async ({ entityType, entityId, entityName }) => {
      try {
        await apiDelete(`/user/hidden-entities/${entityType}/${entityId}`);
        showSuccess(`${entityName} has been restored`);
        return true;
      } catch (error) {
        console.error("Failed to unhide entity:", error);
        showError(
          error.data?.error || "Failed to restore entity. Please try again."
        );
        return false;
      }
    },
    []
  );

  /**
   * Get all hidden entities (optionally filtered by type)
   */
  const getHiddenEntities = useCallback(async (entityType) => {
    try {
      const endpoint = entityType
        ? `/user/hidden-entities?entityType=${entityType}`
        : "/user/hidden-entities";
      const response = await apiGet(endpoint);
      return response.hiddenEntities;
    } catch (error) {
      console.error("Failed to get hidden entities:", error);
      showError("Failed to load hidden items");
      return [];
    }
  }, []);

  /**
   * Unhide all entities (optionally filtered by type)
   */
  const unhideAll = useCallback(async (entityType) => {
    try {
      const endpoint = entityType
        ? `/user/hidden-entities/all?entityType=${entityType}`
        : "/user/hidden-entities/all";
      await apiDelete(endpoint);
      const typeLabel = entityType ? `${entityType}s` : "items";
      showSuccess(`All hidden ${typeLabel} have been restored`);
      return true;
    } catch (error) {
      console.error("Failed to unhide all entities:", error);
      showError(
        error.data?.error || "Failed to restore all items. Please try again."
      );
      return false;
    }
  }, []);

  /**
   * Update hide confirmation preference
   */
  const updateHideConfirmation = useCallback(
    async (disabled) => {
      try {
        await apiPut("/user/hide-confirmation", {
          hideConfirmationDisabled: disabled,
        });
        updateUser?.({ hideConfirmationDisabled: disabled });
        return true;
      } catch (error) {
        console.error("Failed to update hide confirmation preference:", error);
        showError("Failed to update preference");
        return false;
      }
    },
    [updateUser]
  );

  return {
    hideEntity,
    hideEntities,
    unhideEntity,
    unhideAll,
    getHiddenEntities,
    updateHideConfirmation,
    isHiding,
    hideConfirmationDisabled: user?.hideConfirmationDisabled || false,
  };
};

export default useHiddenEntities;
