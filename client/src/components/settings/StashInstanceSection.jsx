import { useCallback, useEffect, useState } from "react";
import { Paper, Button } from "../ui/index.js";
import { useAuth } from "../../hooks/useAuth.js";

const StashInstanceSection = ({ api }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingInstance, setEditingInstance] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    url: "",
    apiKey: "",
    enabled: true,
    priority: 0,
  });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const loadInstances = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Admin gets all instances, regular users get single instance
      const endpoint = isAdmin ? "/setup/stash-instances" : "/setup/stash-instance";
      const response = await api.get(endpoint);

      if (isAdmin) {
        setInstances(response.data.instances || []);
      } else {
        // Non-admin: wrap single instance in array
        setInstances(response.data.instance ? [response.data.instance] : []);
      }
    } catch (err) {
      console.error("Failed to load Stash instances:", err);
      setError(err.response?.data?.error || "Failed to load Stash instances");
    } finally {
      setLoading(false);
    }
  }, [api, isAdmin]);

  useEffect(() => {
    loadInstances();
  }, [loadInstances]);

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString();
  };

  const getDisplayUrl = (url) => {
    if (!url) return "N/A";
    try {
      const parsed = new URL(url);
      return `${parsed.hostname}:${parsed.port || (parsed.protocol === "https:" ? "443" : "80")}`;
    } catch {
      return url;
    }
  };

  const handleAddNew = () => {
    setFormData({
      name: "",
      description: "",
      url: "",
      apiKey: "",
      enabled: true,
      priority: instances.length,
    });
    setFormError(null);
    setTestResult(null);
    setEditingInstance(null);
    setShowAddForm(true);
  };

  const handleEdit = (instance) => {
    setFormData({
      name: instance.name,
      description: instance.description || "",
      url: instance.url,
      apiKey: "", // Don't show existing key
      enabled: instance.enabled,
      priority: instance.priority,
    });
    setFormError(null);
    setTestResult(null);
    setEditingInstance(instance);
    setShowAddForm(true);
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingInstance(null);
    setFormError(null);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!formData.url) {
      setFormError("URL is required");
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);
      setFormError(null);

      const response = await api.post("/setup/test-stash-connection", {
        url: formData.url,
        apiKey: formData.apiKey || undefined,
      });

      setTestResult({
        success: true,
        message: `Connected successfully! Stash version: ${response.data.version || "unknown"}`,
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err.response?.data?.error || "Connection failed",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.url) {
      setFormError("Name and URL are required");
      return;
    }

    try {
      setSaving(true);
      setFormError(null);

      if (editingInstance) {
        // Update existing instance
        const updateData = {
          name: formData.name,
          description: formData.description || null,
          url: formData.url,
          enabled: formData.enabled,
          priority: formData.priority,
        };
        // Only include apiKey if changed
        if (formData.apiKey) {
          updateData.apiKey = formData.apiKey;
        }

        await api.put(`/setup/stash-instance/${editingInstance.id}`, updateData);
      } else {
        // Create new instance
        await api.post("/setup/stash-instance", {
          name: formData.name,
          description: formData.description || null,
          url: formData.url,
          apiKey: formData.apiKey,
          enabled: formData.enabled,
          priority: formData.priority,
        });
      }

      await loadInstances();
      handleCancel();
    } catch (err) {
      setFormError(err.response?.data?.error || "Failed to save instance");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (instance) => {
    if (!confirm(`Are you sure you want to delete "${instance.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await api.delete(`/setup/stash-instance/${instance.id}`);
      await loadInstances();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete instance");
    }
  };

  const handleToggleEnabled = async (instance) => {
    try {
      await api.put(`/setup/stash-instance/${instance.id}`, {
        enabled: !instance.enabled,
      });
      await loadInstances();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update instance");
    }
  };

  return (
    <Paper className="mb-6">
      <Paper.Header>
        <div className="flex items-center justify-between w-full">
          <div>
            <Paper.Title>Stash Instances</Paper.Title>
            <Paper.Subtitle className="mt-1">
              {isAdmin ? "Manage connected Stash servers" : "Connected Stash server"}
            </Paper.Subtitle>
          </div>
          {isAdmin && !showAddForm && (
            <Button onClick={handleAddNew} size="sm">
              Add Instance
            </Button>
          )}
        </div>
      </Paper.Header>
      <Paper.Body>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        ) : error ? (
          <div
            className="p-3 rounded-lg text-sm"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "rgb(239, 68, 68)",
            }}
          >
            {error}
          </div>
        ) : showAddForm ? (
          // Add/Edit Form
          <div className="space-y-4">
            <h3 className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
              {editingInstance ? "Edit Instance" : "Add New Instance"}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    backgroundColor: "var(--bg-input)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                  placeholder="My Stash Server"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  Priority
                </label>
                <input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-lg border"
                  style={{
                    backgroundColor: "var(--bg-input)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                  placeholder="0"
                />
                <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                  Lower numbers = higher priority for deduplication
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Description
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border"
                style={{
                  backgroundColor: "var(--bg-input)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
                placeholder="Optional description"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Stash URL *
              </label>
              <input
                type="text"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border"
                style={{
                  backgroundColor: "var(--bg-input)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
                placeholder="http://localhost:9999/graphql"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                API Key {editingInstance ? "(leave blank to keep existing)" : ""}
              </label>
              <input
                type="password"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border"
                style={{
                  backgroundColor: "var(--bg-input)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
                placeholder={editingInstance ? "••••••••" : "Your Stash API key"}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="enabled" className="text-sm" style={{ color: "var(--text-primary)" }}>
                Enabled
              </label>
            </div>

            {/* Test Result */}
            {testResult && (
              <div
                className="p-3 rounded-lg text-sm"
                style={{
                  backgroundColor: testResult.success ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                  color: testResult.success ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)",
                }}
              >
                {testResult.message}
              </div>
            )}

            {/* Form Error */}
            {formError && (
              <div
                className="p-3 rounded-lg text-sm"
                style={{
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  color: "rgb(239, 68, 68)",
                }}
              >
                {formError}
              </div>
            )}

            {/* Form Actions */}
            <div className="flex gap-3 pt-2">
              <Button onClick={handleTestConnection} variant="secondary" disabled={testing || !formData.url}>
                {testing ? "Testing..." : "Test Connection"}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editingInstance ? "Save Changes" : "Add Instance"}
              </Button>
              <Button onClick={handleCancel} variant="ghost">
                Cancel
              </Button>
            </div>
          </div>
        ) : instances.length > 0 ? (
          // Instance List
          <div className="space-y-4">
            {instances.map((instance, index) => (
              <div
                key={instance.id}
                className="p-4 rounded-lg border"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h4 className="font-medium" style={{ color: "var(--text-primary)" }}>
                        {instance.name}
                      </h4>
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          instance.enabled
                            ? "bg-green-500/20 text-green-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {instance.enabled ? "Active" : "Disabled"}
                      </span>
                      {index === 0 && instances.length > 1 && (
                        <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">
                          Primary
                        </span>
                      )}
                    </div>
                    {instance.description && (
                      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                        {instance.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-sm" style={{ color: "var(--text-tertiary)" }}>
                      <span className="font-mono">{getDisplayUrl(instance.url)}</span>
                      <span>Priority: {instance.priority}</span>
                      <span>Added: {formatDate(instance.createdAt)}</span>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => handleToggleEnabled(instance)}
                        variant="ghost"
                        size="sm"
                      >
                        {instance.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button onClick={() => handleEdit(instance)} variant="ghost" size="sm">
                        Edit
                      </Button>
                      {instances.length > 1 && (
                        <Button
                          onClick={() => handleDelete(instance)}
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300"
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {instances.length > 1 && (
              <div
                className="p-3 rounded-lg text-sm"
                style={{
                  backgroundColor: "rgba(59, 130, 246, 0.1)",
                  color: "var(--text-secondary)",
                }}
              >
                Content from all enabled instances is combined in your library. When duplicates are
                found (via StashDB IDs), the instance with the lowest priority number is used as the
                primary source.
              </div>
            )}
          </div>
        ) : (
          <div
            className="p-4 rounded-lg text-center"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "rgb(239, 68, 68)",
            }}
          >
            <p className="font-medium">No Stash Instance Configured</p>
            <p className="text-sm mt-1 opacity-80">
              Please complete the setup wizard to connect to a Stash server.
            </p>
          </div>
        )}
      </Paper.Body>
    </Paper>
  );
};

export default StashInstanceSection;
