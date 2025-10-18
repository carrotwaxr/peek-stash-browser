# Testing Guide

This document covers testing strategies, tools, and best practices for Peek Stash Browser, including unit tests, integration tests, and end-to-end testing.

## Testing Framework

Peek uses **Vitest** for both frontend and backend testing. Vitest is a modern, fast testing framework with native ES modules support and excellent TypeScript integration.

### Why Vitest?

- **Fast**: Runs tests in parallel with smart caching
- **Modern**: Native ESM and TypeScript support
- **Compatible**: Jest-compatible API (easy migration)
- **Developer Experience**: Watch mode, UI, and great error messages
- **Unified**: Same tool for frontend and backend

## Frontend Testing

### Setup

Tests are located in `client/src/` alongside the code they test.

**Test Files**:
- Unit tests: `*.test.js` or `*.test.jsx`
- Component tests: `ComponentName.test.jsx`

**Example Test File Location**:
```
client/src/components/video-player/
├── VideoPlayer.jsx
├── VideoPlayer.test.jsx
├── videoPlayerUtils.js
└── videoPlayerUtils.test.js
```

### Running Frontend Tests

```bash
# Run tests in watch mode (development)
cd client && npm test

# Run tests once (CI mode)
cd client && npm run test:run

# Run tests with UI
cd client && npm run test:ui

# Run tests with coverage
cd client && npm run test:coverage
```

### Writing Component Tests

**Testing React Components with happy-dom**:

```javascript
// client/src/components/ui/Button.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Button from './Button';

describe('Button', () => {
  it('renders button text', () => {
    render(<Button>Click Me</Button>);
    expect(screen.getByText('Click Me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click Me</Button>);

    fireEvent.click(screen.getByText('Click Me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies variant classes', () => {
    render(<Button variant="primary">Primary</Button>);
    const button = screen.getByText('Primary');
    expect(button.className).toContain('bg-blue-600');
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByText('Disabled')).toBeDisabled();
  });
});
```

### Testing Custom Hooks

```javascript
// client/src/hooks/useApi.test.js
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useApi } from './useApi';

// Mock the API module
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

import api from '../services/api';

describe('useApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches data successfully', async () => {
    const mockData = { id: 1, name: 'Test' };
    api.get.mockResolvedValue({ data: mockData });

    const { result } = renderHook(() => useApi('/test'));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBe(null);
  });

  it('handles errors', async () => {
    const mockError = new Error('API Error');
    api.get.mockRejectedValue(mockError);

    const { result } = renderHook(() => useApi('/test'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe(mockError);
    expect(result.current.data).toBe(null);
  });
});
```

### Testing Utility Functions

```javascript
// client/src/utils/videoFormat.test.js
import { describe, it, expect } from 'vitest';
import { formatDuration, formatFileSize } from './videoFormat';

describe('formatDuration', () => {
  it('formats seconds correctly', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('pads minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(3605)).toBe('1:00:05');
  });
});

describe('formatFileSize', () => {
  it('formats bytes to human readable', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1048576)).toBe('1.0 MB');
    expect(formatFileSize(1073741824)).toBe('1.0 GB');
  });

  it('rounds to one decimal place', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(2621440)).toBe('2.5 MB');
  });
});
```

## Backend Testing

### Setup

Tests are located in `server/` alongside the code they test or in dedicated `__tests__` directories.

**Test Files**:
- Unit tests: `*.test.ts`
- Integration tests: `*.integration.test.ts`

### Running Backend Tests

```bash
# Run tests in watch mode (development)
cd server && npm test

# Run tests once (CI mode)
cd server && npm run test:run

# Run tests with UI
cd server && npm run test:ui

# Run tests with coverage
cd server && npm run test:coverage
```

### Testing Utility Functions

