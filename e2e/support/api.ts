import type { APIResponse } from "@playwright/test";

/** Throws with the status and body unless the response is 2xx */
export async function mustOk(
  response: APIResponse,
  what: string
): Promise<APIResponse> {
  if (!response.ok()) {
    throw new Error(
      `${what} answered ${response.status()} ${(await response.text()) || "(empty body)"}`
    );
  }
  return response;
}
