---
description: Create a branch and begin a new work item
---

I want to create a new branch to add a feature, fix a bug, or make another type of improvement to the code. Please:

1. Read any context or information the user provides about the new work item
2. Read any relevant project documentation (\*.md, /docs/\*) for additional context
3. Pull latest master and create a new branch, following the project's standard branch naming convention
4. Utilize best practices and industry-standard solutions, using web search as needed
5. Take inspiration from Stash (~/code/stash), Plex, YouTube, and Jellyfin as these are popular web apps with similar features
6. Present a summarized step-by-step implementation plan to the user
7. Wait for confirmation
8. If uncertain when making code changes, stop and ask for input from the user rather than iterating repeatedly guessing at the solution
9. Keep code changes DRY and follow JavaScript / React best practices. Look for opportunities to refactor or improve affected code while making changes
10. Once complete and testable, ask the user to start and test the application
11. After user confirms testing is successful, create a meaningful commit
12. DO NOT push to remote - user will use /pullrequest command for that