```typescript
// server/utils/pathMapping.test.ts
import { describe, it, expect } from 'vitest';
import { translateStashPath } from './pathMapping';

describe('translateStashPath', () => {
  it('translates Stash internal path to Peek path', () => {
    process.env.STASH_INTERNAL_PATH = '/data';
    process.env.STASH_MEDIA_PATH = '/app/media';

    const stashPath = '/data/scenes/video.mp4';
    const expected = '/app/media/scenes/video.mp4';

    expect(translateStashPath(stashPath)).toBe(expected);
  });

  it('handles paths without internal prefix', () => {
    process.env.STASH_INTERNAL_PATH = '/data';
    process.env.STASH_MEDIA_PATH = '/app/media';

    const stashPath = '/other/path/video.mp4';

    expect(translateStashPath(stashPath)).toBe(stashPath);
  });

  it('handles trailing slashes correctly', () => {
    process.env.STASH_INTERNAL_PATH = '/data/';
    process.env.STASH_MEDIA_PATH = '/app/media/';

    const stashPath = '/data/scenes/video.mp4';
    const expected = '/app/media/scenes/video.mp4';

    expect(translateStashPath(stashPath)).toBe(expected);
  });
});
```

### Testing API Endpoints

```typescript
// server/controllers/__tests__/auth.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../api';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Authentication Endpoints', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test users before each test
    await prisma.user.deleteMany({
      where: { email: 'test@example.com' }
    });
  });

  describe('POST /api/auth/login', () => {
    it('authenticates valid user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'admin'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe('admin@example.com');
    });

    it('rejects invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('validates required fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/register', () => {
    it('creates new user (admin only)', async () => {
      // First login as admin to get token
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'admin' });

      const token = loginRes.body.token;

      // Create new user
      const response = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'test@example.com',
          password: 'testpassword',
          role: 'USER'
        });

      expect(response.status).toBe(201);
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('rejects duplicate email', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'admin' });

      const token = loginRes.body.token;

      // Try to create duplicate user
      const response = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'admin@example.com',  // Already exists
          password: 'password',
          role: 'USER'
        });

      expect(response.status).toBe(400);
    });

    it('requires admin role', async () => {
      // Create regular user and get their token
      // ... (implementation depends on test setup)

      const response = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          email: 'test@example.com',
          password: 'password',
          role: 'USER'
        });

      expect(response.status).toBe(403);
    });
  });
});
```

## Test Coverage

### Viewing Coverage Reports

```bash
# Generate coverage for frontend
cd client && npm run test:coverage

# Generate coverage for backend
cd server && npm run test:coverage

# Open HTML report
open coverage/index.html
```

### Coverage Goals

| Component | Target Coverage |
|-----------|----------------|
| **Utilities** | 90%+ |
| **Services** | 80%+ |
| **Controllers** | 70%+ |
| **Components** | 60%+ |

!!! tip "Focus on Critical Paths"
    Prioritize testing critical business logic (transcoding, authentication, path translation) over UI components.

## Integration Testing

### Testing Video Transcoding

```typescript
// server/services/__tests__/TranscodingManager.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TranscodingManager } from '../TranscodingManager';
import fs from 'fs';
import path from 'path';

describe('TranscodingManager Integration', () => {
  let manager: TranscodingManager;
  const testVideoPath = path.join(__dirname, 'fixtures', 'test-video.mp4');
  const outputDir = path.join(__dirname, 'output');

  beforeAll(() => {
    manager = new TranscodingManager();

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true });
    }
  });

  it('creates transcoding session', async () => {
    const session = await manager.createSession({
      sceneId: 'test-scene',
      userId: 'test-user',
      startTime: 0,
      qualities: ['720p', '480p', '360p'],
      inputPath: testVideoPath,
      outputDir
    });

    expect(session.sessionId).toBeDefined();
    expect(session.qualities).toEqual(['720p', '480p', '360p']);
    expect(session.status).toBe('starting');
  }, 10000);  // 10 second timeout for FFmpeg startup

  it('generates HLS playlists', async () => {
    const session = await manager.createSession({
      sceneId: 'test-scene',
      userId: 'test-user',
      startTime: 0,
      qualities: ['360p'],  // Test with single quality
      inputPath: testVideoPath,
      outputDir
    });

    // Wait for master playlist to be generated
    await new Promise(resolve => setTimeout(resolve, 5000));

    const masterPlaylistPath = path.join(outputDir, session.sessionId, 'master.m3u8');
    expect(fs.existsSync(masterPlaylistPath)).toBe(true);

    const qualityPlaylistPath = path.join(outputDir, session.sessionId, '360p', 'playlist.m3u8');
    expect(fs.existsSync(qualityPlaylistPath)).toBe(true);
  }, 15000);

  it('cleans up session', async () => {
    const session = await manager.createSession({
      sceneId: 'test-scene',
      userId: 'test-user',
      startTime: 0,
      qualities: ['360p'],
      inputPath: testVideoPath,
      outputDir
    });

    await manager.terminateSession(session.sessionId);

    const sessionDir = path.join(outputDir, session.sessionId);
    expect(fs.existsSync(sessionDir)).toBe(false);
  });
});
```

