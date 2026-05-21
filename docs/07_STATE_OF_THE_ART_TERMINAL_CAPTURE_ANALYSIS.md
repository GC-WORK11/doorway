# STATE OF THE ART TERMINAL CAPTURE ANALYSIS

## Doorway Deep Research — PTY is 1990s Tech

---

## TL;DR

PTY (Pseudo-Terminal) is 1990s-era Unix technology. The state of the art for AI coding agent harnesses in 2026 is NOT a better PTY wrapper. It is a layered execution harness that combines:

1. Process tree capture (not just PTY output)
2. Exit code taxonomy + signal classification
3. Shell command tracing + file delta observation
4. Verifiable execution evidence
5. Self-correction feedback loops
6. Automatic harness evolution

The research is clear: **harness engineering outperforms model upgrades**. LangChain improved Terminal-Bench 2.0 scores from 52.8% to 66.5% with harness changes alone. ForgeCode beats Claude Code and Codex with a harness-first architecture.

---

## 1. WHY PTY IS 1990s TECH

### What PTY Actually Is

PTY stands for **Pseudo-Terminal**. It dates to:

```
1980s  — BSD Unix introduced PTY pairs (master/slave)
1988   — POSIX.1-1988 standardized ptem/pty
1990s  — Linux 1.0+ (1994) implemented full PTY support
2000s  — node-pty wraps forkpty() / openpty() syscall pair
2026   — Doorway is still considering it as primary terminal tech
```

PTY creates a virtual terminal pair:

```
┌─────────────┐         ┌─────────────┐
│  MASTER FD  │◄───────►│  SLAVE FD   │
│  (app reads)│  kernel  │  (shell sees)│
└─────────────┘  ptmx/ptmx└─────────────┘
```

The shell thinks it's connected to a real terminal. The app reads byte stream. ANSI escape sequences flow through.

### The Fundamental Problem with PTY

PTY was designed for **human terminal emulators** — a user types, sees output, the session ends.

PTY was NOT designed for:

- **AI agent execution harnesses**
- **Process tree tracking**
- **Deterministic failure classification**
- **Evidence-backed completion proofs**
- **Self-correction feedback loops**
- **Harness evolution from observed behavior**

PTY gives you:

```
byte stream in → byte stream out → you parse it
```

PTY does NOT give you:

- which subprocesses spawned
- what signals were sent
- memory/CPU of children
- file system mutations
- network connections
- exit code taxonomy
- verification that results are correct

### What Every PTY Wrapper Misses

```
┌────────────────────────────────────────────────────────────┐
│                   PTY Limitations                         │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ❌ Process tree visibility                               │
│     node-pty gives you ONE fd. You don't see children.   │
│                                                            │
│  ❌ Signal propagation tracking                           │
│     You don't know if SIGKILL came from OOM or user.     │
│                                                            │
│  ❌ Exit code classification                              │
│     exit 127 is "command not found" but PTY doesn't tell  │
│     you WHAT command wasn't found.                        │
│                                                            │
│  ❌ File delta observation                                 │
│     PTY sees bytes. It doesn't see what files changed.   │
│                                                            │
│  ❌ Memory/CPU bounds                                     │
│     No visibility into child resource consumption.        │
│                                                            │
│  ❌ Network connection tracking                            │
│     curl, wget, git fetch — all invisible in PTY stream. │
│                                                            │
│  ❌ Deterministic state                                   │
│     PTY is a byte stream. The same command can produce   │
│     different bytes each run. No verifiable state.        │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### What Sentry/Doghog/Warp Actually Do

These tools are NOT powered by raw PTY for their core functionality:

**Sentry (observability)** — Uses process instrumentation, not PTY, to capture crashes/exceptions with full stack traces, breadcrumbs, and context. The terminal is incidental.

**Doghog** — Uses eBPF/ptrace for syscall tracing, not PTY. Real-time capture of what processes actually did at the kernel level.

**Warp** — The UI is built on custom terminal rendering (WGPU/Renderer), but the execution harness uses platform-specific process APIs (fork+exec on Unix, ConPTY on Windows) with custom state management layered on top.

**The pattern**: All production-grade tools layer custom harness logic ON TOP of or BESIDE PTY. PTY is the execution mechanism. The harness is the intelligence.

---

## 2. THE STATE OF THE ART IN 2026

### What Modern AI Coding Harnesses Actually Use

The breakthrough is NOT better terminal emulation. The breakthrough is **harness architecture**.

#### Martin Fowler's Four Pillars (2026)

From [martinfowler.com/articles/harness-engineering.html](https://martinfowler.com/articles/harness-engineering.html):

```
┌────────────────────────────────────────────────────────────┐
│              FOUR PILLARS OF HARNESS ENGINEERING            │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  1. GUIDES                                                 │
│     Constraints that PREVENT bad behavior                  │
│     Examples: Rules files, permission profiles, tool       │
│     schemas, system prompts that encode conventions        │
│                                                            │
│  2. SENSORS                                                │
│     Feedback that OBSERVES what happened                   │
│     Examples: Exit code parsers, test result sensors,    │
│     diff sensors, maintainability sensors, file watchers  │
│                                                            │
│  3. ACTUATORS                                              │
│     Actions the agent can TAKE                             │
│     Examples: Terminal execution, file editing, git ops,  │
│     browser control, CI triggers                           │
│                                                            │
│  4. VERIFIERS                                              │
│     Checks that VALIDATE results                           │
│     Examples: TypeScript check, test run, lint, browser   │
│     proof, replay export                                  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

