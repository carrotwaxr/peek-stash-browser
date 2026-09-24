---
paths:
  - "server/controllers/video.ts"
  - "server/controllers/proxy.ts"
  - "server/controllers/download.ts"
  - "server/routes/video.ts"
  - "server/initializers/api.ts"
  - "server/utils/stashUrl*.ts"
  - "server/utils/streamProxy.ts"
  - "client/src/components/video-player/**"
  - "client/src/components/ui/ExternalPlayerButton.tsx"
---

# Video and media proxy

Peek never transcodes. It proxies Stash's own HLS streams and media files, and the browser never talks to Stash directly.

## Invariant

No Stash host and no API key reaches the browser. The client gets media only through `/api/proxy/...`, `/api/scene/:sceneId/proxy-stream/...` and `/api/scene/:sceneId/caption`. The key travels upstream only: in an `ApiKey` header from `video.ts`, or as `apikey` on the server-side URL in `proxy.ts`, redacted in logs. Log any URL that can carry `apikey` or `sig` through `redactUrl` (`utils/logRedaction.ts`).

The one exception is `stashUrl`, the View in Stash link on library entities, which holds Stash's UI address: `buildStashEntityUrl` takes the viewer and returns null unless it is an admin, so handlers pass `req.user` (through `addStreamabilityInfo` and `executeCarouselQuery` for scenes).

## Building proxy URLs

- Raw Stash paths from the database become proxy URLs before any response. The query builders' `transformUrl` copies append `&instanceId=`. `convertToProxyUrl` in `server/utils/stashUrlProxy.ts` does not, so its URLs are served by the default instance.
- The server builds player stream paths in `StashEntityService.generateSceneStreams` from Stash's recorded choices (`streamDirect`, `streamMkv`, `streamResolutions`), only for single-scene lookups; the client uses them unchanged (`playerSources.ts`). The client still builds the HLS auto-fallback URL in `useVideoPlayer.ts` and caption URLs in `videoPlayerUtils.ts`; `ExternalPlayerButton.tsx` takes its signed direct link from `POST /api/scene/:id/external-player-link` (`useExternalPlayerLink`) and prefixes `window.location.origin`.
- `StashScene.streams` is always NULL until PR 3 drops it. Sync reads Stash's choices from its labels into those three columns and never stores its URLs, which carry the Stash API key.
- Sprite and VTT use Stash's id-keyed routes, `/scene/:id/vtt/{sprite,thumbs}`, not the hash-keyed paths Stash reports.

## Two proxies

- `video.ts` serves HLS playlists, segments and captions, and reads the instance from `?instanceId=`. Stash 0.31 lists HLS segments as `/scene/:id/stream.m3u8/<n>.ts?resolution=...` (its segment route is `stream.m3u8/{n}.ts`). `rewriteHlsPlaylist` turns the four URL shapes Stash emits (absolute URL, absolute path, relative path, bare segment) into `proxy-stream` URLs that this same controller serves, so a rewrite bug breaks every segment request after it. URI attributes in tags (`#EXT-X-KEY`, `#EXT-X-MAP`, ...) go through the same rewrite (`rewriteStashUri`). A line that cannot be rewritten, or that still matches `/apikey/i` afterwards, becomes an empty line; a DASH manifest has its `apikey` parameters stripped (`stripDashApiKeys`) and is refused with 502 if it still names one. Range is never forwarded for `.m3u8` or `.mpd`: Stash honours it there, and a slice could start past `apikey=`. `isAllowedStreamPath` admits only Stash's stream files (`stream`, `stream.mp4`, `stream.webm`, `stream.mkv`, `stream.m3u8`, `stream.mpd`) and `stream.m3u8/<n>.ts`; `pickStreamQuery` forwards only `resolution` and `start`.
- `proxy.ts` serves previews, WebP sprites, images and clip previews. The scene, clip and image handlers find the entity by its route id (numeric; an optional `?instanceId=` narrows the row) and use that row's `stashInstanceId`. `proxyStashMedia` takes `?instanceId=` and accepts only the allowlist in `server/utils/stashMediaPath.ts`: Stash's media routes for the eight entity types by numeric id (`parseStashMediaPath`), with only the `t` (digits) and `default` (`true|false`) query keys rebuilt upstream. Sprite and VTT are id-keyed there; the hash-keyed paths Stash reports are refused. Stash image paths come back either absolute or relative; handle both.
- `getInstanceCredentials` exists in both files, and both treat `"default"` as no instance. `resolveMediaInstanceId` in `utils/mediaAccess.ts` mirrors that mapping for the access check. Change them together.

## Authentication

- A Peek session is required on every `/api/proxy/*` route (`app.use("/api/proxy", authenticate)` in `server/initializers/api.ts`) and on the caption route.
- `authenticateStreamRequest` (`server/middleware/streamAuth.ts`) guards the stream routes: a request without `sig` needs the session; with `sig` it must be a link minted by `createExternalPlayerLink` (`utils/streamLink.ts`: HMAC over user, scene, instance, expiry and `passwordChangedAt`, keyed by HKDF from the JWT secret, 12-hour TTL), and signed links work on the direct stream (`proxy-stream/stream`) only. A password change or reset, or a JWT secret rotation, revokes every link; there is no per-link revocation.
- Every handler then runs `canUserLoadMedia` (`utils/mediaAccess.ts`), which checks each entity the path names with `canUserAccessEntity`, including scene plus clip for `scene_marker` media, and answers 404 when any fails.
- Responses send `Cache-Control: private` (`utils/cacheControl.ts` keeps Stash's freshness and drops `public`), so a shared cache never serves one user's media to another.
- `paths.stream` and `paths.caption` on scenes are always null: the allowlist refuses both Stash routes and nothing reads them.

## Known and deliberate

- `streamProxy` swallows `AbortError` and `ERR_STREAM_PREMATURE_CLOSE`: seeking and navigating away produce them.
- `proxy.ts` caps outbound requests at 6 with a module-level queue. In tests the mocked upstream response must emit `end`, or its slot is never freed and the seventh request hangs.
- `proxy.ts` drops a request whose client has gone (`res.destroyed`) before it takes a slot, and frees the slot instead of forwarding when the client left while queued. A request now waits on the session and access checks before the queue, and a grid of thumbnails is often abandoned mid-wait; piping Stash's response into a dead response pauses the upstream body, `end` never fires, and the slot is held until the upstream timeout. Without the guard a full E2E run left the proxy starved for minutes.
