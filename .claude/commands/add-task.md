Add a task to the Kanban board backlog.

## API

- **Base:** `http://localhost:18790`
- **POST** `/api/tasks` — create task (body: `{ title, description?, column?, assignee?, priority? }`)

## Valid values

- **column:** `backlog`, `todo`, `in_progress`, `review`, `on_hold`, `done`, `wont_do`
- **priority:** `low`, `medium`, `high`

## Instructions

1. Parse the user's input to extract: **title** (required), **description**, **assignee**, and **priority**.
2. If only a short phrase is given, use it as the title with defaults (backlog, medium priority, no assignee).
3. Create the task via `curl`:
   ```
   curl -s -X POST http://localhost:18790/api/tasks \
     -H "Content-Type: application/json" \
     -d '{"title": "...", "description": "...", "column": "backlog", "assignee": "...", "priority": "..."}'
   ```
4. Confirm with a one-liner: task title, priority, assignee (if set).

## Examples

- `/add-task Fix login timeout` → creates "Fix login timeout" in backlog, medium priority
- `/add-task Add dark mode --assignee claude --priority high` → creates with assignee and priority
- `/add-task Refactor auth module: Extract token validation into shared utility --priority low` → title before colon, rest as description

$ARGUMENTS: Task title and optional flags like --assignee, --priority, --description
