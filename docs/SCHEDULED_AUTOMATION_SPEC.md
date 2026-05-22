# Scheduled Automation Runner Spec

## 1. Overview

The Scheduled Automation Runner enables Doorway to execute background AI workflows on recurring schedules (e.g., overnight PR reviews, daily dependency updates, automated test sweeps). It extends the Orchestrator to spawn unattended Agent Lanes that run fully integrated within the Terminal Harness.

In accordance with Doorway's core principles, this runner does not use fake data or mock execution. Every scheduled task spawns a real PTY session, persists its state to SQLite, and requires explicit user approval for risky actions.

## 2. Architecture Layers

### 2.1 Scheduler Loop
- Evaluates the `scheduled_jobs` table.
- Determines eligibility by checking `is_active` and `next_run_at <= CURRENT_TIMESTAMP`.
- Calculates and persists the subsequent `next_run_at` based on a cron parser.

### 2.2 Runner Engine
- When a job fires, the Runner Engine delegates execution to the Orchestrator.
- A new `GoalSession` is established.
- A new Agent Lane is launched and bound to a real PTY session.
- Execution happens headlessly but fully persists state as if driven by the user.

### 2.3 State Machine (`JobRun`)
- `STARTING`: Initializing the lane.
- `RUNNING`: PTY session active.
- `NEEDS_APPROVAL`: Runner paused pending user intervention (e.g., a risky command was detected).
- `COMPLETED`: Execution finished via Completion Confidence heuristics.
- `FAILED`: Hard crash or unrecoverable error.

## 3. SQLite Persistence (Schema)

The runner state must be backed by SQLite (WAL mode).

```sql
CREATE TABLE scheduled_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  workflow_prompt TEXT NOT NULL,
  target_worktree_id TEXT,
  is_active BOOLEAN DEFAULT 1,
  next_run_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE job_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES scheduled_jobs(id),
  lane_id TEXT,
  goal_id TEXT,
  status TEXT NOT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  error_code TEXT
);

CREATE INDEX idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at) WHERE is_active = 1;
CREATE INDEX idx_job_runs_job_id ON job_runs(job_id);
```

## 4. Core Execution Rules

### 4.1 Real Terminal Execution
Scheduled jobs **must not** bypass the Terminal Harness.
- They must use `TerminalRuntime.startSession()`.
- Every byte of input and output is recorded to `terminal_chunks`.
- UI projections must reflect this real state, not a mock "processing" spinner.

### 4.2 Risky Action Approvals
Because the runner operates unattended (e.g., overnight), it must never silently execute destructive actions.
- The Output Watcher scans for risky commands (`git push`, `npm publish`, DB migrations).
- If detected, the PTY halts, and the lane transitions to `NEEDS_APPROVAL`.
- The UI surfaces an Approval Card containing exact context, commands, and `EvidenceRefs` for the user to review in the morning.

### 4.3 Evidence Generation
Every run must attach `EvidenceRefs` to prove what it did.
- `test_result`: Output from `pnpm test`.
- `diff`: Code changes made during the run.
- `browser_screenshot`: Captures from headless browser validations.
- Claims without evidence are rejected.

## 5. Error Handling & Failures

- **No Silent Failures**: `catch` blocks must persist the error and mark the job `FAILED`.
- **Exit Taxonomy**: Terminals that crash must be classified via `classifyExit(exitCode, signal)` rather than generic failure states.
- **Failover**: Inherits `runWithFailover` logic from the Orchestrator to attempt alternative providers if the primary agent LLM API fails.

## 6. IPC and Projections

To expose the runner's state to the UI without inventing domain state, implement the following projections:
- `ScheduledJobProjection`: Maps to `scheduled_jobs` for the settings/automation view.
- `JobRunProjection`: Maps to `job_runs` and joins `EvidenceRefs` to render the "Morning Report" timeline.
