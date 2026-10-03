# Casting

Cast a scene from Peek to a Chromecast, or to an Apple TV with AirPlay. The TV plays the video itself; the browser tab is the remote control.

Location: Scene page, in the player's control bar.

## What you need

| | Chromecast | AirPlay |
|---|---|---|
| Browser | Chrome, Edge or Chrome on Android | Safari on a Mac, or any browser on an iPhone or iPad |
| Peek's address | HTTPS, with a certificate the device trusts | Any address the Apple TV can reach |
| Where | The Scene page (not [TV mode](keyboard-navigation.md#tv-mode)) | The Scene page (not TV mode) |

The Cast button shows in the control bar when the browser can cast and a Cast device is on your network. It reads "Cast this scene" while idle and "Stop casting" while a scene plays on the TV. The AirPlay button appears the same way in Safari, or any browser on an iPhone or iPad, when an Apple TV is in range.

### Chromecast needs HTTPS

Google's Cast sender refuses to run on a plain `http://` address, so on `http://192.168.1.10:6969` or a similar LAN address **the Cast button is absent**: nothing is broken, and no setting turns it on. Put Peek behind HTTPS (a reverse proxy such as SWAG, Nginx Proxy Manager, Traefik or Caddy) and open Peek by that address. `http://localhost` also counts as secure, so the button can show there, but a TV cannot reach "localhost" (see the next section).

The certificate must be publicly trusted, for example from Let's Encrypt. A Cast device refuses a self-signed certificate.

Other browsers do not show the button at all. Firefox, Safari and every browser on iOS have no Cast support, and **Brave turns Cast off by default**: turn on Media Router in Brave's Extensions settings, then reload Peek.

Chromium-based browsers on a Scene page load Google's Cast sender script from `www.gstatic.com`. TV mode and other browsers load nothing from Google. See [Configuration](../getting-started/configuration.md#security-headers-and-third-parties).

### The address the TV must reach

Peek hands the TV a link to the video, the captions and the poster. That link starts with **the address your browser is using**: whatever is in the address bar, including its host name and port. The TV opens it from its own network position, so it must be able to reach Peek at that same address, with no login in between (see below for a login proxy).

- If you open Peek as `https://peek.example.com`, the TV must resolve and reach `peek.example.com`.
- If you open it as `https://localhost` or an address that only your computer can reach, the TV cannot play anything. Use the address a phone on the same network would use.
- There is no separate "address for cast devices" setting.

!!! warning "Split DNS and Chromecast"
    Chromecasts often ignore the DNS server your router hands out and ask `8.8.8.8` directly. If your LAN name only resolves to a LAN address on your own DNS server (split DNS), the Chromecast can instead get the public address, for example through a CDN proxy, or no address at all, and the cast fails to load. The usual fix is a router rule that redirects outbound DNS (port 53) from the Chromecast to your local resolver.

### Behind a login proxy

A reverse proxy that puts its own login in front of Peek (Authelia, Authentik, `PROXY_AUTH_HEADER` front ends) blocks the TV, which cannot sign in. Let signed media requests through the proxy: see [Behind a login proxy](external-player.md#behind-a-login-proxy). Peek still checks every one of them.

## Casting a scene

1. Open the scene in Chrome or Edge.
2. Press **Cast** in the control bar and pick the device in the browser's own dialog.
3. The scene starts on the TV. The player shows "Casting to <device>", and its controls (play, pause, seek, captions) steer the TV. The player's volume does not: set the volume with the TV's own remote.
4. Press **Cast** again, and choose to stop, to end the session.

The scene starts at your **resume point** if you have not played it on this page, and where the page's player was otherwise. Peek picks the file's own stream when the Cast device can play it directly (MP4 with H.264 up to 1080p, or WebM), and an HLS stream from Stash otherwise. This is automatic.

Peek gives the TV the scene's title, its performers, its poster and a personal signed link that works for 12 hours. A long session past that gives "Cast link expired, start casting again": press Cast again. The link follows your access: a scene you hide, or that an admin restricts, stops playing at the TV's next request.

### One scene at a time

A cast session plays one scene at a time, and the page and the TV follow each other:

- A scene change on the page while casting moves the TV to the new scene: Next, Previous, the playlist sidebar and the queue all do.
- On another scene's page, pressing **Cast** or **play** while a session is live loads that scene onto the TV.
- Leaving the page leaves the TV playing. Peek does not stop the cast when you close the tab or move on; stop it with the Cast button (or from the TV). Opening a scene page again attaches to the live session if the TV is still playing that scene.

### Playlists

In a playlist or queue with **Autoplay: On**, a scene that finishes on the TV steps to the next scene: the page moves on and the TV loads it. With repeat-one, the same scene starts again. This works while the casting tab stays open: **the page does the stepping, so a closed tab stops the playlist** when the current scene ends.

### What records while casting

Casting records the same things as watching in the browser, as long as a Peek tab shows the scene on the TV:

- the resume point, saved while the TV plays
- watch time
- the play count, by your Minimum Play Percent rule (Settings → Playback)
- Sync to Stash, if an admin switched it on for your account

The TV's position drives all of it. A seek forward on the TV is not counted as watched. Progress records **only while a Peek tab shows the cast scene**: once you leave the page, the TV keeps playing and nothing is recorded until you come back to that scene's page. With two Peek tabs on the same scene, **only the tab that started the cast, or the one that last loaded a scene, records**; the other mirrors the status ("Casting on <device>") and sends nothing.

### Captions

The captions follow the player's captions menu: turn a caption on or off, or pick another language, and the TV changes to match.

### VR and casting

Casting leaves VR first: starting a cast switches the VR view off, and the VR button hides while a session is live. It returns when the cast ends.

## AirPlay

In Safari, and in any browser on an iPhone or iPad (Chrome and Edge there are built on Safari's engine), the player's **AirPlay** button appears when an Apple TV or another AirPlay device is in range. Pick the device and the video plays there. These browsers play the scene from a signed link (the source Peek asks for on every playback where AirPlay is possible), which the Apple TV can fetch by itself. The same address rule as Chromecast applies: the Apple TV must reach Peek at the address the browser uses. Leave the tab open while it plays.

## Troubleshooting

- **No Cast button:** you are on plain `http://`, in a browser without Cast (Firefox, Safari, Brave without Media Router), in [TV mode](keyboard-navigation.md#tv-mode), or no device was found on the network. Check the address bar first.
- **The TV says "Couldn't play this scene":** the TV could not fetch the link. The address must resolve and be reachable from the TV, over HTTPS with a trusted certificate. See the split DNS note above, and for a login proxy [the bypass](external-player.md#behind-a-login-proxy).
- **"This scene has no format a Cast device can play":** Peek found neither a file the device decodes nor an HLS stream for this scene.
- **Nothing records:** keep a Peek tab on the scene's page while it plays on the TV.
- **A playlist stops after one scene:** the casting tab was closed, or Autoplay is off.
