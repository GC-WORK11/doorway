# DOORWAY - The Agentic Development Harness

**Terminal-native AI coding harness that feels like warp, thinks like pi, and orchestrates like a symphony.**

---

## THE VISION

Doorway is NOT another AI IDE wrapper. It's a **terminal-native harness** that:

- Controls CLI tools (Claude Code, Codex CLI) like a human would
- Handles failures automatically (retry, re-launch, re-prompt)
- Unifies multiple agents into one beautiful thread
- Adapts to YOUR project, not hardcoded rules
- Runs automation while you sleep

**No SDK billing traps. No forced subscriptions. Pure terminal control.**

---

## THE 9 FEATURES

### 1. TERMINAL HARNESS (Primary) — State of the Art

**What It Is:**
Doorway doesn't use SDK/programmatic API calls. It **controls the actual CLI** running in a real terminal.

**Why This Matters:**

- Anthropic/OpenAI charge API billing for SDK/programmatic access
- CLI mode is FREE (uses your existing subscription)
- Terminal control is the HARD problem — solved here

**Cross-Platform Terminal Control:**

- Mac: Native zsh/bash/fish control
- Windows: WSL2 integration + native PowerShell
- Linux: Full PTY + tmux/screen support

**Capabilities:**
| Feature | Status | Implementation |
|---------|--------|----------------|
| Real PTY | ✅ | node-pty cross-platform |
| Session Management | ✅ | Full transcript capture |
| Process Tracking | ✅ | Tree capture, kill, restart |
| File Deltas | ✅ | Git diff watching |
| Exit Taxonomy | ✅ | Crash/OOM/panic/timeout detection |
| Streaming IPC | ✅ | WebSocket push to renderer |
| Fault Detection | 🔨 | Crash/OOM/panic → auto-retry |
| Block Model | 🔨 | Warp-style command blocks |
| Human-like Control | 🔨 | Delegation prompts, follow-up |

---

### 2. SELF-ADAPTING IDE — Learns Your Project

**What It Is:**
Doorway adapts to YOUR project structure, conventions, and patterns. Not hardcoded.

**Adaptation Triggers:**

```
adapt_ui     → Resize panels, change layout
adjust_compaction → Change context strategy
change_model → Switch Claude Sonnet → Opus
retry_task   → Re-run with different approach
```

**User Can Say:**

```
"/compact 60%"       → Set compaction threshold
"/autopilot on"       → Enable smart automation
"/adapt now"          → Re-analyze project
```

---

### 3. UNIFIED THREAD — One Chat, Multiple Agents

**What It Is:**
Claude, Codex, and custom agents work TOGETHER in ONE thread.

**How It Works:**

```
User: @claude @codex implement auth

Doorway Brain (Orchestrator):
  → Claude: "Implement JWT auth in backend/"
  → Codex: "Create React login form/"
  → Both run in PARALLEL terminals
  → Doorway unifies output into ONE thread
```

---

### 4. ORCHESTRATED SUBAGENTS — Peer-to-Peer Coworkers

**What It Is:**
Agents don't just run — they **coordinate like real coworkers**.

**Features:**
| Feature | Status |
|---------|--------|
| Best-of-N | ✅ |
| Parallel Launch | ✅ |
| Retry Logic | ✅ |
| Peer Communication | 🔨 |
| Config Override | 🔨 |

---

### 5. PLUGIN ECOSYSTEM — Like Codex (300+ Plugins)

**What It Is:**
Plugin marketplace with OAuth, MCP servers, skills, and panels.

**Plugin Manifest:**

```typescript
interface DoorwayPlugin {
  id: string;
  name: string;
  version: string;
  skills: Skill[];
  connectors: Connector[]; // OAuth/API/native
  mcpServers: MCPServer[];
  hooks: Hook[];
  panels: Panel[];
  permissions: Permission[];
}
```

---

### 6. SLASH COMMANDS — 40+ Like Claude

**Current Commands (10):**

```
/help, /compact, /goal, /model, /provider
/thread, /worktree, /merge, /plugin, /automation
```

**Needed Commands (30 more):**

```
/think, /continue, /loop, /pr-review, /test
/debug, /browser, /computer, /ssh, /docker
/git, /search, /refactor, /security, /performance
/migrate, /deploy, /monitor, /export, /import
/settings, /theme, /keyboard, /context, /tokens
/retry, /abort, /clear, /history, /screenshot
```

