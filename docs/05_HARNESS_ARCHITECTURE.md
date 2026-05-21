# HARNESS ARCHITECTURE

## The Engineering Blueprint for Doorway

---

## WHAT IS A HARNESS?

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    HARNESS ENGINEERING (Karpathy Level)                    │
└────────────────────────────────────────────────────────────────────────────┘

A "harness" is the infrastructure that makes unreliable systems reliable.

In the context of AI coding tools:

  MODEL (Unreliable)     +     HARNESS (Reliable)     =     RELIABLE OUTPUT

  GPT-5.3                    PTY + Process Tree
  Claude Opus                Exit Taxonomy
  Gemini                     Memory
                              Pattern Learning
                              Orchestration
                              Evidence
```

### The 4 Pillars of Harness Engineering (Martin Fowler)

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║  THE 4 PILLARS                                                             ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  1. CONTEXT ───────────────── What is the current state?                   ║
║     • Project structure                                                    ║
║     • Recent changes                                                        ║
║     • User preferences                                                      ║
║     • Conversation history                                                  ║
║                                                                              ║
║  2. MEMORY ───────────────── What have we learned?                         ║
║     • Success patterns                                                      ║
║     • Failure patterns                                                      ║
║     • Project conventions                                                   ║
║     • Tool preferences                                                      ║
║                                                                              ║
║  3. TOOL EXECUTION ───────── How do we run things safely?                 ║
║     • Process isolation                                                     ║
║     • Resource limits                                                       ║
║     • Output capture                                                        ║
║     • Error classification                                                   ║
║                                                                              ║
║  4. ENTROPY MANAGEMENT ───── How do we handle chaos?                      ║
║     • Retry logic                                                           ║
║     • Fallback strategies                                                   ║
║     • Recovery mechanisms                                                   ║
║     • Self-healing                                                          ║
║                                                                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

## THE DOORWAY HARNESS ARCHITECTURE

### Full System Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         DOORWAY HARNESS ARCHITECTURE                       │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                         USER INTERFACE LAYER                          ││
│  │                                                                        ││
│  │   Thread Canvas │ Process Tree │ Evidence Panel │ Memory View       ││
│  │   Timeline Scrubber │ Exit Taxonomy │ File Delta │ AI Chat        ││
│  │                                                                        ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                    │                                       │
│                                    ↓                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                      ORCHESTRATION LAYER                              ││
│  │                                                                        ││
│  │   Model Router ──► Best model for each task                          ││
│  │   Thread Manager ──► Parallel execution coordination                 ││
│  │   Memory Engine ──► Pattern learning & retrieval                     ││
│  │   Compaction ──► Context window optimization                         ││
│  │                                                                        ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                    │                                       │
│         ┌──────────────────────────┼──────────────────────────┐         │
│         ↓                          ↓                          ↓         │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐            │
│  │Claude Code   │      │ Codex CLI   │      │ Cursor      │            │
│  │  Adapter     │      │  Adapter    │      │  Adapter    │            │
│  │  (Anthropic) │      │  (OpenAI)   │      │  (IDE)      │            │
│  └──────────────┘      └──────────────┘      └──────────────┘            │
│         │                          │                          │         │
│         └──────────────────────────┼──────────────────────────┘         │
│                                    ↓                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                      TERMINAL HARNESS LAYER                           ││
│  │                                                                        ││
│  │   ┌──────────────────────────────────────────────────────────────┐   ││
│  │   │  PTY LAYER (node-pty)                                         │   ││
│  │   │  • Shell sessions (bash, zsh, fish, pwsh)                     │   ││
│  │   │  • PTY fork/spawn/exec                                       │   ││
│  │   │  • Output streaming (UTF-8, ANSI escape codes)                │   ││
│  │   │  • Resize handling                                           │   ││
│  │   └──────────────────────────────────────────────────────────────┘   ││
│  │                                    │                                   ││
│  │                                    ↓                                   ││
│  │   ┌──────────────────────────────────────────────────────────────┐   ││
│  │   │  PROCESS TREE TRACKER                                        │   ││
│  │   │  • Parent/child process relationships                        │   ││
│  │   │  • ps aux | grep (process snapshot)                         │   ││
│  │   │  • /proc/{pid}/status (Linux)                               │   ││
│  │   │  • Darwin process_info (macOS)                              │   ││
│  │   │  • Exit code + signal capture                               │   ││
│  │   └──────────────────────────────────────────────────────────────┘   ││
│  │                                    │                                   ││
│  │                                    ↓                                   ││
│  │   ┌──────────────────────────────────────────────────────────────┐   ││
│  │   │  EXIT CODE TAXONOMY                                         │   ││
│  │   │                                                             │   ││
│  │   │  SIGSEGV (11)     → Segmentation fault (memory corruption) │   ││
│  │   │  SIGKILL (9)      → OOM killed / timeout                    │   ││
│  │   │  SIGABRT (6)      → Assert failed / panic                  │   ││
│  │   │  SIGFPE (8)       → Floating point exception               │   ││
│  │   │  127              → Command not found                      │   ││
│  │   │  126              → Permission denied                     │   ││
│  │   │  1                → General error (analyze output)         │   ││
│  │   │  2                → Usage error                             │   ││
│  │   └──────────────────────────────────────────────────────────────┘   ││
│  │                                    │                                   ││
│  │                                    ↓                                   ││
│  │   ┌──────────────────────────────────────────────────────────────┐   ││
│  │   │  SEMANTIC OUTPUT PARSER                                     │   ││
│  │   │  • ANSI escape code stripping                               │   ││
│  │   │  • Error pattern matching (error:, panic:, failed)          │   ││
│  │   │  • Success pattern matching (✓, passed, success)             │   ││
│  │   │  • Stack trace extraction                                   │   ││
│  │   │  • Warning/count extraction                                 │   ││
│  │   └──────────────────────────────────────────────────────────────┘   ││
│  │                                    │                                   ││
│  │                                    ↓                                   ││
│  │   ┌──────────────────────────────────────────────────────────────┐   ││
│  │   │  AUTO-RETRY DETECTOR                                        │   ││
│  │   │  • Pattern: same command, slight delay                      │   ││
│  │   │  • Pattern: backoff pattern (1s, 2s, 4s)                    │   ││
│  │   │  • Pattern: "Retrying..." in output                        │   ││
│  │   │  • Count retries, present to user                          │   ││
│  │   └──────────────────────────────────────────────────────────────┘   ││
│  │                                    │                                   ││
│  │                                    ↓                                   ││
│  │   ┌──────────────────────────────────────────────────────────────┐   ││
│  │   │  FILE DELTA TRACKER                                          │   ││
│  │   │                                                             │   ││
│  │   │  Linux:     inotify (fanotify for subtree)                  │   ││
│  │   │  macOS:     FSEvents (kqueue backend)                       │   ││
│  │   │  Windows:   ReadDirectoryChangesW                           │   ││
│  │   │                                                             │   ││
│  │   │  Track:     CREATE │ MODIFY │ DELETE │ RENAME              │   ││
│  │   │  Diff:      git diff --name-status                          │   ││
│  │   │  Ignore:    .gitignore patterns                             │   ││
│  │   └──────────────────────────────────────────────────────────────┘   ││
│  │                                    │                                   ││
│  │                                    ↓                                   ││
│  │   ┌──────────────────────────────────────────────────────────────┐   ││
│  │   │  RESOURCE MONITOR                                           │   ││
│  │   │                                                             │   ││
│  │   │  • CPU usage (top, ps)                                      │   ││
│  │   │  • Memory usage (/proc/meminfo, mach_task_info)            │   ││
│  │   │  • Disk I/O                                                │   ││
│  │   │  • Network (ss, netstat)                                    │   ││
│  │   │  • Duration tracking                                        │   ││
│  │   └──────────────────────────────────────────────────────────────┘   ││
│  │                                                                        ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                    │                                       │
│                                    ↓                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                      WORKTREE ISOLATION LAYER                         ││
│  │                                                                        ││
│  │   git worktree add ../doorway-feature-x feature-x                    ││
│  │   git worktree list                                                 ││
│  │   git worktree prune                                                ││
│  │                                                                        ││
│  │   Each thread = isolated worktree = no merge conflicts              ││
│  │                                                                        ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                    │                                       │
│                                    ↓                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                       EVIDENCE LAYER                                  ││
│  │                                                                        ││
│  │   Screenshot capture ──► Playwright screenshot()                     ││
│  │   Terminal recording ──► asciinema / PTY replay                     ││
│  │   Event timeline ────► Structured JSON log                           ││
│  │   File diffs ────────► git diff output                               ││
│  │   Browser automation ─► Playwright for browser control               ││
│  │                                                                        ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                    │                                       │
│                                    ↓                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                      MEMORY LAYER                                    ││
│  │                                                                        ││
│  │   ┌──────────────────────────────────────────────────────────────┐   ││
│  │   │  PROJECT MEMORY                                             │   ││
│  │   │  • Tech stack (package.json, requirements.txt, etc.)        │   ││
│  │   │  • Conventions (eslint, prettier, commit style)            │   ││
│  │   │  • Architecture (folder structure, patterns)                │   ││
│  │   └──────────────────────────────────────────────────────────────┘   ││
│  │   ┌──────────────────────────────────────────────────────────────┐   ││
│  │   │  SESSION MEMORY                                            │   ││
│  │   │  • Files touched                                           │   ││
│  │   │  • Errors encountered                                      │   ││
│  │   │  • Decisions made                                          │   ││
│  │   │  • Commands run                                            │   ││
│  │   └──────────────────────────────────────────────────────────────┘   ││
│  │   ┌──────────────────────────────────────────────────────────────┐   ││
│  │   │  PATTERN MEMORY                                            │   ││
│  │   │  • Success patterns (what worked)                          │   ││
│  │   │  • Failure patterns (what didn't)                          │   ││
│  │   │  • Retry patterns (what needed retries)                    │   ││
│  │   │  • Tool preferences (what model for what task)             │   ││
│  │   └──────────────────────────────────────────────────────────────┘   ││
│  │   ┌──────────────────────────────────────────────────────────────┐   ││
│  │   │  CROSS-PROJECT MEMORY                                       │   ││
│  │   │  • Shared learnings                                        │   ││
│  │   │  • Tool configurations                                     │   ││
│  │   │  • Workflow patterns                                       │   ││
│  │   └──────────────────────────────────────────────────────────────┘   ││
│  │                                                                        ││
│  │   Storage: SQLite (local) + optional cloud sync                     ││
│  │                                                                        ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                    │                                       │
│                                    ↓                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                      STORAGE LAYER                                    ││
│  │                                                                        ││
│  │   SQLite (better-sqlite3)                                             ││
│  │   Tables: threads, events, memory, projects, evidence, patterns        ││
│  │                                                                        ││
│  └──────────────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────┘
```

