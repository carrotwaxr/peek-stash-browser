# Configuration

Peek Stash Browser is configured through environment variables and the setup wizard. This page documents all available configuration options.

## Stash Connection (Setup Wizard)

As of v2.0, Stash connection details are configured via the **Setup Wizard** and stored in the database:

- **Stash URL**: Your Stash GraphQL endpoint (e.g., `http://192.168.1.100:9999/graphql`)
- **Stash API Key**: API key from Stash Settings → Security

The wizard runs automatically on first access. No environment variables needed for Stash connection!

> **Upgrading from v1.x?** Your existing `STASH_URL` and `STASH_API_KEY` environment variables will auto-migrate to the database on first start. You can remove them from your container configuration after successful migration.

## Multi-Instance Support

Peek can connect to **multiple Stash servers** simultaneously. This is useful when you have separate Stash instances for different media types, locations, or libraries.

### Adding Instances

**Location:** Settings → Server Configuration → Stash Instances

1. Click **Add Instance**
2. Fill in the instance details:
   - **Name** (required) — Display name (e.g., "Main Library", "Archive Server")
   - **Description** — Help users understand what content this instance contains
   - **URL** (required) — Stash GraphQL endpoint (must end with `/graphql`)
   - **API Key** (required) — From the Stash instance's Settings → Security
   - **Priority** — Lower number = higher priority for deduplication
3. Click **Test Connection** to validate
4. Save the instance

Peek automatically triggers a full sync for new instances in the background. If a sync is already running, the new instance syncs right after it.

### Managing Instances

Each instance can be:

- **Edited**: Update URL, API key, name, or priority
- **Enabled/Disabled**: Temporarily hide an instance without deleting it
- **Deleted**: Permanently remove it, with its cached library and every user's ratings, favorites, watch and O history, image views, playlist entries, hidden items and downloads for it. Peek refuses while a sync is running, and the last enabled instance cannot be deleted. To keep all of that, disable the instance instead.

### Sync Status

**Location:** Settings → Server Configuration → Sync status

Each instance has a table of its entity types: when each last had a full sync, the newest change Peek has from Stash, the last run's count and duration, and any problem the last run had with that type (a Stash error, a timeout, or a cleanup that was skipped or held back). While a sync runs, the status refreshes every 10 seconds and an **Abort sync** button stops it. **Full Sync** under Server Statistics asks before it starts. See [Sync Problems](troubleshooting.md#sync-problems) for what each problem means.

**Sync Interval**, above the status, sets how often Peek checks Stash for changes (every hour by default). A new interval takes effect at once: the next scheduled sync comes one new interval after you save it. Saving it does not start a sync. Scheduled syncs begin as soon as the setup wizard has saved the first instance, with no restart.

### Per-User Instance Selection

When multiple instances are configured, each user can choose which instances they see content from:

**Location:** Settings → Content → Content Sources

- Check or uncheck instances to control which content appears in your library
- At least one instance must remain selected
- New users see all instances by default

!!! tip "First-Login Setup"
    When a new user logs in and multiple instances are available, they're prompted to select which instances they want to see.

### How Multi-Instance Content Works

- Content from all selected instances appears together in search results, carousels, and browsing pages
- Each entity is tagged internally with its source instance
- If the same content exists on multiple instances, the instance with the lowest priority number is used as the primary source
- Ratings, watch history, and playlists track which instance each scene belongs to

## Required Environment Variables

None. Peek starts with no environment variables set; everything below is optional.

## Optional Environment Variables

These settings have sensible defaults but can be customized:

| Variable             | Description                | Default                                | Notes                        |
| -------------------- | -------------------------- | -------------------------------------- | ---------------------------- |
| `JWT_SECRET`         | Signs login sessions       | Generated on first start, kept in `/app/data/.jwt-secret` | Set it only to control the value. Values copied from examples in these docs are ignored, with a warning in the log |
| `DATABASE_URL`       | SQLite database file       | `file:/app/data/peek-stash-browser.db` | Fixed in the Docker image; ignored with a warning if set |
| `CONFIG_DIR`         | Where backups and download zips go | `/app/data`                    | The database stays in `/app/data`. A directory outside `/app/data` is given to `PUID:PGID` on start |
| `PUID`               | User that owns `/app/data` and runs the server | `99` (unRAID's `nobody`) | See [File ownership](installation.md#file-ownership-puidpgid). `0` runs as root, with a warning |
| `PGID`               | Group that owns `/app/data` | `100` (unRAID's `users`)              | See [File ownership](installation.md#file-ownership-puidpgid) |
| `LOG_LEVEL`          | Server log detail          | `INFO`                                 | `ERROR`, `WARN`, `INFO`, `DEBUG` or `VERBOSE`. No level logs Stash API keys or signed stream links, so a `DEBUG` log is safe to share |
| `NODE_ENV`           | Environment mode           | `production`                           | `development` or `production`|
| `PROXY_AUTH_HEADER`  | Proxy Auth Header          |                                        | Disabled by default          |
| `PROXY_AUTH_TRUSTED_IPS` | Addresses allowed to send `PROXY_AUTH_HEADER` | Unset (any address, with a startup warning) | Comma-separated IPs and CIDR ranges of your auth proxy. See [Trusted proxy addresses](#trusted-proxy-addresses) |
| `TRUST_PROXY`        | Reverse proxies in front of Peek | Unset (trusts only the image's own nginx) | Set to the number of reverse proxies between browsers and Peek. See [Behind a reverse proxy](#behind-a-reverse-proxy) |

### Generating a JWT Secret

Only needed if you set `JWT_SECRET` yourself.

**Linux/macOS/unRAID:**
```bash
openssl rand -base64 32
```

**Windows PowerShell:**
```powershell
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

## Video Streaming (v2.0+)

As of v2.0, **Peek streams video directly through Stash** - no local media access required!

- Videos are proxied through the Stash API
- No media volume mounts needed
- No path mapping configuration required
- Simpler container setup

This is a significant simplification from v1.x which required mounting media directories and configuring path mappings.

## Security Settings

| Variable         | Description                    | Default | When to Use                  |
| ---------------- | ------------------------------ | ------- | ---------------------------- |
| `SECURE_COOKIES` | Enable secure cookie flag      | `false` | Set to `true` when using HTTPS reverse proxy |

!!! warning "Security Best Practices"
    - Keep `/app/data` private: it holds the database, which stores each Stash API key in plain text, and the generated session secret
    - Set `SECURE_COOKIES=true` when using HTTPS
    - **Never expose Peek directly to the internet** - always use a reverse proxy
    - Admin credentials are created during setup wizard (no default passwords)
    - Stash API keys are stored in the database in plain text (not in environment variables): anyone who can read `/app/data` can read them

### Behind a reverse proxy

The image trusts its own nginx, so sign-in lockouts and rate limits see each visitor's address when browsers reach the container directly. With SWAG, Nginx Proxy Manager, Traefik or Caddy in front, set `TRUST_PROXY=1` (one per proxy) so they still see each visitor's address rather than the proxy's.

!!! warning
    Never set `TRUST_PROXY` higher than the real number of proxies. A higher value lets anyone fake their address and get around lockouts and rate limits.

### Security headers and third parties

The bundled nginx sends a Content Security Policy and four other security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`) on every response. A reverse proxy in front should pass them through unchanged. Peek sends no HSTS header, because it usually runs over plain HTTP on a LAN: if you serve it over HTTPS, set HSTS on that proxy.

Peek serves its own fonts. The browser loads nothing from third parties, apart from the admin-only update check, which asks the GitHub API for the latest release.

## Proxy Authentication

Peek supports delegating authentication to your reverse proxy (e.g., Nginx, Traefik, Caddy, Authelia, Authentik). This is useful when you already have an authentication system in place and want Peek to trust the authenticated user from the proxy.

### How It Works

1. Your reverse proxy handles authentication (SSO, OAuth, basic auth, etc.)
2. The proxy adds a header with the authenticated username to all requests
3. Peek reads this header, from the proxy's address only when `PROXY_AUTH_TRUSTED_IPS` is set, and looks up the corresponding user in its database
4. If no header is present, Peek falls back to standard JWT token authentication

### Configuration

Set the `PROXY_AUTH_HEADER` environment variable to the name of the header your proxy uses:

```bash
PROXY_AUTH_HEADER=X-Peek-Username
```

Common header names:
- `X-Peek-Username` (recommended)
- `X-Forwarded-User` (common with Authelia/Traefik)
- `Remote-User` (common with Nginx auth_request)
- `X-Auth-Request-User` (oauth2-proxy)

### Trusted proxy addresses

Set `PROXY_AUTH_TRUSTED_IPS` to your proxy's address, so Peek honours the header only from there:

```bash
PROXY_AUTH_TRUSTED_IPS=172.18.0.5
```

It takes comma-separated IP addresses and CIDR ranges, IPv4 or IPv6 (for example `172.18.0.5, 192.168.1.0/24`). Use the address the proxy connects to Peek from, as Peek sees it. When the proxy and Peek share a Docker network, that is the proxy container's address on that network; when the proxy runs on the host and reaches a published port, it is usually the Docker network's gateway (`172.17.0.1` on the default bridge). `TRUST_PROXY` does not change which address is checked.

Peek logs the address for you:

- `Proxy auth: ignored the Remote-User header from 172.18.0.5, which is not in PROXY_AUTH_TRUSTED_IPS` (a warning, at most once every 10 minutes per address): the request carried the header from an address outside the list, so Peek ignored the header and fell back to the session cookie. If that address is your proxy, add it.
- `Proxy auth: signed in from header` (info, the first time and then at most once an hour per user) gives the username and the proxy's address as `peer`.
- `Proxy auth: the header names no Peek user` (a warning, at most once every 10 minutes per username and address): the proxy passed a username that has no Peek account.

Without `PROXY_AUTH_TRUSTED_IPS`, Peek honours the header from any address, as earlier versions did, and logs a warning at startup: anyone who can reach Peek's port can sign in as any user by sending the header. If an entry is not an address or a range, Peek logs an error naming it at startup and honours the header from no address until you fix it.

### External player links

External players (VLC, Android video apps) cannot pass your single-sign-on login to the proxy. The external player button therefore gives each user a personal, signed link, and Peek checks the signature itself. Let requests to `GET /api/scene/*/proxy-stream/stream` that carry a `sig` query parameter through the proxy without authentication; everything else stays behind it. Peek still rejects an expired, tampered or foreign link with 401, and applies that user's hidden items and content restrictions.

### Security Requirements

!!! danger "Critical Security Requirements"
    When using proxy authentication, you **MUST** ensure:
    
    1. **Peek is NOT accessible directly** - Publish Peek's port only to the proxy: put both on one Docker network and publish no port, or bind the port to the proxy's host only (`-p 127.0.0.1:6969:80`)
    2. **The proxy sanitizes the authentication header** - The proxy must strip any user-supplied headers with the same name to prevent header injection attacks
    3. **Network isolation** - Peek should only listen on localhost or a private network, not on public interfaces
    4. **`PROXY_AUTH_TRUSTED_IPS` names the proxy** - so a request that reaches Peek any other way is not signed in from the header
    
    **Failure to follow these requirements will allow anyone to impersonate any user by setting the header in their request.**

### Example: Nginx with auth_request

```nginx
location / {
    # Authentication endpoint
    auth_request /auth;
    
    # Pass authenticated username to Peek
    auth_request_set $user $upstream_http_x_auth_user;
    proxy_set_header Remote-User $user;
    
    # CRITICAL: Strip any user-provided Remote-User headers
    proxy_set_header Remote-User "";  # Clear first
    proxy_set_header Remote-User $user;  # Then set from auth
    
    # Proxy to Peek
    proxy_pass http://localhost:6969;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

```bash
# Peek configuration
PROXY_AUTH_HEADER=Remote-User
# Where nginx connects from, as Peek sees it (the default bridge's gateway
# here); the "ignored the Remote-User header from" log line names yours
PROXY_AUTH_TRUSTED_IPS=172.17.0.1
```

### Example: Traefik with ForwardAuth (Authelia)

```yaml
# docker-compose.yml
services:
  traefik:
    labels:
      - "traefik.http.middlewares.authelia.forwardauth.address=http://authelia:9091/api/verify?rd=https://auth.example.com"
      - "traefik.http.middlewares.authelia.forwardauth.authResponseHeaders=Remote-User"
      
  peek:
    environment:
      - PROXY_AUTH_HEADER=Remote-User
      # Traefik's address on the network it shares with Peek
      - PROXY_AUTH_TRUSTED_IPS=172.18.0.2
    labels:
      - "traefik.http.routers.peek.middlewares=authelia@docker"
```

### User Management

Users **must exist** in Peek's database for proxy authentication to work:

1. Create users through Peek's admin panel (Settings → User Management)
2. The **username** in Peek must **exactly match** the username passed by the proxy
3. User roles and permissions are still managed within Peek
4. Passwords are not used when proxy auth is enabled (but must still be set in the database)

### Fallback Behavior

When `PROXY_AUTH_HEADER` is set but the header is not present in a request, Peek falls back to standard JWT cookie authentication. This allows:

- Mixed authentication (some users via proxy, others via direct login)
- API access using JWT tokens
- Testing and development without the proxy

### Troubleshooting

**401 Unauthorized - User not found**
- Verify the user exists in Peek's database
- Check that usernames match exactly (case-sensitive)
- Verify the proxy is passing the correct header name
- Look for `Proxy auth: the header names no Peek user` in the log, with the username Peek received

**The header is ignored and Peek shows its login page**
- Look for `Proxy auth: ignored the ... header from <address>` in the log and add that address to `PROXY_AUTH_TRUSTED_IPS` if it is your proxy
- An invalid entry turns header sign-in off: the startup log names it

**Users being logged in as wrong user**
- **CRITICAL**: Your proxy is not sanitizing the header properly
- Verify the proxy strips user-supplied headers before setting the authenticated value
- Check that Peek is not accessible directly (bypass proxy)

## Example Configurations

### Minimal Production Configuration (v2.0+)

```bash
# No variables are required
# Stash connection configured via Setup Wizard (stored in database)
# All other settings use defaults
```

### Complete Production Configuration

```bash
# Backups and download zips (Optional - default shown)
CONFIG_DIR=/app/data

# File ownership (Optional - defaults shown)
PUID=99
PGID=100

# Security (Optional)
SECURE_COOKIES=true

# Environment (Optional)
NODE_ENV=production

# Stash connection configured via Setup Wizard (stored in database)
```

### Development Configuration

```bash
# Database (local SQLite file)
DATABASE_URL=file:./data/peek-db.db

# Development
NODE_ENV=development

# Stash connection configured via Setup Wizard
```


## Docker Compose Example

```yaml
services:
  peek:
    image: carrotwaxr/peek-stash-browser:latest
    container_name: peek-stash-browser
    ports:
      - "6969:80"
    volumes:
      - peek-data:/app/data
    environment:
      # Optional
      - NODE_ENV=production
      - SECURE_COOKIES=false
    restart: unless-stopped

volumes:
  peek-data:
```

!!! tip "Stash Connection"
    Stash URL and API key are configured via the Setup Wizard on first access and stored in the database.

!!! warning "Port Conflict with Whisparr"
    Peek's default port (6969) is the same as Whisparr's default port. If you're running Whisparr, change the port mapping to `"6970:80"` or another available port.

## Troubleshooting Configuration Issues

### Cannot Connect to Stash

Check:

- Stash URL is accessible from the Peek container
- Stash API key is correct and not expired
- Stash GraphQL API is enabled

Test connectivity:

```bash
docker exec peek-stash-browser curl http://your-stash-ip:9999/graphql
```

You can update Stash connection details in Settings → Stash Configuration.

### Videos Won't Play

Check:

- Stash connection is configured correctly (Settings → Stash Configuration)
- Stash server is running and accessible
- The scene exists in Stash and has a valid video file

### Authentication Issues

Check:

- If you set `JWT_SECRET`, keep it the same across restarts; changing it signs everyone out
- `SECURE_COOKIES` matches your HTTP/HTTPS setup
- Database is writable

## Next Steps

- [Quick Start Guide](quick-start.md)
- [Troubleshooting](troubleshooting.md)