## Mocking and Fixtures

### Mocking External Services

```typescript
// server/__tests__/mocks/stash.ts
import { vi } from 'vitest';

export const mockStashApi = {
  findScenes: vi.fn().mockResolvedValue({
    count: 10,
    scenes: [
      {
        id: '1',
        title: 'Test Scene',
        date: '2025-01-15',
        rating100: 85,
        duration: 1800
      }
    ]
  }),

  findPerformers: vi.fn().mockResolvedValue({
    count: 5,
    performers: [
      {
        id: '1',
        name: 'Test Performer',
        favorite: true
      }
    ]
  })
};
```

### Test Fixtures

```typescript
// server/__tests__/fixtures/scenes.ts
export const mockScene = {
  id: '12345',
  title: 'Test Scene',
  date: '2025-01-15',
  rating100: 85,
  duration: 1800,
  files: [
    {
      path: '/data/videos/test.mp4',
      size: '1234567890',
      duration: 1800,
      video_codec: 'h264',
      audio_codec: 'aac'
    }
  ],
  performers: [
    {
      id: '67890',
      name: 'Test Performer',
      favorite: true
    }
  ]
};
```

## Continuous Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Run Tests

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: cd client && npm ci

      - name: Run linter
        run: cd client && npm run lint

      - name: Run tests
        run: cd client && npm run test:run

      - name: Generate coverage
        run: cd client && npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./client/coverage/coverage-final.json

  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: cd server && npm ci

      - name: Run linter
        run: cd server && npm run lint

      - name: Run tests
        run: cd server && npm run test:run

      - name: Generate coverage
        run: cd server && npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./server/coverage/coverage-final.json
```

## Best Practices

### Test Organization

1. **Co-locate tests**: Keep tests next to the code they test
2. **Descriptive names**: Use clear `describe` and `it` blocks
3. **One assertion per test**: Focus each test on a single behavior
4. **Arrange-Act-Assert**: Structure tests clearly

**Example**:
```javascript
describe('formatDuration', () => {
  it('formats 90 seconds as 1:30', () => {
    // Arrange
    const seconds = 90;

    // Act
    const result = formatDuration(seconds);

    // Assert
    expect(result).toBe('1:30');
  });
});
```

### Avoid Common Pitfalls

- **Don't test implementation details**: Test behavior, not internals
- **Don't rely on test order**: Each test should be independent
- **Don't skip cleanup**: Always clean up after tests (database, files)
- **Don't hardcode dates**: Use relative dates or mocks for time-dependent tests

### Testing Video.js

For Video.js components, test the integration points, not Video.js internals:

```javascript
// Test what we control, not Video.js behavior
it('initializes player with correct options', () => {
  const { result } = renderHook(() => useVideoPlayer());

  expect(result.current.playerOptions).toMatchObject({
    autoplay: true,
    controls: true,
    responsive: true
  });
});

it('calls onReady when player is ready', () => {
  const onReady = vi.fn();
  render(<VideoPlayer onReady={onReady} />);

  // Trigger Video.js ready event (mocked)
  // ...

  expect(onReady).toHaveBeenCalled();
});
```

## Debugging Tests

### Running Single Test File

```bash
# Frontend
cd client && npm test -- path/to/test.test.js

# Backend
cd server && npm test -- path/to/test.test.ts
```

### Running Specific Test

```bash
# Use .only() to run a single test
it.only('should do something', () => {
  // This test runs alone
});
```

### Debugging in VS Code

Add to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Vitest Tests",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["test", "--", "--run"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

## Next Steps

- [Contributing Guide](contributing.md) - How to contribute code
- [API Reference](api-reference.md) - Testing API endpoints
- [CI/CD](../reference/ci-cd.md) - Automated testing pipeline
