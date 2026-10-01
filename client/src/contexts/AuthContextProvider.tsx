import { createContext } from "react";
import type {
  AuthUserResponse,
  LandingPagePreference,
} from "@peek/shared-types";

/** Who is signed in. Preferences come from `useUserSettings`. */
export type AuthUser = AuthUserResponse;

export interface LoginResult {
  success: boolean;
  user?: AuthUser;
  /** The page to open first, from the login answer */
  landingPagePreference?: LandingPagePreference;
  error?: string;
}

export interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: (credentials: {
    username: string;
    password: string;
  }) => Promise<LoginResult>;
  logout: () => Promise<void>;
  updateUser: (partialUser: Partial<AuthUser>) => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined
);