---

## KEY COMPONENTS

### 1. PTY Layer (Terminal Harness)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    PTY LAYER IMPLEMENTATION                                │
└────────────────────────────────────────────────────────────────────────────┘

Key files: packages/terminal-runtime/src/pty-backend.ts

Current state:
✓ node-pty integration
✓ PTY spawn/fork/exec
✓ Output streaming
✗ Process tree tracking
✗ Exit code taxonomy
✗ Semantic parser
✗ Auto-retry detection
✗ File delta tracking

What to add:

┌────────────────────────────────────────────────────────────────────────────┐
│  PROCESS TREE TRACKER                                                      │
│                                                                            │
│  Linux:                                                                    │
│  ──────                                                                    │
│  const psTree = async (pid: number): Promise<ProcessNode[]> => {           │
│    const output = await exec(`ps -eo pid,ppid,comm,args --forest`);       │
│    return parsePsOutput(output);                                          │
│  };                                                                       │
│                                                                            │
│  macOS:                                                                   │
│  ──────                                                                    │
│  import { exec } from 'child_process';                                    │
│  import { darwinProcessInfo } from './darwin-process';                   │
│                                                                            │
│  const psTree = async (pid: number): Promise<ProcessNode[]> => {          │
│    const procs = await darwinProcessInfo();                               │
│    return buildTree(procs, pid);                                          │
│  };                                                                       │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│  EXIT CODE TAXONOMY                                                        │
│                                                                            │
│  export const exitCodeTaxonomy: Record<number, ExitInfo> = {               │
│    0:   { type: 'success',     meaning: 'Command succeeded',             │
│           action: 'none' },                                               │
│    1:   { type: 'error',       meaning: 'General error',                 │
│           action: 'analyze_output' },                                      │
│    2:   { type: 'usage',       meaning: 'Usage error',                   │
│           action: 'check_help' },                                         │
│    126: { type: 'permission',  meaning: 'Permission denied',            │
│           action: 'check_permissions' },                                   │
│    127: { type: 'not_found',  meaning: 'Command not found',             │
│           action: 'check_path' },                                         │
│    130: { type: 'signal',      meaning: 'SIGINT (Ctrl+C)',               │
│           action: 'user_canceled' },                                      │
│  };                                                                       │
│                                                                            │
│  export const signalTaxonomy: Record<number, SignalInfo> = {             │
│    9:   { type: 'kill',        meaning: 'SIGKILL (OOM/timeout)',        │
│           action: 'check_resources' },                                     │
│    11:  { type: 'segfault',    meaning: 'SIGSEGV (memory corruption)',  │
│           action: 'analyze_crash' },                                       │
│    6:   { type: 'abort',       meaning: 'SIGABRT (assert failed)',       │
│           action: 'check_asserts' },                                       │
│    8:   { type: 'fpe',         meaning: 'SIGFPE (div by zero)',         │
│           action: 'check_math' },                                          │
│  };                                                                       │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 2. Memory Layer

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    MEMORY LAYER IMPLEMENTATION                             │
└────────────────────────────────────────────────────────────────────────────┘

