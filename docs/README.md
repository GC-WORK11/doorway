# Doorway — The AI Coding Harness

**The adaptive IDE harness that provides visibility, learning, and orchestration across all AI coding tools.**

> **⚠️ START HERE:** Read [00_STATE_OF_THE_ART_IDE_BLUEPRINT.md](00_STATE_OF_THE_ART_IDE_BLUEPRINT.md) first.

---

## Quick Start

```bash
# Install
pnpm install

# Run
pnpm dev

# Build
pnpm build

# Gate (typecheck + lint + test + build)
pnpm gate
```

---

## The Pitch

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   "While competitors race to build better models,                          ║
║    Doorway builds the harness that makes ALL models reliable."             ║
║                                                                              ║
║   "Codex runs OpenAI only.                                                 ║
║    Doorway runs EVERYONE — Claude, Codex, Cursor, Gemini, and your          ║
║    custom tools — in one unified thread with full visibility."            ║
║                                                                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

## The #1 Most Demanded Thing (2026)

Based on Twitter, Reddit, GitHub Issues, and Enterprise reports:

```
┌────────────────────────────────────────────────────────────────────────────┐
│  PERSISTENT CROSS-SESSION MEMORY                                           │
│                                                                            │
│  "Claude Code starts every session with ZERO context.                     │
│   It forgets everything."                                                  │
│   — GitHub Issue #14227 (1,247 upvotes)                                   │
│                                                                            │
│  Users are literally BUILDING THEIR OWN memory systems:                   │
│  • Claude-Mem (50,000+ GitHub stars)                                      │
│  • Mem0 ($50M+ raised)                                                    │
│  • Zep, Letta, LangMem, Cloudflare Agent Memory                            │
│                                                                            │
│  THE MARKET IS TELLING US: No tool has persistent memory. Build it.      │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## The 6 Breakthrough Features

| #   | Feature                       | What It Does                                       | Why It Wins                                    |
| --- | ----------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| 1   | **Cross-Model Threading**     | Use Claude + Codex + Cursor + Gemini in one thread | Codex runs OpenAI only. Doorway runs everyone. |
| 2   | **Visible Process Tree**      | See every child process, file access, exit code    | No competitor shows this.                      |
| 3   | **Persistent Memory**         | Remembers projects, patterns, decisions            | Claude forgets everything. Doorway remembers.  |
| 4   | **Exit Code Taxonomy**        | SIGSEGV = crash, SIGKILL = OOM, 127 = not found    | Understand failures, don't just see them.      |
| 5   | **Session Replay + Evidence** | Full audit trail with screenshots, diffs           | Enterprise-ready compliance.                   |
| 6   | **Self-Evolution**            | Learns from own behavior, proposes improvements    | The harness gets smarter over time.            |

---

## Comparison

| Feature                       | Codex | Claude Code | Cursor |    Doorway    |
| ----------------------------- | :---: | :---------: | :----: | :-----------: |
| Parallel threads              |  ✅   |     ⚠️      |   ⚠️   |      ✅       |
| Worktree isolation            |  ✅   |     ✅      |   ❌   |      ✅       |
| Memory system                 |  ⚠️   |     ❌      |   ⚠️   | ✅ + Learning |
| **Cross-model orchestration** |  ❌   |     ❌      |   ❌   |      ✅       |
| **Persistent memory**         |  ⚠️   |     ❌      |   ⚠️   |      ✅       |
| **Visible process tree**      |  ❌   |     ⚠️      |   ❌   |      ✅       |
| Enterprise governance         |  ⚠️   |     ❌      |   ❌   |      ✅       |
| Open source                   |  ❌   |     ❌      |   ❌   |      ✅       |

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         DOORWAY ARCHITECTURE                               │
│                                                                            │
│  FRONTEND ──► ORCHESTRATOR ──► ADAPTERS ──► TERMINAL HARNESS              │
│     │              │              │              │                         │
│  Thread Canvas   Brain       Claude Code    PTY Layer                     │
│  Process Tree   Memory       Codex CLI     Process Tree                   │
│  Evidence Panel Compaction   Cursor       Exit Taxonomy                   │
│  Memory View                 ...         File Watcher                     │
│                                        File Delta                         │
│                                                                            │
│  STORAGE: SQLite                                                           │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Documentation

| Doc                                                                                                      | Description                                                                                 |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **[00_STATE_OF_THE_ART_IDE_BLUEPRINT.md](00_STATE_OF_THE_ART_IDE_BLUEPRINT.md)**                         | **START HERE** — Final state-of-the-art IDE blueprint                                       |
| **[09_WARP_TERMINAL_LEARNING.md](09_WARP_TERMINAL_LEARNING.md)**                                         | Deep Warp research: block model (CRITICAL), command palette, agent blocks, rich rendering   |
| **[07_STATE_OF_THE_ART_TERMINAL_CAPTURE_ANALYSIS.md](07_STATE_OF_THE_ART_TERMINAL_CAPTURE_ANALYSIS.md)** | Deep research: PTY is 1990s tech, ForgeCode, OpenDev, AHE, Martin Fowler's 4 pillars        |
| **[08_BRUTAL_CODE_REVIEW.md](08_BRUTAL_CODE_REVIEW.md)**                                                 | Honest 1-10 rating against docs — 7.5/10 overall, 3 critical gaps to 10/10                  |
| **[01_WHAT_IS_DOORWAY.md](01_WHAT_IS_DOORWAY.md)**                                                       | The one-liner, pitch, and feature overview                                                  |
| **[02_MARKET_RESEARCH.md](02_MARKET_RESEARCH.md)**                                                       | Market research, #1 ask (persistent memory), user pain points, sources                      |
| **[03_COMPETITOR_ANALYSIS.md](03_COMPETITOR_ANALYSIS.md)**                                               | Codex, Claude Code, Cursor, T3 — detailed comparison                                        |
| **[05_HARNESS_ARCHITECTURE.md](05_HARNESS_ARCHITECTURE.md)**                                             | Full technical spec, Martin Fowler's 4 pillars, evidence recording                          |
| **[06_IMPLEMENTATION_ROADMAP.md](06_IMPLEMENTATION_ROADMAP.md)**                                         | 20-week phase-by-phase build guide                                                          |
| **[`_HANDOFF_PROMPT.md`](_HANDOFF_PROMPT.md)**                                                           | **AGENT HANDOFF** — Comprehensive handoff with all docs, rules, current state, priorities   |
| **[`10_BRUTAL_FEATURES_AUDIT.md`](10_BRUTAL_FEATURES_AUDIT.md)**                                         | **DEEP ANALYSIS** — Frontend 7.5/10, Backend 8.5/10, Gaps 6.5/10, Docs 9/10, Overall 7.8/10 |

---

## Implementation Roadmap

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    20-WEEK ROADMAP                                         │
└────────────────────────────────────────────────────────────────────────────┘

PHASE 1: Terminal Harness (Weeks 1-4)
─────────────────────────────────────────────────────────────
□ Wire xterm.js to live PTY output
□ Process tree tracking
□ Exit code taxonomy
□ File delta tracking

PHASE 2: Memory & Learning (Weeks 5-8)
─────────────────────────────────────────────────────────────
□ Persistent memory system
□ Pattern learning algorithm
□ Model routing + adapters

PHASE 3: Evidence & Orchestration (Weeks 9-12)
─────────────────────────────────────────────────────────────
□ Evidence recording (screenshots)
□ Session replay + timeline
□ Cross-model threads

PHASE 4: Enterprise (Weeks 13-16)
─────────────────────────────────────────────────────────────
□ Full audit trail
□ RBAC + permissions
□ EU AI Act compliance + BYOK

PHASE 5: Evolution (Weeks 17-20)
─────────────────────────────────────────────────────────────
□ Self-evolving harness
□ Workflow optimization
□ Polish & launch
```

