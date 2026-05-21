# BRUTAL DOORWAY CODE REVIEW

## Against Our Own Docs — Honest 1-10 Verdict

---

## OVERALL VERDICT: 6.8/10

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│   NOT AI SLOP. NOT CODEX DESKTOP.                                          │
│   But missing the live streaming layer and pattern learning.                 │
│                                                                            │
│   The architecture is real. The terminal is real. The DB is real.          │
│   The evidence system is real. The tests pass.                             │
│                                                                            │
│   But: xterm.js is NOT connected to live PTY output.                      │
│   And: workflow memory is just file reading, not operational intelligence.  │
│   And: file delta is periodic snapshots, not real-time watchers.          │
│   And: process tree is ps parsing, not live child tracking.                 │
│   And: cross-model threading exists in types but not in UI.                  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## LAYER-BY-LAYER BRUTAL RATINGS

### Terminal Runtime (packages/terminal-runtime) — 7/10

```
STRENGTHS:
✅ Real node-pty backend — cross-platform, mature
✅ Exit code taxonomy — EXCELLENT. Deterministic. Well-typed.
   SIGSEGV, SIGKILL, SIGABRT, exit 0-127 classification is production-grade.
✅ Process tree tracking — uses ps -eo, parses output, builds tree
✅ File delta snapshots — diffs before/after directory scans
✅ Session manager with full lifecycle
✅ Typed errors (PtyError, SessionNotFoundError, etc.)
✅ 302 tests pass

WEAKNESSES:
❌ File delta is periodic snapshots, NOT inotify/fs.watch
   The SOTA doc says we need real-time watchers.
   fs.readdir walks every N seconds is not the same as kernel-level events.
   Misses: file changes during operations, transient files, race conditions.

❌ Process tree uses `ps` parsing, NOT child_process tree API
   The SOTA doc says use Node.js child_process API for live tracking.
   ps parsing is: snapshot → parse → return. Not live.
   Misses: real-time signal propagation, memory/CPU per child.

❌ PTY ISOLATION:
   Each PTY session is independent.
   No sandboxing between agent runs.
   No resource limits (memory, CPU, time) per session.
   No network isolation.

SCORE: 7/10 — Real implementation, real types, but misses the live/realtime layer.
```

### Core (packages/core) — 8/10

```
STRENGTHS:
✅ Comprehensive SQLite schema — 35+ tables, proper migrations
✅ WAL mode, foreign keys, indexes on all query paths
✅ Event sourcing — every action recorded as an event
✅ Full evidence type system:
   - terminal-evidence.ts
   - process-evidence.ts
   - file-delta-evidence.ts
   - proof-evidence.ts
   - permission-evidence.ts
   - handoff-evidence.ts
   - merge-evidence.ts
   - task-graph-evidence.ts
✅ Typed protocol package — all domain types branded/unique
✅ Thread service with full CRUD + projections
✅ Project service with package manager detection
✅ No `|| true` in any gate

WEAKNESSES:
❌ file_changes table stores JSON string, not structured diff
   "changes_json TEXT NOT NULL" — should be normalized columns.
❌ sequences table is a single-row bottleneck for event ordering
   Every event does: INSERT...ON CONFLICT DO UPDATE SET value = value + 1 RETURNING value
   Under load this serializes all writes.
❌ Migrations are inline array of SQL strings, not versioned files
   If migration N fails, the error message shows the first 100 chars only.
   No rollback strategy.

SCORE: 8/10 — Strong foundation. Schema is thoughtful. Evidence system is comprehensive.
```

### Orchestrator (packages/orchestrator) — 7/10

```
STRENGTHS:
✅ Brain service — provider drivers (OpenAI, Anthropic), role bindings
✅ Project memory loader — reads AGENTS.md, DOORWAY.md, .cursorrules, .clauderules
✅ Task graph service — creates task graphs with nodes/edges
✅ Flight recorder — hash-chained audit events for tamper evidence
✅ Browser session service — Playwright-based computer use
✅ Handoff packet service — cross-model communication
✅ Context compiler — builds prompts from memory + structure + files
✅ Environment overrider — allocates ports per worktree
✅ Best-of-N execution (N=2 cap)
✅ Worktree-aware execution

WEAKNESSES:
❌ Memory is just file reading. NOT operational intelligence.
   Our SOTA doc says: "which commands verify this repo, which errors repeat,
   which files are risky, which workflows recur."
   Current implementation: reads .md files. That's not memory.
   That's file ingestion. There's no pattern learning, no learned workflows.

❌ Brain service exists but orchestration doesn't route between models.
   The context compiler is simple string concatenation.
   No model suitability routing (Claude for reasoning, Codex for fast implementation).
   No cost/quality tradeoff in the router.

❌ Task graph creates graphs but doesn't execute them.
   createTaskGraph() exists. executeTaskGraph() does NOT.
   The graph is a data structure, not a runtime.

❌ Browser session service is basic.
   Has launch, pause, resume, screenshot.
   Missing: element inspection, network request capture, DOM diff for visual proof.

SCORE: 7/10 — Real orchestration. Real memory loader. But memory isn't learning yet.
```