PTY is just ONE actuator. The harness is the entire system.

#### ForgeCode — #1 on Terminal-Bench 2.0

From [forgecode.dev](https://forgecode.dev/) and [Medium](https://medium.com/spillwave-solutions/forgecode-dominating-terminal-bench-2-0-harness-engineering-beat-claude-code-codex-gemini-etc-eb5df74a3fa4):

```
ForgeCode: 81.8% on Terminal-Bench 2.0
Claude Code: ~75-77%
Codex CLI: ~71.9%
Gemini CLI: ~68%
SWE-Agent: ~65%

The difference is NOT the model.
ForgeCode uses GPT-5.4 and Opus 4.6 and scores the same harness-first.
The harness architecture wins.
```

ForgeCode's architecture:

```
┌────────────────────────────────────────────────────────────┐
│                    FORGECODE ARCHITECTURE                  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              CONTEXT ENGINE                           │ │
│  │  Navigation of huge codebases                        │ │
│  │  Fast tool corrections                               │ │
│  │  Token-efficient context management                    │ │
│  └──────────────────────────────────────────────────────┘ │
│                          │                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              OBSERVATION LAYER                       │ │
│  │  Process state capture                               │ │
│  │  File system delta tracking                           │ │
│  │  Exit code + signal classification                    │ │
│  │  Command trace history                               │ │
│  └──────────────────────────────────────────────────────┘ │
│                          │                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              VERIFICATION LAYER                       │ │
│  │  Type check                                          │ │
│  │  Test execution                                      │ │
│  │  Lint verification                                   │ │
│  │  Build confirmation                                   │ │
│  └──────────────────────────────────────────────────────┘ │
│                          │                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              EXECUTION LAYER                         │ │
│  │  Shell command execution                             │ │
│  │  Tool registry                                       │ │
│  │  Sandboxed process isolation                         │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

Key insight: **ForgeCode is not just a PTY wrapper. It is a layered execution harness with observation, verification, and correction built in.**

#### OpenDev — 81-Page Research Paper

From [arXiv:2603.05344](https://arxiv.org/html/2603.05344v1):

OpenDev is a Rust-based, terminal-native AI coding agent with a compound AI system architecture:

```
┌────────────────────────────────────────────────────────────┐
│                    OPENDEV ARCHITECTURE                   │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ENTRY & UI                                               │
│  └── CLI interface, task parsing, session management      │
│                                                            │
│  AGENT                                                     │
│  ├── Master loop (single-threaded orchestration)         │
│  ├── Subagent registry (specialized workers)             │
│  ├── Model routing (best model per task type)            │
│  └── Self-verification (internal checks                  │
│                                                            │
│  TOOL & CONTEXT                                           │
│  ├── Tool registry (lazy-discovered external tools)       │
│  ├── Scaffolding pipeline (prompt construction)          │
│  ├── Context engineering (what the model sees)            │
│  └── State management (what happened, what's next)        │
│                                                            │
│  PERSISTENCE                                              │
│  ├── Execution traces (full command history)               │
│  ├── Evidence records (proof of completion)               │
│  └── Pattern memory (learned from sessions)               │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

OpenDev's key lessons:

1. **Terminal is the execution surface** — not the intelligence layer
2. **Process tree matters** — not just output bytes
3. **Evidence persistence** — every action must be recorded for verification
4. **Registry-based tools** — extensible, lazy-discovered, typed
5. **Self-verification loops** — agents check their own work before continuing

#### Terminal-Bench 2.0 — The Benchmark

From [tbench.ai](https://www.tbench.ai/):

Terminal-Bench 2.0 is the gold-standard evaluation for coding agents:

```
┌────────────────────────────────────────────────────────────┐
│               TERMINAL-BENCH 2.0                          │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  89 hard tasks in computer terminal environments           │
│  Inspired by real software engineering problems            │
│  Tasks require multi-step reasoning + execution            │
│  Each task has verifiable completion criteria              │
│                                                            │
│  Harbor Framework — the execution harness for Terminal-Bench│
│  └── Sandboxed terminal execution                         │
│  └── Process tree isolation                               │
│  └── File system snapshots                                │
│  └── Network isolation                                    │
│  └── Evidence collection                                  │
│                                                            │
│  Key insight: The HARBOR harness beats naive PTY every     │
│  time because it provides VERIFICATION, not just OUTPUT.  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

#### Observability-Driven Automatic Evolution (AHE)

From [arXiv:2604.25850](https://arxiv.org/abs/2604.25850):

Stanford's AHE system automatically evolves coding agent harnesses:

```
┌────────────────────────────────────────────────────────────┐
│                    AHE SYSTEM                              │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  10 iterations of harness evolution:                       │
│                                                            │
│  pass@1: 69.7% → 77.0%                                    │
│                                                            │
│  This BEATS human-designed Codex-CLI harness (71.9%)      │
│  Same model (GPT-5.4 high). Different harness.              │
│                                                            │
│  The system identifies observability gaps, proposes         │
│  harness edits, tests them against Terminal-Bench,         │
│  and keeps improvements.                                   │
│                                                            │
│  Key insight: Even incremental harness improvements         │
│  dramatically change agent reliability.                     │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 3. WHAT THE ACTUAL STATE-OF-THE-ART TECH IS

### The Layered Terminal Harness Stack

Modern AI coding tools use a LAYERED stack, not just PTY:

```
┌────────────────────────────────────────────────────────────┐
│                 FRONTEND (Renderer/UI)                    │
│  xterm.js, TerminalSurface, Process Tree Panel            │
├────────────────────────────────────────────────────────────┤
│                                                            │
│                 TERMINAL RUNTIME                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Shell Execution Layer                                 │ │
│  │  ├── PTY/ConPTY (raw process start)                 │ │
│  │  ├── Shell command parsing (bash/zsh/fish)            │ │
│  │  └── Input/output byte stream                         │ │
│  ├──────────────────────────────────────────────────────┤ │
│  │  Process Tree Layer                                    │ │
│  │  ├── child_process tree API                          │ │
│  │  ├── signal propagation tracking                      │ │
│  │  └── resource monitoring (CPU/memory)                 │ │
│  ├──────────────────────────────────────────────────────┤ │
│  │  Exit Taxonomy Layer                                  │ │
│  │  ├── exit code classification                         │ │
│  │  ├── signal parsing (SIGSEGV, SIGKILL, etc.)          │ │
│  │  └── failure root cause inference                     │ │
│  ├──────────────────────────────────────────────────────┤ │
│  │  File Delta Layer                                     │ │
│  │  ├── inotify/fs.watch (real-time)                    │ │
│  │  ├── git diff tracking                               │ │
│  │  └── file hash snapshots                             │ │
│  ├──────────────────────────────────────────────────────┤ │
│  │  Evidence Layer                                        │ │
│  │  ├── command traces                                    │ │
│  │  ├── transcript persistence                           │ │
│  │  └── screenshot/screen capture (browser proof)        │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
├────────────────────────────────────────────────────────────┤
│                 VERIFICATION LAYER                        │
│  Type check │ Test runner │ Lint │ Build │ Replay export    │
├────────────────────────────────────────────────────────────┤
│                 MEMORY LAYER                               │
│  Session memory │ Pattern memory │ Project memory            │
├────────────────────────────────────────────────────────────┤
│                 ORCHESTRATION LAYER                        │
│  Agent loop │ Model routing │ Tool dispatch │ Self-verification│
└────────────────────────────────────────────────────────────┘
```

### What Modern Tools Actually Track

From research across OpenDev, ForgeCode, Harbor, and LangChain's harness improvements:

```
┌────────────────────────────────────────────────────────────┐
│         WHAT STATE-OF-THE-ART TRACKS                      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  PROCESS TREE                                             │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ pnpm test                                            │ │
│  │ ├── node vitest                                     │ │
│  │ │   ├── worker 1                                    │ │
│  │ │   ├── worker 2                                    │ │
│  │ │   └── chromium (browser)                          │ │
│  │ └── exit 1                                          │ │
│  └─────────────────────────────────────────────────────┘ │
│  (NOT just: "pnpm test output: ...exit 1")              │
│                                                            │
│  EXIT CODE TAXONOMY                                      │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 0    = success                                      │ │
│  │ 1    = general error                                │ │
│  │ 2    = misuse / bad argument                        │ │
│  │ 126  = permission denied / not executable           │ │
│  │ 127  = command not found                            │ │
│  │ 128+N = signal N (e.g. 137=SIGKILL, 139=SIGSEGV) │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                            │
│  SIGNAL TRACKING                                         │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ SIGKILL  = external kill / OOM / timeout            │ │
│  │ SIGSEGV  = memory corruption / null pointer         │ │
│  │ SIGABRT  = assertion failure / panic                │ │
│  │ SIGTERM  = graceful termination request             │ │
│  │ SIGINT   = user interrupt (Ctrl+C)                 │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                            │
│  FILE DELTA                                              │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Created: src/auth/login.ts                          │ │
│  │ Modified: src/api/users.ts (+42 -8)                 │ │
│  │ Deleted: src/legacy/auth.ts                        │ │
│  │ (from real inotify/fs.watch, not guessed)          │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                            │
│  COMMAND TRACE                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 10:01:23 $ pnpm test                               │ │
│  │ 10:01:24   ├── spawned: node vitest               │ │
│  │ 10:01:25   ├── stdout: RUN v9.2.3                 │ │
│  │ 10:01:30   ├── stderr: Error: expected 'login'    │ │
│  │ 10:01:31   └── exit 1                             │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                            │
│  EVIDENCE RECORDS                                        │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Proof type: test_failure                            │ │
│  │ Command: pnpm test                                 │ │
│  │ Exit code: 1                                       │ │
│  │ Duration: 8.2s                                     │ │
│  │ Files changed: 2                                   │ │
│  │ Screenshots: 3 (for browser tasks)                │ │
│  │ Replay available: yes                              │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### PTY vs. Full Harness Comparison

```
┌────────────────────────────────────────────────────────────┐
│              PTY ONLY          vs.    FULL HARNESS        │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Byte stream in/out    ←→    Layered observability        │
│  Manual parsing        ←→    Structured event capture    │
│  Unknown failures      ←→    Exit code taxonomy           │
│  Hidden processes     ←→    Process tree visible          │
│  Guessed file changes ←→    inotify/fs.watch delta       │
│  Output only          ←→    Evidence-backed completion   │
│  Static execution     ←→    Self-verification loops       │
│  One-shot run        ←→    Pattern learning + evolution  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 4. THE RESEARCH EVIDENCE

### Harness Engineering Evidence

```
LangChain DeepAgent Terminal-Bench 2.0 improvement:
  Before harness engineering: 52.8% (Top 30)
  After harness engineering:  66.5% (Top 5)
  Same model. Different harness.
  13.7 percentage points from harness changes ALONE.

ForgeCode Terminal-Bench 2.0:
  81.8% with GPT-5.4 high
  81.8% with Opus 4.6
  Same harness. Different models.
  Model matters less than harness.

AHE (Observability-Driven Harness Evolution):
  10 iterations lifted pass@1 from 69.7% to 77.0%
  BEATS human-designed Codex-CLI harness (71.9%)
  Same model (GPT-5.4 high).
  Automated harness evolution outperformed manual design.
```

### Key Research Papers

| Paper                                                                                   | Key Insight                                                                                      |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [arXiv:2603.05344](https://arxiv.org/html/2603.05344v1) OpenDev                         | Rust terminal-native agent with 4-layer architecture: Entry/UI, Agent, Tool/Context, Persistence |
| [arXiv:2604.25850](https://arxiv.org/abs/2604.25850) AHE                                | 10 harness iterations → 77% (beats Codex-CLI's 71.9%)                                            |
| [Martin Fowler](https://martinfowler.com/articles/harness-engineering.html)             | Four pillars: Guides, Sensors, Actuators, Verifiers                                              |
| [ForgeCode](https://forgecode.dev/)                                                     | #1 on Terminal-Bench 2.0 with harness-first architecture                                         |
| [Terminal-Bench 2.0](https://www.tbench.ai/)                                            | 89 hard tasks, Harbor execution harness framework                                                |
| [Augment Code](https://www.augmentcode.com/guides/harness-engineering-ai-coding-agents) | PEV loops, rules files, quality gates                                                            |

---

## 5. WHAT DOORWAY SHOULD ACTUALLY BUILD

### The Real Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    DOORWAY REAL ARCHITECTURE               │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  LAYER 1: TERMINAL EXECUTION                               │
│  ├── PTY (node-pty) — raw process spawn                   │
│  ├── Shell layer (bash/zsh parsing)                       │
│  └── Input/output byte stream                             │
│                                                            │
│  LAYER 2: PROCESS OBSERVABILITY                            │
│  ├── child_process tree capture (Node.js API)             │
│  ├── signal propagation tracking                           │
│  ├── resource monitoring (CPU/memory per process)          │
│  └── network connection visibility (for curl/wget/git)    │
│                                                            │
│  LAYER 3: EXIT TAXONOMY                                   │
│  ├── exit code classification (0, 1, 2, 126, 127, 128+N) │
│  ├── signal parsing (SIGSEGV, SIGKILL, SIGABRT, etc.)    │
│  ├── failure root cause inference                          │
│  └── human-readable explanation                           │
│                                                            │
│  LAYER 4: FILE DELTA TRACKING                             │
│  ├── inotify/fs.watch for real-time file changes          │
│  ├── git diff for versioned delta                         │
│  ├── file hash snapshots for verification                 │
│  └── whitelist for expected changes                       │
│                                                            │
│  LAYER 5: EVIDENCE LAYER                                 │
│  ├── command traces (timestamped)                          │
│  ├── transcript persistence                               │
│  ├── screenshot capture (for browser tasks)              │
│  ├── diff export                                          │
│  └── replay bundle                                        │
│                                                            │
│  LAYER 6: VERIFICATION                                    │
│  ├── type check run (tsc, cargo check)                   │
│  ├── test run                                             │
│  ├── lint run                                             │
│  ├── build confirmation                                   │
│  └── custom verification commands                         │
│                                                            │
│  LAYER 7: MEMORY + PATTERN LEARNING                       │
│  ├── session memory (thread events)                       │
│  ├── project memory (conventions, commands)                │
│  ├── pattern memory (recurring errors/workflows)           │
│  └── cross-project learning                               │
│                                                            │
│  LAYER 8: ORCHESTRATION                                   │
│  ├── model routing (Claude, Codex, Cursor, Gemini)        │
│  ├── cross-model thread management                         │
│  ├── worktree isolation per lane                          │
│  ├── self-verification loops                              │
│  └── automation learning                                  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### PTY is NOT the Answer — But It's the Starting Point

PTY is the execution mechanism. It is necessary but not sufficient.

```
┌────────────────────────────────────────────────────────────┐
│              WHAT TO BUILD FIRST                           │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  PHASE 1A: PTY + PROCESS TREE                             │
│  Keep node-pty for spawning shells.                       │
│  Layer child_process tree capture on top.                  │
│  Show the process tree in UI.                             │
│  Persist tree snapshot on exit.                           │
│                                                            │
│  PHASE 1B: EXIT CODE TAXONOMY                            │
│  Parse exit codes + signals deterministically.            │
│  Show human-readable failure reason.                      │
│  Do NOT make up explanations.                            │
│                                                            │
│  PHASE 1C: FILE DELTA TRACKING                           │
│  Add inotify/fs.watch alongside PTY.                     │
│  Track real file changes.                                │
│  Show diffs from real git diff, not guessed.             │
│                                                            │
│  PHASE 1D: EVIDENCE PERSISTENCE                         │
│  Persist full traces to SQLite.                          │
│  Make replay exportable.                                 │
│  Back every UI claim with evidence.                       │
│                                                            │
│  AFTER PHASE 1: Memory, Orchestration, Automation       │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### What NOT to Build

```
┌────────────────────────────────────────────────────────────┐
│              WHAT NOT TO BUILD                             │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ❌ A "better PTY"                                       │
│     node-pty is fine. Don't reinvent it.                  │
│                                                            │
│  ❌ Fake process tree                                     │
│     Parse ps output. That's not real tree tracking.       │
│                                                            │
│  ❌ Guessed file changes                                  │
│     "Agent edited 3 files" from LLM output is not real.  │
│                                                            │
│  ❌ Generic chat memory                                   │
│     Workflow memory matters. Not conversational context.  │
│                                                            │
│  ❌ Broad "AI magic" predictions                           │
│     Deterministic taxonomy first. ML pattern learning later.│
│                                                            │
│  ❌ UI without evidence                                   │
│     "Agent running" requires real PTY session.             │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 6. THE FINAL VERDICT

### PTY Assessment

```
┌────────────────────────────────────────────────────────────┐
│              PTY VERDICT                                  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  PTY IS:                                                  │
│  ✅ Necessary for shell execution                        │
│  ✅ Mature, cross-platform (node-pty)                   │
│  ✅ Sufficient for raw I/O streaming                     │
│                                                            │
│  PTY IS NOT:                                             │
│  ❌ State of the art                                     │
│  ❌ Sufficient for AI agent harnesses                   │
│  ❌ The differentiator                                  │
│                                                            │
│  THE BREAKTHROUGH IS NOT PTY.                            │
│  THE BREAKTHROUGH IS THE LAYERED HARNESS ON TOP.        │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### What Doorway Should Pivot To

The decision to pivot from "PTY is the answer" to "layered harness is the answer" is correct.

Doorway's terminal capture should be:

```
1. node-pty for raw shell spawning + I/O
   + child_process tree tracking
   + signal propagation capture
   + resource monitoring

2. Structured event emission (not raw bytes)
   + Exit code taxonomy
   + File delta from inotify/fs.watch
   + Command trace history

3. Evidence persistence to SQLite
   + Full transcript
   + Process snapshots
   + Diff records
   + Replay export

4. Verification layer
   + Type check, test, lint, build
   + Custom verification commands

5. Memory layer
   + Session, project, pattern, cross-project

6. Orchestration layer
   + Cross-model routing
   + Worktree isolation
   + Self-verification loops
   + Learned automations
```

### The One-Line Takeaway

```
PTY is the execution mechanism.
The layered harness is the intelligence.
Models commoditize. Harnesses compound.
```

---

## SOURCES

- [Martin Fowler — Harness Engineering](https://martinfowler.com/articles/harness-engineering.html)
- [ForgeCode — World's #1 Coding Harness](https://forgecode.dev/)
- [arXiv:2603.05344 — OpenDev](https://arxiv.org/html/2603.05344v1)
- [arXiv:2604.25850 — AHE](https://arxiv.org/abs/2604.25850)
- [Terminal-Bench 2.0](https://www.tbench.ai/)
- [Augment Code — Harness Engineering](https://www.augmentcode.com/guides/harness-engineering-ai-coding-agents)
- [LangChain — Harness Engineering](https://www.langchain.com/blog/improving-deep-agents-with-harness-engineering)
- [Escape.tech — Harness Engineering](https://escape.tech/blog/everything-i-learned-about-harness-engineering-and-ai-factories-in-san-francisco-april-2026/)
