# CROSS-THREADING ARCHITECTURE SPEC

## 1. THE VISION: THE UNIFIED CANVAS

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                       THE CROSS-THREADING PROBLEM                         │
│                                                                            │
│ Today:                                                                     │
│ • Chat is in one panel (Claude/ChatGPT).                                   │
│ • Terminal runs in another panel (bash/zsh).                               │
│ • File diffs are in Git/IDE source control tabs.                           │
│ • Different models live in different apps or completely siloed chats.      │
│                                                                            │
│ The Doorway Solution: CROSS-THREADING                                      │
│ • A single, chronological, unified timeline on the frontend.               │
│ • Claude thinks → Codex runs tests → Terminal streams output → File        │
│   diffs appear. ALL sequentially in the SAME thread.                       │
│ • Honest State: Frontend reflects exactly what the backend event stream    │
│   emits. No fake UI.                                                       │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. STATE MANAGEMENT: EVENT SOURCING

To resolve multiple parallel streams (CLI output, multiple models generating tokens, file watchers) into a single cohesive UI, Doorway uses an **Event-Sourced Architecture**.

The backend operates as the single source of truth, emitting an append-only stream of `ThreadEvent` objects over a WebSocket or SSE connection. The frontend projects these events into a unified `ThreadState`.

### 2.1 The Event Taxonomy

```typescript
type ThreadEvent = 
  // User & Agent Interaction
  | { type: 'USER_MESSAGE', id: string, content: string, timestamp: number }
  | { type: 'AGENT_THOUGHT', id: string, model: string, content: string, delta?: boolean }
  
  // Tool & Orchestration
  | { type: 'TOOL_INVOCATION', id: string, tool: string, args: any }
  | { type: 'TOOL_RESULT', id: string, result: any, exitCode?: number }
  | { type: 'MODEL_HANDOFF', id: string, fromModel: string, toModel: string, reason: string }

  // Terminal & Process Harness
  | { type: 'PROCESS_SPAWN', id: string, pid: number, command: string, worktreeId: string }
  | { type: 'PROCESS_STDOUT', id: string, pid: number, chunk: string }
  | { type: 'PROCESS_EXIT', id: string, pid: number, code: number, taxonomy: ExitTaxonomy }
  
  // File System & Worktree
  | { type: 'WORKTREE_CREATED', id: string, path: string, branch: string }
  | { type: 'FILE_DELTA', id: string, path: string, status: 'M'|'A'|'D', diff: string };
```

---

## 3. THE UNIFIED THREAD STATE (FRONTEND PROJECTION)

The frontend reducer takes the infinite stream of events and builds a materialized view called `ThreadState`.

```text
╔═══════════════════════════════════════════════════════════════════════════════╗
║  THREAD STATE (React / UI Store)                                             ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  {                                                                           ║
║    id: "thread-123",                                                         ║
║    worktree: "/tmp/doorway-worktrees/feature-x",                             ║
║    timeline: [                                                               ║
║      { type: "MessageNode", content: "..." },                                ║
║      { type: "ExecutionNode", tool: "bash", processes: [...] },              ║
║      { type: "DiffNode", files: [...] }                                      ║
║    ],                                                                        ║
║    activeProcesses: Map<pid, ProcessNode>,                                   ║
║    memoryContext: MemorySnapshot                                             ║
║  }                                                                           ║
║                                                                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### 3.1 Render Rules (The Non-Negotiables)
1. **Honest Loading**: Renderer state must come strictly from backend projections. If a process is spawning, show it as spawning. Do not render fake "thinking..." UI unless the backend explicitly emits a loading event.
2. **Empty & Error States**: Explicitly render `127 Command Not Found` or `SIGKILL (OOM)` via the Exit Taxonomy. Do not hide failures.
3. **Pty Streaming**: `PROCESS_STDOUT` events are piped directly into an embedded `xterm.js` instance scoped to the specific `ExecutionNode` in the timeline.

---

## 4. CROSS-THREAD EXECUTION MODEL

### 4.1 The Isolated Worktree
Every Thread is bound to a unique `git worktree`.
- When the user says "Try feature X in a new thread", the Orchestrator runs: `git worktree add ../doorway-[thread-id] -b feature-x`.
- Multiple models (e.g., Claude Opus and Codex) operating in the SAME thread will execute tools inside this isolated worktree.
- **Result**: No merge conflicts, safe parallel execution, and accurate `FILE_DELTA` events relative to the thread.

### 4.2 Multi-Agent Handoffs
A single thread may employ multiple models.
- **Claude** plans the architecture.
- **Codex** implements the tests in parallel.
- **Cursor** acts on the inline file edits.
All outputs converge onto the single `ThreadState.timeline`. The UI groups these logically, showing the avatar/icon of the model performing the action alongside the generated artifact.

---

## 5. UI/UX: THE BEAUTIFUL TIMELINE

```text
┌────────────────────────────────────────────────────────────────────────────┐
│  DOORWAY UI: THE UNIFIED CANVAS                                            │
│                                                                            │
│  👤 USER: "Setup a Next.js app and run tests."                             │
│                                                                            │
│  🤖 CLAUDE OPUS (Planning)                                                 │
│  │  "I will orchestrate Codex for the setup and then verify."              │
│                                                                            │
│  ⚙️ CODEX (Executing)                                                      │
│  │  > npx create-next-app@latest .                                         │
│  │  [ Terminal PTY streams live here in a foldable block ]                 │
│  │  ✓ Exit 0: Success                                                      │
│                                                                            │
│  📂 FILES CHANGED (Worktree: thread-789)                                   │
│  │  + package.json                                                         │
│  │  + src/app/page.tsx                                                     │
│                                                                            │
│  🤖 CLAUDE OPUS (Reviewing)                                                │
│  │  "Setup complete. The app is ready in your worktree."                   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Real-Time Granularity
- **Process Trees**: The Thread Canvas must visualize parent-child process relationships. If `npm test` spawns `jest`, the Thread Canvas shows the tree dynamically.
- **Timeline Scrubber**: Because state is event-sourced, the UI can provide a "scrubber" to rewind the ThreadState to any point in time, restoring the terminal output and file diffs as they were at that exact millisecond.

---

## 6. IMPLEMENTATION PHASES

1. **Phase 1: Event Bus & Protocol**
   - Define strict Protobuf/JSON schema for `ThreadEvent`.
   - Setup WebSocket relay from Orchestrator to Frontend.
2. **Phase 2: Reducer & State Store**
   - Implement Zustand/Redux slice for `ThreadState` projection.
   - Build multiplexing logic for tying standard output streams to specific timeline nodes.
3. **Phase 3: The Worktree Anchor**
   - Bind thread initialization to `git worktree` creation.
   - Inject `CWD` into all tool and PTY invocations for the thread.
4. **Phase 4: Presentation Layer**
   - Build the `<TimelineNode>` polymorphic components.
   - Ensure "Honest State" enforcement (no fake DOM).