### Adapters (packages/adapters) — 6/10

```
STRENGTHS:
✅ Claude Code adapter — clean implementation
✅ Codex CLI adapter — clean implementation
✅ Base adapter interface — well-typed
✅ Fixture adapter for testing

WEAKNESSES:
❌ Cursor adapter: DOES NOT EXIST
   Our SOTA doc says: "Claude + Codex + Cursor + Gemini in one thread."
   We have Claude and Codex. No Cursor. No Gemini. No custom tool.

❌ Generic CLI adapter is a skeleton.
   Just passes through. No actual command building or output parsing.

❌ No adapter registry pattern.
   Adapters are imported directly in handlers.ts.
   No lazy loading, no MCP server support.

❌ Adapter manifest is static.
   No dynamic tool discovery from installed CLI tools.

SCORE: 6/10 — Claude + Codex adapters are real. Everything else is missing.
```

### Git Engine (packages/git-engine) — 7.5/10

```
STRENGTHS:
✅ Worktree management — create, fork, archive, merge
✅ Diff service — computes diffs, categorizes by type
✅ Integration service — merge planning, safety scoring
✅ Discovery service — package manager detection
✅ Proper error types (GitNotInstalledError, DirtyWorktreeError, etc.)

WEAKNESSES:
❌ No interactive rebase support.
   Agents may create messy histories. No history rewriting.

❌ Diff service computes diffs but doesn't compare against baselines.
   No "what changed since last agent run" tracking.

❌ Worktree merge uses external `git merge` command.
   Not a proper libgit2-style merge engine.
   Could conflict with Doorway's own git operations.

SCORE: 7.5/10 — Solid git operations. Real worktree isolation.
```

### Desktop Renderer (apps/desktop/src/renderer) — 6/10

```
STRENGTHS:
✅ TerminalSurface with real xterm.js — proper Terminal component
✅ TerminalMuxPanel with tabs, status indicators, tab close/add
✅ SurfaceDrawer with multiple surface types (terminal, browser, evidence)
✅ ThreadCanvas with message history, markdown rendering
✅ ComposerDock with slash commands, mention targets, model selection
✅ EvidencePanel for proofs
✅ ReviewEvidence with diff viewer
✅ WorkspaceChrome with project/thread sidebar
✅ CommandPalette with fuzzy search
✅ Dark theme, proper CSS, JetBrains Mono font
✅ Honest empty states ("No terminal session is active", "Open a project first")
✅ 3196-line App.tsx is a PROBLEM, not a feature
   Everything is in one file. No lazy loading, no route splitting.

WEAKNESSES — THE CRITICAL ONES:

❌❌❌ CRITICAL: xterm.js is NOT streaming live PTY output
   TerminalSurface.tsx does:
     useEffect(() => { terminal.reset(); terminal.write(terminalText); }, [terminalText]);

   This means: every time transcript changes, the ENTIRE terminal is RESET
   and the ENTIRE transcript is rewritten. This is:
   - NOT streaming. It's full reload.
   - WILL lose cursor position on every chunk.
   - WILL lag for large transcripts.
   - IS NOT connected to live PTY data callbacks.

   The terminal renders persisted transcript chunks from DB.
   It does NOT receive live data from the PTY backend.

❌ Process tree evidence is NOT shown in UI
   captureProcessTree() is called in handlers.ts on terminal events.
   Process snapshots are stored in SQLite.
   BUT: TerminalMuxPanel shows exit_label only. No process tree panel.

❌ Exit taxonomy is NOT shown in UI
   classifyTerminalExit() produces rich classification objects.
   These are stored in terminal_sessions.exit_kind, .exit_label, etc.
   BUT: no UI panel shows "SIGSEGV = segmentation fault, check memory access".

❌ File delta evidence is NOT shown in UI
   diffFileSnapshots() produces TerminalFileDeltaEntry[].
   Stored in terminal_file_delta_snapshots.
   BUT: no UI panel shows "Created: src/auth/login.ts, Modified: package.json".

❌ Browser proof panel is skeletal
   Shows URL, title, latest screenshot.
   No action history, no network trace, no DOM evidence.

❌ ThreadCanvas handles messages but lanes are not visible.
   Multiple parallel agents = multiple lanes in the thread.
   The UI shows messages chronologically.
   Not visual lanes per agent.

SCORE: 6/10 — Good bones, honest states, real xterm.js.
   But live streaming is broken, evidence panels are empty, lanes are invisible.
```

