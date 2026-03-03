import { createContext } from "react";

export interface AuthUser {
  id: number;
  username: string;
  role: string;
  setupCompleted?: boolean;
  landingPagePreference?: string;
  hideConfirmationDisabled?: boolean;
  preferredPreviewQuality?: string;
  syncToStash?: boolean;
  groups?: Array<{ id: number; name: string }>;
}

export interface LoginResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

export interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: (credentials: { username: string; password: string }) => Promise<LoginResult>;
  logout: () => Promise<void>;
  updateUser: (partialUser: Partial<AuthUser>) => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
