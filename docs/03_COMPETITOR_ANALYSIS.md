# COMPETITOR ANALYSIS

## Doorway vs Codex, Claude Code, Cursor, T3

---

## OVERVIEW

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    COMPETITOR LANDSCAPE (2026)                           │
└────────────────────────────────────────────────────────────────────────────┘

              ┌─────────────────┐
              │   DOORWAY       │
              │  (The Harness)  │
              └────────┬────────┘
                       │
         ┌─────────────┼─────────────┬──────────────┐
         ↓             ↓             ↓              ↓
   ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
   │   CODEX   │ │CLAUDE CODE│ │  CURSOR   │ │    T3     │
   │  DESKTOP  │ │           │ │           │ │   CODE    │
   └───────────┘ └───────────┘ └───────────┘ └───────────┘

The differentiator: Doorway orchestrates ALL of them.
```

---

## CODEX DESKTOP (OpenAI)

### What It Is

```
┌────────────────────────────────────────────────────────────────────────────┐
│  CODEX DESKTOP: The AI "Command Center" for Coding                       │
│                                                                            │
│  Launched: February 2, 2026 (macOS), March 2026 (Windows)                │
│  Downloads: 200,000+ in first day                                         │
│  Team: OpenAI's largest team                                              │
│  Models: GPT-5.3, GPT-5.5                                                 │
└────────────────────────────────────────────────────────────────────────────┘
```

### Key Features

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║  CODEX DESKTOP FEATURES                                                   ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  ✅ PARALLEL AGENT THREADS                                                ║
║     Run 5+ agents in parallel on 5 different branches                     ║
║                                                                              ║
║  ✅ WORKTREE ISOLATION                                                     ║
║     Each thread gets isolated Git worktree (no merge conflicts)            ║
║                                                                              ║
║  ✅ COMPUTER USE                                                           ║
║     Control actual computer: screenshots, clicks, browser automation       ║
║                                                                              ║
║  ✅ MEMORY SYSTEM                                                          ║
║     Remembers projects across sessions                                     ║
║                                                                              ║
║  ✅ 90+ PLUGINS                                                            ║
║     GitHub, Slack, Linear, Figma, AWS, GCP, MCP servers                     ║
║                                                                              ║
║  ✅ AUTOMATIONS                                                            ║
║     Scheduled tasks, trigger-based workflows, background processing        ║
║                                                                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    CODEX DESKTOP ARCHITECTURE                             │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                         FRONTEND (macOS/Windows App)                  ││
│  │   Thread management UI │ Parallel views │ Worktree visualization     ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                    │                                     │
│                                    ↓                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                    MULTI-AGENT ORCHESTRATION                          ││
│  │                                                                       ││
│  │   Thread 1 ──► Worktree A ──► GPT-5.3                             ││
│  │   Thread 2 ──► Worktree B ──► GPT-5.3                             ││
│  │   Thread 3 ──► Worktree C ──► GPT-5.5                             ││
│  │   Thread 4 ──► Worktree D ──► GPT-5.5                             ││
│  │   Thread 5 ──► Worktree E ──► GPT-5.3                             ││
│  │                                                                       ││
│  │   ALL OPENAI. ONLY OPENAI.                                          ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                    │                                     │
│                                    ↓                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                    COMPUTER USE LAYER                                  ││
│  │   Screen capture │ Mouse/keyboard │ Browser automation                ││
│  └──────────────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────┘
```

### Strengths

```
✅ Best parallel execution model
✅ Beautiful native apps (macOS + Windows)
✅ Worktree isolation is excellent
✅ Computer use is game-changing
✅ 90+ plugins ecosystem
✅ OpenAI's resources (fast development)
✅ 200k+ downloads (market validation)
```

### Weaknesses

```
❌ OPENAI ONLY — Can't use Claude, Gemini, or any other model
❌ No cross-model orchestration
❌ Enterprise governance is partial
❌ No RBAC or full audit trail
❌ No self-evolution
❌ Closed source (black box)
❌ Memory is basic (not pattern learning)
```

### Doorway's Win Against Codex

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    DOORWAY WINS: CROSS-MODEL THREADING                     │
│                                                                            │
│  CODEX:                                                                   │
│  Thread 1 ──► GPT-5.3 ──► Feature A                                      │
│  Thread 2 ──► GPT-5.3 ──► Feature B                                      │
│  ALL OPENAI. ONLY OPENAI.                                                 │
│                                                                            │
│  DOORWAY:                                                                 │
│  Thread 1 ──► Claude Opus ──► Complex reasoning                           │
│  Thread 2 ──► Codex ──► Fast boilerplate                                 │
│  Thread 3 ──► Cursor ──► Inline polish                                    │
│  Thread 4 ──► Gemini ──► Documentation                                    │
│  Thread 5 ──► Playwright ──► Browser proof                               │
│                                                                            │
│  BEST MODEL FOR EACH TASK. NO VENDOR LOCK-IN.                              │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## CLAUDE CODE (Anthropic)

