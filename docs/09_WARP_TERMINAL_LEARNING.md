# WARP TERMINAL — WHAT DOORWAY MUST LEARN

## Doorway's Warp Intelligence Brief

Warp is the terminal that forced the entire industry to rethink what a terminal can be. In 2026, Warp pivoted from "modern GPU-accelerated terminal" to "agentic development environment" — running Claude Code, Codex, and Warp Agent in structured blocks with AI baked in.

Doorway must steal the right things and skip the wrong ones.

---

## PART 1: WARP'S CORE TECHNICAL ARCHITECTURE

### Built Entirely in Rust

```
Warp = 100% Rust
├── GPU rendering (Metal on macOS, Vulkan/DX12 on Windows/Linux)
├── Custom UI framework (built from scratch for GPU rendering)
├── CRDT-based text editor (conflict-free replicated data type)
├── PTY handling (cross-platform)
└── Block model (structured terminal output)
```

Rust gives Warp:

- Memory safety without GC pauses (smooth scrolling at 60fps)
- Zero-cost abstractions for terminal rendering
- Parallel processing for block parsing
- Binary distribution (no Node.js runtime needed)

**Doorway lesson:** Doorway uses Electron (Chromium + Node.js) which has a much heavier footprint. The terminal rendering layer could be abstracted to use GPU-accelerated rendering in the future. More importantly: Warp proved you can build a terminal from scratch and out-perform every wrapper.

### The PTY Layer

Warp uses platform-specific PTY APIs:

```
macOS   → forkpty() / openpty() via libc
Linux   → ptmx / ptsname via libc
Windows → ConPTY (Windows Subsystem for Linux / native)
```

This is the same underlying mechanism as node-pty. Warp did NOT invent new PTY tech. They wrapped it in Rust and added structure on top.

**Doorway lesson:** PTY is the execution mechanism. The differentiation is in the STRUCTURE you build on top of PTY. Doorway already has node-pty. The gap is NOT the PTY layer — it's the structured output model on top.

---

## PART 2: THE BLOCK MODEL — WARP'S MOST IMPORTANT INSIGHT

This is the single most important architectural idea in modern terminal design.

### What Are Blocks?

Warp's April 2026 blog post on the block model:

> "Now that we can structure the PTY output into blocks, we need somewhere to put them. That's the BlockList: an ordered sequence of blocks, where each block represents a single command execution."

```
┌────────────────────────────────────────────────────────────────┐
│ BLOCK MODEL                                                   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  BLOCK = Every command + its output as a first-class unit     │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Block #1                                                 │ │
│  │ id: blk_abc123                                          │ │
│  │ command: pnpm test                                       │ │
│  │ stdout: "RUN v9.2.3..."                                  │ │
│  │ stderr: "Error: expected 'login'..."                    │ │
│  │ exit_code: 1                                             │ │
│  │ duration: 8.2s                                           │ │
│  │ timestamp: 2026-05-21T10:01:23Z                        │ │
│  │ cwd: /home/project                                       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Block #2                                                 │ │
│  │ id: blk_def456                                          │ │
│  │ command: git status                                      │ │
│  │ stdout: "M src/auth/login.ts"                           │ │
│  │ exit_code: 0                                             │ │
│  │ duration: 0.3s                                           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  BLOCKLIST = ordered sequence of all blocks                   │
│  └── searchable, filterable, linkable, replayable             │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Why Blocks Are Revolutionary

Traditional terminal:

```
$ pnpm test
RUN v9.2.3
  ✓ login.spec.ts (2s)
  ✗ logout.spec.ts
Error: expected 'login' received 'logout'
FAIL tests/auth.spec.ts
$ git status
M src/auth/login.ts
```

This is a flat byte stream. You can scroll up. You can't search inside command #1. You can't link to "the test failure from pnpm test at 10:01:23". You can't replay "just that command".

Warp blocks:

```
BLOCK blk_abc123:
  command: pnpm test
  exit_code: 1
  duration: 8.2s
  output: [structured test output]
  searchable: YES
  linkable: YES (blk_abc123)
  replayable: YES
  diffable: YES
  collapsible: YES
