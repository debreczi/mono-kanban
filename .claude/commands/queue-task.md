Move a task from backlog to the todo column, making it ready for work.

## API

- **Base:** `http://localhost:18790`
- **GET** `/api/tasks` — list all tasks
- **PATCH** `/api/tasks/:id` — update task (body: any subset of fields)

## Instructions

1. Fetch all tasks: `curl -s http://localhost:18790/api/tasks`
2. Find the task the user is referring to. Match by title (case-insensitive, partial match is fine). If ambiguous, list the candidates and ask which one.
3. If the task is already in `todo`, say so and do nothing.
4. If the task is not in `backlog`, warn the user which column it's currently in and ask for confirmation before moving.
5. PATCH the task to `column: "todo"`.
6. Optionally, if the user specifies `--assignee`, set that too.
7. Confirm with a one-liner: task title moved to todo (and assignee if set/changed).

## Examples

- `/queue-task Fix login timeout` → finds the task, moves it to todo
- `/queue-task Fix login --assignee claude` → moves to todo and assigns to claude
- `/queue-task` (no args) → list all backlog tasks and ask which one to move

$ARGUMENTS: Task title (partial match) and optional --assignee flag
