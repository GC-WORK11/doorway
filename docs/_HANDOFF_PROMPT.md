# DOORWAY HANDOFF PROMPT

## Universal Agent Harness — For Continuing Development

---

## MISSION

Ship Doorway as the state-of-the-art AI coding harness.
Doorway is NOT another chat UI. Doorway is NOT Claude Code with a nicer wrapper.
Doorway is the universal agent command center that runs Claude, Codex, Cursor, Gemini, and custom CLIs in real PTYs, keeps persistent workflow memory, shows exactly what happened, and produces evidence-backed, reviewable outcomes.

**Core Truth:** Models commoditize. Harnesses compound. Doorway wins by being the universal harness layer.

---

## START HERE — READ THESE DOCS IN ORDER

All docs live in `/home/govinda/Doorway/docs/`

### Required Reading (in order):

1. **`docs/00_STATE_OF_THE_ART_IDE_BLUEPRINT.md`** (12KB)
   - The distilled source of truth. Doorway's identity, product atoms, non-negotiables.
   - **START HERE FIRST.** Every other doc flows from this.

2. **`docs/09_WARP_TERMINAL_LEARNING.md`** (38KB)
   - Deep Warp research: block model (CRITICAL), command palette, agent blocks
   - **Key insight:** Block model (commands as first-class blocks with stable IDs) is THE terminal UX innovation
   - 5 things to steal: block model, command palette, exit code visibility, rich output, block-based workflows
   - 5 mistakes to avoid: cloud-first, closed source, no worktree isolation, no evidence layer, no cross-model

3. **`docs/07_STATE_OF_THE_ART_TERMINAL_CAPTURE_ANALYSIS.md`** (44KB)
   - PTY is 1990s tech. The breakthrough is the layered harness ON TOP.
   - ForgeCode (81.8% on Terminal-Bench 2.0), OpenDev (Rust 81-page paper), AHE (69.7%→77.0% via harness evolution)
   - Martin Fowler's 4 pillars: Evidence Recording, Process Tree, Exit Taxonomy, File Delta

4. **`docs/08_BRUTAL_CODE_REVIEW.md`** (26KB)
   - Honest 1-10 rating against docs — **8/10 overall**
   - Layer-by-layer breakdown with specific gaps
   - The 3 remaining blockers to 10/10

5. **`docs/01_WHAT_IS_DOORWAY.md`** (29KB)
   - Product definition, pitch, feature overview
   - Market research: #1 ask is persistent cross-session memory

6. **`docs/02_MARKET_RESEARCH.md`** (32KB)
   - Market pain points, user demand data
   - THE MARKET IS TELLING US: No tool has persistent memory. Build it.

7. **`docs/03_COMPETITOR_ANALYSIS.md`** (43KB)
   - Codex vs Claude Code vs Cursor vs T3 — detailed comparison
   - Codex Desktop is the product shape to beat

8. **`docs/05_HARNESS_ARCHITECTURE.md`** (49KB)
   - Full technical spec, Martin Fowler's 4 pillars, code examples
   - Evidence Recording pattern, Exit Taxonomy, Process Tree, File Delta

9. **`docs/06_IMPLEMENTATION_ROADMAP.md`** (46KB)
   - 20-week phase-by-phase build guide
   - Phase 1: Terminal Harness, Phase 2: Memory + Learning, Phase 3: Evidence + Orchestration, Phase 4: Enterprise, Phase 5: Self-Evolution

### Reference Docs:

- **`docs/README.md`** — Quick reference, comparison table, architecture diagram
- **`docs/10_BRUTAL_FEATURES_AUDIT.md`** — Deep feature audit: frontend 7.5/10, backend 8.5/10

---

## THE RULES — READ THESE FILES

All rules live in `/home/govinda/Doorway/Rules/rules/`

### Primary Rules (required):

1. **`Rules/rules.md`** — Main entry. Read this first.

2. **`Rules/rules/karpathy-do-not-slop.rules.md`** (7.9KB)
   - **PRIMARY quality gate.** Karpathy's 4 principles + Doorway-specific checks
   - Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution
   - **READ THIS FIRST BEFORE ANY CODE.**

3. **`Rules/rules/no-slop-quality-gate.rules.md`**
   - The "Fake Code Kill List" — immediately reject mockProjects, fakeTestResult, dummyTerminalOutput, `|| true`, `as any without reason`
   - Design Taste Gate: reject emoji icons, cluttered dashboards, fake avatars
   - Run `pnpm gate` after every change

