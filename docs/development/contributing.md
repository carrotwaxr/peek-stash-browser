# Contributing to Peek Stash Browser

Thank you for your interest in contributing to Peek! This guide will help you get started with contributing code, documentation, and bug reports.

## Getting Started

### 1. Fork and Clone

```bash
git clone https://github.com/your-username/peek-stash-browser.git
cd peek-stash-browser
git remote add upstream https://github.com/carrotwaxr/peek-stash-browser.git
```

### 2. Set Up Development Environment

Follow the [Development Setup](setup.md) guide to configure your local environment:

```bash
# Copy environment file
cp .env.example .env

# Edit .env with your Stash server settings
# Start development environment
docker-compose up -d
```

### 3. Create Feature Branch

```bash
git checkout -b feature/your-feature-name
```

## Code Contributions

### Before You Start

- **Check existing issues**: Look for open issues or create one to discuss your changes
- **Keep it focused**: One feature or fix per pull request
- **Follow conventions**: Match the existing code style and patterns

### Development Workflow

1. **Make your changes**:
   ```bash
   # Frontend changes
   cd client && npm run dev

   # Backend changes
   cd server && npm run dev
   ```

2. **Write tests**:
   ```bash
   # Frontend tests
   cd client && npm test

   # Backend tests
   cd server && npm test
   ```

3. **Run linters**:
   ```bash
   # Frontend linting
   cd client && npm run lint

   # Backend linting
   cd server && npm run lint
   ```

4. **Test in browser**:
   - Open `http://localhost:6969`
   - Test your changes thoroughly
   - Check for console errors

### Code Style Guidelines

#### TypeScript/JavaScript

- **Use TypeScript strict mode** for backend code
- **Prefer functional components** with hooks for React
- **Use meaningful variable names**: `sceneId` not `sid`
- **Add JSDoc comments** for complex functions
- **Avoid `any` types** without justification

**Example**:
```typescript
/**
 * Translate Stash's internal Docker path to Peek's mount path
 * @param stashPath - Path reported by Stash API
 * @returns Translated path accessible by Peek
 */
export function translateStashPath(stashPath: string): string {
  const internalPath = process.env.STASH_INTERNAL_PATH || '/data';
  const peekPath = process.env.STASH_MEDIA_PATH || '/app/media';

  return stashPath.replace(internalPath, peekPath);
}
```

#### React Components

- **Props interface first**: Define prop types at top of file
- **Use hooks**: `useState`, `useEffect`, `useCallback`, `useMemo`
- **Destructure props**: `const { scene, onPlay } = props`
- **Default exports**: Export component as default

**Example**:
```jsx
interface SceneCardProps {
  scene: Scene;
  onPlay: (sceneId: string) => void;
  className?: string;
}

const SceneCard: React.FC<SceneCardProps> = ({
  scene,
  onPlay,
  className = ''
}) => {
  const handleClick = useCallback(() => {
    onPlay(scene.id);
  }, [scene.id, onPlay]);

  return (
    <div className={`scene-card ${className}`} onClick={handleClick}>
      {/* Component content */}
    </div>
  );
};

export default SceneCard;
```

#### CSS/Tailwind

- **Use Tailwind utilities** over custom CSS
- **Semantic class names** for custom components
- **Responsive by default**: Use responsive prefixes (`md:`, `lg:`)
- **Theme variables**: Use theme colors and spacing

**Example**:
```jsx
<button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500">
  Click Me
</button>
```

### Commit Messages

Follow conventional commit format:

```
<type>: <subject>

<body>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes

**Example**:
```
feat: Add quality selector to video player

Implement quality selection UI allowing users to manually switch
between 720p, 480p, and 360p transcoding qualities. Replaces
automatic quality switching with user control.

Changes:
- Add quality selector dropdown to player controls
- Update VideoPlayer component to handle quality changes
- Add quality state management to useVideoPlayer hook

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Pull Request Process

### 1. Update Your Branch

Before submitting, sync with upstream:

```bash
git fetch upstream
git rebase upstream/main
```

### 2. Push to Your Fork