```

Every block has a stable ID. You can:

```
- "Show me all blocks with exit_code != 0 in the last hour"
- "Show me the pnpm test block with id blk_abc123"
- "Replay block blk_abc123" (re-run the command)
- "Diff block blk_abc123 vs block blk_ghi789"
- "Copy output from block blk_def456"
- "Share a permalink to block blk_xyz999"
```

### Block Types (2026)

Warp has expanded to multiple block types:

```
┌────────────────────────────────────────────────────────────────┐
│ BLOCK TYPES (Warp 2026)                                        │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  SHELL BLOCK                                                   │
│  ├── command + stdout + stderr + exit_code                   │
│  ├── stdin (if interactive)                                  │
│  └── duration + timestamp                                      │
│                                                                │
│  AGENT BLOCK (Agentic Development Environment, April 2026)     │
│  ├── agent_name: Claude Code / Codex / Warp Agent             │
│  ├── task: what the agent was asked to do                     │
│  ├── steps: individual tool invocations                       │
│  ├── blocks: nested shell blocks from agent execution         │
│  ├── result: success / failure / partial                     │
│  └── evidence: screenshots, diffs, test results              │
│                                                                │
│  RICH BLOCK TYPES (expanding in 2026)                        │
│  ├── IMAGE BLOCK — renders PNG/GIF from terminal              │
│  ├── TABLE BLOCK — renders tabular output                     │
│  ├── JSON BLOCK — renders JSON with syntax highlighting      │
│  ├── MARKDOWN BLOCK — renders markdown output                 │
│  └── DIFF BLOCK — renders git diffs with colors               │
│                                                                │
│  WORKFLOW BLOCK                                               │
│  ├── saved sequence of commands                               │
│  ├── parameters (user inputs)                                 │
│  └── run history                                              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### The BlockList

The BlockList is Warp's state container for a session:

```typescript
// Simplified Warp BlockList concept
interface BlockList {
  blocks: Block[]; // ordered sequence
  cursor: number; // current position
  sessionId: string; // stable across restarts
  cwd: string; // current working directory
}

interface Block {
  id: string; // stable ID (blk_abc123)
  type: 'shell' | 'agent' | 'workflow';
  command?: string; // the command that produced this block
  stdout: string; // structured or raw output
  stderr: string;
  exitCode?: number; // undefined if still running
  duration?: number; // milliseconds
  timestamp: string;
  cwd: string;
  agentId?: string; // for agent blocks
  children?: Block[]; // nested blocks (agent → shell steps)
  metadata?: Record<string, unknown>;
}
```

### Why Doorway Needs Blocks

Doorway currently has:

- Terminal sessions (PTY sessions)
- Transcript chunks (pieces of output)
- Terminal events (started, stopped, chunk recorded)

Doorway does NOT have:

- Command-level block abstraction
- Stable block IDs that persist across restarts
- Block-based output query
- Structured block types (shell vs agent vs rich)
- Block replay
- Block diffing

**Doorway must adopt the block model at the core of the terminal harness.**

---

## PART 3: WARP'S COMMAND PALETTE

### What Warp Built

Warp's command palette (Cmd+P / Ctrl+R) is not just fuzzy search.

It is a **command database** built from your actual command history.

