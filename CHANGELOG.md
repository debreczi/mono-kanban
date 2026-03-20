# Changelog

## 1.0.0 - 2026-03-20

Initial public release.

### Added

- Lightweight self-hosted Kanban board with a 7-column workflow
- Drag-and-drop task management with title, description, assignee, and priority fields
- Local JSON-backed task storage with no database dependency
- Optional Token Usage dashboard
- Optional Cron Status dashboard
- Claude Code slash commands for adding and queueing work
- README guidance for Claude Code cron-based automation

### Changed

- Default optional dashboard data paths now point to local `./data` files for standalone use
- Public repo metadata and README copy polished for GitHub release

### Fixed

- Safer JSON file handling to avoid silently overwriting invalid task data
- Consistent API usage deduplication behavior