# Screenshot Automation System

Automated screenshot capture and gallery generation for Peek Stash Browser releases.

## Overview

This system captures screenshots of Peek across multiple viewports (mobile, tablet, desktop, 4K) and themes (dark, light, blue), then publishes them to a gallery hosted on ImgBash.

## Quick Start

### 1. Configure IDs and Credentials

Edit `screenshots/config.json` to set:

- **Login credentials**: Username and password for screenshot user
- **Detail page IDs**: Scene, performer, studio, etc. IDs to use for detail page screenshots

Example:

```json
{
  "loginCredentials": {
    "username": "screenshots",
    "password": "your-password-here"
  },
  "pages": [
    {
      "name": "scene-detail",
      "path": "/scene/{sceneId}",
      "sceneId": "1234"  // ← Set this to your chosen scene ID
    },
    {
      "name": "performer-detail",
      "path": "/performer/{performerId}",
      "performerId": "567"  // ← Set this to your chosen performer ID
    }
    // ... etc
  ]
}
```

### 2. Start Peek Locally

Ensure Peek is running with Docker:

```bash
docker-compose up -d
```

Verify it's accessible at `http://localhost:6969`.

### 3. Capture Screenshots

Run the capture script:

```bash
npm run screenshots
```

This will:
1. Launch headless Chrome via Playwright
2. Login to Peek with configured credentials
3. Navigate to each page in the config
4. Capture screenshots for each viewport and theme
5. Save screenshots to `screenshots/output/<version>/`

**Output**:
- Screenshots saved locally (gitignored)
- Filename format: `<page>_<viewport>_<theme>.png`
- Example: `home_desktop_dark.png`, `scene-detail_mobile_light.png`

### 4. Review Screenshots

Open `screenshots/output/<version>/` directory and review the captured screenshots. Make sure content is appropriate and screenshots look good.

### 5. Publish Gallery

Once satisfied with screenshots, publish to ImgBash:

```bash
npm run screenshots:publish
```

This will:
1. Upload all screenshots to ImgBash
2. Generate responsive gallery HTML page
3. Upload gallery page to ImgBash
4. Output gallery URL

**Output**:
- Gallery URL to add to GitHub Release notes
- Local gallery HTML saved for reference

### 6. Add to GitHub Release

Copy the gallery URL and add it to your GitHub Release description:

```markdown
## Screenshots

View screenshots for this release: [Screenshot Gallery](https://imgbash.com/...)
```

## Configuration

### config.json Structure

```json
{
  "baseUrl": "http://localhost:6969",
  "loginCredentials": {
    "username": "admin",
    "password": "admin"
  },
  "viewports": {
    "mobile": { "width": 375, "height": 812 },
    "tablet": { "width": 768, "height": 1024 },
    "desktop": { "width": 1920, "height": 1080 },
    "4k": { "width": 3840, "height": 2160 }
  },
  "themes": ["dark", "light", "blue"],
  "pages": [
    {
      "name": "home",
      "path": "/",
      "description": "Homepage with carousels",
      "waitForSelector": "[data-carousel]",
      "waitTime": 3000
    }
    // ... more pages
  ]
}
```

### Page Configuration Options

- **name**: Identifier for the page (used in filename)
- **path**: URL path (can include `{sceneId}`, `{performerId}`, etc. placeholders)
- **description**: Human-readable description (shown in gallery)
- **waitForSelector**: CSS selector to wait for before capturing (optional)
- **waitTime**: Additional wait time in ms after page load (optional)
- **sceneId/performerId/etc**: IDs to replace in path placeholders (required for detail pages)
- **interactions**: Array of interactions to perform before capture (optional)

### Interaction Examples

Capture lightbox screenshot:

```json
{
  "name": "scene-lightbox",
  "path": "/scene/{sceneId}",
  "sceneId": "1234",
  "interactions": [
    {
      "action": "click",
      "selector": "[data-scene-image]",
      "waitAfter": 1000
    }
  ]
}
```

