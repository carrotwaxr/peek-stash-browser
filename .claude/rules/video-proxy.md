---
paths:
  - "server/controllers/video.ts"
  - "server/controllers/proxy.ts"
  - "server/controllers/download.ts"
  - "server/services/PlaylistZipService.ts"
  - "server/services/DownloadService.ts"
  - "server/routes/video.ts"
  - "server/initializers/api.ts"
  - "server/utils/stashUrl*.ts"
  - "server/utils/proxyUrl.ts"
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

- Raw Stash paths from the database become proxy URLs before any response, through `toProxyUrl(urlOrPath, instanceId)` in `server/utils/proxyUrl.ts` and nowhere else: `/api/proxy/stash?path=<path and query>&instanceId=<the entity's instance>`. The instance is required, since a URL without one is served by the highest-priority instance. It drops any `apikey` query parameter (Stash's stored paths carry none) and returns an existing `/api/proxy/` path as is.
- The server builds player stream paths in `StashEntityService.generateSceneStreams` from Stash's recorded choices (`streamDirect`, `streamMkv`, `streamResolutions`), only for single-scene lookups; the client uses them unchanged (`playerSources.ts`). The client still builds the HLS auto-fallback URL in `useVideoPlayer.ts` and caption URLs in `videoPlayerUtils.ts`; `ExternalPlayerButton.tsx` takes its signed direct link from `POST /api/scene/:id/external-player-link` (`useExternalPlayerLink`) and prefixes `window.location.origin`.
- Sync reads Stash's choices from its labels into those three columns and never stores its URLs, which carry the Stash API key. The old `streams` column that held them is gone (`20260925000200_drop_scene_streams_and_recovery_key`).
- Sprite and VTT use Stash's id-keyed routes, `/scene/:id/vtt/{sprite,thumbs}`, not the hash-keyed paths Stash reports.

## Two proxies

- `video.ts` serves HLS playlists, segments and captions, and reads the instance from `?instanceId=`. Stash 0.31 lists HLS segments as `/scene/:id/stream.m3u8/<n>.ts?resolution=...` (its segment route is `stream.m3u8/{n}.ts`). `rewriteHlsPlaylist` turns the four URL shapes Stash emits (absolute URL, absolute path, relative path, bare segment) into `proxy-stream` URLs that this same controller serves, so a rewrite bug breaks every segment request after it. URI attributes in tags (`#EXT-X-KEY`, `#EXT-X-MAP`, ...) go through the same rewrite (`rewriteStashUri`). A line that cannot be rewritten, or that still matches `/apikey/i` afterwards, becomes an empty line; a DASH manifest has its `apikey` parameters stripped (`stripDashApiKeys`) and is refused with 502 if it still names one. Range is never forwarded for `.m3u8` or `.mpd`: Stash honours it there, and a slice could start past `apikey=`. `isAllowedStreamPath` admits only Stash's stream files (`stream`, `stream.mp4`, `stream.webm`, `stream.mkv`, `stream.m3u8`, `stream.mpd`) and `stream.m3u8/<n>.ts`; `pickStreamQuery` forwards only `resolution` and `start`.
- `proxy.ts` serves previews, WebP sprites, images and clip previews. The scene, clip and image handlers find the entity by its route id (route id and `?instanceId=`, both required) and use that row's `stashInstanceId`. `proxyStashMedia` takes `?instanceId=` and accepts only the allowlist in `server/utils/stashMediaPath.ts`: Stash's media routes for the eight entity types by numeric id (`parseStashMediaPath`), with only the `t` (digits) and `default` (`true|false`) query keys rebuilt upstream. Sprite and VTT are id-keyed there; the hash-keyed paths Stash reports are refused. Stash image paths come back either absolute or relative; handle both.
- Every media route requires `?instanceId=` (400 without, or for a malformed one); `getCredentials(instanceId)` serves only a named, enabled instance. The by-id routes read their row by (id, instance). `"default"` is an ordinary id (the owner's instance has it). A named instance that is not enabled (disabled or deleted) throws `UnknownInstanceError`, which both answer with 404. The by-id handlers pass the row's `stashInstanceId`.

## Authentication

- A Peek session is required on every `/api/proxy/*` route (`app.use("/api/proxy", authenticate)` in `server/initializers/api.ts`) and on the caption route.
- `authenticateStreamRequest` (`server/middleware/streamAuth.ts`) guards the stream routes: a request without `sig` needs the session; with `sig` it must be a link minted by `createExternalPlayerLink` (`utils/streamLink.ts`: HMAC over user, scene, instance, expiry and `passwordChangedAt`, keyed by HKDF from the JWT secret, 12-hour TTL), and signed links work on the direct stream (`proxy-stream/stream`) only. A password change or reset, or a JWT secret rotation, revokes every link; there is no per-link revocation.
- Every handler then runs `canUserLoadMedia` (`utils/mediaAccess.ts`), which checks each entity the path names with `canUserAccessEntity`, including scene plus clip for `scene_marker` media, and answers 404 when any fails. `proxyStashMedia` sets aside only the user's own `hidden` rows (`canUserSeeApartFromOwnHides`, mode `"apartFromOwnHides"`), so Hidden Items thumbnails load; a restriction, a cascade or a pending hold still refuses, and streams and captions check strictly. The by-id routes check access first (the check reads the row by id and instance), then read clip and image rows for their media paths; the scene routes read no row. Every refusal (missing, deleted, not visible, instance not enabled) answers the same `404 {error: "Not found"}`.
- Responses send `Cache-Control: private` (`utils/cacheControl.ts` keeps Stash's freshness and drops `public`), so a shared cache never serves one user's media to another.
- `paths.stream` and `paths.caption` on scenes are always null: the allowlist refuses both Stash routes and nothing reads them.

## Known and deliberate

- `streamProxy` swallows `AbortError` and `ERR_STREAM_PREMATURE_CLOSE`: seeking and navigating away produce them.
- `proxy.ts` caps outbound requests at 6 with a module-level queue. A slot is freed when the transfer's `stream.pipeline` finishes, when the client closes, on a request error and at the timeout. `tests/controllers/proxy.test.ts` fakes `http.get` and `stream.pipeline` (the fake completes at once); a fake that never calls back holds its slot, and the seventh request hangs. `proxy.http.test.ts` runs the real streams against a stand-in Stash.
- `proxyHttpRequest` streams with `stream.pipeline`, not `pipe`, which neither passes a source error on nor ends its destination. Once Stash's response has started, its status and Content-Length are promised, so a reset, a close or a stall (the timeout) mid-body destroys the response and the browser sees the request fail at once. Before Stash answers, a failure answers 502 and the timeout 504; Stash's own 401/403/5xx are 502, 404 is 404, and 206/304/416 pass. A browser that leaves is logged at debug; Stash failing or going quiet at warn.
- `proxy.ts` drops a request whose client has gone (`res.destroyed`) before it takes a slot, and frees the slot instead of forwarding when the client left while queued. A request now waits on the session and access checks before the queue, and a grid of thumbnails is often abandoned mid-wait; forwarding it would fetch a response nobody reads and hold a slot meanwhile. Without the guard (and with `pipe`, which held such a slot until the upstream timeout) a full E2E run left the proxy starved for minutes.

## Downloads

- A playlist zip is read when it is built (start and retry), for the download's `userId` (the requester, never the playlist owner), through `loadPlaylistItems` (`services/PlaylistQueryService.ts`) with that user's allowed instances, so its entries, M3U and NFOs hold only what they may see and the NFO's rating is theirs (`rating` from the scene builder; none writes none). Never read a scene, its relations or `rating100` with Prisma for a file a user receives.
- The scene and image file route (`getDownloadFile`) fetches through `fetchFromStash`: it forwards `Range` and `If-Range`, answers 206 and 416 as Stash does (with `Content-Range`, `Accept-Ranges`, `ETag`, `Last-Modified`), times out at 60 s before headers (504) and after 60 s without data, and cancels the body of a refused fetch (404 for Stash's 404 and 410, 502 for the rest). A zip row with no file is a 404; the zip itself gets Range from `res.sendFile`.
