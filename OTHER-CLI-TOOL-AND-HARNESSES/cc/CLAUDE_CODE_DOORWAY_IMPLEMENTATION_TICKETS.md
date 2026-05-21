# Claude Code → Doorway Implementation Tickets

**Purpose:** Translate Claude Code findings into actionable Doorway implementation tickets.

---

## Finding Translation Table

| # | Finding | Why it matters | Doorway equivalent | Implementation package | Priority | Acceptance test |
|---|--------|--------------|-------------------|----------------------|---------|----------------|
| F1 | Claude Code classifies risky shell commands before execution via 20 security checks | Users trust terminal agents only when destructive actions are gated | `CommandRiskClassifier` + `PermissionReceiptService` before any `TerminalRuntime.writeInput()` | `packages/core/permissions` | P0 | `rm -rf`, `git reset --hard`, `git push --force` produce permission receipt before execution |
| F2 | Tool schemas use Zod for input validation before execution | Catches malformed inputs early, prevents partial state | `ToolInputValidator` using Zod for all worker tool inputs | `packages/core/tools` | P0 | Invalid JSON/zod schema produces typed error, not crash |
| F3 | `readFileState` tracks file reads for TOCTOU protection | Prevents race conditions when model edits file user also changed | `FileStateCache` with timestamp + content hash tracking | `packages/core/filesystem` | P1 | Edit a file between read and write → error with clear message |
| F4 | File edits use string replacement (not patch application) | Simpler, more predictable than patch, quote-normalized | `StringEditStrategy` with quote style preservation | `packages/core/filesystem` | P1 | Edit with curly quotes → model output uses curly quotes, not straight |
| F5 | Context compaction groups by API round trip for coherent summarization | Prevents breaking tool-use/message pairs across compaction | `RoundTripCompactor` grouping tool + result pairs | `packages/core/compact` | P1 | Compact mid-session → model resumes correctly with context |
| F6 | Auto-compact has circuit breaker (3 consecutive failures) | Prevents infinite compaction loops that burn tokens | `CompactionCircuitBreaker` with configurable failure limit | `packages/core/compact` | P1 | 3 consecutive compaction failures → stop trying, notify user |
| F7 | CLAUDE.md supports `@include` directive with relative paths and fragment stripping | Enables modular instruction files without duplication | `DoorwayInstructions` with `@include` support | `packages/core/context` | P1 | `@include @./shared/rules.md#auth` resolves correctly in `DOORWAY.md` |
| F8 | Project root detection uses LRU memoization (max 50 entries) | Prevents unbounded filesystem walks on deep directory trees | `GitRootDetector` with LRU cache (max 100 entries) | `packages/core/context` | P2 | 100+ worktrees created → memory stable, no unbounded growth |
| F9 | Hook system has 24 event types but hook execution is fire-and-forget | Hooks are powerful but errors don't fail the parent operation | `LaneLifecycleEvents` (6-8 events max) with typed error propagation | `packages/core/events` | P2 | Hook error → lane gets error event, parent continues |
| F10 | Subagent isolation via context cloning | Shared mutable state risk across agents | `WorkerContextFactory` creating fresh process context per worker | `packages/terminal-runtime` | P0 | Subagent crash → parent survives, clean termination |
| F11 | Worktree-based isolation for filesystem-level agent separation | True filesystem isolation, not just process | `WorktreeManager` for agent worktrees (`.doorway/worktrees/<slug>`) | `packages/terminal-runtime` | P0 | Two agents edit same file path in different worktrees → no conflict |
| F12 | Tool results >50K chars offloaded to disk with preview in transcript | Prevents context blowup from large outputs | `ToolResultOffloader` with configurable threshold | `packages/core/storage` | P1 | Bash command output 100K chars → preview in ledger, full in file |
| F13 | Session resume detects interruption type (interrupted_prompt vs interrupted_turn) | User gets appropriate continuation message | `InterruptionDetector` classifying pause type | `packages/core/session` | P2 | Ctrl+C mid-turn → resume says "continue where you left off" not "task completed" |
| F14 | Git diff includes `--shortstat` probe before expensive operations | Avoids slow diff on huge repositories | `GitDiffFetcher` with size probe first | `packages/core/vcs` | P2 | 10K file repo → diff fetches in <1s, not timeout |
| F15 | Permission rules use `ToolName(content)` wildcard syntax | Clean, composable rule definitions | `WildcardPermissionMatcher` supporting `Tool(path/**)` patterns | `packages/core/permissions` | P1 | `Bash(git:*)` → `Bash(git status)` allowed, `Bash(npm install)` denied |
| F16 | File history snapshots (up to 100) with rewind capability | Lets user review file state at any message point | `FileHistoryStore` with per-message snapshots | `packages/core/filesystem` | P2 | Rewind to message 5 → file contents match what existed at that point |
| F17 | Coordinator mode restricts worker tools (`CLAUDE_CODE_SIMPLE`: Bash, Read, Edit) | Least privilege for subagents | `WorkerToolRestrictor` applying `allowedTools` per worker type | `packages/orchestrator` | P1 | Coordinator spawns worker → worker has only assigned tools |
| F18 | Terminal uses Ink (React) with Yoga layout, damage tracking for partial redraws | Smooth 60fps terminal UI without full redraw flicker | `InkTerminalRenderer` (or wrapper) for visible worker output | `packages/terminal-runtime` | P2 | Long output → partial scroll update, no full screen flicker |
| F19 | Structured patch output via `diff` library with 3 context lines | Human-readable diffs with hunks | `DiffGenerator` using `diff` library, 3 context lines | `packages/core/diff` | P1 | Edit 3 lines in 100-line file → diff shows correct hunk with context |
| F20 | Analytics events for git operations (commit, push, merge, PR) | Audit trail for VCS operations | `GitOperationTracker` emitting ledger events | `packages/core/vcs` | P2 | `git commit` → ledger entry with commit hash, author, message |
| F21 | Tool concurrency partitioning: read-only tools parallel, stateful tools serial | Prevents race conditions while maximizing throughput | `ToolConcurrencyScheduler` partitioning by `isConcurrencySafe` | `packages/core/tools` | P1 | 10 concurrent Grep calls → parallel execution; 10 Edit calls → serial |
| F22 | `bypassPermissions` mode exists but dangerous files are bypass-immune | Allows power users while protecting critical paths | `SafetyLane` with bypass-immune path list | `packages/core/permissions` | P0 | `bypassPermissions=true` → still blocked from editing `.doorway/settings.json` |
| F23 | Memory files support `type:` frontmatter (user, feedback, project, reference) | Enables semantic categorization for retrieval | `MemoryStore` with typed entries matching Claude Code taxonomy | `packages/core/memory` | P2 | Memory entry tagged `type:feedback` → retrieved in relevant context |
| F24 | Shell commands split by operators (`&&`, `||`, `|`, `;`) and each checked | Compound commands don't bypass safety on first safe subcommand | `CommandSplitter` partitioning compound commands | `packages/core/permissions` | P0 | `git status && rm -rf /` → second part blocked, first part logged |
| F25 | Session metadata appended to transcript JSONL (custom-title, tag, mode) | Enables session organization and search | `SessionMetadataStore` appending to ledger | `packages/core/session` | P2 | Tag session "auth-refactor" → resume lists "auth-refactor" sessions |
| F26 | Prompt history stored in `~/.claude/history.jsonl` with project scope | Cross-session history without context pollution | `PromptHistoryStore` with project isolation | `packages/core/history` | P2 | Search history → only current project's prompts shown |
| F27 | Slash commands registered via `commands.ts` with source priority ordering | Plugins can add commands without overriding core | `CommandRegistry` with priority-based resolution | `packages/core/commands` | P2 | Plugin registers `/mycommand` → doesn't conflict with built-in `/help` |
| F28 | Async hooks support with `asyncTimeout` and progress tracking | Long-running hooks don't block the main loop | `AsyncHookRunner` with timeout and progress | `packages/core/events` | P3 | Hook returns `async:true,asyncTimeout:30000` → runs in background, progress tracked |
| F29 | Denial tracking with maxConsecutive (3) and maxTotal (20) limits | Prevents classifier from going rogue | `DenialTracker` with configurable limits | `packages/core/permissions` | P1 | 3 consecutive denials → stop auto-denying, prompt user |
| F30 | Output streaming via `StreamingToolExecutor` for concurrent tool execution | Model sees tool results as they complete, not all at once | `StreamingResultEmitter` for worker output | `packages/terminal-runtime` | P2 | 3 tools running → results stream in as they complete |

