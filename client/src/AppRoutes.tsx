import { lazy } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import type { GetSetupStatusResponse } from "@peek/shared-types";
import {
  LoginGuard,
  ProtectedRoute,
  SetupGuard,
} from "./components/guards/RouteGuards";
import Login from "./components/pages/Login";
import { RouteErrorBoundary } from "./components/ui/ErrorBoundary";
import GlobalLayout from "./components/ui/GlobalLayout";
import { PUBLIC_ROUTES } from "./constants/navigation";

// Lazy load page components for code splitting. Login and the layout stay in
// the entry; the setup wizard and password recovery are rare visits.
const SetupWizard = lazy(() => import("./components/pages/SetupWizard"));
const ForgotPasswordPage = lazy(
  () => import("./components/pages/ForgotPasswordPage")
);
const Home = lazy(() => import("./components/pages/Home"));
const Scenes = lazy(() => import("./components/pages/Scenes"));
const Recommended = lazy(() => import("./components/pages/Recommended"));
const Performers = lazy(() => import("./components/pages/Performers"));
const Studios = lazy(() => import("./components/pages/Studios"));
const Tags = lazy(() => import("./components/pages/Tags"));
const Groups = lazy(() => import("./components/pages/Groups"));
const Galleries = lazy(() => import("./components/pages/Galleries"));
const Images = lazy(() => import("./components/pages/Images"));
const GalleryDetail = lazy(() => import("./components/pages/GalleryDetail"));
const GroupDetail = lazy(() => import("./components/pages/GroupDetail"));
const Scene = lazy(() => import("./components/pages/Scene"));
const PerformerDetail = lazy(
  () => import("./components/pages/PerformerDetail")
);
const StudioDetail = lazy(() => import("./components/pages/StudioDetail"));
const TagDetail = lazy(() => import("./components/pages/TagDetail"));
const Playlists = lazy(() => import("./components/pages/Playlists"));
const PlaylistDetail = lazy(() => import("./components/pages/PlaylistDetail"));
const SettingsPage = lazy(() => import("./components/pages/SettingsPage"));
const WatchHistory = lazy(() => import("./components/pages/WatchHistory"));
const UserStats = lazy(() => import("./components/pages/UserStats"));
const HiddenItemsPage = lazy(
  () => import("./components/pages/HiddenItemsPage")
);
const Downloads = lazy(() => import("./components/pages/Downloads"));
const Clips = lazy(() => import("./components/pages/Clips"));
const CarouselBuilder = lazy(
  () => import("./components/carousel-builder/CarouselBuilder")
);

/** The routes, given the loaded setup status. The router lives in `App`. */
const AppRoutes = ({
  setupStatus,
  onSetupComplete,
}: {
  setupStatus: GetSetupStatusResponse;
  onSetupComplete: () => void;
}) => {
  return (
    <Routes>
      {/* Setup wizard route */}
      <Route
        path={PUBLIC_ROUTES.setup}
        element={
          <SetupGuard setupStatus={setupStatus}>
            {/* Its own chunk, outside the layout's boundary */}
            <RouteErrorBoundary resetKey={PUBLIC_ROUTES.setup}>
              <SetupWizard
                setupStatus={setupStatus}
                onSetupComplete={onSetupComplete}
              />
            </RouteErrorBoundary>
          </SetupGuard>
        }
      />

      {/* Login route */}
      <Route
        path={PUBLIC_ROUTES.login}
        element={
          <LoginGuard setupStatus={setupStatus}>
            <Login />
          </LoginGuard>
        }
      />

      {/* Forgot password route */}
      <Route
        path={PUBLIC_ROUTES.forgotPassword}
        element={
          <RouteErrorBoundary resetKey={PUBLIC_ROUTES.forgotPassword}>
            <ForgotPasswordPage />
          </RouteErrorBoundary>
        }
      />

      {/* Redirects from legacy routes */}
      <Route
        path="/my-settings"
        element={<Navigate to="/settings?section=user&tab=theme" replace />}
      />
      <Route
        path="/server-settings"
        element={
          <Navigate to="/settings?section=server&tab=user-management" replace />
        }
      />

      {/* Protected app routes share one layout that stays mounted */}
      <Route
        element={
          <ProtectedRoute setupStatus={setupStatus}>
            <GlobalLayout>
              <Outlet />
            </GlobalLayout>
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Home />} />
        <Route path="/scenes" element={<Scenes />} />
        <Route path="/recommended" element={<Recommended />} />
        <Route path="/performers" element={<Performers />} />
        <Route path="/studios" element={<Studios />} />
        <Route path="/tags" element={<Tags />} />
        <Route path="/collections" element={<Groups />} />
        <Route path="/galleries" element={<Galleries />} />
        <Route path="/images" element={<Images />} />
        <Route path="/gallery/:galleryId" element={<GalleryDetail />} />
        <Route path="/performer/:performerId" element={<PerformerDetail />} />
        <Route path="/studio/:studioId" element={<StudioDetail />} />
        <Route path="/tag/:tagId" element={<TagDetail />} />
        <Route path="/collection/:groupId" element={<GroupDetail />} />
        <Route path="/watch-history" element={<WatchHistory />} />
        <Route path="/user-stats" element={<UserStats />} />
        <Route path="/hidden-items" element={<HiddenItemsPage />} />
        <Route path="/downloads" element={<Downloads />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/playlists" element={<Playlists />} />
        <Route path="/clips" element={<Clips />} />
        <Route path="/playlist/:playlistId" element={<PlaylistDetail />} />
        <Route path="/scene/:sceneId" element={<Scene />} />
        <Route path="/settings/carousels/new" element={<CarouselBuilder />} />
        <Route
          path="/settings/carousels/:id/edit"
          element={<CarouselBuilder />}
        />
      </Route>

      {/* Catch-all redirect - send unknown routes to home (guards will handle auth) */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;
