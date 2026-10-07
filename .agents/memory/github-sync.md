---
name: GitHub sync through Replit
description: Limits of using the GitHub App connector to publish local workspace changes.
---

The GitHub App connector authenticates REST API requests but does not automatically provide credentials for the container's native `git push`. The repository Contents API can commit a file update directly to a branch, but it does not publish the workspace's local-only commit history.

**Why:** A local HTTPS push failed after the GitHub integration was connected, while a REST Contents update succeeded. The branch's file content matched, but its local and remote commit graphs remained divergent.

**How to apply:** Prefer the native Git workflow when it has usable credentials. If using REST to update files, describe it as a remote file commit rather than a full Git push, and don't reset or force-push local history without explicit approval.