```
┌────────────────────────────────────────────────────────────────┐
│ WARP COMMAND PALETTE                                           │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Cmd+P → Search everything:                                   │
│  ├── Commands you've run                                       │
│  ├── Command output (search inside outputs)                   │
│  ├── Saved workflows                                          │
│  ├── Files in current directory                               │
│  └── AI suggestions                                           │
│                                                                │
│  Fuzzy search with:                                           │
│  ├── Approximate matches (did you mean?)                     │
│  ├── Context (recent commands weighted higher)                 │
│  ├── Source tracking (which repo, which block)              │
│  └── Output preview                                           │
│                                                                │
│  Example:                                                     │
│  → "pnpm test" → shows all pnpm test blocks                  │
│    → with exit codes, timestamps, repo context                │
│    → click to jump directly to that block                    │
│    → replay button to re-run                                 │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Why This Matters for Doorway

Doorway's ThreadCanvas shows messages chronologically. But terminal history is a flat list of chunks.

Warp's command palette demonstrates:

1. **Command history should be a searchable database, not a flat list**
2. **Output should be searchable, not just the command itself**
3. **Context (repo, time, exit code) should filter results**
4. **One-click replay of any historical command**

Doorway should build: `DoorwayCommandPalette` with block-level search across all terminal history.

---

## PART 4: WARP'S AGENTIC DEVELOPMENT ENVIRONMENT (April 2026)

This is Warp's biggest pivot. In April 2026, Warp released their agentic development environment built on a proprietary model called **Oz**.

### Warp Agent Architecture (2026)

```
┌────────────────────────────────────────────────────────────────┐
│ WARP AGENTIC DEVELOPMENT ENVIRONMENT                           │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  oz — Warp's proprietary AI model                              │
│  ├── Built specifically for terminal/code agent tasks          │
│  ├── Runs Claude Code, Codex, or oz (their model)             │
│  └── First-class support for all three                         │
│                                                                │
│  Agent Block (supersedes Shell Block for agents)              │
│  ├── task description                                         │
│  ├── agent_type: claude_code | codex | oz                    │
│  ├── status: planning | running | reviewing | done | failed │
│  ├── steps[]: nested shell blocks from tool invocations       │
│  │   ├── tool: terminal | editor | browser | git             │
│  │   ├── command: the actual command                         │
│  │   ├── output: stdout/stderr                               │
│  │   └── exit_code                                           │
│  ├── result: what the agent concluded                        │
│  ├── evidence: screenshots, diffs, test proofs                │
│  └── review: human approval / rejection                       │
│                                                                │
│  Oz Dashboard (in Warp UI)                                    │
│  ├── See all running agents across repos                     │
│  ├── Approve/deny agent actions                               │
│  ├── View agent reasoning steps                               │
│  └── Export agent session for review                           │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Warp + Claude Code + Codex Integration

Warp in 2026 runs ALL THREE agents:

```
Warp Agent: oz (Warp's own model, native to Warp)
Claude Code: Anthropic's agent, runs inside Warp blocks
Codex CLI: OpenAI's agent, runs inside Warp blocks
```

Each agent runs inside a structured Agent Block. The shell commands the agent runs appear as nested Shell Blocks inside the Agent Block.

This is EXACTLY what Doorway's architecture describes with:

- Cross-model threading (Claude + Codex + Warp Agent)
- Visible process tree (nested shell blocks)
- Evidence-backed completion (screenshot/diff/test evidence in Agent Block)

**Warp confirmed Doorway's architecture is correct. They built it first.**

### Warp's Weakness — OpenAI Only for Codex

Warp's agentic environment has a limitation: Codex runs OpenAI's model. Claude Code runs Anthropic's model. oz runs Warp's model. You can't mix and match freely.

**This is Doorway's opening.** Doorway's cross-model threading can route between Claude, Codex, Cursor, Gemini, and custom tools. Warp supports three agents but each is siloed.

---

## PART 5: WARP'S TERMINAL FEATURES DOORWAY MUST STEAL

### 1. Structured Output Rendering (HIGH PRIORITY)

Warp recognizes structured output and renders it beautifully:

```
Raw:   $ git log --oneline
       abc1234 feat: add login
       def5678 fix: auth bug
       99a1b2c chore: deps

Warp:  Renders as clickable commit links, author avatars,
       timestamps, branch tags
```

Doorway should add: terminal output type detection (git log, JSON, table, markdown) and rich rendering.

### 2. Command Duration Display

Warp shows `duration` on every block. This seems simple but is enormously useful:

```
pnpm test                              8.2s  ✓
git status                             0.3s  ✓
cargo build --release                  45.1s ✓
npm run dev                           running...
```

Doorway has `duration` in TerminalSession but it's not surfaced in the UI.

### 3. Exit Code Highlighting

Warp colors blocks by exit code:

```
exit 0   → green (success)
exit 1   → red (failure)
exit 127 → yellow (command not found)
running  → blue pulsing (active)
```

Doorway has `classifyTerminalExit()` but doesn't color-code terminal tabs by exit status.

### 4. Split Panes

Warp supports terminal splitting. Multiple panes in one window.

Doorway's TerminalMuxPanel has tabs. Should also support split panes for parallel agent monitoring.

### 5. Workflows (Saved Command Sequences)

Warp's Warp Drive includes saved workflows:

