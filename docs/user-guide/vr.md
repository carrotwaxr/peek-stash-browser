# VR Playback

Watch a VR scene in 3D from the Scene page, drag to look around on a desktop, or put on a headset and watch it there. Peek knows which scenes are VR from the VR tag your Stash server uses.

Location: Scene page, in the player's control bar.

## What you need

| | |
|---|---|
| A VR scene | A scene whose own tags include the server's VR tag, or a tag below it |
| In the browser | Any current browser: the picture is drawn in the player, and you drag to look around |
| In a headset | A browser that supports headset mode (Quest Browser, Safari on Apple Vision Pro) and Peek on **HTTPS** |
| Where | The Scene page (not [TV mode](keyboard-navigation.md#tv-mode)) |

The **VR** button shows only on VR scenes. Scenes that are not VR never load any VR code, and TV mode has no VR button.

### Which scenes are VR

An admin picks the VR tag for each Stash server (see [the VR tag](../getting-started/configuration.md#the-vr-tag)); by default it is the one set in Stash. A scene is VR when one of **its own tags** is that tag or a tag below it (a child tag of the VR tag counts). Tags a scene gets from its performers, studio or groups do not count. Add the tag in Stash, and the button shows after the next sync.

## The VR button

1. Open a VR scene.
2. Press **VR** in the control bar. A menu opens with **VR view** and a list of projections.
3. Tick **VR view**. The player draws the scene in 3D. Drag the picture to look around.
4. Untick it to go back to the flat picture.

You do not have to press play first: Peek asks the browser for the start of the video when you switch VR on, so the picture shows at once and playback starts when you press play. The VR code (about 750 kB) loads at that moment. Where the browser supports headset mode, it is fetched while the Scene page opens, so the button answers faster. Elsewhere nothing is fetched until you press the button.

!!! note
    Once you have used VR in a browser that has no headset support (WebXR), a small compatibility layer stays loaded until the page reloads. It makes no requests to any third party.

### Projections

A VR video stores its picture in one of several layouts, and the player must be told which one. The **projection** list in the VR menu names them:

| Menu entry | Typical file |
|---|---|
| 180° stereo | Most VR scenes: 180 degrees, left and right eye side by side |
| 180° mono | 180 degrees, one picture |
| 360° mono | 360 degrees, one picture |
| 360° stereo, side by side | 360 degrees, eyes side by side |
| 360° stereo, top and bottom | 360 degrees, eyes stacked |
| Fisheye 180°, 200° and 220° stereo | Fisheye lens footage |
| Equi-angular cube stereo | Cube-mapped files |
| Flat, side by side | A 3D film that is not VR |

Peek picks one for each scene. It reads, strongest first:

1. the scene's **tags and their aliases**, for example `180`, `360`, `SBS`, `LR`, `TB`, `FISHEYE` or `MKX200`;
2. words in the **file name**, such as `Scene_180_LR.mp4` or `Scene_360_TB.mp4`, the suffixes HereSphere and DeoVR use;
3. the **shape** of the frame: a square frame is 360° top and bottom, one about 16:9 or wider is 180° side by side;
4. otherwise 180° stereo, which most VR scenes are.

### Fixing a projection

If a scene looks stretched, doubled or split, pick another projection in the menu. The picture changes at once.

- The choice is **stored in this browser, for you and that scene.** It does not follow you to another browser or device, and other users do not see it.
- It stays in the browser after your account is deleted. Clear the site's data in the browser to remove it.
- **To fix it for everyone,** add a projection tag to the scene in Stash (for example `180_LR` or `360_TB`), or put the projection in the file name. The next sync carries it into Peek.

## Watching in a headset

1. Open Peek by an **HTTPS** address in the headset's browser (Quest Browser, or Safari on Apple Vision Pro).
2. Open a VR scene and tick **VR view** in the VR menu.
3. A headset button appears in the control bar when the browser can start a headset session. Press it and the scene plays around you.
4. In the headset the player shows its own controls: **play and pause**, **next and previous** (when the scene is in a queue or playlist of more than one scene), and a **favorite** button for the scene. Next and previous move through the queue, and the favorite is your own.

When the page is not on HTTPS, the VR menu says "Headset mode needs HTTPS". Dragging on the page still works. Put Peek behind a reverse proxy with a certificate, as for [Chromecast](casting.md#chromecast-needs-https).

!!! warning "Quest Browser and plain HTTP"
    A headset session needs a secure address. For a test on a private network you can mark one address as secure in Quest Browser: open `chrome://flags`, find the "Insecure origins treated as secure" flag, enter Peek's address (for example `http://192.168.1.10:6969`), enable it and restart the browser. This is a developer setting that Meta can rename or remove, and it weakens the browser's checks for that address: use HTTPS where you can.

### Safari

Safari plays scenes through its own HLS player. When you switch VR on while a scene plays that way, and Safari can play the scene's file directly, Peek moves to the **Direct** source (the file itself), which Safari can draw in 3D. If Safari cannot play the file, it stays on the stream. Pick a source in the player's source menu to change it.

## Other players: copy the stream link

Peek has no integration with HereSphere or DeoVR. If you prefer those players, copy the scene's stream link and open it in them:

1. In the Scene page's player, open the dropdown arrow on the external player button and choose **Copy Stream URL** (see [External Player](external-player.md#copying-the-stream-url-fallback-method)).
2. In the player, choose its option to open a network or web video and paste the link.
3. Set the projection in that player.

The link is personal and works for 12 hours, then you copy a fresh one. If Peek sits behind a login proxy that asks for its own sign-in, the player cannot get past it: see [Behind a login proxy](external-player.md#behind-a-login-proxy).

## VR and casting

VR and casting take turns. Starting a cast switches the VR view off, and the VR button hides while a Cast session is live or Safari plays to an AirPlay device. It returns when the session ends. See [Casting](casting.md#vr-and-casting).

## Troubleshooting

- **No VR button:** the scene does not carry the server's VR tag (or a child of it) directly; an admin has not set the tag and Stash has none; you are in TV mode; or a cast session is live. Ask an admin to check the VR tag of the scene's server.
- **The picture looks wrong:** pick another projection in the menu. Tag the scene in Stash to fix it for everyone.
- **No headset button:** the browser has no headset support, or Peek is not on HTTPS. The VR menu says so on an insecure address.
- **A scene I fixed shows the old projection:** your pick for that scene is stored in this browser and wins over the tags. Choose the projection again, or clear the site's data.
