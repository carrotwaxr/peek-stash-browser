# API Reference

This document provides a complete reference for the Peek Stash Browser REST API, including authentication, library endpoints, and video streaming.

## Base URL

All API endpoints are prefixed with `/api` in production:

```
Production:  http://your-server:6969/api
Development: http://localhost:8000/api
```

## Authentication

### POST /api/auth/login

Authenticate a user and receive a JWT token.

**Request Body**:
```json
{
  "email": "admin@example.com",
  "password": "admin"
}
```

**Response** (200 OK):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clxxx1234",
    "email": "admin@example.com",
    "role": "ADMIN",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

**Error Responses**:
- `400 Bad Request`: Missing email or password
- `401 Unauthorized`: Invalid credentials

**Example**:
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin"}'
```

### POST /api/auth/logout

End the current user session.

**Headers**:
```
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "message": "Logged out successfully"
}
```

**Example**:
```bash
curl -X POST http://localhost:8000/api/auth/logout \
  -H "Authorization: Bearer <token>"
```

### POST /api/auth/register

Create a new user account (Admin only).

**Headers**:
```
Authorization: Bearer <admin-token>
```

**Request Body**:
```json
{
  "email": "newuser@example.com",
  "password": "securepassword",
  "role": "USER"
}
```

**Response** (201 Created):
```json
{
  "user": {
    "id": "clxxx5678",
    "email": "newuser@example.com",
    "role": "USER",
    "createdAt": "2025-01-15T10:00:00.000Z"
  }
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input or email already exists
- `403 Forbidden`: Not an admin user

## Library Endpoints

All library endpoints proxy requests to Stash's GraphQL API and require authentication.

### POST /api/library/scenes

Search and filter scenes from Stash library.

**Headers**:
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "filter": {
    "page": 1,
    "per_page": 25,
    "sort": "date",
    "direction": "DESC"
  },
  "scene_filter": {
    "rating100": {
      "modifier": "GREATER_THAN",
      "value": 80
    },
    "performer_favorite": true,
    "duration": {
      "modifier": "GREATER_THAN",
      "value": 300
    },
    "has_markers": "true"
  }
}
```

**Response** (200 OK):
```json
{
  "count": 1234,
  "scenes": [
    {
      "id": "12345",
      "title": "Example Scene",
      "date": "2025-01-15",
      "rating100": 85,
      "duration": 1800,
      "paths": {
        "screenshot": "http://stash:9999/scene/12345/screenshot",
        "preview": "http://stash:9999/scene/12345/preview"
      },
      "files": [
        {
          "path": "/data/videos/scene.mp4",
          "size": "1234567890",
          "duration": 1800,
          "video_codec": "h264",
          "audio_codec": "aac"
        }
      ],
      "performers": [
        {
          "id": "67890",
          "name": "Performer Name",
          "favorite": true
        }
      ],
      "tags": [
        {
          "id": "111",
          "name": "Tag Name"
        }
      ]
    }
  ]
}
```

**Filter Options**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `filter.page` | number | Page number (1-indexed) |
| `filter.per_page` | number | Results per page (default: 25) |
| `filter.sort` | string | Sort field: `title`, `date`, `rating`, `duration` |
| `filter.direction` | string | Sort direction: `ASC`, `DESC` |
| `filter.q` | string | Search query |
| `scene_filter.rating100` | object | Rating filter (0-100) with modifier |
| `scene_filter.duration` | object | Duration filter (seconds) with modifier |
| `scene_filter.performer_favorite` | boolean | Filter by favorite performers |
| `scene_filter.has_markers` | string | Filter scenes with markers |

**Modifiers**:
- `EQUALS`
- `NOT_EQUALS`
- `GREATER_THAN`
- `LESS_THAN`
- `BETWEEN` (requires `value` and `value2`)
- `INCLUDES`
- `EXCLUDES`

**Example**:
```bash
curl -X POST http://localhost:8000/api/library/scenes \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "page": 1,
      "per_page": 25,
      "sort": "date",
      "direction": "DESC"
    }
  }'
```

### POST /api/library/performers

Search and filter performers from Stash library.

**Request Body**:
```json
{
  "filter": {
    "page": 1,
    "per_page": 50,
    "sort": "name",
    "direction": "ASC"
  },
  "performer_filter": {
    "favorite": true,
    "gender": "FEMALE",
    "age": {
      "modifier": "GREATER_THAN",
      "value": 21
    }
  }
}
```

**Response** (200 OK):
```json
{
  "count": 456,
  "performers": [
    {
      "id": "67890",
      "name": "Performer Name",
      "gender": "FEMALE",
      "birthdate": "1995-06-15",
      "age": 29,
      "favorite": true,
      "image_path": "http://stash:9999/performer/67890/image",
      "scene_count": 42,
      "tags": [
        {
          "id": "222",
          "name": "Tag Name"
        }
      ]
    }
  ]
}
```

### POST /api/library/studios

Search and filter studios from Stash library.

**Request Body**:
```json
{
  "filter": {
    "q": "studio search",
    "per_page": 25
  },
  "studio_filter": {
    "name": {
      "modifier": "INCLUDES",
      "value": "Productions"
    },
    "scene_count": {
      "modifier": "GREATER_THAN",
      "value": 10
    }
  }
}
```

**Response** (200 OK):
```json
{
  "count": 123,
  "studios": [
    {
      "id": "333",
      "name": "Studio Name",
      "url": "https://studio.example.com",
      "image_path": "http://stash:9999/studio/333/image",
      "scene_count": 156,
      "parent_studio": null
    }
  ]
}
```

### POST /api/library/tags

Search and filter tags from Stash library.

**Request Body**:
```json
{
  "filter": {
    "sort": "scene_count",
    "direction": "DESC"
  },
  "tag_filter": {
    "scene_count": {
      "modifier": "GREATER_THAN",
      "value": 5
    },
    "name": {
      "modifier": "MATCHES_REGEX",
      "value": "^(category).*"
    }
  }
}
```

**Response** (200 OK):
```json
{
  "count": 789,
  "tags": [
    {
      "id": "444",
      "name": "Tag Name",
      "scene_count": 234,
      "image_path": "http://stash:9999/tag/444/image"
    }
  ]
}
```

## Video Streaming Endpoints

Video endpoints handle HLS transcoding and streaming. No authentication required (sessions are validated internally).

### POST /api/video/session

Create a new transcoding session for video playback.

**Request Body**:
```json
{
  "sceneId": "12345",
  "startTime": 120,
  "qualities": ["720p", "480p", "360p"]
}
```

**Response** (200 OK):
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "masterPlaylistUrl": "/api/video/session/550e8400-e29b-41d4-a716-446655440000/master.m3u8",
  "qualities": ["720p", "480p", "360p"]
}
```

