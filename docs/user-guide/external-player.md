# External Player

Peek allows you to open scenes in external media players like VLC for enhanced playback features such as hardware acceleration, subtitle support, and advanced playback controls.

## Platform Compatibility

| Platform | Status | Notes |
|----------|--------|-------|
| **Android** | ✅ Works | Opens app chooser for any installed video player |
| **iOS** | ✅ Works | Opens directly in VLC (requires VLC for iOS) |
| **Windows (Edge/Chrome)** | ✅ Works | Requires protocol handler setup (see below) |
| **Windows (Firefox)** | ⚠️ Limited | May not work due to Firefox's protocol handling |
| **macOS** | 🔬 Untested | Should work with protocol handler |
| **Linux** | 🔬 Untested | Should work with protocol handler |
| **Chromecast** | ✅ Works | Casting, not the external player button: see [Casting](casting.md). Needs Peek on HTTPS, in Chrome, Edge or Chrome on Android |
| **AirPlay (Safari to Apple TV)** | ✅ Works | See [Casting](casting.md#airplay). Safari shows an AirPlay button in the player when an Apple TV is nearby |

!!! note "Help Us Test"
    We need community feedback on platform compatibility. If you test on a platform not marked as "Works", please [report your results on GitHub](https://github.com/carrotwaxr/peek-stash-browser/issues) so we can update this documentation.

## Using the External Player Button

On the scene page, you'll find an external player button (external link icon) beside the **Back** button, at the top of the page. (Admins also see a "View in Stash" button next to it.) The behavior differs by platform:

### Mobile Devices

- **Android**: Tapping the button opens a dialog to choose any installed video player app (VLC, MX Player, etc.)
- **iOS**: Tapping the button opens the scene directly in VLC (requires VLC for iOS to be installed)

### Desktop (Windows/Mac/Linux)

The button becomes a combo button with two parts:

1. **Main button** (external link icon): Opens the scene in VLC
2. **Dropdown arrow**: Click to reveal additional options:
   - **Copy Stream URL**: Copies the direct stream URL to your clipboard

## Your personal link

The link behind the button belongs to you. Peek creates it when you open the scene page, and it:

- works for 12 hours, then returns an error until you reopen the scene page for a fresh one
- stops working as soon as your password changes, or an admin resets it
- shows only what your account may see, so hidden items and content restrictions still apply

Don't share it: anyone who has it can watch that scene as you until it expires. If a link stops working, reopen the scene page and copy a fresh one.

## Behind a login proxy

If a reverse proxy with its own login (Authelia, Authentik, or any front end that sets `PROXY_AUTH_HEADER`) sits in front of Peek, an external player and a cast device cannot pass that login: VLC and a Chromecast cannot sign in. Both get a personal signed link instead, and Peek checks the link itself. Let these requests through the proxy without authentication, and keep everything else behind it:

- the methods `GET`, `HEAD` and `OPTIONS` (the last is a Cast device's cross-origin preflight)
- on the paths `/api/scene/<id>/proxy-stream/...`, `/api/scene/<id>/caption` and `/api/scene/<id>/poster`
- only when the query string has a `sig` parameter

As a regular expression on the path and query, for a proxy that matches that way (Authelia's `resources`, for example):

```text
^/api/scene/[0-9]+/(proxy-stream/.*|caption|poster)[?](.*&)?sig=.*$
```

Adapt it to your proxy's own syntax, and let the proxy pass Peek's `Access-Control-*` headers and the browser's `Range` header on those requests unchanged. A proxy that adds its own CORS headers there breaks casting.

What this lets through is narrow:

- **Peek checks every signed request itself:** the signature, the user it names, its expiry, and that user's access to the scene. An expired, tampered or foreign link is refused with 401, a scene the user has hidden or may not see answers 404, and the link opens only the one scene it was made for. The bypass lets no one past Peek's own checks.
- **A link works for 12 hours.** Logging out does not revoke it. Only a password change or reset (or a change of the server's `JWT_SECRET`) does.
- **The external player button's link opens only the direct stream** (`proxy-stream/stream`). The link Peek makes for casting also opens the HLS playlist and its segments, the captions and the scene's poster, and nothing else.
- **Safari now asks Peek for a signed link every time it plays a scene,** not only when you press a link button, so a login proxy that blocks signed requests can affect Safari playback too. If Safari fails to play behind such a proxy, apply the bypass.

!!! warning "Only the signed requests"
    Do not let `/api/scene/...` through without the `sig` condition. A request without `sig` needs a Peek session, and the proxy's login is what protects the rest of Peek.

[Casting](casting.md) needs this bypass behind a login proxy, and [Configuration](../getting-started/configuration.md#external-player-links) lists it with the other proxy settings.

## Setting Up VLC Protocol Handler (Desktop)

For the "Open in VLC" button to work on desktop, you need to install a protocol handler that registers the `vlc://` URL scheme with your operating system.

**Why is this needed?** VLC doesn't natively understand `vlc://` URLs. The protocol handler intercepts these URLs, strips the `vlc://` prefix, and passes the actual video URL to VLC.

### Windows Setup (Recommended Method)

The most reliable method for Windows is using a registry file with a PowerShell script. This approach handles URL encoding issues that browsers introduce.

#### Step 1: Create the Registry File

1. Open Notepad
2. Paste the following content:

```reg
Windows Registry Editor Version 5.00

[HKEY_CLASSES_ROOT\vlc]
@="URL:VLC Protocol"
"URL Protocol"=""

[HKEY_CLASSES_ROOT\vlc\DefaultIcon]
@="C:\\Program Files\\VideoLAN\\VLC\\vlc.exe,0"

[HKEY_CLASSES_ROOT\vlc\shell]

[HKEY_CLASSES_ROOT\vlc\shell\open]

[HKEY_CLASSES_ROOT\vlc\shell\open\command]
@="C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -WindowStyle Hidden -Command \"& {$url='%1' -replace '^vlc://' -replace '^http//', 'http://' -replace '^https//', 'https://'; Start-Process -FilePath 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe' -ArgumentList $url}\""
```

3. Save as `vlc-protocol.reg` (make sure to select "All Files" as the file type)

!!! warning "Adjust VLC Path if Needed"
    If VLC is installed in a different location (e.g., `C:\Program Files (x86)\VideoLAN\VLC\vlc.exe`), update both paths in the registry file accordingly.

#### Step 2: Install the Registry Entries

1. Double-click the `vlc-protocol.reg` file
2. Click "Yes" when prompted by User Account Control
3. Click "Yes" when asked to confirm adding to the registry
4. You should see "The keys and values contained in [path] have been successfully added to the registry"

#### Step 3: Test It

1. Open Peek in **Edge** or **Chrome**
2. Navigate to a scene
3. Click the external player button
4. When prompted, allow the browser to open the VLC handler
5. VLC should open and start playing the video

#### How the PowerShell Script Works

The PowerShell command in the registry performs these transformations:

1. Removes the `vlc://` prefix from the URL
2. Fixes `http//` → `http://` (browsers strip the colon for security)
3. Fixes `https//` → `https://`
4. Launches VLC with the corrected URL

### Alternative: Third-Party Protocol Handlers

These tools may also work, though results vary:

- [player-protocol](https://github.com/tgdrive/player-protocol) - Supports VLC and PotPlayer
- [vlc-protocol](https://github.com/stefansundin/vlc-protocol) - VLC-specific handler

### macOS Setup

macOS users can try:

1. Install a protocol handler like [player-protocol](https://github.com/tgdrive/player-protocol)
2. Or use the "Copy Stream URL" fallback method

!!! note "macOS Testers Needed"
    If you've successfully set up VLC protocol handling on macOS, please share your method on [GitHub](https://github.com/carrotwaxr/peek-stash-browser/issues).

### Linux Setup

Linux users can register protocol handlers via `xdg-mime` or desktop files. A typical approach:

1. Create a `.desktop` file for handling `x-scheme-handler/vlc`
2. Register it with `xdg-mime default vlc-handler.desktop x-scheme-handler/vlc`

!!! note "Linux Testers Needed"
    If you've successfully set up VLC protocol handling on Linux, please share your method on [GitHub](https://github.com/carrotwaxr/peek-stash-browser/issues).

## Copying the Stream URL (Fallback Method)

If you don't want to set up a protocol handler, or it's not working on your platform, you can use the "Copy Stream URL" option:

1. Click the dropdown arrow on the external player button
2. Select "Copy Stream URL"
3. Open VLC manually
4. Go to **Media → Open Network Stream** (Ctrl+N on Windows/Linux, Cmd+N on macOS)
5. Paste the URL and click **Play**

This method works on all platforms without any additional setup.

Copying to the clipboard works only when you reach Peek over HTTPS. On a plain HTTP address, the browser has no clipboard API, so a text field with the link appears instead: select it and press Ctrl+C (Cmd+C on macOS).

## Troubleshooting

### "Open in VLC" doesn't work (Windows)

1. **Check browser**: Try Edge or Chrome instead of Firefox
2. **Verify registry**: Open `regedit` and check that `HKEY_CLASSES_ROOT\vlc` exists
3. **Check VLC path**: Ensure the path in the registry matches your VLC installation
4. **Use fallback**: Copy the stream URL and open it manually in VLC

### Firefox doesn't open VLC (Windows)

Firefox handles custom protocols differently from Edge/Chrome and may not respect Windows registry protocol handlers. Known workarounds:

- Use Edge or Chrome for the "Open in VLC" feature
- Use the "Copy Stream URL" fallback method
- Set `network.protocol-handler.expose.vlc` to `false` in `about:config` (results may vary)

!!! bug "Known Issue"
    Firefox on Windows currently doesn't reliably support the `vlc://` protocol even with the registry handler installed. We're tracking this issue and welcome any solutions from the community.

### Video won't play in VLC

- Ensure VLC is up to date (version 3.0 or later recommended)
- A link older than 12 hours, or from before a password change, returns 401: reopen the scene page and copy a fresh one
- Behind a login proxy, the link needs the bypass in [Behind a login proxy](#behind-a-login-proxy)
- Try the "Copy Stream URL" method to verify the URL works

### Android: No app found to handle the link

- Install a video player app (VLC, MX Player, etc.)
- The Android intent system should show a list of compatible apps

### iOS: Link doesn't open VLC

- Ensure VLC for iOS is installed from the App Store
- The `vlc-x-callback://` scheme is only supported by VLC
- Other iOS video players are not currently supported

## Technical Details

### URL Formats by Platform

| Platform | URL Format | Example |
|----------|------------|---------|
| Android | Intent URI | `intent://host#Intent;action=android.intent.action.VIEW;scheme=https;type=video/mp4;...` |
| iOS | VLC x-callback | `vlc-x-callback://x-callback-url/stream?url=...` |
| Desktop | VLC protocol | `vlc://https://peek.example.com/api/scene/123/proxy-stream/stream?instanceId=…&uid=…&exp=…&sig=…` |

On Android, the `type` in the intent is the real type of the scene's file, taken from its extension: `video/mp4` for an MP4, `video/x-matroska` for an MKV, and so on. A file with an unknown extension gets `video/*`, which any video app accepts. This lets players that pick by type open MKV, AVI and WMV files too.

### Stream URL

The stream URL points to Peek's proxy endpoint, not directly to Stash. This ensures:

- API keys are not exposed in URLs
- The link is signed for you: `uid` is your account, `exp` is when it stops working (12 hours after it was made), and `sig` is a signature Peek checks on every request. The signature also covers your password, so a password change or reset invalidates the link, and Peek still applies your hidden items and content restrictions when the link is used
- The URL format is: `{peek-url}/api/scene/{sceneId}/proxy-stream/stream?instanceId=…&uid=…&exp=…&sig=…`

## Contributing

If you've found a solution for a platform or browser that's not working, please:

1. [Open an issue](https://github.com/carrotwaxr/peek-stash-browser/issues/new) with your platform details
2. Describe the steps you took to get it working
3. We'll update this documentation to help other users
