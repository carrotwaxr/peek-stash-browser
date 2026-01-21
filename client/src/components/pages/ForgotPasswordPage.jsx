import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { forgotPasswordInit, forgotPasswordReset } from "../../services/api.js";
import { Button } from "../ui/index.js";

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: username, 2: recovery key + new password
  const [username, setUsername] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleUsernameSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await forgotPasswordInit(username);
      if (response.hasRecoveryKey) {
        setStep(2);
      } else {
        setError("This account does not have a recovery key set. Please contact an administrator.");
      }
    } catch {
      setError("Failed to check username. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword)) {
      setError("Password must contain at least one letter");
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setError("Password must contain at least one number");
      return;
    }

    setLoading(true);

    try {
      await forgotPasswordReset(username, recoveryKey, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || "Invalid recovery key or username");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="w-full max-w-md p-8 rounded-lg" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
          <h1 className="text-2xl font-bold mb-4 text-center" style={{ color: "var(--text-primary)" }}>
            Password Reset Successful
          </h1>
          <p className="text-center mb-6" style={{ color: "var(--text-secondary)" }}>
            Your password has been reset. You can now log in with your new password.
          </p>
          <Button variant="primary" className="w-full" onClick={() => navigate("/login")}>
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="w-full max-w-md p-8 rounded-lg" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
        <h1 className="text-2xl font-bold mb-6 text-center" style={{ color: "var(--text-primary)" }}>
          Forgot Password
        </h1>

        {error && (
          <div className="p-3 rounded-lg mb-4 text-sm" style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", color: "rgb(239, 68, 68)" }}>
            {error}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleUsernameSubmit}>
            <div className="mb-4">
              <label htmlFor="username" className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Username
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 rounded-lg"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                required
                autoFocus
              />
            </div>
            <Button type="submit" variant="primary" className="w-full" disabled={loading} loading={loading}>
              Continue
            </Button>
            <div className="mt-4 text-center">
              <Link to="/login" className="text-sm" style={{ color: "var(--text-muted)" }}>
                Back to Login
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetSubmit}>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
              Enter your recovery key and choose a new password.
            </p>
            <div className="mb-4">
              <label htmlFor="recoveryKey" className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Recovery Key
              </label>
              <input
                type="text"
                id="recoveryKey"
                value={recoveryKey}
                onChange={(e) => setRecoveryKey(e.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                className="w-full px-4 py-2 rounded-lg font-mono"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                required
                autoFocus
              />
            </div>
            <div className="mb-4">
              <label htmlFor="newPassword" className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                New Password
              </label>
              <input
                type="password"
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-lg"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                required
                minLength={8}
              />
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                8+ characters with at least one letter and one number
              </p>
            </div>
            <div className="mb-6">
              <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Confirm New Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-lg"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" variant="primary" className="w-full" disabled={loading} loading={loading}>
              Reset Password
            </Button>
            <div className="mt-4 text-center">
              <button type="button" onClick={() => { setStep(1); setError(null); }} className="text-sm" style={{ color: "var(--text-muted)" }}>
                Back
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