Key files: packages/orchestrator/src/memory.ts

┌────────────────────────────────────────────────────────────────────────────┐
│  MEMORY STRUCTURE                                                          │
│                                                                            │
│  interface Memory {                                                        │
│    id: string;                                                            │
│    type: 'project' | 'session' | 'pattern' | 'cross_project';            │
│    content: {                                                             │
│      // Project memory                                                    │
│      techStack?: string[];                                                │
│      conventions?: string[];                                              │
│      architecture?: string;                                                │
│                                                                             │
│      // Session memory                                                     │
│      filesTouched?: string[];                                              │
│      errorsEncountered?: ErrorRecord[];                                   │
│      decisionsMade?: Decision[];                                          │
│      commandsRun?: Command[];                                              │
│                                                                             │
│      // Pattern memory                                                      │
│      successPatterns?: Pattern[];                                         │
│      failurePatterns?: Pattern[];                                          │
│      toolPreferences?: Record<TaskType, ModelType>;                        │
│                                                                             │
│      // Cross-project memory                                               │
│      sharedLearnings?: Learning[];                                         │
│    };                                                                      │
│    confidence: number;                                                     │
│    lastAccessed: Date;                                                     │
│    accessCount: number;                                                    │
│  }                                                                        │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│  PATTERN LEARNING ALGORITHM                                                │
│                                                                            │
│  // Track success/failure for learning                                   │
│  interface PatternObservation {                                           │
│    task: string;                                                          │
│    model: ModelType;                                                      │
│    approach: string;                                                      │
│    outcome: 'success' | 'failure' | 'partial';                          │
│    duration: number;                                                      │
│    attempts: number;                                                      │
│    timestamp: Date;                                                        │
│  }                                                                        │
│                                                                            │
│  // Learn from observations                                               │
│  const learn = async (observation: PatternObservation) => {                │
│    await db.patterns.upsert({                                             │
│      where: { task_approach: { task: observation.task,                   │
│                                 approach: observation.approach } },       │
│      update: {                                                            │
│        successCount: observation.outcome === 'success' ? +1 : 0,          │
│        failureCount: observation.outcome === 'failure' ? +1 : 0,          │
│        avgDuration: (existing.avgDuration + observation.duration) / 2,    │
│        confidence: calculateConfidence(existing, observation),             │
│      },                                                                   │
│      create: {                                                            │
│        task: observation.task,                                            │
│        approach: observation.approach,                                    │
│        model: observation.model,                                          │
│        successCount: observation.outcome === 'success' ? 1 : 0,           │
│        failureCount: observation.outcome === 'failure' ? 1 : 0,           │
│        avgDuration: observation.duration,                                 │
│        confidence: 0.5,                                                    │
│      },                                                                   │
│    });                                                                    │
│  };                                                                       │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 3. Model Router

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    MODEL ROUTER IMPLEMENTATION                             │
└────────────────────────────────────────────────────────────────────────────┘

