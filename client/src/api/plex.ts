export async function plexApi<T>(
  path: string,
  body?: unknown,
  method = "POST"
): Promise<T> {
  const response = await fetch(`/api/auth/plex${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(data.error ?? "Plex request failed. Please try again.");
  return data;
}
