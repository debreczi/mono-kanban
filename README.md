# mono-kanban

mono-kanban is a lightweight, self-hosted Kanban board built for solo developers who want something simple, local, and fast. It uses plain JSON file storage instead of a database, supports drag-and-drop task management, and can optionally surface token usage and cron status dashboards for automation-heavy workflows.

## Features

- 7-column Kanban board: Backlog, To Do, In Progress, Review, On Hold, Done, Won't Do
- Drag-and-drop cards between columns
- Create, edit, and delete tasks with title, description, assignee, and priority
- Token usage dashboard (`/usage.html`) — optional, requires a compatible data file
- Cron status monitor (`/crons.html`) — optional, requires a compatible registry/status file

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later

## Installation

```bash
git clone <your-repo-url>
cd mono-kanban
npm install
npm start
```

Open [http://localhost:18790](http://localhost:18790) in your browser.

`tasks.json` is created automatically on first run in the project directory.

## Configuration

All configuration is via environment variables. Everything has a default and is optional.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `18790` | HTTP port the server listens on |
| `USAGE_FILE` | `./data/usage.json` | Path to token usage JSON data file |
| `API_USAGE_FILE` | `./data/api-usage.json` | Path to API key usage JSON data file |
| `CRON_REGISTRY_FILE` | `./data/cron-registry.json` | Path to cron registry JSON file |
| `CRON_STATUS_FILE` | `./data/cron-status.json` | Path to cron status JSON file |

If you do not provide dashboard data files, the main Kanban board still works normally and the dashboard pages simply start empty.

Example with custom port:

```bash
PORT=3000 npm start
```

Example with custom data paths:

```bash
USAGE_FILE=/data/usage.json CRON_REGISTRY_FILE=/data/cron-registry.json npm start
```

## Customising Assignees

Edit the `<select id="field-assignee">` dropdown in `public/index.html` to add or rename assignees. Each `<option value="...">` value is also used as a CSS class for the assignee badge colour — add matching `.badge-assignee.yourname` rules in `public/styles.css` if you want custom colours.

## Data Storage

Tasks are stored in `tasks.json` in the project root. This file is excluded from git (see `.gitignore`). Back it up manually or add it to your own backup routine.

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/tasks` | List all tasks |
| `POST` | `/api/tasks` | Create a task |
| `PATCH` | `/api/tasks/:id` | Update a task |
| `DELETE` | `/api/tasks/:id` | Delete a task |

## Claude Code Integration

You can use [Claude Code](https://docs.anthropic.com/en/docs/claude-code) as an autonomous agent that picks up tasks from your board and works on them — triggered by a simple cron job.

### How It Works

1. A cron job runs every N minutes
2. It checks the Kanban API for tasks in the `todo` column assigned to `claude`
3. If tasks exist, it launches Claude Code in non-interactive mode with a prompt that tells it to process them
4. Claude reads the task, does the work, and moves the card to `review` (or wherever your workflow dictates)

### Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- `jq` for JSON parsing (`sudo apt install jq` / `brew install jq`)
- `curl`

### Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code
claude  # follow the auth flow on first run
```

### The Cron Script

Save this as `claude-kanban.sh` in your project (or anywhere you like):

```bash
#!/usr/bin/env bash
# claude-kanban.sh — Check the Kanban board for Claude's TODO tasks and process them
set -euo pipefail

# --- Configuration -----------------------------------------------------------
KANBAN_URL="${KANBAN_URL:-http://localhost:18790}"
ASSIGNEE="${ASSIGNEE:-claude}"
WORK_DIR="${WORK_DIR:-$(pwd)}"
MAX_BUDGET="${MAX_BUDGET:-5.00}"
MODEL="${MODEL:-claude-sonnet-4-6}"
LOGDIR="${LOGDIR:-./logs/claude-kanban}"

mkdir -p "$LOGDIR"
LOGFILE="$LOGDIR/run-$(date +%Y%m%d-%H%M%S).log"
exec > "$LOGFILE" 2>&1

echo "=== Claude Kanban Run: $(date) ==="

# --- Pre-check: is the board reachable? --------------------------------------
if ! curl -sf "$KANBAN_URL/api/tasks" > /dev/null 2>&1; then
  echo "ERROR: Kanban server not reachable at $KANBAN_URL. Aborting."
  exit 1
fi

# --- Pre-check: any tasks in TODO for our assignee? --------------------------
TASKS=$(curl -sf "$KANBAN_URL/api/tasks")
TODO_COUNT=$(echo "$TASKS" | jq --arg a "$ASSIGNEE" \
  '[.[] | select(.column == "todo" and .assignee == $a)] | length')

if [ "$TODO_COUNT" -eq 0 ]; then
  echo "No tasks for '$ASSIGNEE' in TODO. Nothing to do."
  exit 0
fi

echo "Found $TODO_COUNT task(s) for '$ASSIGNEE' in TODO. Launching Claude Code..."

# --- Run Claude Code ---------------------------------------------------------
cd "$WORK_DIR"
claude -p --dangerously-skip-permissions \
  --model "$MODEL" \
  --max-budget-usd "$MAX_BUDGET" \
  "You have tasks on the Kanban board at $KANBAN_URL assigned to '$ASSIGNEE' in the 'todo' column.
For each task:
1. GET $KANBAN_URL/api/tasks to see all tasks
2. Pick the highest-priority 'todo' task assigned to '$ASSIGNEE'
3. PATCH it to 'in_progress' before starting work
4. Do the work described in the task
5. PATCH it to 'review' when done
Process one task per run." || true

echo "=== Done: $(date) ==="
```

Make it executable:

```bash
chmod +x claude-kanban.sh
```

### Setting Up the Cron Job

Run `crontab -e` and add a line. For example, every 15 minutes:

```cron
*/15 * * * * /path/to/claude-kanban.sh
```

> **Tip:** Cron doesn't load your shell profile, so if `claude` isn't found, add an explicit PATH at the top of the script or in your crontab:
> ```cron
> PATH=/usr/local/bin:/usr/bin:/home/youruser/.npm-global/bin
> */15 * * * * /path/to/claude-kanban.sh
> ```

### Configuration

All settings are via environment variables with sensible defaults:

| Variable | Default | Purpose |
|---|---|---|
| `KANBAN_URL` | `http://localhost:18790` | Base URL of your mono-kanban instance |
| `ASSIGNEE` | `claude` | Which assignee's tasks to pick up |
| `WORK_DIR` | current directory | Working directory for Claude Code (usually your project root) |
| `MAX_BUDGET` | `5.00` | Max spend per run in USD |
| `MODEL` | `claude-sonnet-4-6` | Claude model to use |
| `LOGDIR` | `./logs/claude-kanban` | Where to write run logs |

Example with overrides:

```bash
KANBAN_URL=http://myserver:3000 ASSIGNEE=bot MAX_BUDGET=2.00 ./claude-kanban.sh
```

### Slash Commands

mono-kanban ships with two [Claude Code slash commands](https://docs.anthropic.com/en/docs/claude-code/slash-commands) in `.claude/commands/` for managing tasks directly from the terminal:

| Command | What it does |
|---|---|
| `/add-task Fix login timeout` | Creates a task in **backlog** with defaults |
| `/add-task Add dark mode --assignee claude --priority high` | Creates with assignee and priority |
| `/queue-task Fix login` | Moves a backlog task to **todo** (partial title match) |
| `/queue-task Fix login --assignee claude` | Moves to todo and assigns |

These work inside any Claude Code session when your working directory is the mono-kanban project (or a parent that contains it). They use `curl` under the hood to hit the Kanban API.

> **Typical workflow:** `/add-task` to capture ideas into backlog, `/queue-task` to promote them to todo when ready, then the cron job picks them up automatically.

### Tips

- **Cost control:** The `--max-budget-usd` flag caps each run. The pre-check exits early (zero cost) when there are no tasks.
- **Rate limits:** If you're on a Pro plan, you may hit rate limits. Consider adding a lockfile mechanism that skips runs for a cooldown period after a rate limit is detected.
- **Task design:** Write clear task titles and descriptions — Claude reads them literally. Include file paths, expected behavior, and acceptance criteria.
- **Review column:** Have a human review tasks that Claude moves to `review` before marking them `done`. Trust but verify.
- **CLAUDE.md:** Place a `CLAUDE.md` file in your `WORK_DIR` with project context, coding conventions, and instructions. Claude Code reads this automatically and it dramatically improves task quality.

## License

MIT
