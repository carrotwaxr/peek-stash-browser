# What Peek Is

Peek is a self-hosted, multi-user front end for one or more [Stash](https://github.com/stashapp/stash) servers. It is built for a household or a group of people who share a Stash library and want each person to have their own account, their own ratings and history, and their own limits on what they can see.

Stash stays your library manager: it scans your files, scrapes metadata, tags content and transcodes video. Peek is how several people browse the result.

## Accounts and access

- **Two roles.** An admin manages users, groups, restrictions and servers. A user browses and watches.
- **Setup wizard.** The first visit walks you through creating the admin account and connecting your Stash server.
- **Groups and permissions.** Groups grant Can Share, Download Files and Download Playlists. All three are denied by default, and a setting on one user overrides what their groups say. See [User Groups](user-guide/user-management.md#user-groups).
- **Sign-in options.** Recovery keys for a forgotten password, single sign-on through a trusted header from your auth proxy, and a login rate limit with account lockout.

Details: [User Management](user-guide/user-management.md) and [Proxy Authentication](getting-started/configuration.md#proxy-authentication).

## Your own data

Peek keeps these per account, and separately for each Stash server:

- ratings and favorites, on all seven kinds of item (scenes, performers, studios, tags, collections, galleries and images)
- watch history, play counts and resume points
- O counts and image views
- statistics, hidden items, saved Views (filters, sort and display settings), pinned filters, carousels and your theme and other preferences

The rating, favorite, O count and play numbers you see in Peek are yours, not Stash's. Nobody else's activity changes them.

Two optional tools connect this data to Stash. **Sync from Stash** imports a user's ratings, favorites, O counts and plays from Stash. **Sync to Stash** writes a user's data back to Stash, and only an admin can switch it on for a user. See [Syncing with Stash](user-guide/user-management.md#syncing-with-stash).

## Content restrictions

An admin can give a user a **Show only** list and an **Always hide** list of collections, tags, studios and galleries. Tags and studios include the ones beneath them, and Always hide wins over Show only. The restrictions cascade to the items they cover, and they apply everywhere: lists, counts, search, recommendations, direct links, downloads and playback.

Admin accounts are never restricted, and users cannot get around their restrictions.

Every user can also hide items for themselves. Hidden items belong to the person who hid them, and they apply to that person everywhere. See [Content Restrictions](user-guide/content-restrictions.md) and [Hidden Items](user-guide/hidden-items.md).

## Several Stash servers

One Peek can sit in front of several Stash servers. Each user picks which of the enabled servers they see. That choice is a preference, not access control: it only narrows what you see. Servers an admin has disabled never show, and an empty choice means all enabled servers. Ratings, history and playlists remember which server an item came from. See [Using Several Stash Servers](user-guide/multiple-stash-servers.md), and [Configuration](getting-started/configuration.md#multi-instance-support) for adding servers.

## Media through Peek

Streams, captions and images all go through Peek, so a user needs to be signed in to get them. Users never receive Stash's address or API key. An external player such as VLC gets a personal signed link that works for 12 hours. See [External Player](user-guide/external-player.md).

To reach Peek from outside your network, put it behind a reverse proxy. See [Behind a reverse proxy](getting-started/configuration.md#behind-a-reverse-proxy).

## What Peek never does

- It never edits your Stash metadata.
- It never gives users Stash's API key or address.
- It writes to Stash only through Sync to Stash, which an admin switches on for a user.

## Also

- [Playlists](user-guide/playlists.md): named playlists you can share with groups
- [Keyboard Navigation and TV Mode](user-guide/keyboard-navigation.md): drive Peek from a remote or the arrow keys
- [Timeline and Folder views](user-guide/browse-and-display.md): browse by date or by tag hierarchy
- [Recommendations](user-guide/recommendations.md): suggestions and similar scenes built from your own history
- [Downloads](user-guide/downloads.md): scene files and playlist zips with NFO files, for the users and groups you allow
- [Merge Detection](user-guide/merge-detection.md): Peek keeps your data right when scenes are merged in Stash
- [Database backups](user-guide/user-management.md#database-backup): built into the admin tools

## Where to go next

- [Installation](getting-started/installation.md) and [Quick Start](getting-started/quick-start.md)
- [Configuration](getting-started/configuration.md)
- [FAQ](getting-started/faq.md)
