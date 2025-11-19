---
description: Create a meaningful commit message based on recent changes
---

Review all the uncommitted file changes we've made in this branch and create a meaningful commit message. Follow these guidelines:

1. Check git status and git diff to see all changes
2. Update mkdocs `docs/` and `README.md` if changes need documentation coverage or updates
3. Run unit tests for the client (`cd client && npm test`). Update and add unit tests as needed
4. Run unit tests for the server (`cd server && npm test`). Update and add unit tests as needed
5. Summarize the nature of changes (new feature, enhancement, bug fix, refactoring, etc.)
6. Focus on the "why" rather than just the "what"
7. Keep it concise but descriptive (1-2 sentences)
8. Do not push to remote