Supported interaction actions:
- `click`: Click element
- `hover`: Hover over element
- `scroll`: Scroll element into view

## Best Practices

### Choosing Content IDs

When selecting IDs for detail pages:

1. **Use content-restricted user**: Create a dedicated user with content restrictions to ensure appropriate content appears in screenshots
2. **Pick representative content**: Choose scenes/performers that showcase typical Peek features
3. **Keep it consistent**: Use the same IDs across releases for easy comparison
4. **Test first**: Capture screenshots locally and review before publishing

### Content Restrictions

To ensure appropriate screenshots:

1. Create a user specifically for screenshots (e.g., "screenshots")
2. Apply content restrictions to that user:
   - Include only appropriate studios/tags
   - Exclude inappropriate groups/tags
3. Use that user's credentials in `config.json`

### Screenshot Quality

- **Wait times**: Increase `waitTime` if content isn't fully loaded
- **Selectors**: Use `waitForSelector` to ensure critical elements are visible
- **Network idle**: Script waits for network idle before capturing
- **Viewport only**: Only captures visible viewport (not full-page scroll)

## Architecture

### Capture Script ([capture.js](./capture.js))

- Uses Playwright with headless Chrome
- Logs in once, then iterates through themes → pages → viewports
- Sets theme via settings page before each theme batch
- Handles dynamic path resolution (replaces `{sceneId}` with actual ID)
- Executes interactions (clicks, hovers, scrolls) if configured
- Saves screenshots to `screenshots/output/<version>/`

### Publish Script ([publish.js](./publish.js))

- Checks for existing screenshots in output directory
- Uploads each screenshot to ImgBash via REST API
- Generates responsive gallery HTML with:
  - Grid layout organized by page
  - Theme tabs for each viewport
  - Lightbox for full-size viewing
  - Dark theme styling
- Uploads gallery HTML to ImgBash
- Returns gallery URL

### ImgBash Integration

- Free tier supports unlimited uploads
- NSFW-friendly hosting
- Direct image URLs (no expiration)
- Simple REST API for uploads
- Can host both images and HTML pages

## Troubleshooting

### Screenshots not capturing

1. **Peek not running**: Ensure `docker-compose up -d` succeeded
2. **Login failed**: Check credentials in `config.json`
3. **Selector not found**: Increase `waitTime` or update `waitForSelector`
4. **IDs not configured**: Detail pages require IDs (sceneId, performerId, etc.)

### Upload failed

1. **ImgBash API error**: Check error message for details
2. **Large files**: Screenshots may be too large (try reducing viewport sizes)
3. **Network issues**: Check internet connection

### Gallery not displaying

1. **Check browser console**: Look for JavaScript errors
2. **Image URLs broken**: Verify ImgBash uploads succeeded
3. **Local gallery**: Open `screenshots/output/<version>/gallery.html` to test locally

## File Structure

```
screenshots/
├── README.md           # This file
├── config.json         # Configuration (IDs, credentials, pages)
├── capture.js          # Screenshot capture script
├── publish.js          # Upload and gallery generation script
└── output/             # Output directory (gitignored)
    └── <version>/      # Version-specific directory
        ├── *.png       # Screenshot files
        └── gallery.html # Local copy of gallery
```

## Version Management

- Version is read from `client/package.json`
- Screenshots saved to `screenshots/output/<version>/`
- Each version has its own directory
- Gallery URL includes version identifier

## Integration with Release Process

The screenshot system integrates with the `/publishalpha` Claude command:

1. Complete normal release process (version bump, git tag, Docker build)
2. After GitHub Release is created, optionally run screenshot workflow
3. Capture screenshots locally with `npm run screenshots`
4. Publish gallery with `npm run screenshots:publish`
5. Manually add gallery URL to GitHub Release description

This keeps screenshots optional and allows manual review before publishing.