### What It Is

```
┌────────────────────────────────────────────────────────────────────────────┐
│  CLAUDE CODE: Anthropic's AI Coding Agent                                  │
│                                                                            │
│  Launched: Late 2024                                                       │
│  Model: Claude (3.5 Sonnet, 3.7, Opus 4.6)                                │
│  Strength: Most powerful single agent, best reasoning                     │
└────────────────────────────────────────────────────────────────────────────┘
```

### Key Features

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║  CLAUDE CODE FEATURES                                                     ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  ✅ 38+ TOOLS                                                              ║
║     Read, write, edit, bash, grep, glob, web search, etc.                  ║
║                                                                              ║
║  ✅ WORKTREE SUPPORT                                                        ║
║     Isolated branches for parallel work                                    ║
║                                                                              ║
║  ✅ HOOKS SYSTEM                                                           ║
║     Pre/post execution hooks for customization                             ║
║                                                                              ║
║  ✅ ULTRA-THINK MODE                                                       ║
║     Deep reasoning for complex problems                                    ║
║                                                                              ║
║  ✅ SUB-AGENTS IN WORKTREES                                                ║
║     Delegate to isolated agents                                            ║
║                                                                              ║
║  ✅ PERMISSION SYSTEM                                                       ║
║     User approval for dangerous operations                                 ║
║                                                                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    CLAUDE CODE ARCHITECTURE                                │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                         FRONTEND (CLI + IDE)                         ││
│  │   Terminal interface │ Permission prompts │ Status indicators       ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                    │                                     │
│                                    ↓                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                    AGENT CORE                                         ││
│  │   Tool execution │ Context management │ State machine              ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                    │                                     │
│                                    ↓                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                    SUBPROCESS TRACKING                                ││
│  │   node-pty │ Process tree │ Output capture                          ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                    │                                     │
│                                    ↓                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                    CLAUDE MODEL (Anthropic API)                      ││
│  │   38+ tools │ Permission system │ Token management                  ││
│  └──────────────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────┘
```

### Strengths

```
✅ Most powerful single agent
✅ Best at complex reasoning
✅ Best at large refactors
✅ Ultra-think mode for deep analysis
✅ Permission system for safety
✅ Excellent tool suite (38+ tools)
```

### Weaknesses

```
❌ FORGETS EVERYTHING — No persistent memory (THE #1 COMPLAINT)
❌ Claude only — Can't use GPT or Gemini
❌ No cross-model orchestration
❌ Basic audit trail
❌ No enterprise governance
❌ Session memory broken (user #1 complaint)
```

### Doorway's Win Against Claude Code

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    DOORWAY WINS: PERSISTENT MEMORY                        │
│                                                                            │
│  CLAUDE CODE:                                                              │
│  Session 1: Zero context                                                  │
│  Session 2: Zero context                                                  │
│  Session 3: Zero context                                                 │
│  EVERY SESSION STARTS FROM SCRATCH                                        │
│                                                                            │
│  DOORWAY:                                                                 │
│  Session 1: Remembers project, tech stack, conventions                   │
│  Session 2: Remembers previous errors, what worked                        │
│  Session 3: Remembers patterns, learned improvements                     │
│  GETS SMARTER EVERY SESSION                                               │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## CURSOR (IDE Integration)

### What It Is

```
┌────────────────────────────────────────────────────────────────────────────┐
│  CURSOR: AI-First IDE                                                     │
│                                                                            │
│  Launched: 2023                                                            │
│  Model: Claude + GPT (switchable)                                          │
│  Strength: Best IDE integration, inline autocomplete                       │
└────────────────────────────────────────────────────────────────────────────┘
```

### Key Features

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║  CURSOR FEATURES                                                          ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  ✅ COMPOSER                                                               ║
║     Multi-file editing with AI                                             ║
║                                                                              ║
║  ✅ AGENT MODE                                                             ║
║     Full agent that can read, write, execute                                ║
║                                                                              ║
║  ✅ INLINE AUTOCOMPLETE                                                    ║
║     Best-in-class code suggestions                                         ║
║                                                                              ║
║  ✅ CONTEXT AWARENESS                                                      ║
║     Understands entire codebase                                            ║
║                                                                              ║
║  ✅ RULES FOR AI                                                           ║
║     Project-specific instructions                                           ║
║                                                                              ║
║  ✅ TAB NAVIGATION                                                          ║
║     Smart file switching                                                    ║
║                                                                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Strengths

```
✅ Best IDE integration
✅ Inline autocomplete is excellent
✅ Composer for multi-file edits
✅ Rules for AI (project context)
✅ Beautiful UI
✅ Fast adoption (developers love it)
```

### Weaknesses

```
❌ Weak CLI harness
❌ No session management (ephemeral)
❌ No cross-tool orchestration
❌ No enterprise governance
❌ No terminal visibility
```

### Doorway's Win Against Cursor

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    DOORWAY WINS: SESSION MANAGEMENT + ORCHESTRATION       │
│                                                                            │
│  CURSOR:                                                                   │
│  Inline editing = Excellent                                              │
│  Session management = None                                                │
│  Cross-tool = None                                                        │
│                                                                            │
│  DOORWAY:                                                                 │
│  Uses Cursor for inline polish                                           │
│  + Session memory across sessions                                         │
│  + Orchestrates with Claude + Codex                                      │
│  + Full audit trail                                                       │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## T3 CODE (Effect + WebSocket)

### What It Is

```
┌────────────────────────────────────────────────────────────────────────────┐
│  T3 CODE: TypeScript-First AI Coding Framework                            │
│                                                                            │
│  Built by: Effect (functional Scala/TypeScript ecosystem)                │
│  Architecture: Effect framework + WebSocket RPC                           │
│  Protocol: ACP (Agent Communication Protocol)                              │
└────────────────────────────────────────────────────────────────────────────┘
```

### Key Features

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║  T3 CODE FEATURES                                                         ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  ✅ EFFECT FRAMEWORK                                                       ║
║     Typed effects, error handling, dependency injection                   ║
║                                                                              ║
║  ✅ WEBSOCKET RPC                                                          ║
║     Real-time streaming, bidirectional communication                       ║
║                                                                              ║
║  ✅ ACP PROTOCOL                                                           ║
║     Agent Communication Protocol for multi-agent coordination              ║
║                                                                              ║
║  ✅ TYPE-SAFE TOOLS                                                        ║
║     All tools are typed with Effect                                       ║
║                                                                              ║
║  ✅ TERMINAL INTEGRATION                                                   ║
║     PTY-based terminal capture                                             ║
║                                                                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    T3 CODE ARCHITECTURE                                   │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                    EFFECT LAYER                                       ││
│  │   Typed effects │ Error handling │ DI container                      ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                    │                                     │
│                                    ↓                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                    ACP PROTOCOL                                      ││
│  │   Agent registry │ Message types │ RPC calls                         ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                    │                                     │
│                                    ↓                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                    WEBSOCKET LAYER                                    ││
│  │   Real-time streaming │ Bidirectional │ Heartbeat                     ││
│  └──────────────────────────────────────────────────────────────────────┘│
│                                    │                                     │
│                                    ↓                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │                    TOOL LAYER                                         ││
│  │   Read │ Write │ Bash │ Grep │ Glob (all typed)                      ││
│  └──────────────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────┘
```

### Strengths

```
✅ Excellent TypeScript integration
✅ Real-time streaming architecture
✅ Type-safe tools (Effect)
✅ ACP protocol is well-designed
✅ Functional programming patterns
```

### Weaknesses

```
❌ Newer, less mature
❌ Smaller community
❌ No memory system
❌ No enterprise governance
❌ No cross-model orchestration
```

### Doorway's Win Against T3 Code

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    DOORWAY WINS: MEMORY + ENTERPRISE                       │
│                                                                            │
│  T3 CODE:                                                                  │
│  Type-safe tools = Excellent                                             │
│  Memory = None                                                            │
│  Enterprise = None                                                        │
│                                                                            │
│  DOORWAY:                                                                 │
│  Same typed architecture                                                 │
│  + Persistent memory                                                     │
│  + Enterprise governance                                                 │
│  + Cross-model orchestration                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## COMPARISON TABLE

```
╔═══════════════════════════════════════════════════════════════════════════════════════════════════════╗
║                                           FEATURE COMPARISON                                        ║
╠═══════════════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                                        ║
║  Feature                      │ Codex    │ Claude  │ Cursor  │ T3 Code │ Doorway                   ║
║  ─────────────────────────────┼──────────┼─────────┼─────────┼─────────┼─────────────              ║
║  Parallel threads              │ ✅       │ ⚠️      │ ⚠️      │ ⚠️      │ ✅✅✅                      ║
║  Worktree isolation           │ ✅       │ ✅      │ ❌      │ ✅      │ ✅✅✅                      ║
║  Computer use                  │ ✅       │ ❌      │ ❌      │ ❌      │ ✅ + EVIDENCE              ║
║  ─────────────────────────────┼──────────┼─────────┼─────────┼─────────┼─────────────              ║
║  Memory system                 │ ⚠️       │ ❌      │ ⚠️      │ ❌      │ ✅✅✅                      ║
║  Pattern learning             │ ❌       │ ❌      │ ❌      │ ❌      │ ✅✅✅                      ║
║  Self-evolution               │ ❌       │ ❌      │ ❌      │ ❌      │ ✅✅✅                      ║
║  ─────────────────────────────┼──────────┼─────────┼─────────┼─────────┼─────────────              ║
║  Cross-model orchestration    │ ❌       │ ❌      │ ❌      │ ❌      │ ✅✅✅                      ║
║  Claude integration            │ ❌       │ ✅      │ ⚠️      │ ❌      │ ✅✅✅                      ║
║  Codex integration            │ ✅       │ ❌      │ ❌      │ ❌      │ ✅✅✅                      ║
║  Cursor integration           │ ❌       │ ❌      │ ✅      │ ❌      │ ✅✅✅                      ║
║  ─────────────────────────────┼──────────┼─────────┼─────────┼─────────┼─────────────              ║
║  Visible process tree          │ ❌       │ ⚠️      │ ❌      │ ⚠️      │ ✅✅✅                      ║
║  Exit code taxonomy           │ ❌       │ ❌      │ ❌      │ ❌      │ ✅✅✅                      ║
║  File delta tracking          │ ⚠️       │ ⚠️      │ ❌      │ ⚠️      │ ✅✅✅                      ║
║  ─────────────────────────────┼──────────┼─────────┼─────────┼─────────┼─────────────              ║
║  Enterprise governance         │ ⚠️       │ ❌      │ ❌      │ ❌      │ ✅✅✅                      ║
║  Audit trail                  │ ⚠️       │ ❌      │ ❌      │ ❌      │ ✅✅✅                      ║
║  RBAC                         │ ❌       │ ❌      │ ❌      │ ❌      │ ✅✅✅                      ║
║  EU AI Act compliance         │ ❌       │ ❌      │ ❌      │ ❌      │ ✅✅✅                      ║
║  ─────────────────────────────┼──────────┼─────────┼─────────┼─────────┼─────────────              ║
║  Open source                  │ ❌       │ ❌      │ ❌      │ ⚠️      │ ✅✅✅                      ║
║  Session replay               │ ⚠️       │ ⚠️      │ ❌      │ ❌      │ ✅✅✅                      ║
║  Auto-retry detection         │ ❌       │ ❌      │ ❌      │ ❌      │ ✅✅✅                      ║
║                                                                                                        ║
║  LEGEND: ✅ Full │ ⚠️ Partial │ ❌ None                                                                ║
║                                                                                                        ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════════════╝
```

---

## THE GAP MAP

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    WHERE NO ONE WINS (THE OPPORTUNITY)                     │
└────────────────────────────────────────────────────────────────────────────┘

                    Memory │ Cross-Model │ Visibility │ Enterprise │ Evolution
                    ───────┼─────────────┼────────────┼────────────┼──────────
Codex Desktop         ⚠️    │     ❌       │     ❌     │     ⚠️     │    ❌
Claude Code           ❌    │     ❌       │     ⚠️     │     ❌     │    ❌
Cursor                ⚠️    │     ❌       │     ❌     │     ❌     │    ❌
T3 Code               ❌    │     ❌       │     ⚠️     │     ❌     │    ❌
                    ───────┼─────────────┼────────────┼────────────┼──────────
DOORWAY               ✅    │     ✅       │     ✅     │     ✅     │    ✅

LEGEND: ✅ Full │ ⚠️ Partial │ ❌ None

THE OPPORTUNITY: Doorway is the ONLY tool addressing ALL gaps.
```

---

## THE BOTTOM LINE

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   CODEX = OpenAI's vision (parallel + worktrees + computer use)             ║
║   CLAUDE CODE = Best single agent (powerful but forgets)                   ║
║   CURSOR = Best IDE integration (inline but ephemeral)                    ║
║   T3 CODE = Type-safe architecture (excellent but new)                     ║
║                                                                              ║
║   DOORWAY = The harness that orchestrates ALL of them.                      ║
║                                                                              ║
║   THE KEY WIN: Cross-model orchestration + Persistent memory + Enterprise   ║
║                                                                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```
