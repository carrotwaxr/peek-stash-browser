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

!!! note "Help Us Test"
    We need community feedback on platform compatibility. If you test on a platform not marked as "Works", please [report your results on GitHub](https://github.com/carrotwaxr/peek-stash-browser/issues) so we can update this documentation.

## Using the External Player Button

On the scene page, you'll find an external player button (external link icon) next to the "View in Stash" button. The behavior differs by platform:

### Mobile Devices

- **Android**: Tapping the button opens a dialog to choose any installed video player app (VLC, MX Player, etc.)
- **iOS**: Tapping the button opens the scene directly in VLC (requires VLC for iOS to be installed)

### Desktop (Windows/Mac/Linux)

The button becomes a combo button with two parts:

1. **Main button** (external link icon): Opens the scene in VLC
2. **Dropdown arrow**: Click to reveal additional options:
   - **Copy Stream URL**: Copies the direct stream URL to your clipboard

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
- The stream URL goes through Peek's proxy, which should handle authentication automatically
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
| Desktop | VLC protocol | `vlc://https://peek.example.com/api/scene/123/proxy-stream/stream` |

### Stream URL

The stream URL points to Peek's proxy endpoint, not directly to Stash. This ensures:

- API keys are not exposed in URLs
- Authentication is handled by Peek
- The URL format is: `{peek-url}/api/scene/{sceneId}/proxy-stream/stream`

## Contributing

If you've found a solution for a platform or browser that's not working, please:

1. [Open an issue](https://github.com/carrotwaxr/peek-stash-browser/issues/new) with your platform details
2. Describe the steps you took to get it working
3. We'll update this documentation to help other users
