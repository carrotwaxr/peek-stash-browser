import { useEffect, useState } from "react";
import { apiGet } from "../../../api";
import { useAuth } from "../../../hooks/useAuth";
import { StatusMessage } from "../../ui/index";
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
    void loadUsers();
  }, []);

  // The spinner shows only until the first answer: a reload after an edit
  // keeps the table and updates it in place, and a failed one shows the error
  // above the table it leaves as it was
  const loadUsers = async () => {
    try {
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
        <StatusMessage
          variant="success"
          title={null}
          className="mb-6"
          message={message}
        />
      )}

      {error && (
        <StatusMessage
          variant="error"
          title={null}
          className="mb-6"
          message={error}
        />
      )}

      {/* User Management Section */}
      <UserManagementSection
        users={users}
        currentUser={currentUser as UserItem | null}
        onUsersChanged={() => void loadUsers()}
        onMessage={showMessage}
        onError={showError}
      />
    </div>
  );
};

export default UserManagementTab;