---

## Implementation Tickets

### Ticket P0-1: PermissionReceiptService

**Description:** Create formal permission receipt system that produces cryptographically signable receipts for every permission decision (allow/deny) with full audit trail.

**Files to create:**
- `packages/core/permissions/src/receipt.ts`
- `packages/core/permissions/src/CommandRiskClassifier.ts`
- `packages/core/permissions/src/PermissionMode.ts`
- `packages/core/permissions/src/store.ts`

**API:**
```typescript
interface PermissionReceipt {
  id: string
  timestamp: number
  toolName: string
  inputHash: string
  decision: 'allow' | 'deny'
  source: 'user' | 'classifier' | 'hook' | 'config'
  rulesApplied: string[]
  sessionId: string
  workerId?: string
}

class PermissionReceiptService {
  record(decision: PermissionDecision): PermissionReceipt
  getBySession(sessionId: string): PermissionReceipt[]
  getByWorker(workerId: string): PermissionReceipt[]
  verify(receipt: PermissionReceipt): boolean
}
```

**Acceptance test:** `rm -rf`, `git reset --hard`, `git push --force` produce permission receipt before execution.

---

### Ticket P0-2: WorktreeManager

**Description:** Manage git worktree lifecycle for agent isolation. Each agent gets its own worktree with symlinked shared directories.