Key files: packages/orchestrator/src/brain.ts

┌────────────────────────────────────────────────────────────────────────────┐
│  MODEL SELECTION ALGORITHM                                                 │
│                                                                            │
│  type ModelType = 'claude-opus' | 'claude-sonnet' | 'gpt-5.3' |          │
│                   'gpt-5.5' | 'gemini-pro' | 'cursor' | 'custom';        │
│                                                                            │
│  type TaskType = 'complex_reasoning' | 'fast_boilerplate' |              │
│                  'inline_polish' | 'documentation' | 'refactor' |         │
│                  'bug_fix' | 'code_review' | 'browser_test';             │
│                                                                            │
│  const modelPreferences: Record<TaskType, {                               │
│    primary: ModelType[];                                                  │
│    fallback: ModelType[];                                                │
│    confidence: number;                                                    │
│  }> = {                                                                   │
│    complex_reasoning: {                                                   │
│      primary: ['claude-opus', 'claude-sonnet'],                          │
│      fallback: ['gpt-5.5'],                                               │
│    },                                                                     │
│    fast_boilerplate: {                                                    │
│      primary: ['gpt-5.3', 'claude-sonnet'],                              │
│      fallback: ['gemini-pro'],                                            │
│    },                                                                     │
│    inline_polish: {                                                        │
│      primary: ['cursor'],                                                 │
│      fallback: ['claude-sonnet'],                                        │
│    },                                                                     │
│    documentation: {                                                       │
│      primary: ['gemini-pro', 'claude-sonnet'],                           │
│      fallback: ['gpt-5.3'],                                               │
│    },                                                                     │
│    refactor: {                                                             │
│      primary: ['claude-opus'],                                           │
│      fallback: ['claude-sonnet'],                                        │
│    },                                                                     │
│    bug_fix: {                                                             │
│      primary: ['claude-opus', 'gpt-5.5'],                                │
│      fallback: ['claude-sonnet'],                                        │
│    },                                                                     │
│    code_review: {                                                         │
│      primary: ['claude-opus'],                                           │
│      fallback: ['claude-sonnet', 'gpt-5.5'],                             │
│    },                                                                     │
│    browser_test: {                                                        │
│      primary: ['cursor'],                                                 │
│      fallback: ['claude-sonnet'],                                        │
│    },                                                                     │
│  };                                                                       │
│                                                                            │
│  // Learn from pattern memory                                             │
│  const selectModel = async (task: TaskType, context: Context) => {        │
│    const preferences = modelPreferences[task];                             │
│    const pattern = await getPattern(task, context);                      │
│                                                                             │
│    if (pattern && pattern.confidence > 0.7) {                            │
│      // Use learned pattern                                               │
│      return pattern.model;                                                │
│    }                                                                      │
│                                                                             │
│    // Fall back to preferences                                             │
│    for (const model of preferences.primary) {                              │
│      if (await isAvailable(model)) {                                      │
│        return model;                                                      │
│      }                                                                    │
│    }                                                                      │
│                                                                             │
│    return preferences.fallback[0];                                         │
│  };                                                                       │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## IMPLEMENTATION PRIORITY

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    IMPLEMENTATION PRIORITY                                 │
└────────────────────────────────────────────────────────────────────────────┘

