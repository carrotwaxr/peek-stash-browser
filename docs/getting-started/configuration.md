# Configuration

Peek Stash Browser is configured through environment variables and the setup wizard. This page documents all available configuration options.

## Stash Connection (Setup Wizard)

As of v2.0, Stash connection details are configured via the **Setup Wizard** and stored in the database:

- **Stash URL**: Your Stash GraphQL endpoint (e.g., `http://192.168.1.100:9999/graphql`)
- **Stash API Key**: API key from Stash Settings → Security

The wizard runs automatically on first access. No environment variables needed for Stash connection!

> **Upgrading from v1.x?** Your existing `STASH_URL` and `STASH_API_KEY` environment variables will auto-migrate to the database on first start. You can remove them from your container configuration after successful migration.

## Required Environment Variables

| Variable     | Description     | Example                             |
| ------------ | --------------- | ----------------------------------- |
| `JWT_SECRET` | JWT signing key | Generate with `openssl rand -base64 32` |

### Generating JWT Secret

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

## Optional Environment Variables

These settings have sensible defaults but can be customized:

| Variable             | Description                | Default                                | Notes                        |
| -------------------- | -------------------------- | -------------------------------------- | ---------------------------- |
| `DATABASE_URL`       | SQLite database file       | `file:/app/data/peek-stash-browser.db` | Path inside container        |
| `CONFIG_DIR`         | App data directory         | `/app/data`                            | Database location            |
| `NODE_ENV`           | Environment mode           | `production`                           | `development` or `production`|
| `PROXY_AUTH_HEADER`  | Proxy Auth Header          |                                        | Disabled by default          |

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
    - Set a strong `JWT_SECRET` during installation (required)
    - Set `SECURE_COOKIES=true` when using HTTPS
    - **Never expose Peek directly to the internet** - always use a reverse proxy
    - Admin credentials are created during setup wizard (no default passwords)
    - Stash API key is stored securely in the database (not in environment variables)

## Proxy Authentication

Peek supports delegating authentication to your reverse proxy (e.g., Nginx, Traefik, Caddy, Authelia, Authentik). This is useful when you already have an authentication system in place and want Peek to trust the authenticated user from the proxy.

### How It Works

1. Your reverse proxy handles authentication (SSO, OAuth, basic auth, etc.)
2. The proxy adds a header with the authenticated username to all requests
3. Peek reads this header and looks up the corresponding user in its database
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

### Security Requirements

!!! danger "Critical Security Requirements"
    When using proxy authentication, you **MUST** ensure:
    
    1. **Peek is NOT accessible directly** - Only allow access through the reverse proxy
    2. **The proxy sanitizes the authentication header** - The proxy must strip any user-supplied headers with the same name to prevent header injection attacks
    3. **Network isolation** - Peek should only listen on localhost or a private network, not on public interfaces
    
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

**Users being logged in as wrong user**
- **CRITICAL**: Your proxy is not sanitizing the header properly
- Verify the proxy strips user-supplied headers before setting the authenticated value
- Check that Peek is not accessible directly (bypass proxy)

## Example Configurations

### Minimal Production Configuration (v2.0+)

```bash
# Required
JWT_SECRET=your_very_long_random_secret_key_here

# Stash connection configured via Setup Wizard (stored in database)
# All other settings use defaults
```

### Complete Production Configuration

```bash
# Authentication (Required)
JWT_SECRET=your_very_long_random_secret_key_here

# Database (Optional - defaults shown)
DATABASE_URL=file:/app/data/peek-stash-browser.db
CONFIG_DIR=/app/data

# Security (Optional)
SECURE_COOKIES=true

# Environment (Optional)
NODE_ENV=production

# Stash connection configured via Setup Wizard (stored in database)
```

### Development Configuration

```bash
# Authentication
JWT_SECRET=dev-secret-change-in-production

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
      - JWT_SECRET=${JWT_SECRET}
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

- `JWT_SECRET` is set
- `SECURE_COOKIES` matches your HTTP/HTTPS setup
- Database is writable

## Next Steps

- [Quick Start Guide](quick-start.md)
- [Troubleshooting](troubleshooting.md)
