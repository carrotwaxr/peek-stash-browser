# Performance Tips

Optimize Peek Stash Browser for the best performance.

## Hardware Recommendations

| Resource | Minimum | Recommended | Optimal |
|----------|---------|-------------|---------|
| **CPU** | 2 cores | 4 cores | 6+ cores |
| **RAM** | 2 GB | 4 GB | 8+ GB |
| **Storage** | HDD | SSD (appdata) | NVMe SSD |
| **Network** | 100 Mbps | 1 Gbps | 1 Gbps+ |

## Server Optimization

### Media Storage

- **Use local storage**: Network shares (SMB/NFS) are 10-50x slower
- **Use SSD for temp files**: Store `CONFIG_DIR` on fast storage
- **Keep media accessible**: Avoid remote mounts when possible

### Transcoding Performance

- **Allocate sufficient CPU**: Each stream needs ~0.5-1 CPU core
- **Use lower qualities**: 360p/480p transcode faster than 720p
- **Limit concurrent streams**: Each stream adds CPU load

### Docker Configuration

```yaml
# docker-compose.yml
services:
  peek:
    cpus: "4"        # Limit to 4 CPUs
    mem_limit: 4g    # Limit to 4GB RAM
    volumes:
      - /mnt/ssd/media:/app/media:ro  # Fast local storage
      - /mnt/ssd/appdata:/app/data     # SSD for database/cache
```

## Client Optimization

### Browser Performance

- **Use Chrome/Edge**: Best Video.js performance
- **Keep browser updated**: Latest versions have performance improvements
- **Close unused tabs**: Reduces memory usage
- **Disable extensions**: Some extensions slow down video playback

### Network Performance

- **Use wired connection**: WiFi adds latency and packet loss
- **QoS prioritization**: Prioritize video streaming traffic
- **Reduce quality on slow connections**: Use 360p/480p for < 5 Mbps

## Database Performance

### SQLite Optimization

```bash
# Vacuum database periodically
docker exec peek-stash-browser sqlite3 /app/data/peek-db.db "VACUUM;"

# Analyze tables
docker exec peek-stash-browser sqlite3 /app/data/peek-db.db "ANALYZE;"
```

### Backup Without Downtime

```bash
# Online backup
docker exec peek-stash-browser sqlite3 /app/data/peek-db.db ".backup /app/data/backup.db"
```

## Monitoring

### Check Resource Usage

```bash
# Docker stats
docker stats peek-stash-browser

# Check transcoding sessions
docker exec peek-stash-browser ls -la /app/data/hls-cache/

# Check disk usage
docker exec peek-stash-browser du -sh /app/data/hls-cache/
```

### Performance Metrics

Good performance indicators:
- CPU usage: < 80% during transcoding
- Memory usage: < 2 GB for typical workload
- Disk I/O: > 50 MB/s read speed
- Transcoding speed: > 0.8x (real-time or faster)

## Troubleshooting Slow Performance

### Identify Bottleneck

1. **Check CPU**: `docker stats` - High CPU? Reduce quality or streams
2. **Check Memory**: Low memory? Increase Docker memory limit
3. **Check I/O**: Slow disk? Move to SSD or local storage
4. **Check Network**: Slow network? Reduce quality

### Common Solutions

- **Buffering/stuttering**: Reduce quality, check I/O speed
- **Slow seeking**: Media on slow storage
- **High CPU**: Too many streams, reduce quality
- **Slow page loads**: Check browser cache, network speed

## Next Steps

- [Troubleshooting](troubleshooting.md) - Fix common issues
- [Video System](../development/video-system.md) - Understand transcoding
