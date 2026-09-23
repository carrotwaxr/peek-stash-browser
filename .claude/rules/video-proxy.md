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

No Stash host and no API key reaches the browser. The client gets media only through `/api/proxy/...`, `/api/scene/:sceneId/proxy-stream/...` and `/api/scene/:sceneId/caption`. The key travels upstream only: in an `ApiKey` header from `video.ts`, or as `apikey` on the server-side URL in `proxy.ts`, redacted in logs.

## Building proxy URLs

- Raw Stash paths from the database become proxy URLs before any response. The query builders' `transformUrl` copies append `&instanceId=`. `convertToProxyUrl` in `server/utils/stashUrlProxy.ts` does not, so its URLs are served by the default instance.
- The server builds player stream paths in `StashEntityService.generateSceneStreams` from Stash's recorded choices (`streamDirect`, `streamMkv`, `streamResolutions`), only for single-scene lookups; the client uses them unchanged (`playerSources.ts`). The client still builds the HLS auto-fallback URL in `useVideoPlayer.ts`, the direct URL in `ExternalPlayerButton.tsx` and caption URLs in `videoPlayerUtils.ts`.
- `StashScene.streams` is always NULL until PR 3 drops it. Sync reads Stash's choices from its labels into those three columns and never stores its URLs, which carry the Stash API key.
- Sprite and VTT use Stash's id-keyed routes, `/scene/:id/vtt/{sprite,thumbs}`, not the hash-keyed paths Stash reports.

## Two proxies

- `video.ts` serves HLS playlists, segments and captions, and reads the instance from `?instanceId=`. `rewriteHlsPlaylist` turns the four URL shapes Stash emits (absolute URL, absolute path, relative path, bare segment) into `proxy-stream` URLs that this same controller serves, so a rewrite bug breaks every segment request after it.
- `proxy.ts` serves previews, WebP sprites, images and clip previews. The scene, clip and image handlers find the entity by its bare route id (no instance) and use that row's `stashInstanceId`. `proxyStashMedia` takes `?instanceId=` and rejects paths without a leading `/` or containing `..` or `://`. Stash image paths come back either absolute or relative; handle both.
- `getInstanceCredentials` exists in both files, and both treat `"default"` as no instance. Change them together.

## Authentication

None of these routes run `authenticate`. `server/initializers/api.ts` comments the `/api/proxy/*` routes as public on purpose. Nothing documents the stream and caption routes as public. Treat access control on these routes as an open question, not settled design.

## Known and deliberate

- `streamProxy` swallows `AbortError` and `ERR_STREAM_PREMATURE_CLOSE`: seeking and navigating away produce them.
- `proxy.ts` caps outbound requests at 6 with a module-level queue. In tests the mocked upstream response must emit `end`, or its slot is never freed and the seventh request hangs.