```bash
git push origin feature/your-feature-name
```

### 3. Create Pull Request

On GitHub:

1. Click "New Pull Request"
2. Select your fork and branch
3. Fill out the PR template
4. Link related issues

### PR Requirements

- [ ] All tests passing
- [ ] Linters passing
- [ ] Documentation updated (if needed)
- [ ] No merge conflicts
- [ ] Descriptive title and description
- [ ] Screenshots for UI changes

### PR Template

```markdown
## Description

Brief description of what this PR does and why.

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing

Describe how you tested your changes:

1. Step one
2. Step two
3. Expected result

## Screenshots (if applicable)

Add screenshots or GIFs showing the changes.

## Checklist

- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
```

### Code Review

- **Be responsive**: Address feedback promptly
- **Ask questions**: If feedback is unclear, ask for clarification
- **Keep it professional**: Focus on the code, not the person
- **Update as needed**: Push changes to your branch as requested

### After Approval

Once approved, your PR will be merged by a maintainer. You can delete your branch after merging.

## Bug Reports

### Before Reporting

1. **Check existing issues**: Search for similar issues
2. **Verify it's a bug**: Test in dev environment
3. **Gather information**: Logs, screenshots, steps to reproduce

### Bug Report Template

```markdown
## Bug Description

A clear and concise description of what the bug is.

## Steps to Reproduce

1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

## Expected Behavior

What you expected to happen.

## Actual Behavior

What actually happened.

## Environment

- **Platform**: unRAID / Docker / Development
- **Version**: v1.0.0
- **Browser**: Chrome 120 / Firefox 121 / Safari 17
- **Stash Version**: 0.25.0

## Logs

```bash
# Backend logs
docker logs peek-stash-browser-backend

# Browser console errors
(paste console output)
```

## Screenshots

If applicable, add screenshots to help explain your problem.

## Additional Context

Any other context about the problem.
```

## Feature Requests

### Feature Request Template

```markdown
## Feature Description

A clear and concise description of the feature you'd like to see.

## Use Case

Explain the problem this feature would solve and who would benefit.

## Proposed Solution

Describe how you envision this feature working.

## Alternatives Considered

Describe alternative solutions or features you've considered.

## Implementation Complexity

Your assessment of how complex this feature might be to implement:

- [ ] Simple (< 1 day)
- [ ] Medium (1-3 days)
- [ ] Complex (> 3 days)

## Additional Context

Any other context, mockups, or examples.
```

## Documentation Contributions

Documentation is just as important as code! Areas to contribute:

- **API documentation**: Document new endpoints
- **User guides**: Improve setup and usage docs
- **Code comments**: Add JSDoc/TSDoc comments
- **README improvements**: Clarify installation or features
- **Troubleshooting**: Add common issues and solutions

### Documentation Style

- **Be concise**: Get to the point quickly
- **Use examples**: Code examples are better than descriptions
- **Stay current**: Update docs when code changes
- **Test instructions**: Verify commands and steps work

## Community Guidelines

### Be Respectful

- **Welcoming**: Be kind to new contributors
- **Constructive**: Provide helpful, actionable feedback
- **Patient**: Remember everyone was a beginner once
- **Professional**: Keep discussions focused on the project

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and ideas
- **Pull Requests**: Code review and collaboration
- **Stash Discord**: #third-party-integrations channel for Stash-related questions

## Development Resources

### Documentation

- [Development Setup](setup.md) - Local environment setup
- [Architecture](architecture.md) - System design
- [API Reference](api-reference.md) - REST API documentation
- [Testing Guide](testing.md) - Writing tests

### External Resources

- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vite Guide](https://vitejs.dev/guide/)
- [Prisma Docs](https://www.prisma.io/docs/)
- [Video.js Documentation](https://docs.videojs.com/)
- [Stash GraphQL API](https://github.com/stashapp/stash/blob/develop/graphql/schema/schema.graphql)

## Questions?

- **Issues**: Open an issue for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions
- **Discord**: Join the Stash Discord #third-party-integrations channel

Thank you for contributing to Peek Stash Browser!
