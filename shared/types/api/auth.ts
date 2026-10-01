// shared/types/api/auth.ts
/**
 * Sign-in and session types: who the signed-in user is. Preferences (landing
 * page, theme, hide confirmation, preview quality) are not identity; they come
 * from `GET /api/user/settings`.
 */
import type { LandingPagePreference } from "./user.js";

/** The signed-in user as `/api/auth/check`, `/api/auth/me` and login answer it */
export interface AuthUserResponse {
  id: number;
  username: string;
  role: string;
  setupCompleted: boolean;
}

/** GET /api/auth/check */
export interface AuthCheckResponse {
  authenticated: true;
  user: AuthUserResponse;
}

/** GET /api/auth/me */
export interface AuthMeResponse {
  user: AuthUserResponse;
}

/** POST /api/auth/login: the user, and the page to open first beside it */
export interface LoginResponse {
  success: true;
  user: AuthUserResponse;
  landingPagePreference: LandingPagePreference;
}