4. **`Rules/rules/frontend.rules.md`**
   - No fake production state. Only backend projections or honest empty/error states.
   - Shell shape: thin utility rail, main sidebar, thread canvas, message capsules, composer dock, drawer surfaces
   - Evidence Rules: every user-visible claim needs evidence or honest unknown state

5. **`Rules/rules/harness-orchestrator.rules.md`**
   - Terminal Harness Rules: real PTY, store every session, capture input/output
   - Agent Lane Rules: every running tool is a lane with status
   - Orchestrator Routing Rules: reuse/launch/fork/handoff/compact/ask decision with persistence
   - Completion Confidence: use score, never auto-merge

6. **`Rules/rules/backend-infrastructure.rules.md`**
   - Layer boundaries: protocol → services → runtime → persistence → adapters → IPC → UI
   - Protocol first: every UI state needs projection types
   - SQLite locally: WAL mode, migrations versioned, no destructive migrations

7. **`Rules/rules/adaptive-automation.rules.md`**
   - Pattern detection: require 3+ repeated occurrences before suggesting automation
   - Automation must be transparent: name, trigger, steps, tools, commands, approvals, checks, risk level

8. **`Rules/rules/connectors-plugins-skills.rules.md`**
   - No connector may act without user account/config
   - Every connector fetch/action creates EvidenceRef
   - Plugin manifest required: permissions, filesystem, network

9. **`Rules/rules/self-evolving-harness.rules.md`**
   - Self-improvement only through reviewable worktrees and gates
   - Never allow: access secrets, auto-approve permissions, disable audit/evidence
   - Rollback snapshot required before any self-improvement

---

## THE KARPATHY GUIDELINES — BEHAVIORAL RULES

From `/home/govinda/andrej-karpathy-skills/skills/karpathy-guidelines/SKILL.md`

**These address common LLM coding pitfalls:**

- Wrong assumptions without checking
- Overcomplication and bloated abstractions
- Touching code that shouldn't be changed
- Hidden confusion

### The 4 Principles:

#### 1. Think Before Coding

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

#### 2. Simplicity First

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- If 200 lines could be 50, rewrite it.
- Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

#### 3. Surgical Changes

- Touch only what you must. Clean up only your own mess.
- Don't "improve" adjacent code, comments, or formatting.
- Match existing style, even if you'd do it differently.
- Every changed line should trace directly to the user's request.

#### 4. Goal-Driven Execution

- Define success criteria. Loop until verified.
- Transform imperative into verifiable: "Add validation" → "Write tests for invalid inputs, then make them pass"
- For multi-step: state brief plan with verify checks

---

## THE NON-NEGOTIABLES

From `Rules/rules.md` and `AGENTS.md`:

```
1. NO FAKE PRODUCTION UI — no mockProjects, no fakeTerminalOutput, no sampleAgentRuns
2. NO HIDDEN FAILURES — no || true in gates, no catch(e){} without logging
3. REAL PTY SESSIONS — visible CLI workers run through real PTY sessions owned by Doorway
4. HONEST STATE — renderer state must come from backend projections or honest loading/empty/error/unconfigured states
5. EVIDENCE-BACKED — every UI claim backed by real event→persistence→projection chain
6. NO COMPETITOR CODE — competitor/resource source trees are research fixtures, not production code
```

---

## CURRENT CODEBASE STATE

### Directory Structure:

```
/home/govinda/Doorway/
├── packages/
│   ├── terminal-runtime/     # PTY management, exit taxonomy, process tracking, file delta
│   ├── core/                 # SQLite DB, 35+ tables, event sourcing, evidence types
│   ├── protocol/             # Branded types, projection types
│   ├── adapters/            # Claude Code, Codex CLI, Cursor, Gemini adapters
│   ├── orchestrator/         # Brain service, memory loader, task graph, flight recorder, AUTO-COMPACTOR
│   ├── git-engine/           # Worktree management, diff service, merge assessment
│   ├── handoff-capsule/      # Multi-format export (JSON/MD/HTML replay)
│   └── review-merge/         # Merge safety assessment, review board
├── apps/
│   └── desktop/              # Electron app
│       └── src/
│           ├── main/         # IPC handlers, service wiring
│           └── renderer/     # React UI, xterm.js terminal, ContextUsageIndicator
└── docs/                    # 11 research/planning docs
```

### Gate Status:

```
pnpm gate:
  typecheck  ✅
  lint       ✅
  test       ✅ (328 passing, 20 test files)
  build      ✅
  dead       ✅ (zero dead exports)
  deps       ✅ (no unused deps)
  format     ✅
```

### Line Count:

- **35,546 lines** TypeScript/TSX across 119 files
- **328 tests** with zero flakiness

---

## AUTO-COMPACTION — THE KEY FEATURE

**File:** `packages/orchestrator/src/auto-compactor.ts`

### How It Works:

```
BEFORE every agent call (executeTask, executeBestOfN):
  1. Get thread messages
  2. Estimate context tokens used
  3. If usage > 80% of model context window:
     a. Mark thread as compacting
     b. Keep: system prompt + last 3 messages
     c. Summarize: all middle messages → single summary
     d. Record thread.compacted event
     e. Log: "[AutoCompactor] Context compacted for thread X"
     f. Continue with agent launch
```

### Model Context Windows (known):

```typescript
// Claude: 200K tokens
'claude-3-5-sonnet': 200000,
'claude-3-opus': 200000,
'claude-3-haiku': 200000,

// OpenAI: varies
'gpt-4o': 128000,
'gpt-4o-mini': 128000,
'gpt-3.5-turbo': 16385,

// Gemini: varies
'gemini-2.5-pro': 1000000,
'gemini-1.5-pro': 128000,
```

### Integration Points:

```typescript
// packages/orchestrator/src/index.ts

// In Orchestrator constructor:
this.autoCompactor = new AutoCompactor(db, { threshold: 0.8 });
this.autoCompactorIntegration = createAutoCompactorIntegration(this.autoCompactor);

// In executeTask (before launching):
const wasCompacted = await this.autoCompactor.autoCompactIfNeeded(threadId as ThreadId, messages);

// In executeBestOfN (before launching):
const wasCompacted = await this.autoCompactor.autoCompactIfNeeded(threadId as ThreadId, messages);
```

### UI Indicator:

```typescript
// apps/desktop/src/renderer/ContextUsageIndicator.tsx
// Shows in ComposerDock when thread is active

interface ContextStats {
  usagePercent: number; // 0.0 - 1.0+
  approxTokens: number; // Estimated tokens used
  transcriptChunks: number; // Terminal transcript size
  inputEvents: number; // Terminal input count
  threadEvents: number; // Total thread events
}

// Status colors:
// - < 56%: green (ok)
// - 56-80%: yellow (warning)
// - 80%+: red (danger, auto-compact pending)
```

### Compaction Algorithm:

```typescript
// Keep: messages[0] (system) + messages[last-3 to last]
// Summarize: messages[1 to last-4] → single summary string
// Result: { summary, tokensBefore, tokensAfter, entriesDropped }
```

---

## EVIDENCE PANELS — WIRED AND WORKING

### The 3 Evidence Panels:

```typescript
// apps/desktop/src/renderer/ProcessTreePanel.tsx
// Shows: pid, command, args, cpu%, memory% for each process

interface ProcessSnapshotNode {
  pid: number;
  ppid: number;
  command: string;
  args: string;
  cpuPercent: number;
  memoryPercent: number;
}

// apps/desktop/src/renderer/ExitTaxonomyPanel.tsx
// Shows: exit label, kind, code, signal, summary, recommendation

interface ExitClassification {
  kind: string; // 'command_not_found', 'success', 'signal', etc.
  label: string; // Human-readable: "exit 127"
  summary: string; // What happened
  recommendation: string; // What to do
  exitCode?: number;
  signal?: string;
}

// apps/desktop/src/renderer/FileDeltaPanel.tsx
// Shows: changeType, path, previousSize -> currentSize

interface FileChange {
  path: string;
  changeType: 'created' | 'modified' | 'deleted';
  previousSize?: number;
  currentSize?: number;
}
```

### Where They're Used:

```typescript
// apps/desktop/src/renderer/EvidencePanel.tsx (line ~700)

<ProcessTreePanel terminalSessions={terminalSessions} />
<FileDeltaPanel terminalSessions={terminalSessions} />
<ExitTaxonomyPanel terminalSessions={terminalSessions} />
```

### Data Flow:

```
Terminal Session → terminal_process_snapshots table
                → TerminalProjection.latestProcessSnapshot
                → ProcessTreePanel renders
```

---

## RATING BY LAYER