**Files to create:**
- `packages/terminal-runtime/src/worktree.ts`
- `packages/terminal-runtime/src/WorktreeManager.ts`

**API:**
```typescript
interface WorktreeManager {
  create(slug: string, branch?: string): Promise<Worktree>
  remove(slug: string): Promise<void>
  list(): Worktree[]
  cleanupStale(maxAgeDays: number): Promise<void>
}

interface Worktree {
  path: string
  branch: string
  createdAt: number
  lastUsedAt: number
}
```

**Acceptance test:** Two agents editing same file path in different worktrees → no conflict, clean merge.

---

### Ticket P0-3: EventLedger

**Description:** Immutable event ledger for all worker actions. Every tool call, file change, permission decision, and user input recorded with full evidence.

**Files to create:**
- `packages/core/ledger/src/ledger.ts`
- `packages/core/ledger/src/entry.ts`
- `packages/core/ledger/src/query.ts`

**API:**
```typescript
interface LedgerEntry {
  id: string
  timestamp: number
  workerId: string
  threadId: string
  event: 'tool_use' | 'tool_result' | 'user_input' | 'permission' | 'file_change' | 'command' | 'error'
  data: Record<string, unknown>
}

class EventLedger {
  append(entry: LedgerEntry): void
  query(filter: LedgerQuery): LedgerEntry[]
  getThread(threadId: string): LedgerEntry[]
  getWorkerActions(workerId: string): LedgerEntry[]
}
```

**Acceptance test:** Ledger entry written for every agent action, queryable by thread.

---

### Ticket P1-1: ClaudeCodeAdapter

**Description:** Adapter to run Claude Code as a visible worker in Doorway's orchestrator. Wraps the Claude Code CLI, captures tool calls, feeds permission decisions, and records transcript.

**Files to create:**
- `packages/adapters/claude-code/src/ClaudeCodeAdapter.ts`
- `packages/adapters/claude-code/src/parseToolCalls.ts`
- `packages/adapters/claude-code/src/feedPermissionDecisions.ts`

**API:**
```typescript
interface ClaudeCodeAdapter {
  start(sessionId: string, prompt: string, options: WorkerOptions): void
  stop(): void
  feedPermission(decision: PermissionDecision): void
  getTranscript(): Transcript
  getToolCalls(): ToolCall[]
}
```

**Acceptance test:** Spawn Claude Code via adapter → tool calls captured in ledger → permission decisions fed back → transcript recorded.

---

### Ticket P1-2: DoorwayInstructions (DOORWAY.md)

**Description:** Project instruction system equivalent to CLAUDE.md with `@include` directive support, glob-based conditional rules, and memory taxonomy.

**Files to create:**
- `packages/core/context/src/instructions.ts`
- `packages/core/context/src/includeResolver.ts`
- `packages/core/context/src/DoorwayInstructions.ts`

**API:**
```typescript
interface DoorwayInstructions {
  load(projectRoot: string): Promise<InstructionFile[]>
  resolveInclude(path: string, from: string): Promise<string>
  getActiveRules(filePaths?: string[]): InstructionRule[]
}
```

**Acceptance test:** `DOORWAY.md` with `@include @./rules/auth.md#policy` resolves correctly, `paths: src/**/*.ts` activates only for matching files.

---

### Ticket P1-3: ToolConcurrencyScheduler

**Description:** Partition tool calls into concurrent (read-only) and serial (stateful) batches for optimal throughput without race conditions.