PHASE 1: TERMINAL HARNESS (Weeks 1-4)
─────────────────────────────────────────────────────────────
Priority 1: Wire xterm.js to live PTY output
  • Connect TerminalMuxPanel to PTY backend
  • Real-time output streaming
  • ANSI escape code rendering

Priority 2: Process tree tracking
  • Linux/macOS process tree capture
  • Parent/child relationship tracking
  • Real-time tree updates

Priority 3: Exit code taxonomy
  • Exit code classification
  • Signal handling
  • User-friendly error messages

Priority 4: File delta tracking
  • inotify/FSEvents integration
  • Git diff for changes
  • File change notifications

PHASE 2: MEMORY & LEARNING (Weeks 5-8)
─────────────────────────────────────────────────────────────
Priority 5: Basic memory system
  • Project context storage
  • Session history
  • SQLite persistence

Priority 6: Pattern learning
  • Success/failure tracking
  • Pattern observation
  • Confidence calculation

Priority 7: Model routing
  • Task classification
  • Model selection
  • Learned preferences

PHASE 3: EVIDENCE & ORCHESTRATION (Weeks 9-12)
─────────────────────────────────────────────────────────────
Priority 8: Screenshot capture
  • Playwright integration
  • Browser automation
  • Visual evidence recording

Priority 9: Session replay
  • Event timeline
  • Timeline scrubbing
  • Jump to moment

Priority 10: Cross-model threads
  • Multi-model coordination
  • Parallel execution
  • Unified view

PHASE 4: ENTERPRISE (Weeks 13-16)
─────────────────────────────────────────────────────────────
Priority 11: Audit trail
  • Event logging
  • Export functionality
  • Compliance formats

Priority 12: RBAC & Governance
  • Role permissions
  • API key management
  • SSO integration

Priority 13: EU AI Act compliance
  • Transparency reports
  • Human oversight logs
  • Documentation
```

---

## THE BOTTOM LINE

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   HARNESS = Infrastructure that makes unreliable systems reliable.          ║
║                                                                              ║
║   DOORWAY'S HARNESS MUST PROVIDE:                                         ║
║   1. CONTEXT ──────── Project structure, changes, preferences              ║
║   2. MEMORY ──────── Learned patterns, success/failure tracking           ║
║   3. TOOL EXECUTION ─ Process isolation, resource limits, output capture  ║
║   4. ENTROPY MANAGEMENT ─ Retry logic, fallback, recovery                 ║
║                                                                              ║
║   THE KEY INSIGHT:                                                         ║
║   The model is commodity. The harness is the differentiator.              ║
║                                                                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```