```
┌────────────────────────────────────────────────────────────────┐
│ WORKFLOW: "Full Stack Review"                                   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  1. pnpm typecheck  → must exit 0                            │
│  2. pnpm test       → must exit 0                            │
│  3. git diff        → capture diff                          │
│  4. [user approval] → confirm before merge                   │
│                                                                │
│  Parameters:                                                   │
│  - repo: string (required)                                    │
│  - branch: string (required)                                   │
│                                                                │
│  Each step is a block. Results are saved.                     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

Doorway's automation surface should build on this. Doorway's learned automations (from Phase 5 of the roadmap) should use a similar block-based workflow model.

### 6. Block Filtering

Inside a single large block (e.g., `pnpm test` with 500 lines of output), Warp lets you filter:

```
pnpm test [block]
├── [filter: ERROR] → shows only error lines
├── [filter: FAIL]  → shows only failing tests
├── [filter: WARN]  → shows warnings
└── [expand all]    → full output
```

Doorway should add: inline block filtering in the terminal surface.

### 7. Block Linking / Permalinks

Every Warp block has a stable ID and can be linked to:

```
https://warp.dev/block/blk_abc123
→ jumps directly to that block in that session
```

Doorway should add: session/block permalink support for sharing terminal output.

### 8. Command Editing (Input Editor)

Warp moved text editing INTO the terminal. The input line supports:

- Multi-line editing (write scripts directly in the terminal)
- Cursor movement (vim-style keys)
- History navigation within current command
- Copy/paste within input line
- Syntax highlighting for known commands

Doorway's TerminalSurface currently relies on xterm.js's built-in input handling. The Doorway-specific enhancements (vim keys, multi-line, command templates) should be added as xterm.js addons.

### 9. Autosuggestions

Warp provides command autosuggestions as you type:

```
$ pnpm     → "pnpm install" (from history)
$ pnpm i   → "pnpm install --save-dev" (from history)
$ git      → "git status" (from history)
```

This is NOT just shell completion. It's learning from YOUR command history and suggesting contextually.

Doorway should add: command autosuggestions based on observed command frequency per repo.

---

## PART 6: WHAT WARP GOT WRONG

Warp is not perfect. Doorway must learn from these failures:

### 1. Closed Source (Partially Fixed in 2026)

Warp was closed source for years. In 2026, they open-sourced parts. But the core agent (oz) remains proprietary.

**Doorway lesson:** Open source is a competitive advantage in the agent harness space. Claude Code and Codex are also closed. Doorway should stay open source.

### 2. Warp Requires an Account

You can't use Warp without creating an account. Many users ditched it for this reason alone.

**Doorway lesson:** Local-first. No account required. No telemetry without consent. This is Doorway's advantage over Warp.

### 3. Cloud Sync Dependency

Warp Drive (workflows, shared workspaces) requires cloud sync. If offline, you lose some features.

**Doorway lesson:** Local SQLite first. Cloud sync as an optional feature. All data must work offline.

### 4. No True Cross-Model Threading

Warp runs Claude Code, Codex, and oz as separate agents. But they don't coordinate between them. Each agent is independent.

**Doorway lesson:** Cross-model threading (Claude → review → Codex → verify) is Doorway's real differentiator. Warp confirmed this gap exists in their product.

### 5. No Worktree Isolation

Warp's agents run in the current directory. No git worktree isolation.

**Doorway lesson:** Doorway's worktree isolation is a key safety feature Warp doesn't have. Lean into this for enterprise users.

### 6. No Evidence-Backed Completion

Warp shows what commands ran. It does NOT verify that tests passed, that browser automation worked, or that the code is production-ready.

**Doorway lesson:** "Done" should mean "tests passed + evidence recorded + diff reviewable." Warp stops at "command ran."

---

## PART 7: DOORWAY'S WARP-INSPIRED ROADMAP

### Phase 1B: Block Model (Week 5, parallel with Phase 1)

```
┌────────────────────────────────────────────────────────────────┐
│ ADOPT THE BLOCK MODEL                                          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  1. CREATE BLOCK TYPES                                         │
│     TerminalBlock: { id, command, stdout, stderr,              │
│                      exitCode, duration, timestamp, cwd }     │
│     AgentBlock: { id, agentType, task, steps[], result }     │
│     WorkflowBlock: { id, steps[], params, results[] }        │
│     RichBlock: { id, format: json|table|image|diff }         │
│                                                                │
│  2. BLOCK LIST (instead of flat transcript chunks)             │
│     sessions → block_list: Block[]                            │
│     Each command = one block with stable ID                   │
│     Each block = independently queryable                        │
│                                                                │
│  3. BLOCK-LEVEL OPERATIONS                                    │
│     ├── replay block (re-run command)                        │
│     ├── copy block output                                     │
│     ├── filter block content (ERROR/FAIL/WARN)               │
│     ├── diff two blocks                                       │
│     ├── link to block (permalinks)                           │
│     └── collapse/expand block                                 │
│                                                                │
│  4. BLOCK SEARCH                                              │
│     Search commands + search inside outputs                    │
│     Filter by: exit code, duration, repo, time range         │
│     Sort by: recency, duration, exit code                     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Phase 2B: Command Palette (Week 6)