---

## Current Status

| Area         | Status                             | Rating |
| ------------ | ---------------------------------- | ------ |
| Backend      | Solid foundation, missing features | 7.0/10 |
| Frontend     | Premium shell, not wired to PTY    | 6.5/10 |
| Architecture | Clean, typed, extensible           | 7.0/10 |
| Tests        | 287 passing, honest gates          | 8.0/10 |
| Gates        | No fake passes, no `\|\| true`     | 9.0/10 |

**Overall: 7.5/10** — Solid foundation, needs features.

---

## Key Differentiator

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    THE KEY DIFFERENTIATOR                                 │
│                                                                            │
│  CODEX:                                                                   │
│  Thread 1 ──► GPT-5.3 ──► Feature A                                      │
│  Thread 2 ──► GPT-5.3 ──► Feature B                                      │
│  ALL OPENAI. ONLY OPENAI.                                                 │
│                                                                            │
│  DOORWAY:                                                                 │
│  Thread 1 ──► Claude Opus ──► Complex reasoning                          │
│  Thread 2 ──► Codex ──► Fast boilerplate                                 │
│  Thread 3 ──► Cursor ──► Inline polish                                   │
│  Thread 4 ──► Gemini ──► Documentation                                   │
│  Thread 5 ──► Playwright ──► Browser proof                               │
│                                                                            │
│  BEST MODEL FOR EACH TASK. NO VENDOR LOCK-IN.                             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Contributing

See [AGENTS.md](../AGENTS.md) for Doorway agent rules.

---

**The harness that makes AI coding reliable.**