**Error Responses**:
- `400 Bad Request`: Missing sceneId or invalid parameters
- `404 Not Found`: Scene not found in Stash
- `500 Internal Server Error`: FFmpeg process failed to start

**Example**:
```bash
curl -X POST http://localhost:8000/api/video/session \
  -H "Content-Type: application/json" \
  -d '{
    "sceneId": "12345",
    "startTime": 0,
    "qualities": ["720p", "480p", "360p"]
  }'
```

### GET /api/video/session/:sessionId/master.m3u8

Get the HLS master playlist for a transcoding session.

**Parameters**:
- `sessionId`: Transcoding session UUID

**Response** (200 OK):
```m3u8
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480
480p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360
360p/playlist.m3u8
```

**Error Responses**:
- `404 Not Found`: Session not found or expired

**Example**:
```bash
curl http://localhost:8000/api/video/session/550e8400.../master.m3u8
```

### GET /api/video/session/:sessionId/:quality/playlist.m3u8

Get the HLS quality-specific playlist.

**Parameters**:
- `sessionId`: Transcoding session UUID
- `quality`: Quality level (`720p`, `480p`, `360p`)

**Response** (200 OK):
```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXTINF:4.000000,
segment_000.ts
#EXTINF:4.000000,
segment_001.ts
#EXT-X-ENDLIST
```

**Error Responses**:
- `404 Not Found`: Session or quality not found

### GET /api/video/session/:sessionId/:quality/segment_:num.ts

Get a specific video segment.

**Parameters**:
- `sessionId`: Transcoding session UUID
- `quality`: Quality level (`720p`, `480p`, `360p`)
- `num`: Segment number (000, 001, 002, etc.)

**Response** (200 OK):
- Content-Type: `video/MP2T`
- Binary MPEG-TS segment data

**Error Responses**:
- `404 Not Found`: Session, quality, or segment not found
- `503 Service Unavailable`: Segment not yet transcoded (retry)

**Example**:
```bash
curl http://localhost:8000/api/video/session/550e8400.../720p/segment_000.ts \
  -o segment_000.ts
```

### DELETE /api/video/session/:sessionId

Manually terminate a transcoding session and clean up resources.

**Parameters**:
- `sessionId`: Transcoding session UUID

**Response** (200 OK):
```json
{
  "message": "Session terminated successfully",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Responses**:
- `404 Not Found`: Session not found

## Health Check

### GET /api/health

Check the health status of the Peek server and its dependencies.

**Response** (200 OK):
```json
{
  "status": "healthy",
  "timestamp": "2025-10-17T12:00:00.000Z",
  "services": {
    "database": "healthy",
    "stash": "healthy"
  }
}
```

**Response** (503 Service Unavailable):
```json
{
  "status": "unhealthy",
  "timestamp": "2025-10-17T12:00:00.000Z",
  "services": {
    "database": "healthy",
    "stash": "error"
  },
  "error": "Failed to connect to Stash GraphQL API"
}
```

**Example**:
```bash
curl http://localhost:8000/api/health
```

## Error Handling

All API endpoints follow consistent error response format:

```json
{
  "error": "Error message",
  "details": "Additional error details (development only)"
}
```

### Common HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| `200 OK` | Success | Successful request |
| `201 Created` | Resource created | User registration |
| `400 Bad Request` | Invalid input | Validation errors |
| `401 Unauthorized` | Authentication required | Missing or invalid token |
| `403 Forbidden` | Insufficient permissions | Non-admin accessing admin endpoint |
| `404 Not Found` | Resource not found | Session, scene, or user not found |
| `500 Internal Server Error` | Server error | Unexpected server failure |
| `503 Service Unavailable` | Service temporarily unavailable | FFmpeg process failed, Stash unreachable |

## Rate Limiting

!!! info "Not Currently Implemented"
    Rate limiting is planned for future releases. Current implementation has no rate limits.

**Planned limits**:
- Authentication endpoints: 10 requests per minute per IP
- API endpoints: 100 requests per minute per user
- Video segments: No limit (streaming)

## CORS Configuration

**Development**:
- Allowed origins: `http://localhost:5173`, `http://localhost:6969`
- Credentials: Allowed

**Production**:
- Allowed origins: Same origin only
- Credentials: Allowed

## WebSocket Support

!!! info "Not Currently Implemented"
    WebSocket support for real-time updates is planned for future releases.

## Next Steps

- [Video System](video-system.md) - Video transcoding details
- [Testing Guide](testing.md) - API testing strategies
- [Architecture](architecture.md) - System overview