```
┌────────────────────────────────────────────────────────────────┐
│ DOORWAY COMMAND PALETTE                                        │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Cmd+P → Doorway command palette                              │
│  ├── Search all blocks across all sessions                    │
│  ├── Search inside command outputs                            │
│  ├── Jump to any block by ID                                 │
│  ├── Filter by: exit_code, duration, repo, agent              │
│  ├── Replay any block with one click                         │
│  ├── Show command frequency per repo                          │
│  └── AI suggestions (learned from patterns)                   │
│                                                                │
│  This is Warp's command palette adapted for Doorway's         │
│  multi-agent, evidence-backed context.                         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Phase 3B: Rich Block Rendering (Week 9)

```
┌────────────────────────────────────────────────────────────────┐
│ RICH BLOCK RENDERING                                          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Terminal output type detection:                               │
│  ├── git log        → rendered with links, avatars            │
│  ├── JSON           → syntax highlighted, collapsible         │
│  ├── table          → rendered as actual table                │
│  ├── markdown       → rendered as markdown                   │
│  ├── diff           → side-by-side diff view                 │
│  ├── test output    → expandable test results                 │
│  └── image (base64) → inline image in terminal               │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Phase 4B: Warp-Style Workflows (Week 13)

```
┌────────────────────────────────────────────────────────────────┐
│ BLOCK-BASED WORKFLOWS                                         │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Learn from observed patterns:                                 │
│  → User runs: pnpm test → pnpm build → git diff              │
│  → 3 times in the same repo                                  │
│  → Doorway suggests: "Save as Workflow 'CI Check'?"          │
│                                                                │
│  Workflow = Block[] with parameters + approval gates           │
│  Each step = Block (shell command or agent block)            │
│  Results = stored per workflow run                            │
│  Evidence = attached to workflow block                         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## PART 8: THE SPECIFIC TECHNICAL IMPLEMENTATION

### Block Model for Doorway

Doorway's terminal-runtime should emit blocks, not raw chunks:

```typescript
// CURRENT (chunk-based):
SessionManager.onData((sessionId, data) => {
  session.transcript.push({ sessionId, sequence, text: data });
});

// PROPOSED (block-based):
interface TerminalBlock {
  id: TerminalBlockId; // "blk_${timestamp}_${random}"
  sessionId: TerminalSessionId;
  command: string; // the command that started this block
  stdin?: string; // interactive input
  stdout: string;
  stderr: string;
  exitCode?: number; // undefined if still running
  exitKind?: string; // from classifyTerminalExit()
  exitLabel?: string;
  exitRecommendation?: string;
  durationMs?: number;
  startTime: Date;
  endTime?: Date;
  cwd: string;
  processTree?: ProcessSnapshotNode[];
  fileDeltas?: TerminalFileDeltaEntry[];
  childBlocks?: TerminalBlock[]; // nested blocks for agent steps
  type: 'shell' | 'agent' | 'workflow' | 'rich';
}

// BlockList replaces flat transcript:
interface TerminalSession {
  id: TerminalSessionId;
  blocks: TerminalBlock[]; // NOT chunks[]
  currentBlock?: TerminalBlock; // block being written to
  status: 'running' | 'stopped' | 'paused';
}
```

### Block Emitter Pattern

```typescript
// terminal-runtime emits structured blocks:
sessionManager.onCommandStart((block) => {
  db.recordBlockStart(block);
  ipc.sendToRenderer('block:start', block);
});

sessionManager.onData((blockId, data) => {
  db.appendBlockOutput(blockId, data);
  ipc.sendToRenderer('block:data', { blockId, data });
});

