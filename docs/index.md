A self-hosted, multi-user front end for one or more [Stash](https://github.com/stashapp/stash) servers. Stash stays your library manager; Peek gives each person their own account, ratings, history and limits on what they can see. [Read more about what Peek is](what-peek-is.md).

**Get started quickly:**

- [**Installation**](getting-started/installation.md) - Get up and running with Docker or unRAID
- [**Configuration**](getting-started/configuration.md) - Connect Peek to your Stash server
- [**Troubleshooting**](getting-started/troubleshooting.md) - Common issues and solutions

### What Peek Adds to Stash

- **Accounts and Access** - Admin and user roles, [groups that grant sharing and download permissions](user-guide/user-management.md#user-groups) (denied by default), recovery keys, sign-in through an SSO proxy, and a setup wizard
- **Your Own Data** - Ratings, favorites, watch history, resume points, O counts and hidden items belong to each user, on all seven kinds of item; the ratings and counts you see are yours, not Stash's ([Watch History](user-guide/watch-history.md))
- **Content Restrictions** - Admins give a user show-only or always-hide lists of collections, tags, studios and galleries, applied everywhere ([Learn more](user-guide/content-restrictions.md))
- **Hidden Items** - Hide anything for yourself ([Learn more](user-guide/hidden-items.md))
- **Several Stash Servers** - One Peek in front of several Stash servers; each user chooses which they see ([Learn more](getting-started/configuration.md#multi-instance-support))
- **Media Through Peek** - Streams, captions and images are proxied through Peek, so users never get Stash's address or API key. Stash's own transcodes mean no duplicate transcoding. External players and cast devices get a personal signed link ([Learn more](user-guide/external-player.md))
- **Playlists and Sharing** - Create, organize and play named playlists, and share them with groups ([Learn more](user-guide/playlists.md))
- **Browsing** - TV mode, timeline and folder views, recommendations and similar scenes from your own history ([Learn more](user-guide/recommendations.md))
- **Downloads** - Scene files and playlist zips with NFO files, for the users and groups you allow ([Learn more](user-guide/downloads.md))
- **Modern Interface** - Responsive React UI, optimized for all devices, with themes and per-user customization
- **Scalable Library** - Built for libraries of 100,000 scenes and more

Peek never edits your Stash metadata. To reach Peek from outside your network, put it behind a [reverse proxy](getting-started/configuration.md#behind-a-reverse-proxy).

## Requirements

- Stash server with GraphQL API enabled and an API key configured (Settings → Security)
- Docker (or Docker on unRAID)
- Network access between Peek and Stash

## Architecture

Peek uses a **single-container architecture**:

- **Frontend**: React 19 app served by nginx
- **Backend**: Node.js/Express API server (proxied through nginx)
- **Database**: SQLite (embedded, no separate container)
- **Streaming**: Proxied through Peek from Stash, using Stash's own transcodes (no local transcoding)

## Community & Support

- **Questions and community**: [Peek thread on the Stash forum](https://discourse.stashapp.cc/t/peek-stash-browser/4018)
- **Bug Reports and Feature Requests**: [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)

## License

This project is licensed under the MIT License.

## Acknowledgments

Built with [Stash](https://github.com/stashapp/stash), React, Express, and other amazing open source projects.
