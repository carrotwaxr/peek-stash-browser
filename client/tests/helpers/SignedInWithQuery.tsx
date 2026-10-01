import { type ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthContext } from "@/contexts/AuthContextProvider";
import { createAuthValue } from "../testUtils";

/**
 * A signed-in user inside a fresh QueryClient, for rendering readers of the
 * user-settings query (`useUserSettings`). The client lives as long as the
 * mounted tree.
 */
export function SignedInWithQuery({
  children,
  signedIn = true,
}: {
  children: ReactNode;
  signedIn?: boolean;
}) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider
        value={createAuthValue({
          isAuthenticated: signedIn,
          user: signedIn
            ? { id: 1, username: "viewer", role: "USER", setupCompleted: true }
            : null,
        })}
      >
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
