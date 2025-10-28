import { useState } from "react";
import axios from "axios";
import Button from "../ui/Button.jsx";
import Paper from "../ui/Paper.jsx";
import ConfirmDialog from "../ui/ConfirmDialog.jsx";
import CustomThemeEditor from "./CustomThemeEditor.jsx";
import { showSuccess, showError } from "../../utils/toast.jsx";
import { useTheme } from "../../themes/useTheme.js";
import { Pencil, Trash2, Copy, Plus, X } from "lucide-react";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

/**
 * Custom theme management component
 */
const CustomThemeManager = () => {
  const { customThemes, refreshCustomThemes, currentTheme, changeTheme } = useTheme();
  const [editingTheme, setEditingTheme] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCreate = () => {
    setIsCreating(true);
    setEditingTheme(null);
  };

  const handleEdit = (theme) => {
    setEditingTheme(theme);
    setIsCreating(false);
  };

  const handleSaveNew = async (themeData) => {
    try {
      setLoading(true);
      const response = await api.post("/themes/custom", themeData);
      await refreshCustomThemes();
      showSuccess(`Theme "${themeData.name}" created successfully!`);
      setIsCreating(false);

      // Auto-select the new theme
      changeTheme(`custom-${response.data.theme.id}`);
    } catch (error) {
      showError(error.response?.data?.error || "Failed to create theme");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (themeData) => {
    try {
      setLoading(true);
      await api.put(`/themes/custom/${editingTheme.id}`, themeData);
      await refreshCustomThemes();
      showSuccess(`Theme "${themeData.name}" updated successfully!`);
      setEditingTheme(null);
    } catch (error) {
      showError(error.response?.data?.error || "Failed to update theme");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (theme) => {
    try {
      setLoading(true);
      await api.delete(`/themes/custom/${theme.id}`);
      await refreshCustomThemes();
      showSuccess(`Theme "${theme.name}" deleted successfully!`);
      setDeleteConfirm(null);

      // If deleted theme was active, switch to default
      if (currentTheme === `custom-${theme.id}`) {
        changeTheme("peek");
      }
    } catch (error) {
      showError(error.response?.data?.error || "Failed to delete theme");
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async (theme) => {
    try {
      setLoading(true);
      const response = await api.post(`/themes/custom/${theme.id}/duplicate`);
      await refreshCustomThemes();
      showSuccess(`Theme duplicated as "${response.data.theme.name}"!`);
    } catch (error) {
      showError(error.response?.data?.error || "Failed to duplicate theme");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingTheme(null);
  };

  // Show editor if creating or editing
  if (isCreating || editingTheme) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            {isCreating ? "Create Custom Theme" : `Edit "${editingTheme.name}"`}
          </h3>
          <Button variant="secondary" onClick={handleCancel} disabled={loading}>
            <X size={16} className="mr-2" />
            Cancel
          </Button>
        </div>
        <CustomThemeEditor
          theme={editingTheme}
          onSave={isCreating ? handleSaveNew : handleSaveEdit}
          onCancel={handleCancel}
          isNew={isCreating}
        />
      </div>
    );
  }

  // Show theme list
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Custom Themes
          </h3>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Create and manage your own custom themes
          </p>
        </div>
        <Button variant="primary" onClick={handleCreate}>
          <Plus size={16} className="mr-2" />
          Create Theme
        </Button>
      </div>

      {customThemes.length === 0 ? (
        <Paper>
          <Paper.Body>
            <div className="text-center py-12">
              <div className="text-4xl mb-4">🎨</div>
              <h4 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                No custom themes yet
              </h4>
              <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
                Create your first custom theme to personalize your experience
              </p>
              <Button variant="primary" onClick={handleCreate}>
                <Plus size={16} className="mr-2" />
                Create Your First Theme
              </Button>
            </div>
          </Paper.Body>
        </Paper>
      ) : (
        <div className="space-y-3">
          {customThemes.map((theme) => {
            const isActive = currentTheme === `custom-${theme.id}`;
            return (
              <Paper key={theme.id}>
                <Paper.Body>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      {/* Color Preview */}
                      <div className="flex gap-1">
                        <div
                          className="w-8 h-8 rounded"
                          style={{ backgroundColor: theme.config.accents.primary }}
                          title="Primary Accent"
                        />
                        <div
                          className="w-8 h-8 rounded"
                          style={{ backgroundColor: theme.config.accents.secondary }}
                          title="Secondary Accent"
                        />
                      </div>

                      {/* Theme Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                            {theme.name}
                          </h4>
                          {isActive && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: "var(--status-success-bg)",
                                color: "var(--status-success)",
                                border: "1px solid var(--status-success-border)",
                              }}
                            >
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                          {theme.config.mode === "dark" ? "Dark" : "Light"} mode
                          {" • "}
                          Created {new Date(theme.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      {!isActive && (
                        <Button
                          variant="secondary"
                          onClick={() => changeTheme(`custom-${theme.id}`)}
                          className="text-sm"
                        >
                          Use Theme
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        onClick={() => handleEdit(theme)}
                        disabled={loading}
                        className="p-2"
                        title="Edit"
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => handleDuplicate(theme)}
                        disabled={loading}
                        className="p-2"
                        title="Duplicate"
                      >
                        <Copy size={16} />
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => setDeleteConfirm(theme)}
                        disabled={loading}
                        className="p-2"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                </Paper.Body>
              </Paper>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete Custom Theme"
          message={`Are you sure you want to delete "${deleteConfirm.name}"? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
          variant="danger"
        />
      )}
    </div>
  );
};

export default CustomThemeManager;