### Desktop Main Process (apps/desktop/src/main) — 7.5/10

```
STRENGTHS:
✅ Complete IPC handler registration — all domains covered
✅ Real service instantiation (Orchestrator, SessionManager, GitEngine, etc.)
✅ captureProcessTree() wired to terminal lifecycle events
✅ captureAndRecordFileDelta() wired to terminal lifecycle events
✅ Live permission handlers with agent run tracking
✅ Thread replay export (JSONL) and verification
✅ Vault integration for secure key storage
✅ Proper error propagation from handlers to renderer
✅ Preload script with typed IPC bridge

WEAKNESSES:
❌ No real-time IPC channel for terminal output
   PTY data arrives via SessionManager callbacks in the main process.
   These callbacks update SQLite.
   The renderer polls SQLite via getThreadEvents or reloads.
   There is no WebSocket or streaming IPC channel from main → renderer.

❌ Browser session lives in the main process but renderer state is separate.
   Browser actions are stored in memory in BrowserSessionService.
   They need to be persisted to SQLite and projected to the renderer.
   Currently: in-memory only, not in the evidence chain.

❌ Vault implementation is opaque (vault.ts not reviewed in full).
   Assuming it's a safeStorage wrapper, which is correct on macOS
   but has limitations on Linux (no keyring integration).

SCORE: 7.5/10 — Solid IPC layer. Real services wired. Missing streaming channel.
```

### Build / Gates — 8.5/10

```
✅ pnpm typecheck — PASSES
✅ pnpm lint — PASSES
✅ pnpm test — PASSES (302 tests)
✅ pnpm build — PASSES
✅ pnpm dead — PASSES (knip dead code)
✅ pnpm deps — PASSES (depcheck)
⚠️ pnpm format — FAILS on docs/*.md (Prettier warnings only)

REMARKABLE: No `|| true` in any gate.
No hidden failures.
No fake test coverage.

SCORE: 8.5/10 — Among the cleanest codebases I've seen for gate integrity.
```

### Tests — 8/10

```
✅ 302 tests passing
✅ Proper mocking (no real model calls in tests)
✅ Real service tests (database, git, terminal)
✅ Handler tests with mock IPC
✅ Renderer tests with proper component testing
✅ No fake test data that masks real behavior

WEAKNESSES:
❌ No integration tests for the full agent loop.
   Orchestrator → Adapter → Terminal → Events → SQLite → Renderer.
   This chain is tested in pieces but not end-to-end.

❌ No performance/regression tests.
   Event ordering under concurrent agent runs.
   Database sequence bottleneck under load.

❌ Browser session service has NO tests.

SCORE: 8/10 — Strong unit test coverage. Missing integration tests.
```

---

## THE 5 CRITICAL GAPS (Must Fix Before 10/10)

### GAP 1: Live PTY Streaming to Renderer (BLOCKER)

```
PROBLEM:
TerminalSurface.tsx: useEffect triggers terminal.reset() + terminal.write(terminalText)
on every transcript change. This is a full reload, not streaming.

WHAT THE SOTA DOC SAYS:
"xterm.js receives live output" and "terminal uses real node-pty session"

WHAT ACTUALLY HAPPENS:
1. PTY emits data → SessionManager captures → stored in SQLite
2. Renderer calls getThreadEvents/getTerminalTranscript periodically
3. TerminalSurface receives new chunks → resets → rewrites all text

FIX REQUIRED:
1. Add WebSocket or streaming IPC channel from main process → renderer
2. SessionManager.onData callback pushes data to renderer in real-time
3. xterm.js terminal.write() appends, does NOT reset
4. Fallback to DB reload only on reconnect/recovery

IMPACT ON SCORE: Without this, Doorway is NOT state-of-the-art.
```

### GAP 2: Evidence Panels Are Empty (BLOCKER)

