# Security Best Practices

Protect your Peek installation and user data.

## Default Credentials

!!! danger "Change Default Password Immediately"
    Default credentials: `admin` / `admin`
    
    This is well-known and must be changed after first login!

## Authentication Security

### Strong Passwords

- **Minimum 12 characters** recommended
- Use mix of uppercase, lowercase, numbers, symbols
- Don't reuse passwords from other services
- Consider using a password manager

### JWT Secret

Generate a strong JWT secret:

```bash
# Generate 32-byte random secret
openssl rand -hex 32
```

Add to `.env`:
```bash
JWT_SECRET=your-generated-secret-here
```

### Session Management

- Sessions expire after 24 hours (configurable)
- Revoke sessions when logging out from shared devices
- Review active sessions regularly in Settings

## Network Security

### Don't Expose to Internet

Peek is designed for local network use only.

**Recommended**:
- Access via VPN when remote
- Use reverse proxy with authentication (Authelia, etc.)
- Keep on local network only

**Not Recommended**:
- Direct port forwarding to internet
- Public IP access without authentication layer

### Reverse Proxy Setup

If using reverse proxy (Nginx, Caddy, Traefik):

```bash
# Set secure cookies
SECURE_COOKIES=true

# Behind proxy
# Ensure X-Forwarded-For headers are passed
```

**Nginx example**:
```nginx
location / {
    proxy_pass http://peek:80;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### HTTPS/TLS

When using HTTPS:

1. Configure reverse proxy with valid TLS certificate
2. Set `SECURE_COOKIES=true`
3. Force HTTPS redirects in reverse proxy
4. Use HTTP Strict Transport Security (HSTS)

## File Security

### Read-Only Media Mount

Always mount media as read-only:

```yaml
volumes:
  - /mnt/media:/app/media:ro  # :ro = read-only
```

### Temp File Cleanup

Peek automatically cleans up transcoding temp files after 30 minutes.

Manual cleanup if needed:
```bash
docker exec peek-stash-browser rm -rf /app/data/hls-cache/*
```

### Database Backups

Regular backups protect against data loss:

```bash
# Backup script
#!/bin/bash
DATE=$(date +%Y%m%d)
docker exec peek-stash-browser sqlite3 /app/data/peek-db.db ".backup /app/data/backup-$DATE.db"
```

## User Management

### Principle of Least Privilege

- Create regular user accounts for daily use
- Reserve admin account for administration only
- Don't share admin credentials

### Disable Unused Accounts

Regularly audit and disable:
- Inactive users
- Former users
- Test accounts

## Environment Variables

### Protect Secrets

Never commit `.env` files to version control:

```bash
# .gitignore
.env
.env.local
.env.production
```

### Stash API Key

Protect your Stash API key:
- Don't share publicly
- Rotate if compromised
- Use environment variables, not hardcoded

## Docker Security

### Run as Non-Root

Peek container runs as non-root user for security.

### Resource Limits

Prevent resource exhaustion:

```yaml
services:
  peek:
    cpus: "4"
    mem_limit: 4g
    pids_limit: 200
```

### Keep Updated

- Update Peek container regularly
- Update base OS and Docker
- Subscribe to security advisories

## Monitoring

### Audit Logs

Review logs for suspicious activity:

```bash
# Check for failed login attempts
docker logs peek-stash-browser | grep "401"

# Check for unusual API access
docker logs peek-stash-browser | grep "Unauthorized"
```

### Failed Login Attempts

Monitor for brute force attempts (future feature):
- Account lockout after N failed attempts
- IP-based rate limiting
- Email notifications for suspicious activity

## Incident Response

### If Compromised

1. **Immediately** change admin password
2. Revoke all active sessions
3. Review audit logs for unauthorized access
4. Check for unauthorized users
5. Rotate JWT_SECRET
6. Rotate Stash API key if exposed

### Data Breach

If database is compromised:
1. All user passwords are bcrypt hashed (safe)
2. Change passwords as precaution
3. Rotate JWT_SECRET
4. Review what data was accessible

## Security Checklist

- [ ] Changed default admin password
- [ ] Generated strong JWT_SECRET
- [ ] Media mounted read-only
- [ ] Not exposed to public internet
- [ ] Using HTTPS (if remote access)
- [ ] SECURE_COOKIES enabled (if HTTPS)
- [ ] Regular database backups
- [ ] Docker container updated
- [ ] Audit logs reviewed periodically
- [ ] Unused accounts disabled

## Reporting Security Issues

Found a security vulnerability?

**Do NOT** open a public GitHub issue.

Instead:
1. Email: security@[project-email] (if available)
2. Or create private security advisory on GitHub
3. Include: description, impact, reproduction steps

We'll respond within 48 hours.

## Next Steps

- [Troubleshooting](troubleshooting.md) - Fix security-related issues
- [Settings](../user-guide/settings.md) - Configure security settings
- [unRAID Deployment](../deployment/unraid.md) - Secure deployment guide
