# Using Several Stash Servers

One Peek can sit in front of several Stash servers. This page is for people who browse a Peek that has more than one; to add or remove servers, see [Multi-Instance Support](../getting-started/configuration.md#multi-instance-support) in Configuration (admins only).

Peek calls a server an instance in some places, and the Settings page calls the choice **Content Sources**. They are the same thing.

## Choosing which servers you see

**Location:** Settings → User Preferences → Content → Content Sources

Tick the servers whose content you want in your library. Each change saves as you click, and every page then lists content from the ticked servers only: scenes, performers, tags, search results, carousels, playlists and the timeline.

- At least one server stays ticked. Peek ignores a click that would untick the last one.
- This is a preference, not access control. It only narrows what you see, and you can change it at any time. Your content restrictions and hidden items apply to every server, whatever you tick.
- Only servers an admin has enabled are listed. A disabled server never shows, even if you had ticked it.
- If you have never made a choice, or an admin disables every server you ticked, you see all the enabled servers until you choose again.
- The **Content Sources** section appears only when two or more servers are enabled. With one, there is nothing to choose.

### The first sign-in

When you sign in for the first time and two or more servers are enabled, Peek asks which ones you want to see as part of the first-sign-in setup. All of them are ticked to start with. You can change the choice later in Settings.

### A server that was just added

A new server stays hidden from everyone until its first sync has finished, so you will not see its content before your restrictions and hidden items can apply to it. If you ticked only that server, you see a notice that the library is syncing. See [Configuration](../getting-started/configuration.md#adding-instances) for the admin side.

## Your data belongs to one server

Ratings, favorites, O counts, watch history, resume points and hidden items are kept per account and per server. A scene on two servers is two scenes to Peek, each with its own rating and history. Playlist entries remember which server their scene came from, so a playlist can hold items from several servers.

Peek does not merge the same content across servers: each server's copy is listed separately. An admin sets a priority number on each server; it orders the server lists and decides which server's names show without a suffix (below).

## Same name, two servers

Filter lists (performers, tags, studios and the like) show a name once per item. When two servers have an item with the same name, the one from the server with the higher priority number gets the server's name added, for example `Jane Doe (Archive Server)`. The server with the lowest priority number gets no suffix. A name that exists on one server only never gets one.

## Troubleshooting

**Content I expect is missing.** Check Content Sources: the server may be unticked. Also check [Hidden Items](hidden-items.md), and ask an admin whether the server is enabled and has finished its first sync.

**There is no Content Sources section.** Only one server is enabled, so there is nothing to choose.