---

### 7. AUTOMATION — Schedule, Run, Report

**What It Is:**
AI-powered automation that runs while you sleep.

**Automation Types:**
| Type | Example | Detection |
|------|---------|-----------|
| Pipeline | `build && test && deploy` | Commands run together 3+ times |
| Scheduled | `pr check at 9am daily` | Time-based patterns |
| Preemptive | Block flaky command | 70%+ failure rate |
| Reactive | Run on file change | Git hook patterns |

---

### 8. UI AESTHETICS — Raycast/Linear/Vercel Style

**Design System:**

```css
--dw-bg-primary: #050607;
--dw-accent: #6366f1;
--font-sans: 'Geist', 'Inter', system-ui;
--font-mono: 'Geist Mono', monospace;
```

---

### 9. TECHNICAL PILLARS — The Foundation

**Package Architecture:**

```
doorway/
├── packages/
│   ├── terminal-runtime/     # Terminal control
│   ├── core/                 # Business logic
│   ├── orchestrator/         # Brain
│   ├── adapters/             # CLI adapters
│   ├── handoff-capsule/      # Handoff protocol
│   ├── git-engine/           # Git operations
│   ├── review-merge/         # PR review
│   └── protocol/              # Shared types
├── apps/
│   └── desktop/               # Electron app
```

---

## CURRENT SCORE: 6.5/10

| Feature                   | Score | Gap                             |
| ------------------------- | ----- | ------------------------------- |
| 1. Terminal Harness       | 7/10  | Streaming ✅, Fault recovery 🔨 |
| 2. Self-Adapting IDE      | 6/10  | Wired to UI 🔨                  |
| 3. Unified Thread         | 5/10  | Coordination 🔨                 |
| 4. Orchestrated Subagents | 6/10  | Peer comm 🔨                    |
| 5. Plugin Ecosystem       | 7/10  | Store/OAuth 🔨                  |
| 6. Slash Commands         | 5/10  | Need 30 more                    |
| 7. Automation             | 6/10  | Execution 🔨                    |
| 8. UI Aesthetics          | 5/10  | App.tsx split 🔨                |
| 9. Technical Pillars      | 8/10  | Solid foundation                |

---

## ROADMAP TO 10/10

### Week 1: Streaming + Fault Recovery

- [ ] Wire streaming IPC to renderer
- [ ] Add crash/OOM/panic detection
- [ ] Auto-retry on terminal failure
- [ ] Block model for terminal output

### Week 2: Self-Adaptation + UI

- [ ] Wire SelfAdaptationService to UI
- [ ] Add adaptation triggers to chat
- [ ] Split App.tsx (10 components)
- [ ] Add 10 more slash commands

### Week 3: Agent Coordination

- [ ] Peer-to-peer IPC between agents
- [ ] Handoff protocol improvements
- [ ] Config override for CLI
- [ ] Add 10 more slash commands

### Week 4: Plugin + Automation

- [ ] Plugin marketplace UI
- [ ] OAuth flow implementation
- [ ] Automation execution engine
- [ ] Add 10 more slash commands

---

## COMPETITION ANALYSIS

| Feature          | Warp | Cursor | Codex | Doorway |
| ---------------- | ---- | ------ | ----- | ------- |
| Terminal Control | ✅   | ❌     | ❌    | ✅      |
| Block Model      | ✅   | ❌     | ❌    | 🔨      |
| AI Agents        | ✅   | ✅     | ✅    | ✅      |
| Multi-Agent      | ❌   | ❌     | ✅    | ✅      |
| Slash Commands   | ✅   | ✅     | ✅    | 🔨      |
| Plugins          | ❌   | ✅     | ✅    | 🔨      |
| Automation       | ✅   | ❌     | ❌    | 🔨      |
| Self-Adapt       | ❌   | ❌     | ❌    | 🔨      |

**Doorway wins on**: Terminal control, multi-agent orchestration, self-adaptation, automation.

---

## PHILOSOPHY

> "The terminal is the only honest interface. SDKs lie. They promise control but take your billing. The CLI running in a real PTY — that's truth. That's what Doorway controls."

> "Doorway doesn't replace Claude or Codex. It orchestrates them like a conductor. One thread. Multiple agents. Unified output."

---

**Status: 6.5/10 → Building to 10/10**