```
PROBLEM:
- captureProcessTree() runs → stored in SQLite → NOT shown in UI
- classifyTerminalExit() runs → stored in SQLite → NOT shown in UI
- diffFileSnapshots() runs → stored in SQLite → NOT shown in UI

WHAT THE SOTA DOC SAYS:
"Show the process tree in UI (ProcessTreePanel.tsx)"
"Show human-readable failure reason in UI"
"Show file changes from real git diff in UI"

WHAT ACTUALLY HAPPENS:
TerminalMuxPanel shows: session id, status, chunk count.
That's it.

FIX REQUIRED:
1. Build ProcessTreePanel.tsx — renders process snapshots as tree
2. Build ExitTaxonomyPanel.tsx — renders exit classification + recommendation
3. Build FileDeltaPanel.tsx — renders file changes with diff
4. Wire these to TerminalMuxPanel
5. Add evidence drawer to SurfaceDrawer

IMPACT ON SCORE: Without this, Doorway provides no visibility.
The entire differentiator is invisible.
```

### GAP 3: Memory Is File Reading, Not Learning (CRITICAL)

```
PROBLEM:
ProjectMemoryLoader reads .md files into context.
That's ingestion, not memory.

WHAT THE SOTA DOC SAYS:
"which tool works best for which task"
"which commands verify this repo"
"which errors repeat"
"which workflows recur"
"which files are risky"
"what the user prefers"

WHAT ACTUALLY HAPPENS:
- Read AGENTS.md → pass to prompt
- Read DOORWAY.md → pass to prompt
- That's it.

FIX REQUIRED:
1. Track: which commands succeeded in which repos
2. Track: which errors occurred in which files
3. Track: which workflows were executed repeatedly
4. Track: which models were used for which task types
5. Surface learned patterns in composer or as suggestions
6. Store pattern memory in SQLite (new pattern_memory table)

IMPACT ON SCORE: Memory is the #1 market demand.
Without it, Doorway loses the primary differentiator.
```

### GAP 4: File Delta Is Periodic Snapshots, Not Real-Time (SIGNIFICANT)

```
PROBLEM:
File delta runs every N seconds via periodic snapshot.
Uses fs.readdir walk, not inotify/fs.watch.

WHAT THE SOTA DOC SAYS:
"inotify/fs.watch for real-time file changes"

WHAT ACTUALLY HAPPENS:
handlers.ts has captureAndRecordFileDelta() called on terminal lifecycle events.
This does await snapshotFiles(rootPath) — a full directory walk.
Then diffs the snapshots.
This means:
- File changes during a build are missed if no snapshot runs during it
- Large repos are slow to scan
- No kernel-level event, just filesystem polling

FIX REQUIRED:
1. Add inotify/fs.watch-based real-time watcher
2. Debounce and batch file change events
3. Still use snapshots as fallback for macOS (no inotify)
4. Wire watcher to file delta evidence layer

IMPACT ON SCORE: Important but not a complete blocker.
```

### GAP 5: Cross-Model Lanes Not Visible (SIGNIFICANT)

```
PROBLEM:
executeBestOfN() runs 2 agents in parallel.
These are separate worktrees, separate terminals, separate lanes.
The ThreadCanvas shows messages chronologically.
Lanes are NOT visualized.

WHAT THE SOTA DOC SAYS:
"see Claude Lane running, Codex Lane reviewing"
"See which lane is running, which stopped, which failed"

WHAT ACTUALLY HAPPENS:
Single terminal tab per session.
No lane separation in UI.
No visual grouping by agent/provider.

FIX REQUIRED:
1. Build LanePanel or AgentDashboard component
2. Show per-lane: provider, status, terminal session, worktree, activity
3. Wire to listToolLaneProjections() which already exists
4. Add lane indicators to ThreadCanvas

IMPACT ON SCORE: Important for the orchestration story.
```

---

## WHAT IS GENUINELY EXCELLENT

```
✅ Exit code taxonomy — Production-grade deterministic classification.
   No other tool has this level of exit code intelligence.
   This alone is impressive.

✅ Event sourcing with hash chaining — FlightRecorderService is the real deal.
   Tamper-evident audit trail. Proper cryptographic integrity.
   Enterprise-grade compliance from day one.

✅ SQLite schema design — Thoughtful, indexed, migrated, typed.
   The evidence tables alone show deep thinking about what needs to be provable.

✅ Test integrity — No `|| true`, no fake passes, 302 real tests.
   The gate is honest. This is rare and valuable.

✅ Typed protocol package — Every domain entity is branded/unique types.
   ThreadId, TerminalSessionId, AgentRunId, etc.
   No stringly-typed IDs leaking across boundaries.

✅ Real PTY — node-pty backend is production-grade, cross-platform.
   Not a mock, not a simulation.

✅ Browser session with Playwright — Real browser automation for computer use.

✅ Worktree isolation — Proper git worktree management per agent run.
```

