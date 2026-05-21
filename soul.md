# DOORWAY — SENIOR PRINCIPAL CTO SOUL (MASTER)

*Authoritative strategic document. Every architectural decision traces back to this.*
*Version: 2.0 — Updated May 2026*

---

## I. IDENTITY

**Doorway is NOT:**
- A chat UI
- A Claude Code wrapper
- A fake dashboard
- An SDK wrapper (like T3 or Conductor that charges API billing)
- PTY-based (that's 1990s tech)

**Doorway IS:**
A **state-of-the-art terminal harness** that runs real CLI tools in real terminals, with self-evolving orchestration, cross-model threading, and a unified chat output — no SDK subscription lock-in.

**The one-liner:** *"Other tools charge you API billing for using their harness. Doorway runs CLI tools like a human — no subscription required."*

**Core truth:** Models commoditize. Harnesses compound.

---

## II. THE 5 NON-NEGOTIABLES

1. **NO FAKE PRODUCTION STATE** — Real terminals, real output, real evidence
2. **NO HIDDEN FAILURES** — No `|| true`, no swallowed errors
3. **REAL TERMINAL CONTROL** — Not PTY. Not SDK. A layered harness that captures, watches, detects faults, and relaunches autonomously
4. **EVIDENCE-BACKED UI** — Every claim needs backend proof or honest unknown
5. **LAYER DISCIPLINE** — UI never invents backend state

---

## III. FEATURE 1: STATE-OF-THE-ART TERMINAL HARNESS (THE MAIN ONE)

### The Core Innovation
Doorway does NOT use:
- PTY (1990s tech — just byte streams)
- SDK/API wrappers (like T3 Code, Conductor — they charge API billing per prompt)
- ConPTY, node-pty raw wrappers

Doorway uses a **layered terminal harness** that treats the terminal like a human would:

```
┌─────────────────────────────────────────────────────────────────┐
│              STATE-OF-THE-ART TERMINAL HARNESS                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CAPTURE     → Capture EVERYTHING: stdout, stderr, ANSI codes   │
│  WATCH       → Watch processes: what spawned, CPU/memory, tree  │
│  FAULT-DETECT→ Detect failures: signals, exit codes, crashes    │
│  AUTO-RELAUNCH→ If prompt fails or terminal dies, relaunch    │
│  PROGRESS    → Track real-time progress of long operations     │
│  VERIFY      → Confirm changes with diff evidence              │
│                                                                 │
│  CROSS-OS    → Works identically on macOS, Linux, Windows      │
└─────────────────────────────────────────────────────────────────┘
```

### What This Enables

**Scenario A: Prompt fails mid-way**
- Claude is running a refactor
- Terminal dies or command fails
- Doorway harness detects failure via exit code taxonomy
- Automatically relaunches Claude with the same context
- User sees: "Restarted Claude — continuing refactor"

**Scenario B: One model finishes, another is still running**
- Codex finishes implementing feature, shows beautiful diff
- Claude is still running (asked a clarifying question in terminal)
- Doorway frontend shows: "Codex finished ✓ — 3 files changed"
- When Claude asks question, Doorway surfaces it in chat: "Claude needs input..."
- User answers in Doorway chat → Doorway reprompts Claude in its terminal

**Scenario C: User delegates to @claude @codex simultaneously**
- User says "@claude @codex build the auth system"
- Doorway Brain (orchestrator) splits the task
- Claude gets: complex reasoning + security review
- Codex gets: fast boilerplate + implementation
- Both run in separate terminal sessions (isolated worktrees)
- Doorway unifies output into ONE beautiful chat thread

### Competitive Gap This Fills

| Competitor | Approach | Problem |
|---|---|---|
| T3 Code | SDK wrapper | Charges API billing per prompt |
| Conductor | SDK wrapper | Charges API billing per prompt |
| Raw PTY | Byte streams | No intelligence, no fault detection |
| ConPTY | Windows-specific | Not cross-platform |

**Doorway's advantage:** Runs the actual CLI binaries (claude, codex, cursor) like a human would. No API billing. No subscription. Just works.

---

## IV. FEATURE 2: SELF-ADAPTING HARNESS

### The Core Innovation
Current IDEs are static. Doorway adapts to YOU.

**What this means:**

```
STATIC IDE                    →  ADAPTIVE DOORWAY
─────────────────────────────→─────────────────────────────
Hardcoded shortcuts           →  Learns YOUR shortcuts
Fixed theme                  →  Adapts to YOUR eyes
Static context window        →  Auto-compacts to YOUR usage
Fixed model preferences      →  Learns which model YOU prefer
Manual thread management     →  Doorway creates/merges threads
No automation                →  Doorway suggests automations
```

**Scenario: User says "I'm going out, put yourself in auto-compact mode"**
- Doorway switches to aggressive context compaction
- Shorter summaries, fewer intermediate steps shown
- Lower memory footprint
- When user returns, Doorway resumes full mode

**Scenario: Pi-Agent-Style Adaptation**
- Doorway notices user runs `pnpm test` 90% of the time after `pnpm build`
- Suggests: "Run build+test as automation?"
- Learns from acceptance/rejection
- Eventually auto-runs if user approves

---

## V. FEATURE 3: UNIFIED CROSS-MODEL THREADING

### The Core Innovation
No matter how many terminals/models are running, Doorway shows ONE unified chat.

**The mental model:**

```
User sees (beautiful unified chat):
──────────────────────────────────────────
[Doorway Chat]

@claude @codex build the auth system

──────────────────────────────────────────
Claude: Thinking about security implications...
Codex: Starting boilerplate generation...
──────────────────────────────────────────
Codex: ✓ Done — 3 files changed
  + src/auth/login.ts
  + src/auth/logout.ts  
  + src/auth/middleware.ts
──────────────────────────────────────────
Claude: Should I use JWT or session-based auth?
  [User answers in chat]
Claude: Implementing JWT auth...
──────────────────────────────────────────
```

**What happens behind the scenes:**

```
┌─────────────────────────────────────────────────────────────────┐
│                      DOORWAY BRAIN                              │
│                                                                 │
│  User prompt: "@claude @codex build auth"                      │
│                                                                 │
│  ┌─────────────┐     ┌─────────────┐                          │
│  │ Claude Lane │     │ Codex Lane   │                          │
│  │ Terminal A  │     │ Terminal B   │                          │
│  │ Worktree A  │     │ Worktree B  │                          │
│  └─────────────┘     └─────────────┘                          │
│         ↓                   ↓                                  │
│  Brain prepends smart delegation prompt to each terminal:      │
│                                                                 │
│  Claude gets: "You are Doorway-Claude. The user wants auth.   │
│                Focus on security review + complex decisions."    │
│                                                                 │
│  Codex gets: "You are Doorway-Codex. The user wants auth.     │
│                Focus on fast boilerplate + implementation."     │
└─────────────────────────────────────────────────────────────────┘
```

**The key:** Doorway's Brain is the orchestrator — it doesn't use SDK calls. It generates smart delegation prompts that it sends to the actual CLI binaries in real terminal sessions.

---

## VI. FEATURE 4: PEER-TO-PEER SUBAGENT ORCHESTRATION

### The Core Innovation
Subagents don't just run in isolation. They collaborate like real coworkers.

**What this means:**

```
TRADITIONAL SUBAGENTS              →  DOORWAY PEER ORCHESTRATION
─────────────────────────────────→─────────────────────────────────
Agent A runs task                   →  Agent A runs, Agent B watches
Agent B runs task                   →  Agent B comments, Agent A adjusts
No inter-agent communication        →  Agents share context via Doorway
User manages all agents manually    →  Doorway orchestrates automatically
Agents don't know about each other  →  Agents are aware, collaborate
```

**Scenario: Real Coworker Dynamics**
- Doorway launches Claude (senior dev) and Codex (junior dev)
- Claude is implementing architecture
- Codex is doing boilerplate
- Claude notices Codex is using an outdated pattern
- Claude sends a peer message: "Hey Codex, use the new util fn instead"
- Codex adjusts its approach
- User sees this as inline collaboration in the chat

**Scenario: Authority to Modify System Config**
- Agents can request Doorway to modify `.claude.md`, `.cursorrules`, etc.
- Doorway surfaces request to user: "Claude wants to update project rules"
- User approves/rejects
- If approved, Doorway updates the file and notifies all agents

---

## VII. FEATURE 5: PLUGIN ECOSYSTEM (Codex-Style)

### The Core Innovation
Codex has 300+ plugins. Doorway needs its own plugin infrastructure.

**Plugin Types:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    DOORWAY PLUGIN TYPES                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CONNECTOR PLUGINS (OAuth-based)                               │
│  ─────────────────────────────────                             │
│  Gmail, Slack, Linear, GitHub, Figma, Jira, Notion...         │
│  → User connects via OAuth                                     │
│  → Plugin can read/write with user permission                  │
│  → Every action creates EvidenceRef                            │
│                                                                 │
│  SKILL PLUGINS (Terminal-based)                               │
│  ──────────────────────────────────                            │
│  Browser automation, file operations, git ops, CI triggers...  │
│  → Run as terminal commands                                    │
│  → No OAuth needed                                             │
│                                                                 │
│  MCP SERVER PLUGINS                                           │
│  ────────────────────────                                      │
│  Model Context Protocol servers                                │
│  → Extend tool registry dynamically                           │
│  → Typed, discoverable                                        │
└─────────────────────────────────────────────────────────────────┘
```

**From Codex Desktop Learnings:**
- Plugins are why users don't leave Codex
- Plugin ecosystem = lock-in via habit
- Doorway must build BEFORE competitors copy our harness

---

## VIII. FEATURE 6: SLASH COMMAND SYSTEM

### The Core Innovation
Claude has 38+ slash commands. Doorway needs them too — but smarter.

**Required Slash Commands:**

```
┌─────────────────────────────────────────────────────────────────┐
│                  DOORWAY SLASH COMMANDS                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CORE COMMANDS                                                 │
│  ───────────────                                                │
│  /model [name]       → Switch model (claude/codex/gemini)    │
│  /thread [name]      → Switch/create thread                    │
│  /compact            → Force context compaction                │
│  /goal [description] → Set session goal                        │
│  /loop               → Enable continuous loop mode             │
│  /continue           → Continue last task                      │
│  /pause              → Pause current task                      │
│  /status             → Show all running agents + progress       │
│                                                                 │
│  AGENT COMMANDS                                                 │
│  ──────────────                                                  │
│  /claude [prompt]   → Launch Claude agent                     │
│  /codex [prompt]    → Launch Codex agent                      │
│  /browser [url]      → Open browser automation                │
│  /computer           → Enable computer use mode                │
│                                                                 │
│  WORKFLOW COMMANDS                                              │
│  ─────────────────                                              │
│  /automation new     → Create new automation                    │
│  /automation list   → List saved automations                   │
│  /schedule [cron]   → Schedule automation                      │
│                                                                 │
│  SYSTEM COMMANDS                                                │
│  ────────────────                                              │
│  /login             → Authenticate services                    │
│  /logout            → Clear credentials                        │
│  /plugins           → Manage plugins                          │
│  /config            → Edit Doorway config                      │
│  /help              → Show all commands                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## IX. FEATURE 7: AUTOMATION + SCHEDULING

### The Core Innovation
Doorway learns from your workflows and can automate them.

**Scenario: Morning PR Review**
```
User: "Before I sleep, schedule PR check + GitHub Actions review for 8am"

Doorway creates automation:
  Trigger: 8:00 AM daily
  Steps:
    1. gh pr list --review-requested
    2. For each PR: run tests via GitHub Actions API
    3. Compile results into report
    4. Send to user via Slack/Email
    
Output at 8am:
  ┌─────────────────────────────────────────┐
  │ DOORWAY MORNING REPORT — May 22, 2026   │
  │                                         │
  │ 3 PRs need your review                 │
  │ ✓ PR #142: Tests pass, approved        │
  │ ⚠ PR #143: Tests failing, 2 comments   │
  │ ○ PR #144: Awaiting CI                 │
  │                                         │
  │ GitHub Actions: 2 failing builds        │
  └─────────────────────────────────────────┘
```

**From AI Workflow Automation (Zapier, Make, n8n):**
- Doorway doesn't need to be as generic
- Doorway is specifically for CODING workflows
- The harness understands code, terminals, git, tests

---

## X. FEATURE 8: RAYCAST/LINEAR/VERCEL-LEVEL UI

### The Core Innovation
The frontend must be indistinguishable from top-tier indie SaaS.

**Reference Designs to Match:**
- Raycast (command palette, minimal, fast)
- Linear (dark, sharp, purposeful)
- Vercel (clean, lots of whitespace)
- Cursor (IDE-aware, integrated)
- Conductor (clean, dashboard-style)

**Key UI Principles:**
```
1. DARK MODE DEFAULT — Not optional
2. JETBRAINS MONO — For terminal/code
3. SUB-millisecond ANIMATIONS — 60fps or nothing
4. GLASS MORPHISM — Subtle, not gaudy
5. MINIMAL CHROME — Content is king
6. FLOATING PANELS — Not modal hell
7. COMMAND PALETTE — Everything accessible via keyboard
```

---

## XI. FEATURE 9: TECHNICAL PILLARS (Platform Features)

### The Atomic Platform Features

```
┌─────────────────────────────────────────────────────────────────┐
│                    DOORWAY PLATFORM ATOMS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PROJECTS           → Real local repos with memory              │
│  THREADS            → Persistent goal sessions                  │
│  TERMINALS          → Live PTY-like sessions (state-of-art)    │
│  WORKTREES          → Isolated git workspaces                  │
│  AGENT LANES        → Per-model terminal + status               │
│  EVIDENCE           → Screenshots, diffs, test proofs          │
│  MEMORY             → Project patterns, user preferences        │
│  AUTOMATIONS        → Learned + scheduled workflows             │
│  CONNECTORS         → OAuth integrations                        │
│  PLUGINS            → MCP servers, skill packs                 │
│  SLASH COMMANDS     → First-class UX for CLI features           │
│                                                                 │
│  PROJECTIONS        → Typed state for every UI element          │
│  FLIGHT RECORDER    → Tamper-evident audit trail                │
│  EXIT TAXONOMY      → SIGSEGV, SIGKILL, exit codes explained   │
│  AUTO-COMPACTOR     → Context window management at 80%          │
└─────────────────────────────────────────────────────────────────┘
```

---

## XII. CURRENT REALITY (Honest CTO Assessment)

### Scores by Layer

| Layer                  | Score  | Trend |
|-----------------------|--------|-------|
| Terminal Runtime      | 7.5/10 | ↑     |
| Core/Database         | 8.5/10 | —     |
| Orchestrator (Brain)  | 8.5/10 | ↑↑    |
| Adapters              | 6/10   | —     |
| Git Engine            | 7.5/10 | —     |
| Desktop Main          | 8.5/10 | ↑     |
| Desktop Renderer      | 8/10   | ↑     |
| Review-Merge         | 6.5/10 | —     |
| Handoff-Capsule       | 7/10   | —     |
| Build/Gates           | 9.5/10 | ↑↑    |
| **OVERALL**           | **8/10**|       |

### What's Working

- ✅ Exit code taxonomy (SIGSEGV, SIGKILL, SIGABRT, 0-127) — EXCELLENT
- ✅ AUTO-COMPACTION at 80% context — fully integrated
- ✅ 328 tests passing, zero dead exports
- ✅ Typed protocol package — ThreadId, TerminalSessionId branded/unique
- ✅ Hash-chained FlightRecorderService — tamper-evident
- ✅ Worktree isolation per run
- ✅ Best-of-N parallel execution (N=2 cap)
- ✅ Evidence panels: ProcessTreePanel, ExitTaxonomyPanel, FileDeltaPanel

### Critical Gaps (Must Fix for Feature 1)

1. **xterm.js NOT streaming live PTY** — Full reload on every transcript change. Must become append-by-sequence streaming via WebSocket or streaming IPC.
2. **No real fault detection + auto-relaunch** — Harness must detect terminal death and relaunch automatically
3. **No process tree visibility in UI** — User can't see Claude vs Codex terminals separately
4. **Cursor/Gemini adapters missing** — Universal harness promise incomplete
5. **File delta is periodic snapshots** — Not inotify/fs.watch real-time

### What Needs Rebuilding for Feature 1

The terminal harness layer needs to be rebuilt as state-of-the-art, not PTY-based:

```
CURRENT (PTY-based):           TARGET (State-of-the-art):
──────────────────────         ──────────────────────────
terminal.reset()               append-by-sequence streaming
Full transcript reload         Incremental delta updates
No fault detection             Exit code taxonomy + auto-relaunch
No process visibility          Full process tree with signals
No cross-OS abstraction       Unified API across macOS/Linux/Win
```

---

## XIII. COMPETITIVE POSITIONING

### Who We Beat and Why

| Competitor | Weakness We Exploit |
|---|---|
| **T3 Code / Conductor** | They charge API billing. We run CLIs like humans — no subscription |
| **Codex Desktop** | OpenAI only. We run everyone |
| **Claude Code** | Forgets everything. We remember |
| **Cursor** | No real terminal harness. We have PTY-layer done right |
| **Warp** | No worktree isolation, no cross-model threading |
| **Sentry/Doghog** | Observability only. We also act |

### The One Chart That Matters

```
DOORWAY WINS IF:
✓ We run CLIs like humans (no API billing like T3/Conductor)
✓ We have state-of-the-art terminal harness (not PTY)
✓ We remember everything (not like Claude that forgets)
✓ We run everyone (not like Codex that's OpenAI-only)

DOORWAY LOSES IF:
✗ We ship fake production UI
✗ We use PTY instead of layered harness
✗ We charge API subscription like competitors
✗ We become another chat wrapper
```

---

## XIV. DEFINITION OF DONE

Every feature is NOT complete until:

```
[ ] Code compiles
[ ] Typecheck passes
[ ] Tests pass (or failing reason is honest)
[ ] Lint passes
[ ] No fake production state introduced
[ ] No unused/dead files introduced
[ ] No hidden build/test failures
[ ] UI states are real: loading/empty/error/success
[ ] Errors are user-visible where relevant
[ ] Critical actions are evidence-backed
[ ] New behavior has tests
[ ] Docs updated if architecture changed
```

---

## XV. PRODUCT ATOMS

| Atom | Definition |
|------|------------|
| **Project** | Real local repo/folder: path, mode, package manager, memory sources |
| **Thread** | Persistent user goal: messages, events, lanes, terminals, worktrees, evidence, checkpoints |
| **Lane** | Visible worker: Claude lane, Codex lane, tester lane — status, terminal, worktree, activity |
| **Terminal Session** | Real terminal harness: session id, cwd, pid, input/output, exit code/signal, status, fault detection, auto-relaunch |
| **Worktree** | Isolated git workspace: branch, path, cleanliness, diff, merge safety |
| **EvidenceRef** | Proof backing a claim: terminal chunk, diff, test result, screenshot, permission receipt |
| **Memory** | Stored operational knowledge: project, session, pattern, user preference, cross-project |
| **Automation** | Saved repeated workflow: trigger, steps, tools, commands, approvals, risk level, schedule |

---

## XVI. EVIDENCE TAXONOMY

Every user-facing claim requires evidence:

```
terminal_chunk     — raw output from terminal
terminal_input     — user keyboard input
diff              — git diff of file changes
test_result       — test runner output with pass/fail
browser_screenshot — visual proof of UI state
browser_action     — clicks, navigation, interactions
permission_receipt — user approved/dismissed a permission request
connector_context  — data fetched from external service
automation_pattern — repeated workflow pattern detected
peer_message      — inter-agent communication
fault_event       — terminal death, signal, crash detection
relaunch_event    — automatic recovery from failure
```

---

## XVII. KARPATHY PRINCIPLES (Embedded in DNA)

### 1. Think Before Coding
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them.

### 2. Simplicity First
- No features beyond what was asked.
- If 200 lines could be 50, rewrite it.

### 3. Surgical Changes
- Touch only what you must. Don't "improve" adjacent code.

### 4. Goal-Driven Execution
- Define success criteria before starting.
- Loop until verified.

---

## XVIII. MAGIC TRUTHS

```
1. "Models commoditize. Harnesses compound."
2. "PTY is 1990s tech. The breakthrough is the layered harness on top."
3. "ForgeCode scored 81.8% on Terminal-Bench 2.0. Claude Code scored ~75-77%. Harness wins."
4. "The #1 most demanded thing in 2026 is persistent cross-session memory."
5. "T3/Conductor charge API billing. Doorway runs CLIs like humans — no subscription."
6. "Evidence-backed UI or honest unknown state. No in-between."
```

---

*Last updated: May 21, 2026*
*Version: 2.0*
*Status: MASTER STRATEGIC DOCUMENT — All decisions trace back here*
