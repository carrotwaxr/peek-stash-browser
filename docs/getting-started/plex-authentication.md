# Plex server connection and sign-in

Connect a Plex owner account, select its server, and import the full Plex accounts that have accepted access. Manage their Peek activation and roles inside Peek. Plex sign-in remains optional and disabled by default; keep an enabled local administrator for recovery.

## Container configuration

No Plex-specific environment variables, manually generated UUID, or public URL are required. Start Peek with its normal port and persistent `/app/data` volume, finish local administrator setup, then enable Plex under **Settings ? Server Configuration ? Plex server connection**.

For example, after loading or building the custom image on Unraid:

```sh
mkdir -p /mnt/user/appdata/peek-plex
docker run -d --name peek-plex --restart unless-stopped \
  -p 6970:80 \
  -v /mnt/user/appdata/peek-plex:/app/data \
  -e PUID=99 -e PGID=100 \
  peek-plex:local
```

Open `http://YOUR-SERVER-IP:6970` and complete setup. The example image tag is the locally built custom image described below.

Peek generates a stable client identifier automatically and stores it with the enabled flag in `<CONFIG_DIR>/plex-settings.json`. Include this file in appdata backups. Existing installations import `PLEX_CLIENT_IDENTIFIER` and `PLEX_AUTH_ENABLED` on first use; after that, the UI controls the saved enabled flag. `PLEX_PUBLIC_URL` is no longer used. Keep `PLEX_PRODUCT` only if you want a custom application name.

Local HTTP access such as `http://192.168.1.10:6970` works without a reverse proxy. For access over the internet, use HTTPS through your reverse proxy. Preserve the browser's Host header, including its port, and Origin header. No Plex callback URL or inbound Plex connection is required: Peek polls Plex from the backend.

Cookies automatically use the Secure flag for direct TLS or matching HTTPS browser Origin/Referer headers. An existing explicit `SECURE_COOKIES=true` or `false` remains an override. A container configured with `SECURE_COOKIES=true` must be accessed over HTTPS; remove the override to use automatic detection. `TRUST_PROXY` remains a separate general setting for client IP handling and should match your actual proxy chain; it is not needed for Plex URL detection.

Leave `PROXY_AUTH_HEADER` unset unless you deliberately use a separately secured authentication proxy. Plex uses Peek's normal session cookies. Local HTTP is suitable for trusted local networks; it does not encrypt sessions in transit.

## Connect and import

1. Finish Peek's setup wizard and sign in using a local administrator.
2. Open **Settings → Server Configuration → Plex server connection**.
3. Enable **Plex integration**, then choose **Connect Plex owner account**, open the authorization link in a new tab, and sign into the full Plex account that owns your server. Return to the original Peek tab.
4. Select one of the servers owned by that account and choose **Select server and import users**.
5. Open **Settings → User Management → Plex users**. The owner and accepted full accounts are already listed, with their Peek profiles created. Newly imported profiles are inactive and have the **User** role.
6. Choose **Activate** for each permitted user. Use the **Role** selector to explicitly assign **User** or **Admin**. Admin assignment requires confirmation and uses Peek's existing role/permission handling. Plex ownership never automatically grants Peek administrator privileges.

The importer excludes managed Home profiles, pending invitations, and accounts shared only to another server. It uses immutable Plex account IDs, not names or emails, for linkage. Usernames are used for display and for new Peek profiles; name collisions get a unique suffix rather than being linked to a local account. The owner is imported as a normal inactive User unless already explicitly linked to an existing profile.

**Access scope:** standard Peek users without instance selections can see all enabled Stash instances, subject to content restrictions. Instance selection is a viewing preference, not an access boundary. Configure restrictions for activated users as needed.

## Sign in with Plex

The login screen displays **Sign in with Plex** when enabled. The user follows the authorization link, completes Plex sign-in in a new tab, and returns to Peek. Peek verifies their account on its backend and requires an active imported identity with membership in the selected server before issuing its normal session.

- An active member returns to the same Peek profile, playlists, history and assigned role.
- An inactive member or unknown account is denied access.
- The browser receives no persistent Plex token. The temporary PIN code and public client identifier appear in Plex's required authorization URL fragment.

PIN flows expire after at most ten minutes, are browser-bound and single-use, and are kept only in memory. A restart requires starting sign-in again. Complete one flow at a time per browser. Deploy one backend process; pending flows are not shared across replicas.

## Existing local profiles

To use Plex with an existing local profile, sign into that profile first and open **Settings → Account → Link Plex account**. Enter its current local password, then verify the full Plex account through the authorization link. The account must be a verified member of the connected server.

An untouched inactive imported placeholder can be replaced by this verified link. The placeholder record remains inactive, and the existing local profile keeps its history and settings. Linking does not activate an inactive Plex identity; an administrator must still activate it. An already activated, used, or privileged imported profile cannot be replaced automatically. There is no email/username matching, automatic merge, or arbitrary administrator reassignment.

Deactivating Plex for a linked local profile leaves its local login available. To block all methods, use **Disable a Peek account across all sign-in methods** under User Management. Plex-only profiles cannot establish a local password through recovery or administrator reset.

