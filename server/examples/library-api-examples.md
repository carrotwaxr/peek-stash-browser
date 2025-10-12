# Library API Examples

The new library endpoints provide powerful filtering and search capabilities for scenes, performers, studios, and tags. All endpoints are POST routes that accept JSON payloads with filter parameters.

## Endpoints

### POST /api/library/scenes

Find scenes with filtering, pagination, and search

### POST /api/library/performers

Find performers with filtering, pagination, and search

### POST /api/library/studios

Find studios with filtering, pagination, and search

### POST /api/library/tags

Find tags with filtering, pagination, and search

## Request Structure

Each endpoint accepts a JSON body with these parameters:

### Common Filter Parameters (FindFilterType)

```json
{
  "filter": {
    "q": "search term", // Text search query
    "page": 1, // Page number (starts at 1)
    "per_page": 25, // Results per page (-1 for all)
    "sort": "name", // Sort field
    "direction": "ASC" // ASC or DESC
  }
}
```

### Scene-specific Filters (SceneFilterType)

```json
{
  "filter": {
    "per_page": 20,
    "page": 1
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

### Performer-specific Filters (PerformerFilterType)

```json
{
  "filter": {
    "per_page": 50,
    "sort": "name"
  },
  "performer_filter": {
    "favorite": true,
    "gender": "FEMALE",
    "age": {
      "modifier": "GREATER_THAN",
      "value": 21
    },
    "birth_year": {
      "modifier": "BETWEEN",
      "value": 1990,
      "value2": 2000
    }
  }
}
```

### Studio-specific Filters (StudioFilterType)

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

### Tag-specific Filters (TagFilterType)

```json
{
  "filter": {
    "sort": "name",
    "per_page": 100
  },
  "tag_filter": {
    "name": {
      "modifier": "MATCHES_REGEX",
      "value": "^[A-Z].*"
    },
    "scene_count": {
      "modifier": "NOT_NULL"
    }
  }
}
```

## Criterion Modifiers

Common modifiers available for filtering:

- `EQUALS`
- `NOT_EQUALS`
- `GREATER_THAN`
- `LESS_THAN`
- `BETWEEN`
- `NOT_BETWEEN`
- `IS_NULL`
- `NOT_NULL`
- `INCLUDES`
- `EXCLUDES`
- `MATCHES_REGEX`
- `NOT_MATCHES_REGEX`

## Example Requests

### Get Recent High-Rated Scenes

```bash
curl -X POST http://localhost:8000/api/library/scenes \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "per_page": 10,
      "sort": "created_at",
      "direction": "DESC"
    },
    "scene_filter": {
      "rating100": {
        "modifier": "GREATER_THAN",
        "value": 75
      }
    }
  }'
```

### Search for Favorite Female Performers

```bash
curl -X POST http://localhost:8000/api/library/performers \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "q": "performer name",
      "per_page": 25
    },
    "performer_filter": {
      "favorite": true,
      "gender": "FEMALE"
    }
  }'
```

### Find Studios with Many Scenes

```bash
curl -X POST http://localhost:8000/api/library/studios \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "sort": "scene_count",
      "direction": "DESC",
      "per_page": 20
    },
    "studio_filter": {
      "scene_count": {
        "modifier": "GREATER_THAN",
        "value": 50
      }
    }
  }'
```

### Search Tags by Name Pattern

```bash
curl -X POST http://localhost:8000/api/library/tags \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "q": "tag search",
      "per_page": 50
    },
    "tag_filter": {
      "name": {
        "modifier": "INCLUDES",
        "value": "genre"
      }
    }
  }'
```

## Response Format

All endpoints return the same structure as the existing Stash GraphQL responses:

### Scenes Response

```json
{
  "findScenes": {
    "count": 125,
    "duration": 45632.5,
    "filesize": 1234567890,
    "scenes": [
      {
        "id": "1",
        "title": "Scene Title",
        "paths": {
          "screenshot": "http://stash:9999/scene/1/screenshot?apikey=xxx",
          "preview": "http://stash:9999/scene/1/preview?apikey=xxx",
          "stream": "http://stash:9999/scene/1/stream?apikey=xxx"
        }
        // ... other scene properties
      }
    ]
  }
}
```

### Performers Response

```json
{
  "findPerformers": {
    "count": 45,
    "performers": [
      {
        "id": "1",
        "name": "Performer Name",
        "favorite": true
        // ... other performer properties
      }
    ]
  }
}
```

Note: Scene responses include transformed `paths` with API keys automatically appended for direct media access.