| Layer            | Score  | Trend |
| ---------------- | ------ | ----- |
| Terminal Runtime | 7.5/10 | ↑     |
| Core/Database    | 8.5/10 | —     |
| Orchestrator     | 8.5/10 | ↑↑    |
| Adapters         | 6/10   | —     |
| Git Engine       | 7.5/10 | —     |
| Desktop Main     | 8.5/10 | ↑     |
| Desktop Renderer | 8/10   | ↑     |
| Review-Merge     | 6.5/10 | —     |
| Handoff-Capsule  | 7/10   | —     |
| Build/Gates      | 9.5/10 | ↑↑    |

**OVERALL: 8/10**

---

## THE 3 REMAINING BLOCKERS TO 10/10

### 1. No Cursor/Gemini Adapters (HIGH)

**Gap:** Doorway promises "universal harness — Claude + Codex + Cursor + Gemini"
**Reality:** Only Claude Code + Codex CLI work

**Fix:** Follow this pattern:

```typescript
// packages/adapters/src/cursor-adapter.ts (template)
export class CursorAdapter implements IAgentAdapter {
  readonly provider = 'cursor';
  readonly name = 'Cursor';
  readonly manifest: AdapterManifest = {
    capabilities: ['edit', 'read', 'terminal', 'browser'],
    executionSurface: 'visible_terminal',
  };

  async buildLaunch(context: LaunchContext): Promise<LaunchSpec> {
    // Build cursor launch command
    return {
      command: 'cursor',
      args: ['--agent', context.prompt],
      cwd: context.cwd,
      env: context.env ?? {},
    };
  }
}
```

### 2. No Streaming IPC Channel (MEDIUM)

