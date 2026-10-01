import type { ReactNode } from "react";
import { AuthContext } from "@/contexts/AuthContextProvider";
import { createAuthValue } from "../testUtils";

/** The id of the user `SignedIn` signs in */
export const SIGNED_IN_USER_ID = 1;

const auth = createAuthValue({
  isAuthenticated: true,
  user: { id: SIGNED_IN_USER_ID, username: "viewer", role: "USER" },
});

/** A signed-in user around code that calls `useAuth`, with no auth request */
export function SignedIn({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