**Files to create:**
- `packages/core/tools/src/concurrency.ts`
- `packages/core/tools/src/ToolConcurrencyScheduler.ts`

**API:**
```typescript
interface ToolConcurrencyScheduler {
  schedule(tools: ToolCall[]): Batch[]
  execute(batch: Batch, executor: ToolExecutor): AsyncIterable<ToolResult>
}

interface Batch {
  isConcurrent: boolean
  tools: ToolCall[]
}
```

**Acceptance test:** 10 concurrent Grep calls execute in parallel; 10 Edit calls execute serially.

---

### Ticket P1-4: DiffGenerator

**Description:** Generate human-readable structured diffs for file changes with configurable context lines.

**Files to create:**
- `packages/core/diff/src/DiffGenerator.ts`
- `packages/core/diff/src/patch.ts`

**API:**
```typescript
interface DiffGenerator {
  generatePatch(oldContent: string, newContent: string, filePath: string): Patch
  generateHunks(patch: Patch, contextLines?: number): Hunk[]
}

interface Patch {
  filePath: string
  hunks: Hunk[]
  additions: number
  deletions: number
}
```

**Acceptance test:** Edit 3 lines in 100-line file → diff shows correct hunk with 3 context lines.

---

### Ticket P2-1: RoundTripCompactor

**Description:** Context compaction that groups tool calls with their results by API round trip for coherent summarization.

**Files to create:**
- `packages/core/compact/src/RoundTripCompactor.ts`
- `packages/core/compact/src/microCompact.ts`
- `packages/core/compact/src/CompactionCircuitBreaker.ts`

**Acceptance test:** Compact mid-session → model resumes correctly with context.

---

### Ticket P2-2: DenialTracker

**Description:** Track permission denials with configurable consecutive and total limits to prevent classifier from going rogue.

**Files to create:**
- `packages/core/permissions/src/DenialTracker.ts`

**Acceptance test:** 3 consecutive denials → stop auto-denying, prompt user.

---

### Ticket P2-3: FileHistoryStore

**Description:** Per-message file snapshots enabling rewind to any point in session history.

**Files to create:**
- `packages/core/filesystem/src/FileHistoryStore.ts`
- `packages/core/filesystem/src/snapshot.ts`

**Acceptance test:** Rewind to message 5 → file contents match what existed at that point.

---

### Ticket P2-4: LaneLifecycleEvents

**Description:** Simplified event system for lane (worker) lifecycle — 6-8 typed events replacing Claude Code's 24 hook types.

**Files to create:**
- `packages/core/events/src/LaneLifecycleEvents.ts`
- `packages/core/events/src/EventBus.ts`

**Events:**
```typescript
type LaneEvent =
  | 'lane:start'
  | 'lane:stop'
  | 'lane:error'
  | 'lane:tool_use'
  | 'lane:tool_result'
  | 'lane:permission_required'
  | 'lane:idle'
  | 'lane:resumed'
```

**Acceptance test:** Lane error → error event emitted, parent notified, continues.

---

### Ticket P3-1: AsyncHookRunner

**Description:** Background hook execution with timeout and progress tracking for long-running hooks.

**Files to create:**
- `packages/core/events/src/AsyncHookRunner.ts`

**Acceptance test:** Hook returns `async:true,asyncTimeout:30000` → runs in background, progress tracked.

---

### Ticket P3-2: GitOperationTracker

**Description:** Emit ledger events for git operations (commit, push, merge, PR).

**Files to create:**
- `packages/core/vcs/src/GitOperationTracker.ts`

**Acceptance test:** `git commit` → ledger entry with commit hash, author, message.

---

## Cross-Cutting Concerns

### Security Review Required For:
- Ticket P0-1 (PermissionReceiptService) — receipt signing algorithm
- Ticket P0-2 (WorktreeManager) — symlink attack surface
- Ticket P0-3 (EventLedger) — append-only integrity
- Ticket P2-2 (DenialTracker) — limit bypass via timing attacks

### Performance Review Required For:
- Ticket P1-3 (ToolConcurrencyScheduler) — batching overhead at scale
- Ticket P2-1 (RoundTripCompactor) — compaction latency on large sessions
- Ticket P2-3 (FileHistoryStore) — disk usage with 100+ snapshots

### Observability Requirements (all tickets):
- Every ticket must emit structured log events
- Every ticket must have metrics (duration, count, error rate)
- Every ticket must propagate trace context
