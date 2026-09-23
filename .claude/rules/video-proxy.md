---
paths:
  - "server/controllers/video.ts"
  - "server/controllers/proxy.ts"
  - "server/routes/video.ts"
  - "server/utils/stashUrl*.ts"
  - "server/utils/streamProxy.ts"
  - "client/src/components/video-player/**"
---

# Video and media proxy

Peek never transcodes. It proxies Stash's own HLS streams and media files, and the browser never talks to Stash directly.

## Invariant

No Stash host and no API key reaches the browser. Every media URL the client receives is `/api/proxy/...` or `/api/scene/:sceneId/proxy-stream/...`. Raw Stash paths from the database go through `convertToProxyUrl` or a `transformUrl` before any response. The key travels upstream only: in an `ApiKey` header from `video.ts`, or as `apikey` on the server-side URL in `proxy.ts`, redacted in logs.

## Two proxies

- `video.ts` serves HLS playlists, segments and captions, and reads the instance from `?instanceId=`. `rewriteHlsPlaylist` turns the four URL shapes Stash emits (absolute URL, absolute path, relative path, bare segment) into `proxy-stream` URLs that this same controller serves, so a rewrite bug breaks every segment request after it. The client builds the matching URL in `useVideoPlayer.ts`.
- `proxy.ts` serves previews, WebP sprites, images and clip previews. It looks the instance up from the entity's `stashInstanceId`, except `proxyStashMedia`, which takes `?instanceId=` and rejects paths containing `..` or `://`. Stash image paths come back either absolute or relative; handle both.
- `getInstanceCredentials` exists in both files, and both treat `"default"` as no instance. Change them together.

## Intentional, do not fix

- The proxy and stream routes have no `authenticate`, by design. The API key never leaves the server.
- `streamProxy` swallows `AbortError` and `ERR_STREAM_PREMATURE_CLOSE`: seeking and navigating away produce them.
- `proxy.ts` caps outbound requests at 6 with a module-level queue. In tests the mocked upstream response must emit `end`, or its slot is never freed and the seventh request hangs.