---

## THE HONEST SUMMARY TABLE

```
┌────────────────────────────────┬────────┬──────────────────────────────────┐
│ Layer                          │ Score  │ Status                           │
├────────────────────────────────┼────────┼──────────────────────────────────┤
│ Terminal Runtime               │ 7/10   │ Real PTY, good taxonomy,         │
│                                │        │ no live streaming, snapshot delta │
├────────────────────────────────┼────────┼──────────────────────────────────┤
│ Core / Database                │ 8/10   │ Excellent schema, event sourcing, │
│                                │        │ JSON blob in one table           │
├────────────────────────────────┼────────┼──────────────────────────────────┤
│ Orchestrator                   │ 7/10   │ Real services, no pattern        │
│                                │        │ learning, no model routing       │
├────────────────────────────────┼────────┼──────────────────────────────────┤
│ Adapters                       │ 6/10   │ Claude + Codex real,            │
│                                │        │ no Cursor, Gemini, or custom     │
├────────────────────────────────┼────────┼──────────────────────────────────┤
│ Git Engine                     │ 7.5/10 │ Solid worktree + diff,          │
│                                │        │ no interactive rebase            │
├────────────────────────────────┼────────┼──────────────────────────────────┤
│ Desktop Renderer               │ 6/10   │ Good bones, honest states,       │
│                                │        │ no live streaming, empty panels  │
├────────────────────────────────┼────────┼──────────────────────────────────┤
│ Desktop Main Process           │ 7.5/10 │ Solid IPC, real services,        │
│                                │        │ no streaming channel            │
├────────────────────────────────┼────────┼──────────────────────────────────┤
│ Build / Gates                  │ 8.5/10 │ Clean, honest, no faking         │
├────────────────────────────────┼────────┼──────────────────────────────────┤
│ Tests                          │ 8/10   │ 302 tests, strong coverage,     │
│                                │        │ no integration tests            │
├────────────────────────────────┼────────┼──────────────────────────────────┤
│ Overall                        │ 6.8/10 │ Real engineering. Gaps are clear │
└────────────────────────────────┴────────┴──────────────────────────────────┘
```

---

## FINAL VERDICT

```
┌────────────────────────────────────────────────────────────────────────────┐
│  DOORWAY IS:                                                              │
│  "Real engineering built against the right vision,                        │
│   but missing the last 30% that makes it state-of-the-art."               │
│                                                                            │
│  NOT: AI slop, not fake UI, not mock backend.                              │
│  YES: Real PTY, real DB, real event sourcing, real tests, honest gates.    │
│                                                                            │
│  THE 3 THINGS BETWEEN 6.8/10 AND 10/10:                                    │
│  1. Live PTY streaming to xterm.js (not full transcript reload)            │
│  2. Evidence panels wired to UI (process tree, exit taxonomy, file delta) │
│  3. Pattern learning from observed sessions (not just file reading)        │
│                                                                            │
│  If those 3 are built, Doorway is genuinely competitive with Codex.         │
│  Right now, it has the backend of a 9/10 product with a 5/10 frontend.    │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## THE PATH TO 10/10

```
PRIORITY 1 (Week 1-2): Live PTY Streaming
- WebSocket channel from SessionManager → renderer
- xterm.js appends, doesn't reset
- Fallback to DB reload on reconnect
- Status: BLOCKER

PRIORITY 2 (Week 3-4): Evidence Panels
- ProcessTreePanel.tsx from stored snapshots
- ExitTaxonomyPanel.tsx from stored classifications
- FileDeltaPanel.tsx from stored diffs
- Status: BLOCKER

PRIORITY 3 (Week 5-8): Pattern Memory
- Track command success/failure per repo
- Track error frequency per file
- Track model usage per task type
- Surface learned patterns in composer
- Status: CORE DIFFERENTIATOR

PRIORITY 4 (Week 9-12): Cross-Model Lanes
- Visual lane dashboard per agent
- Model routing intelligence
- Worktree status per lane
- Status: COMPETITIVE WIN

PRIORITY 5 (Week 13-20): Polish + Enterprise
- Real-time file watchers (inotify)
- Browser evidence panel
- Integration tests
- RBAC + permissions
- Self-evolution from AHE patterns
- Status: DISTRIBUTION
```
