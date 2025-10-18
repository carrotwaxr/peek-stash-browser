# Frequently Asked Questions

Common questions about Peek Stash Browser.

## General

### What is Peek?

Peek is a modern web application for browsing and streaming Stash media content with real-time HLS transcoding. It provides a fast, responsive interface with adaptive quality streaming.

### How is Peek different from Stash?

Peek is a browser/player focused on video playback, while Stash is a comprehensive media organizer. Peek:

- Focuses on smooth video playback with adaptive streaming
- Provides a simplified, browsing-focused interface
- Uses real-time transcoding for universal compatibility
- Complements Stash rather than replacing it

### Does Peek modify my Stash library?

No. Peek is read-only. It connects to Stash's GraphQL API to read data but never modifies your library, files, or metadata.

## Installation

### What platforms are supported?

- **unRAID**: Community Applications or manual Docker install
- **Docker**: Any platform supporting Docker
- **Development**: Node.js 18+ on Windows/Mac/Linux

### Do I need a separate database server?

No. Peek uses embedded SQLite. No PostgreSQL, MySQL, or other database server needed.

### Can I run Peek and Stash on the same server?

Yes. They run as separate containers and don't conflict.

## Video Playback

### Why does transcoding take so long?

Transcoding is CPU-intensive. Performance depends on:

- Server CPU power
- Storage I/O speed (SSD vs HDD vs network)
- Original video codec and resolution
- Target quality selected

For best performance, use local SSD storage and allocate 2-4 CPU cores.

### Why can't I play videos directly without transcoding?

Direct play is planned but not yet implemented. Currently, all videos are transcoded to HLS for:

- Universal browser compatibility
- Adaptive quality switching
- Fast seeking with HLS segments
- Consistent playback experience

### Can I download the original video file?

Original file downloads are planned but not yet implemented. Currently, only transcoded HLS streams are available for playback.

## Configuration

### Where are my settings stored?

- **User preferences**: SQLite database in `/app/data/peek-db.db`
- **Server config**: Environment variables
- **Temp files**: `/app/data/hls-cache/` (auto-cleaned)

### How do I backup my data?

```bash
# Backup SQLite database
docker exec peek-stash-browser sqlite3 /app/data/peek-db.db ".backup /app/data/backup.db"

# Copy backup out of container
docker cp peek-stash-browser:/app/data/backup.db ./peek-backup.db
```

### Can I customize the theme?

Dark and light themes are built-in. Custom themes and color schemes are planned for a future release.

## Performance

### How many concurrent streams can Peek handle?

Depends on server CPU:

- **2 CPU cores**: 1-2 streams at 720p
- **4 CPU cores**: 3-4 streams at 720p
- **6+ CPU cores**: 5+ streams at 720p

Lower qualities (480p, 360p) require less CPU and support more concurrent streams.

### Why is my media loading slowly?

Check storage speed:

```bash
docker exec peek-stash-browser dd if=/app/media/test.mp4 of=/dev/null bs=1M count=100
```

If < 50 MB/s, media is likely on:
- Network share (SMB/NFS) - Move to local storage
- Slow HDD - Upgrade to SSD
- USB drive - Use internal storage

### How much disk space does Peek need?

- **App data**: ~100 MB (database, config)
- **Temp files**: ~50-100 MB per quality per minute of video
- **Recommendation**: 5-10 GB for temp storage on busy servers

Temp files are automatically cleaned up after 30 minutes.

## Troubleshooting

### Videos won't play

1. Check FFmpeg is installed: `docker exec peek-stash-browser ffmpeg -version`
2. Verify path mapping is correct
3. Check file permissions on media
4. Review backend logs for errors

See: [Troubleshooting Guide](troubleshooting.md)

### Can't connect to Stash

1. Verify `STASH_URL` is correct and accessible from container
2. Check Stash API key is valid
3. Test connectivity: `docker exec peek-stash-browser curl http://stash:9999/graphql`

### Login doesn't work

- Check cookies are enabled
- Verify `JWT_SECRET` is set
- Try incognito mode
- Clear browser cache

## Features

### When will playlists be available?

Playlists are planned for a future release. Track progress on GitHub Issues.

### Can I use Peek on mobile?

Yes. The web interface is responsive and works on mobile browsers. A dedicated mobile app is not currently planned.

### Does Peek support hardware transcoding?

Not yet. Hardware-accelerated transcoding (GPU) is planned for a future release to improve performance and reduce CPU usage.

### Can I use Peek without Stash?

No. Peek requires a Stash server for media library management and metadata. Peek is designed as a companion to Stash, not a replacement.

## Security

### Is Peek secure?

Peek includes:
- JWT authentication
- Bcrypt password hashing
- Read-only media access
- Session management

**Important**: Change the default admin password immediately!

See: [Security Best Practices](security.md)

### Should I expose Peek to the internet?

No. Peek is designed for local network use. For remote access:
- Use VPN
- Use reverse proxy with authentication layer
- Don't expose directly to internet

## Support

### Where can I get help?

- **Documentation**: https://carrotwaxr.github.io/peek-stash-browser
- **GitHub Issues**: Bug reports and feature requests
- **Stash Discord**: #third-party-integrations channel

### How do I report a bug?

1. Search existing issues first
2. Gather logs and error messages
3. Create detailed issue on GitHub
4. Include: version, platform, steps to reproduce

See: [Contributing Guide](../development/contributing.md)

### Can I contribute?

Yes! Contributions are welcome:
- Code improvements
- Bug fixes
- Documentation
- Translations (future)

See: [Contributing Guide](../development/contributing.md)

## Next Steps

- [Installation](../getting-started/installation.md) - Install Peek
- [Troubleshooting](troubleshooting.md) - Fix common issues
- [Performance Tips](performance.md) - Optimize performance
