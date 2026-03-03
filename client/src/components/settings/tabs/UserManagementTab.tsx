import { useEffect, useState } from "react";
import { apiGet } from "../../../api";
import { useAuth } from "../../../hooks/useAuth";
import UserManagementSection from "../UserManagementSection";

interface UserItem {
  id: number;
  username: string;
  role: string;
  syncToStash?: boolean;
  createdAt: string;
  groups?: Array<{ id: number; name: string }>;
}

const UserManagementTab = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<{ users: UserItem[] }>("/user/all");
      setUsers(data.users || []);
    } catch (err) {
      setError((err as Error).message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const showError = (err: string) => {
    setError(err);
    setTimeout(() => setError(null), 5000);
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center p-12"
        style={{ backgroundColor: "var(--bg-card)" }}
      >
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Messages */}
      {message && (
        <div
          className="mb-6 p-4 rounded-lg"
          style={{
            backgroundColor: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            color: "rgb(34, 197, 94)",
          }}
        >
          {message}
        </div>
      )}

      {error && (
        <div
          className="mb-6 p-4 rounded-lg"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "rgb(239, 68, 68)",
          }}
        >
          {error}
        </div>
      )}

      {/* User Management Section */}
      <UserManagementSection
        users={users}
        currentUser={currentUser as UserItem | null}
        onUsersChanged={loadUsers}
        onMessage={showMessage}
        onError={showError}
      />
    </div>
  );
};

export default UserManagementTab;
