import { Suspense } from "react";
import { BrowserRouter as Router } from "react-router-dom";
import type { GetSetupStatusResponse } from "@peek/shared-types";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "react-hot-toast";
import AppRoutes from "./AppRoutes";
import { queryClient, queryKeys } from "./api";
import { SetupStatusGate } from "./components/guards/SetupStatusGate";
import PageLoader from "./components/ui/PageLoader";
import { AuthProvider } from "./contexts/AuthContext";
import { CardDisplaySettingsProvider } from "./contexts/CardDisplaySettingsContext";
import { ConfigProvider } from "./contexts/ConfigContext";
import { ShortcutScopeProvider } from "./contexts/ShortcutScopeContext";
import { TVModeProvider } from "./contexts/TVModeProvider";
import { UnitPreferenceProvider } from "./contexts/UnitPreferenceProvider";
import { ThemeProvider } from "./themes/ThemeProvider";
import "./themes/base.css";

// Main app component with authentication and routing
const AppContent = () => {
  const client = useQueryClient();

  // Setup has just completed: the wizard is done, so the next load goes to
  // Home (the user is already logged in via auto-login)
  const handleSetupComplete = () => {
    client.setQueryData<GetSetupStatusResponse>(
      queryKeys.setup.status(),
      (status) => status && { ...status, setupComplete: true }
    );
    window.location.href = "/";
  };

  return (
    <SetupStatusGate>
      {(setupStatus) => (
        <Router>
          <Suspense fallback={<PageLoader />}>
            <AppRoutes
              setupStatus={setupStatus}
              onSetupComplete={handleSetupComplete}
            />
          </Suspense>
        </Router>
      )}
    </SetupStatusGate>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ConfigProvider>
            <UnitPreferenceProvider>
              <TVModeProvider>
                <ShortcutScopeProvider>
                  <CardDisplaySettingsProvider>
                    <AppContent />
                    <Toaster
                      position="top-right"
                      toastOptions={{
                        duration: 3000,
                        style: {
                          padding: "0",
                        },
                      }}
                    />
                  </CardDisplaySettingsProvider>
                </ShortcutScopeProvider>
              </TVModeProvider>
            </UnitPreferenceProvider>
          </ConfigProvider>
        </ThemeProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