## Synchronization and revocation

Use **Sync now** for an immediate refresh. Peek also syncs at startup when connected and every **30 minutes** while running.

- New members are imported as inactive Users.
- Existing activation choices, roles, usernames and Peek activity are preserved.
- A successfully verified removal clears server membership and Plex activation. Existing Plex sessions and signed media links are refused on their next authenticated request after that sync. A response or stream already in progress is not forcibly terminated.
- Returning members remain inactive until manually reactivated; they keep their profile and previously assigned role.
- Incomplete, malformed, oversized, or failed API responses do not replace the last successful membership snapshot. The admin screen shows a sync error, and the scheduler retries next interval. New inactive placeholder records may remain if a database error interrupts a batched import; they grant no access.

Revocation therefore follows the last successful sync, not real-time Plex events. During an API outage, last-known membership remains in use. For immediate denial, deactivate the user in Peek rather than waiting for Plex synchronization. Changing to a different server requires reactivating users. A disconnect clears the encrypted owner credential and all Plex activation/membership while retaining profiles and their data.

The connection uses Plex's account APIs (`/api/v2/resources` and `/api/users/`), not a Plex Media Server database or its local account history. Resources determine ownership; user/server references determine accepted membership. These sharing APIs can evolve, so a live import check is required before upgrading a production instance. See the [PlexAPI source](https://github.com/pushingkarmaorg/python-plexapi/blob/master/plexapi/myplex.py) for their data model and [Plex's PIN flow](https://forums.plex.tv/t/authenticating-with-plex/609370/) for authorization.

## Owner credential storage and recovery

Background sync requires retaining the owner's Plex token. Peek encrypts it with **AES-256-GCM**, using a separate random 32-byte key in `<CONFIG_DIR>/.plex-key` (`/app/data/.plex-key` in the standard container). The key file is created with owner-only permissions. Neither this key nor a Plex token is returned through the admin API, placed in a URL, or logged. Ordinary user tokens are discarded after verification.

Back up the entire appdata directory, including `plex-settings.json`, `.plex-key`, the SQLite database, and `.jwt-secret` if used. Database-only backups do not include the encryption key. Restore the matching key with its database or reconnect the Plex owner account; a missing or mismatched key does not grant access or silently decrypt credentials with a new key.

Use **Disconnect Plex** to remove the retained encrypted credential. To revoke its authorization at Plex as well, remove this Peek app's device in Plex's **Authorized Devices** settings. Backups may retain older encrypted credentials, so keep backups protected. If rotating a lost/compromised key, disconnect, replace the key safely while the container is stopped, then reconnect; revoke the old device at Plex where appropriate.

The local administrator remains available when Plex is disabled, disconnected, or unavailable. Peek prevents disabling, deleting, or demoting its last enabled local administrator through these user-management operations. Local recovery should be tested before relying on Plex.

## Upgrade the Unraid test container

The changes are in your local feature branch; cloning upstream will not include them. Export the committed source from Windows:

```powershell
cd C:\scripts\peek-plex-integration\peek-stash-browser
git archive --format=tar --output=..\peek-plex-source.tar HEAD
```

Copy the archive to your Unraid share. The following commands use the test paths from the earlier setup; substitute your actual paths if different. Stop the test container and back up `/mnt/user/appdata/peek-plex-test` before upgrading. Leave the production Peek container on its separate data directory.

```sh
cd /mnt/user/appdata/peek-plex-build
tar -xf /mnt/user/appdata/peek-stash-browser/peek-plex-source.tar
docker build -f Dockerfile.production -t peek-plex:local .
```

`peek-plex:local` is a local custom image tag, not a published upstream image. Source exports now preserve LF line endings for shell scripts via `.gitattributes`; do not edit the scripts with CRLF before building.

Recreate `peek-plex-test` with that new image, retaining its existing environment variables, stable client identifier, and `/mnt/user/appdata/peek-plex-test:/app/data` mapping. Restarting the existing container alone does not replace its image. In an Unraid template, keep container port **80**, your selected host port (the earlier test used **6970**), PUID/PGID, and proxy hostname. No new environment variables are needed for owner connection, server selection, or the fixed 30-minute sync.

The application applies the new migration on startup. It adds connection storage and Plex membership metadata without replacing existing user IDs. Before connecting a server, existing manual approvals remain compatible; after connecting, only imported server members can use Plex. The UI now manages imported users rather than asking administrators to enter Plex IDs manually.

For rollback, stop the test container and restore the full pre-upgrade appdata backup and the exact earlier image/configuration. Switching images alone does not revert database migrations. Do not mount the live production data directory into the test container, run two containers on the same database, or use the root development `docker-compose.yml` as a production deployment.

## Verification

See [Plex validation](../development/plex-validation.md) for exact commands and results. Test against a copy of appdata first: owner connection, correct-server import, inactive denial, activation, explicit Admin assignment, existing-profile linking, sync/removal/reactivation, disconnect, and local-admin recovery.
