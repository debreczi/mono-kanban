import express from "express";
import { readFile, writeFile, access, mkdir, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const TASKS_FILE = join(__dirname, "tasks.json");
const USAGE_FILE = process.env.USAGE_FILE || join(DATA_DIR, "usage.json");
const API_USAGE_FILE = process.env.API_USAGE_FILE || join(DATA_DIR, "api-usage.json");
const CRON_REGISTRY_FILE = process.env.CRON_REGISTRY_FILE || join(DATA_DIR, "cron-registry.json");
const CRON_STATUS_FILE = process.env.CRON_STATUS_FILE || join(DATA_DIR, "cron-status.json");
const PUBLIC_DIR = join(__dirname, "public");
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 18790;

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

async function readJsonFile(filePath, { createIfMissing = false, fallbackValue = [] } = {}) {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err?.code === "ENOENT") {
      if (createIfMissing) {
        await writeJsonFile(filePath, fallbackValue);
      }
      return [...fallbackValue];
    }

    if (err instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${filePath}: ${err.message}`);
    }

    throw err;
  }
}

async function writeJsonFile(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(value, null, 2) + "\n", "utf-8");
  await rename(tmpPath, filePath);
}

async function readTasks() {
  return readJsonFile(TASKS_FILE, { createIfMissing: true, fallbackValue: [] });
}

async function writeTasks(tasks) {
  await writeJsonFile(TASKS_FILE, tasks);
}

async function readUsage() {
  return readJsonFile(USAGE_FILE, { fallbackValue: [] });
}

async function writeUsage(records) {
  await writeJsonFile(USAGE_FILE, records);
}

async function readApiUsage() {
  return readJsonFile(API_USAGE_FILE, { fallbackValue: [] });
}

async function writeApiUsage(records) {
  await writeJsonFile(API_USAGE_FILE, records);
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_COLUMNS = new Set(["backlog", "todo", "in_progress", "review", "on_hold", "done", "wont_do"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high"]);

function validateTaskFields(body, partial = false) {
  const errors = [];

  if (!partial && (!body.title || typeof body.title !== "string")) {
    errors.push("title is required and must be a string");
  }
  if (body.column !== undefined && !VALID_COLUMNS.has(body.column)) {
    errors.push(`column must be one of: ${[...VALID_COLUMNS].join(", ")}`);
  }
  if (body.priority !== undefined && !VALID_PRIORITIES.has(body.priority)) {
    errors.push(`priority must be one of: ${[...VALID_PRIORITIES].join(", ")}`);
  }
  if (body.title !== undefined && typeof body.title !== "string") {
    errors.push("title must be a string");
  }
  if (body.description !== undefined && typeof body.description !== "string") {
    errors.push("description must be a string");
  }
  if (body.assignee !== undefined && typeof body.assignee !== "string") {
    errors.push("assignee must be a string");
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

// CORS — allow any localhost origin (various ports during dev).
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (_req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /api/tasks — list all tasks
app.get("/api/tasks", async (_req, res, next) => {
  try {
    const tasks = await readTasks();
    res.json(tasks);
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks — create a task
app.post("/api/tasks", async (req, res, next) => {
  try {
    const errors = validateTaskFields(req.body, false);
    if (errors.length) {
      return res.status(400).json({ error: errors.join("; ") });
    }

    const now = new Date().toISOString();
    const task = {
      id: randomUUID(),
      title: req.body.title,
      description: req.body.description ?? "",
      column: req.body.column ?? "backlog",
      assignee: req.body.assignee ?? "",
      priority: req.body.priority ?? "medium",
      createdAt: now,
      updatedAt: now,
    };

    const tasks = await readTasks();
    tasks.push(task);
    await writeTasks(tasks);

    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/tasks/:id — update a task
app.patch("/api/tasks/:id", async (req, res, next) => {
  try {
    const errors = validateTaskFields(req.body, true);
    if (errors.length) {
      return res.status(400).json({ error: errors.join("; ") });
    }

    const tasks = await readTasks();
    const idx = tasks.findIndex((t) => t.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: "Task not found" });
    }

    const allowedFields = ["title", "description", "column", "assignee", "priority"];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        tasks[idx][field] = req.body[field];
      }
    }
    tasks[idx].updatedAt = new Date().toISOString();

    await writeTasks(tasks);
    res.json(tasks[idx]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tasks/:id — remove a task
app.delete("/api/tasks/:id", async (req, res, next) => {
  try {
    const tasks = await readTasks();
    const idx = tasks.findIndex((t) => t.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: "Task not found" });
    }

    const [removed] = tasks.splice(idx, 1);
    await writeTasks(tasks);
    res.json(removed);
  } catch (err) {
    next(err);
  }
});

// GET /api/usage — return all records newest-first
app.get("/api/usage", async (_req, res, next) => {
  try {
    const records = await readUsage();
    const sorted = [...records].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(sorted);
  } catch (err) {
    next(err);
  }
});

// GET /api/usage/summary — aggregated totals + byDay
app.get("/api/usage/summary", async (_req, res, next) => {
  try {
    const records = await readUsage();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    let totalInputTokens = 0, totalOutputTokens = 0, totalCacheWriteTokens = 0, totalCacheReadTokens = 0, totalCostUsd = 0;
    let todayCost = 0, weekCost = 0;
    const byDayMap = {};

    for (const r of records) {
      totalInputTokens += r.inputTokens ?? 0;
      totalOutputTokens += r.outputTokens ?? 0;
      totalCacheWriteTokens += r.cacheWriteTokens ?? 0;
      totalCacheReadTokens += r.cacheReadTokens ?? 0;
      totalCostUsd += r.estimatedCostUSD ?? 0;

      const day = r.timestamp.slice(0, 10);
      if (day === todayStr) todayCost += r.estimatedCostUSD ?? 0;
      if (new Date(r.timestamp) >= weekAgo) weekCost += r.estimatedCostUSD ?? 0;

      if (!byDayMap[day]) byDayMap[day] = { date: day, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, costUsd: 0, runs: 0 };
      byDayMap[day].inputTokens += r.inputTokens ?? 0;
      byDayMap[day].outputTokens += r.outputTokens ?? 0;
      byDayMap[day].cacheWriteTokens += r.cacheWriteTokens ?? 0;
      byDayMap[day].cacheReadTokens += r.cacheReadTokens ?? 0;
      byDayMap[day].costUsd += r.estimatedCostUSD ?? 0;
      byDayMap[day].runs += 1;
    }

    const byDay = Object.values(byDayMap).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      totalSessions: records.length,
      totalInputTokens,
      totalOutputTokens,
      totalCacheWriteTokens,
      totalCacheReadTokens,
      totalCostUsd,
      todayCost,
      weekCost,
      byDay,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/usage — append a record
app.post("/api/usage", async (req, res, next) => {
  try {
    const b = req.body;
    if (!b.sessionId || typeof b.sessionId !== "string") {
      return res.status(400).json({ error: "sessionId is required" });
    }
    const record = {
      id: b.id ?? randomUUID(),
      timestamp: b.timestamp ?? new Date().toISOString(),
      sessionId: b.sessionId,
      trigger: b.trigger ?? "manual",
      model: b.model ?? "claude-sonnet-4-6",
      inputTokens: Number(b.inputTokens ?? 0),
      outputTokens: Number(b.outputTokens ?? 0),
      cacheWriteTokens: Number(b.cacheWriteTokens ?? 0),
      cacheReadTokens: Number(b.cacheReadTokens ?? 0),
      estimatedCostUSD: Number(b.estimatedCostUSD ?? 0),
    };

    const records = await readUsage();
    // Dedup by sessionId
    if (records.some((r) => r.sessionId === record.sessionId && r.trigger === record.trigger)) {
      return res.status(409).json({ error: "Record for this sessionId already exists" });
    }
    records.push(record);
    await writeUsage(records);
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
});

// GET /api/api-usage — return all API key spend records newest-first
app.get("/api/api-usage", async (_req, res, next) => {
  try {
    const records = await readApiUsage();
    const sorted = [...records].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(sorted);
  } catch (err) {
    next(err);
  }
});

// GET /api/api-usage/summary — aggregated totals for API key spend
app.get("/api/api-usage/summary", async (_req, res, next) => {
  try {
    const records = await readApiUsage();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    let totalInputTokens = 0, totalOutputTokens = 0, totalCacheWriteTokens = 0, totalCacheReadTokens = 0, totalCostUsd = 0;
    let todayCost = 0, weekCost = 0, monthCost = 0;
    const byDayMap = {};

    for (const r of records) {
      totalInputTokens += r.inputTokens ?? 0;
      totalOutputTokens += r.outputTokens ?? 0;
      totalCacheWriteTokens += r.cacheWriteTokens ?? 0;
      totalCacheReadTokens += r.cacheReadTokens ?? 0;
      totalCostUsd += r.actualCostUSD ?? 0;

      const day = (r.timestamp || "").slice(0, 10);
      if (day === todayStr) todayCost += r.actualCostUSD ?? 0;
      if (new Date(r.timestamp) >= weekAgo) weekCost += r.actualCostUSD ?? 0;
      if (new Date(r.timestamp) >= monthAgo) monthCost += r.actualCostUSD ?? 0;

      if (!byDayMap[day]) byDayMap[day] = { date: day, costUsd: 0, runs: 0 };
      byDayMap[day].costUsd += r.actualCostUSD ?? 0;
      byDayMap[day].runs += 1;
    }

    const byDay = Object.values(byDayMap).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      totalSessions: records.length,
      totalInputTokens,
      totalOutputTokens,
      totalCacheWriteTokens,
      totalCacheReadTokens,
      totalCostUsd,
      todayCost,
      weekCost,
      monthCost,
      byDay,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/api-usage — append an API key spend record
app.post("/api/api-usage", async (req, res, next) => {
  try {
    const b = req.body;
    if (!b.sessionId || typeof b.sessionId !== "string") {
      return res.status(400).json({ error: "sessionId is required" });
    }
    const record = {
      id: b.id ?? randomUUID(),
      timestamp: b.timestamp ?? new Date().toISOString(),
      sessionId: b.sessionId,
      source: b.source ?? "unknown",
      apiKey: b.apiKey ?? "unknown",
      trigger: b.trigger ?? "unknown",
      model: b.model ?? "claude-sonnet-4-6",
      inputTokens: Number(b.inputTokens ?? 0),
      outputTokens: Number(b.outputTokens ?? 0),
      cacheWriteTokens: Number(b.cacheWriteTokens ?? 0),
      cacheReadTokens: Number(b.cacheReadTokens ?? 0),
      actualCostUSD: Number(b.actualCostUSD ?? 0),
    };

    const records = await readApiUsage();
    if (records.some((r) => r.sessionId === record.sessionId && r.trigger === record.trigger)) {
      return res.status(409).json({ error: "Record for this sessionId already exists" });
    }
    records.push(record);
    await writeApiUsage(records);
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
});

// GET /api/crons — merged registry + status view
app.get("/api/crons", async (_req, res, next) => {
  try {
    let registry = [];
    let status = {};
    try {
      registry = JSON.parse(await readFile(CRON_REGISTRY_FILE, "utf-8"));
    } catch { /* empty registry */ }
    try {
      status = JSON.parse(await readFile(CRON_STATUS_FILE, "utf-8"));
    } catch { /* empty status */ }

    const now = Date.now();
    const result = registry.map(cron => {
      const s = status[cron.name] || {};
      // Parse expected interval from schedule (handles */N patterns)
      const intervalSec = parseIntervalSec(cron.schedule);
      const stale = s.lastRun
        ? (now - new Date(s.lastRun).getTime()) > 2 * intervalSec * 1000
        : false;
      return {
        name: cron.name,
        schedule: cron.schedule,
        scheduleHuman: cron.scheduleHuman,
        description: cron.description,
        lastRun: s.lastRun || null,
        exitCode: s.exitCode ?? null,
        result: s.result || "never",
        summary: s.summary || null,
        durationSeconds: s.durationSeconds ?? null,
        stale,
      };
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

function parseIntervalSec(schedule) {
  // Only handles */N patterns for the minute field
  const m = schedule.match(/^\*\/(\d+)\s/);
  if (m) return parseInt(m[1]) * 60;
  // "0 4 * * *" style — daily = 86400
  return 86400;
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

// 404 catch-all for unknown API routes
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`mono-kanban listening on http://localhost:${PORT}`);
});