**Gap:** Live terminal data: PTY → DB polling → renderer
**Reality:** Should be: PTY → streaming IPC → renderer (like Warp's WebSocket)

**Fix:** Add streaming IPC in `apps/desktop/src/main/ipc.ts`:

```typescript
// Add channel for streaming terminal data
ipcMain.handle('terminal:stream-start', (event, sessionId) => {
  // Subscribe to PTY output
  // Forward to renderer via WebSocket or streaming IPC
});

ipcMain.handle('terminal:stream-stop', (event, sessionId) => {
  // Unsubscribe
});
```

### 3. Evidence Panels Need Real Data (MEDIUM)

**Gap:** Panels are wired but may not receive data
**Reality:** ProcessTreePanel, ExitTaxonomyPanel, FileDeltaPanel render empty states

**Fix:** Verify capture runs on every terminal session:

```typescript
// packages/terminal-runtime/src/session.ts
// Ensure these are called in session lifecycle:

// On session start:
await processTracker.captureSnapshot(sessionId);

// Periodic during session:
setInterval(() => processTracker.captureSnapshot(sessionId), 5000);

// On session end:
await processTracker.captureSnapshot(sessionId);
await fileDelta.captureSnapshot(sessionId);
await exitTaxonomy.classify(sessionId, exitCode);
```

---

## WHAT'S WORKING WELL

```
✅ Real node-pty backend with full lifecycle
✅ Exit code taxonomy — EXCELLENT, deterministic, well-typed
✅ Process tree tracking via ps parsing
✅ File delta snapshots
✅ xterm.js terminal — PROPERLY streaming (append by sequence)
✅ Operational memory — REAL pattern learning (≥3 runs = stored pattern)
✅ AUTO-COMPACTION at 80% context — fully integrated
✅ ContextUsageIndicator in ComposerDock
✅ Evidence panels wired: ProcessTreePanel, ExitTaxonomyPanel, FileDeltaPanel
✅ Task graph with Brain-powered decomposition
✅ Best-of-N parallel execution (hard cap N=2)
✅ Worktree isolation per run
✅ Handoff packets between runs
✅ Mesh agents (reviewer, implementer, pi_agent, browser_supervisor)
✅ Flight recorder + event routing
✅ 15+ UI capsules (merge, handoff, evidence, peers, approvals, task graph)
✅ Command palette with slash commands + mentions
✅ Browser session integration
✅ Compact checkpoints
✅ Peer messaging system
✅ Full multi-format export (JSON/MD/HTML replay)
✅ 328 tests passing, zero dead exports
```

---

## KEY FILES AND THEIR PURPOSES

### Orchestrator (Brain of Doorway)

| File                                                  | Purpose                                  |
| ----------------------------------------------------- | ---------------------------------------- |
| `packages/orchestrator/src/index.ts`                  | Main Orchestrator class, executes agents |
| `packages/orchestrator/src/auto-compactor.ts`         | **AUTO-COMPACTION ENGINE**               |
| `packages/orchestrator/src/compiler.ts`               | Context compilation for prompts          |
| `packages/orchestrator/src/task-graph.ts`             | Task decomposition                       |
| `packages/orchestrator/src/memory.ts`                 | Project memory loader                    |
| `packages/orchestrator/src/brain/brain-service.ts`    | AI model orchestration                   |
| `packages/orchestrator/src/brain/anthropic-driver.ts` | Anthropic API driver                     |
| `packages/orchestrator/src/brain/openai-driver.ts`    | OpenAI API driver                        |

### Terminal Runtime

| File                                               | Purpose                    |
| -------------------------------------------------- | -------------------------- |
| `packages/terminal-runtime/src/pty-backend.ts`     | node-pty management        |
| `packages/terminal-runtime/src/session.ts`         | Terminal session lifecycle |
| `packages/terminal-runtime/src/exit-taxonomy.ts`   | Exit code classification   |
| `packages/terminal-runtime/src/process-tracker.ts` | Process tree via ps        |
| `packages/terminal-runtime/src/file-delta.ts`      | File change detection      |

### Core (Database + Evidence)

| File                                      | Purpose                   |
| ----------------------------------------- | ------------------------- |
| `packages/core/src/database.ts`           | SQLite setup, 35+ tables  |
| `packages/core/src/thread-service.ts`     | Thread CRUD               |
| `packages/core/src/event-service.ts`      | Event recording           |
| `packages/core/src/operational-memory.ts` | **REAL pattern learning** |
| `packages/core/src/terminal-evidence.ts`  | Terminal evidence types   |
| `packages/core/src/process-evidence.ts`   | Process evidence types    |

### Desktop UI

| File                                                  | Purpose                 |
| ----------------------------------------------------- | ----------------------- |
| `apps/desktop/src/renderer/App.tsx`                   | Main app (2,972 lines)  |
| `apps/desktop/src/renderer/ComposerDock.tsx`          | Prompt input + controls |
| `apps/desktop/src/renderer/TerminalMuxPanel.tsx`      | Terminal sessions UI    |
| `apps/desktop/src/renderer/TerminalSurface.tsx`       | xterm.js integration    |
| `apps/desktop/src/renderer/ContextUsageIndicator.tsx` | **Context usage UI**    |
| `apps/desktop/src/renderer/EvidencePanel.tsx`         | Evidence dashboard      |
| `apps/desktop/src/renderer/SurfaceDrawer.tsx`         | Drawer surfaces         |
| `apps/desktop/src/renderer/HarnessContext.tsx`        | State context           |

### Evidence Panels

| File                                              | Purpose                            |
| ------------------------------------------------- | ---------------------------------- |
| `apps/desktop/src/renderer/ProcessTreePanel.tsx`  | Process tree UI                    |
| `apps/desktop/src/renderer/ExitTaxonomyPanel.tsx` | Exit classification UI             |
| `apps/desktop/src/renderer/FileDeltaPanel.tsx`    | File changes UI                    |
| `apps/desktop/src/renderer/SurfaceControls.tsx`   | Tools + lanes + operational memory |

### Handlers (Main Process)

| File                                         | Purpose             |
| -------------------------------------------- | ------------------- |
| `apps/desktop/src/main/index.ts`             | Electron main entry |
| `apps/desktop/src/main/handlers/handlers.ts` | IPC handlers        |
| `apps/desktop/src/preload.ts`                | Preload script      |

---

## PATTERN: HOW TO ADD A NEW ADAPTER

```typescript
// 1. Create adapter file
// packages/adapters/src/new-adapter.ts

export class NewAgentAdapter implements IAgentAdapter {
  readonly provider = 'new-agent';
  readonly name = 'New Agent';
  readonly manifest: AdapterManifest = {
    capabilities: ['edit', 'read', 'terminal'],
    executionSurface: 'visible_terminal',
  };

  async buildLaunch(context: LaunchContext): Promise<LaunchSpec> {
    return {
      command: 'new-agent',
      args: ['--task', context.prompt],
      cwd: context.cwd,
      env: context.env ?? {},
    };
  }

  onEvent(callback: (event: AgentEvent) => void): () => void {
    // Subscribe to stdout/stderr/exit
    return () => {};
  }
}

// 2. Register in orchestrator
const orchestrator = new Orchestrator(db, vault);
orchestrator.registerAdapter(new NewAgentAdapter());

// 3. Add to provider dropdown in UI
// apps/desktop/src/renderer/ComposerDock.tsx
```

---

## PATTERN: HOW TO ADD A NEW EVENT TYPE

```typescript
// 1. Add to EventType in packages/protocol/src/index.ts
export type EventType =
  | 'my.new_event'
  | ...

// 2. Add payload interface
export interface MyNewEventPayload {
  readonly threadId: ThreadId;
  readonly data: string;
  readonly timestamp: string;
}

// 3. Add to EventPayload union
export type EventPayload =
  | MyNewEventPayload
  | ...

// 4. Record event
recordEvent(db, threadId, 'my.new_event', {
  threadId,
  data: 'value',
  timestamp: new Date().toISOString(),
});
```

---

## PATTERN: HOW TO TEST A NEW FEATURE

```typescript
// 1. Create test file next to source
// packages/orchestrator/src/auto-compactor.test.ts

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AutoCompactor } from './auto-compactor';

describe('AutoCompactor', () => {
  // Mock database
  const mockDb = { ... } as any;

  it('triggers compaction at threshold', () => {
    const compactor = new AutoCompactor(mockDb, { threshold: 0.8 });
    // Test logic
    expect(result).toBe(true);
  });
});

// 2. Run tests
pnpm test

// 3. Run full gate
pnpm gate
```

---

## PATTERN: HOW TO ADD A NEW PROJECTION TYPE

```typescript
// 1. Define in packages/protocol/src/index.ts
export interface MyProjection {
  readonly id: MyId;
  readonly data: string;
  readonly computed: string;
}

// 2. Create projection function in appropriate service
// packages/core/src/my-service.ts
export function projectMyEntity(entity: MyEntity): MyProjection {
  return {
    id: entity.id,
    data: entity.data,
    computed: expensiveComputation(entity),
  };
}

// 3. Export from core index
// packages/core/src/index.ts
export { projectMyEntity } from './my-service';

// 4. Use in renderer
const projection = projectMyEntity(entity);
```

---

## WHAT TO BUILD NEXT

### Priority 1: Complete the Universal Harness

1. **Add Cursor adapter** (`packages/adapters/src/cursor-adapter.ts`)
   - Follow `claude-code-adapter.ts` pattern
   - Register in orchestrator

2. **Add Gemini adapter** (`packages/adapters/src/gemini-adapter.ts`)
   - Follow `claude-code-adapter.ts` pattern
   - Register in orchestrator

3. **Verify evidence capture runs**
   - Check `process-tracker.ts` called in session lifecycle
   - Check `file-delta.ts` called in session lifecycle
   - Check `exit-taxonomy.ts` called on session end

### Priority 2: Streaming IPC

1. **Add streaming channel** (`apps/desktop/src/main/ipc.ts`)
   - WebSocket or streaming IPC for terminal data
   - Replace DB polling

### Priority 3: Polish

1. **Add rich output rendering** to terminal
   - Detect and render: git log, JSON, tables, markdown, diff
   - Follow Warp's rich output patterns

2. **Add cross-model lane dashboard**
   - Visual lane per agent with status
   - Show terminal, worktree, progress per lane

3. **Add operational memory to UI**
   - Show repeated commands with confidence scores
   - Surface learned patterns in EvidencePanel

---

## IMPORTANT CAVEATS

### App.tsx is Massive (2,972 lines)

- **Do not refactor for the sake of refactoring**
- It's working. It's tested.
- If you need to add features, add them in separate files
- If you need to change existing behavior, surgical changes only

### Terminal Streaming is Fixed

- `TerminalSurface.tsx` appends by sequence, not reset+write-all
- This was the #1 user complaint
- Do not revert this behavior

### Operational Memory is Real

- Pattern learning uses UPSERT with confidence scores
- Requires 3+ runs to learn
- Stores repeated commands with frequency tracking
- Do not simplify to file-reading

### Auto-Compaction is Integrated

- Triggers at 80% before every agent call
- Records `thread.compacted` events
- Shows usage in ComposerDock
- Do not disable or remove

---

## THE ONE-LINER

**"Models commoditize. Harnesses compound. Doorway wins by being the universal harness layer."**

---

## FINAL REMINDER

Run `pnpm gate` after EVERY change. Not after a session. After EVERY change.

If tests fail, fix them before committing.
If dead exports appear, remove them.
If lint fails, fix it.

The discipline is the product.

---

**Doorway is at 8/10.** Three focused sprints close the gap to 10/10:

1. Cursor + Gemini adapters (1 day each)
2. Streaming IPC (2 days)
3. Evidence capture verification (1 day)

Ship it.
