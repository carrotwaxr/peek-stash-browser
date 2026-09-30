import type { ReactNode } from "react";
import type { GetSetupStatusResponse } from "@peek/shared-types";
import { ApiError } from "../../api/client";
import { useSetupStatus } from "../../api/hooks/useSetupStatus";
import ServerStarting from "./ServerStarting";

interface Props {
  /** The app's routes, given the loaded setup status */
  children: (status: GetSetupStatusResponse) => ReactNode;
}

/**
 * Holds the app until GET /setup/status has answered. While it fails the
 * page says Peek is starting and the query keeps retrying; only a loaded
 * status decides between the setup wizard, login and the app.
 */
export const SetupStatusGate = ({ children }: Props) => {
  const { data, failureCount, failureReason } = useSetupStatus();

  if (data) return children(data);

  if (failureCount > 0) {
    return (
      <ServerStarting
        httpStatus={
          failureReason instanceof ApiError ? failureReason.status : undefined
        }
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-xl">Loading...</div>
    </div>
  );
};