sessionManager.onCommandEnd((block) => {
  db.recordBlockEnd(block);
  ipc.sendToRenderer('block:end', block);
});
```

### Warp's Key Lesson for Doorway's UI

Warp's block model enables a fundamentally better UI:

```
WARP UI:                          DOORWAY CURRENT UI:
┌─────────────────────────┐       ┌─────────────────────────┐
│ blk_abc123 │ pnpm test  │       │ Terminal Session term_a │
│ blk_def456 │ git status │       │ ─────────────────────── │
│ blk_ghi789 │ cargo build│       │ $ pnpm test            │
│ [filter: FAIL]          │       │ RUN v9.2.3             │
└─────────────────────────┘       │ ✓ login.spec.ts        │
                                   │ ✗ logout.spec.ts       │
                                   │ $ git status           │
                                   │ M src/auth/login.ts    │
                                   └─────────────────────────┘

WARP UI:
- List of blocks (not flat output)
- Each block independently searchable
- Filter by exit code
- One-click replay
- Stable links to any block
- Rich output rendering
- Nested blocks for agents
```

**Doorway's TerminalMuxPanel should adopt this block-list UI pattern.**

---

## PART 9: FINAL TAKEAWAYS FROM WARP

### What Doorway Must Learn (Priority Order)

```
PRIORITY 1 — BLOCK MODEL (Biggest Impact)
  Every terminal command → Block with stable ID
  BlockList replaces flat transcript chunks
  Blocks are queryable, linkable, replayable
  This is the single most important architectural change

PRIORITY 2 — COMMAND PALETTE (High Impact)
  Search all command history + outputs
  Filter by exit code, duration, repo, time
  One-click block replay
  Context-aware suggestions

PRIORITY 3 — EXIT CODE VISIBILITY (Medium Impact)
  Color-code terminal tabs by exit status
  Show duration on every command
  Surface exit taxonomy in UI (SIGSEGV = red, etc.)

PRIORITY 4 — RICH OUTPUT RENDERING (Medium Impact)
  Detect git log, JSON, table, markdown, diff
  Render appropriately (not raw text)
  Expandable test results

PRIORITY 5 — WORKFLOWS (Long-term)
  Learn repeated command patterns
  Suggest block-based workflows
  Parameters + approval gates
```

### What Doorway Must NOT Copy

```
❌ Account requirement (Warp's biggest mistake)
❌ Cloud-first (Doorway must be local-first)
❌ Closed-source agent (oz is proprietary)
❌ No worktree isolation (Warp's agents run in cwd)
❌ No evidence-backed completion (Warp stops at "command ran")
```

### The Final Synthesis

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  WARP'S LESSON: The terminal byte stream is dead.             │
│  The future is structured BLOCKS.                              │
│                                                                │
│  Doorway's LESSON: Blocks are necessary but not sufficient.    │
│  Blocks + evidence + cross-model threading + worktree safety    │
│  + memory + open source = Doorway's full differentiation.     │
│                                                                │
│  Warp has the best terminal UX in the industry.                │
│  Doorway should have the best agent HARNESS.                   │
│  These are complementary, not competitive.                     │
│                                                                │
│  Steal Warp's block model.                                     │
│  Keep Doorway's evidence layer.                                 │
│  Ship the combination.                                         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## SOURCES

- [How Warp Works](https://www.warp.dev/blog/how-warp-works) — Architecture deep dive
- [The Block Model Behind Warp's Agentic Development Environment](https://www.warp.dev/blog/block-model-behind-warps-agentic-development-environment) — April 2026
- [Warp Terminal Blocks Documentation](https://docs.warp.dev/terminal/blocks/) — Block basics
- [Warp Command Completions](https://docs.warp.dev/terminal/command-completions/completions/) — Autosuggestions
- [Warp Agents](https://www.warp.dev/agents) — Claude Code, Codex, Warp Agent in Warp
- [Warp vs Wave Terminal](https://www.youtube.com/watch?v=-QlMSLIY0JU) — Feature comparison
- [Warp Terminal Review 2026](https://rejoicehub.com/blogs/warp-terminal-review) — Full feature overview
- [Ghostty vs Warp vs WezTerm](https://www.termdock.com/en/blog/best-terminal-emulator-ai-cli-2026) — AI CLI comparison
- [Warp Open Source Release](https://medium.com/jonathans-musings/what-warps-open-source-release-tells-us-about-the-future-of-agentic-software-development-5d4409726bf1) — Open source analysis
