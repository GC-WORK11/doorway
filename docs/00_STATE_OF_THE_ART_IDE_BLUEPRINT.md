# STATE OF THE ART IDE BLUEPRINT

## Doorway: The Universal Agent Harness

This is the distilled source of truth from the Doorway research docs and conversation history.

Doorway is **not** another AI chat UI.
Doorway is **not** a prettier Claude Code wrapper.
Doorway is **not** a fake dashboard for mocked agents.

Doorway is the **local-first agent harness / command center** that makes AI coding tools visible, persistent, orchestratable, and enterprise-grade.

---

## 1. The 2026 Baseline Changed

Codex Desktop changed what users expect.

The new baseline is no longer:

```text
single chat → one agent → one answer
```

The new baseline is:

```text
one repo → many isolated agent threads → worktrees → terminal execution → reviewable diffs
```

Codex Desktop proved users want:

1. parallel agent threads
2. isolated worktrees
3. computer/browser use
4. persistent memory
5. plugins/connectors
6. automations
7. a polished desktop command center

So Doorway cannot win by being “Claude Code with a nicer UI.”

Doorway wins only if it becomes the layer above all tools.

---

## 2. The One-Line Product Definition

```text
Doorway is the universal harness for AI coding agents:
it runs Claude, Codex, Cursor, Gemini, and custom CLIs in real PTYs,
keeps persistent workflow memory,
shows exactly what happened,
and produces evidence-backed, reviewable outcomes.
```

Short pitch:

```text
Codex runs OpenAI agents.
Doorway runs everyone.
```

Better pitch:

```text
While competitors build better individual agents,
Doorway builds the harness that makes all agents reliable.
```

---

## 3. The Core Strategic Insight

Models commoditize.
Harnesses compound.

A model gets better when the vendor ships a new model.
A harness gets better every time the user works.

Doorway’s moat is not “better autocomplete.”
Doorway’s moat is accumulated operational intelligence:

- which tool works best for which task
- which commands verify this repo
- which errors repeat
- which files are risky
- which workflows recur
- which approvals are required
- what evidence proves completion
- what the user prefers

That is why persistent memory matters.
Not generic chat memory — **workflow memory**.

---

## 4. The Product Shape

Doorway should feel like a calm, premium cockpit for real agent work.

Required surfaces:

```text
Workspace Chrome
├── Project / Thread sidebar
├── Chat-first Thread Canvas
├── Composer Dock
├── Terminal Drawer
├── Worktree / Diff Drawer
├── Evidence Drawer
├── Browser Proof Drawer
├── Tools / Connectors Drawer
└── Memory / Automation Surface
```

But the UI rule is strict:

```text
No surface may claim anything that backend evidence cannot prove.
```

Examples:

- “Agent running” requires a real terminal session or lane projection.
- “Tests passed” requires a persisted test proof.
- “3 files changed” requires real git/file diff evidence.
- “Browser verified” requires screenshot/action evidence.
- “Memory learned” requires a stored memory/pattern record.

If evidence does not exist, the UI says:

```text
Unknown
No session active
No proof recorded
No diff selected
Unconfigured
```

That honesty is part of the product.

---

## 5. The Product Atoms

Everything in Doorway should reduce to these atoms:

### Project

A real local repo or folder.

Must contain:

- path
- mode: git or terminal-only
- package manager/framework detection
- memory sources
- available commands

### Thread

A persistent user goal/conversation.

Must contain:

- messages
- events
- lanes
- terminals
- worktrees
- evidence
- memory checkpoints

### Lane

A visible worker.

Examples:

- Claude Code lane
- Codex CLI lane
- Cursor lane
- tester lane
- browser proof lane

Must contain:

- provider/tool
- status
- terminal session
- worktree
- latest activity
- evidence refs

### Terminal Session

A real PTY owned by Doorway.

Must contain:

- session id
- cwd
- pid
- command/runtime
- input events
- output chunks
- exit code/signal
- status

### Worktree

An isolated git workspace for agent changes.

Must contain:

- branch
- path
- cleanliness
- diff
- merge safety state

### EvidenceRef

A proof object backing a claim.

Kinds:

- terminal chunk
- terminal input
- diff
- test result
- browser screenshot
- permission receipt
- replay export
- handoff capsule
- peer message

### Memory

Stored operational knowledge.

Kinds:

- project memory
- session memory
- pattern memory
- user preference memory
- cross-project memory

### Automation

A saved repeated workflow generated from real observed events.

Must contain:

- trigger
- steps
- commands
- tools
- approvals
- checks
- risk level

---

## 6. What State-of-the-Art Means for Doorway

A state-of-the-art AI IDE in 2026 is not just an editor.
It is an **agent operating system**.

Doorway’s state-of-the-art bar:

| Capability  | Minimum Bar         | Doorway Bar                                   |
| ----------- | ------------------- | --------------------------------------------- |
| Terminal    | Real PTY            | PTY + process tree + input/output evidence    |
| Agents      | One tool            | Claude + Codex + Cursor + custom tools        |
| Parallelism | Multiple chats      | isolated worktrees + lane state + review flow |
| Memory      | Chat history        | workflow memory + pattern learning            |
| UI          | Pretty panels       | evidence-backed projections only              |
| Browser     | Open URL            | browser proof with screenshots/actions        |
| Completion  | Agent says done     | terminal/test/diff/browser evidence           |
| Enterprise  | None/basic logs     | audit trail + permissions + replay export     |
| Automation  | User-defined macros | learned from repeated real workflows          |

The goal is not “look advanced.”
The goal is to make the invisible parts of agent work visible.

---

## 7. Doorway vs Codex Desktop

Codex Desktop is the closest product shape.

Codex has:

- polished desktop command center
- parallel agent threads
- worktree isolation
- computer use
- memory
- plugins
- automations

Doorway must respect that baseline.

Doorway cannot pretend Codex is weak.
Codex is strong.
It is backed by OpenAI and sets the user expectation.

Doorway’s wedge is not “we have parallel threads too.”
That is table stakes.

Doorway’s wedge is:

```text
Codex is an OpenAI command center.
Doorway is a universal command center.
```

Meaning:

- Claude for deep reasoning/refactors
- Codex for fast implementation/review
- Cursor for inline IDE polish
- Gemini for docs/large context
- Playwright/browser for visual proof
- custom enterprise CLI tools for internal workflows

All in one persistent thread with shared evidence.

---

## 8. The Non-Negotiable Differentiators

Doorway must build these or it is not differentiated enough.

### 1. Cross-Model Threading

A single Doorway thread can route steps across tools:

```text
User goal: Build login + tests + browser proof

1. Claude Code → architecture / tricky auth logic
2. Codex CLI → implementation + tests
3. Playwright → browser proof
4. Claude Code → review
5. Doorway → evidence bundle + replay
```

The user sees one thread, not five disconnected tools.

### 2. Visible Process Tree

Doorway shows the subprocess reality:

```text
pnpm test
├── node vitest
│   ├── worker 1
│   ├── worker 2
│   └── chromium
└── exit 1
```

This beats raw terminal text because it explains what actually ran.

### 3. Exit Code Taxonomy

Doorway explains failure:

```text
127      command not found
126      permission denied
SIGKILL  likely OOM / timeout / external kill
SIGSEGV  crash / memory corruption
SIGABRT  assertion / panic
```

No fake intelligence. Deterministic taxonomy first.

### 4. Persistent Workflow Memory

Doorway remembers:

- repo commands
- successful verification flows
- recurring errors
- preferred models
- project conventions
- approval patterns

This is the #1 user demand.

### 5. Evidence-Backed Completion

“Done” means:

- terminal exited or is reviewable
- tests are recorded or explicitly absent
- diff is available
- browser proof exists if UI changed
- replay/export is possible

The agent saying “done” is not enough.

### 6. Learned Automations

Doorway watches repeated real workflows and suggests:

```text
Save “UI Change Review”?
- run implementation agent
- run pnpm typecheck
- capture browser screenshot
- run reviewer agent
- export evidence bundle
```

No fake automation suggestions. Only repeated observed flows.

---

## 9. What Not To Build

Do not build:

- fake dashboards
- fake model status
- fake terminal output
- fake diffs
- fake proof cards
- generic chat memory
- disconnected UI components
- speculative plugin marketplace
- broad enterprise admin panels before core harness works
- “AI magic” where deterministic parsing is enough

Every feature must answer:

```text
What real event powers this?
What evidence proves it?
What user decision does it improve?
```

If those answers are weak, do not build it yet.

---

## 10. The First Real Vertical Slice

The first state-of-the-art slice is not memory or enterprise.
It is the honest terminal harness.

Why?

Because every other claim depends on it.

### Slice 1: Real PTY Control

User path:

```text
Open project → create thread → open terminal drawer → run command → see real output → input works → transcript persists
```

Success criteria:

- terminal uses real node-pty session
- xterm receives live output
- user input writes back to PTY
- resize writes back to PTY
- transcript is persisted
- no fake fallback if a real session exists
- unavailable state is honest

### Slice 2: Process + Exit Evidence

User path:

```text
Run test/build → see command process tree → see exit classification → understand failure
```

Success criteria:

- child processes visible
- exit code/signal classified
- failure reason is deterministic
- terminal stopped event persists classification

### Slice 3: File Delta Evidence

User path:

```text
Agent edits repo → Doorway shows changed files from real file/git state
```

Success criteria:

- file changes come from watcher/git diff
- no guessed file counts
- diff panel links to evidence

Only after these slices should memory/orchestration become the focus.

---

## 11. The North Star UX

Doorway should feel like this:

```text
Thread: “Fix checkout flow”

Claude Lane      running       terminal term_a12   worktree doorway/checkout-auth
Codex Lane       reviewing     terminal term_b91   worktree doorway/checkout-tests
Browser Proof    captured      screenshot proof_71
Tests            failed        exit 1 · 2 failing specs
Diff             reviewable    5 files · +180 -42
Memory           updated       learned test command: pnpm test -- checkout

User can:
- inspect terminals
- open diffs
- replay timeline
- approve/deny risky steps
- hand off to another model
- save repeated workflow as automation
```

The magic is not hidden.
The magic is legible.

---

## 12. Engineering Principles

Build in this order:

1. protocol type
2. backend persistence/event
3. runtime implementation
4. IPC/API
5. UI projection
6. tests
7. docs

Never UI-first fake state.

For every product claim, require:

```text
projection → event → persistence → runtime source
```

Example:

```text
Terminal tab says “running”
→ TerminalProjection.status
→ terminal_sessions.status in SQLite
→ SessionManager/node-pty active session
```

If the chain breaks, the UI must show unknown/unconfigured.

---

## 13. Doorway’s Final Identity

Doorway is best described as:

```text
A local-first universal agent OS for software development.
```

Or more concretely:

```text
A desktop harness that runs multiple AI coding tools in real isolated terminals,
tracks their work through git/worktree/evidence projections,
remembers what works,
and turns repeated workflows into safe automations.
```

The product category is not “AI editor.”
The product category is:

```text
AI coding harness / agent command center / workflow memory layer
```

---

## 14. The Build Mandate

When coding starts, do not chase the whole vision.

Start with the smallest real slice that proves Doorway’s philosophy:

```text
Real terminal.
Real persisted transcript.
Real UI projection.
Real tests.
No fake state.
```

Then layer:

```text
process tree → exit taxonomy → file delta → cross-model lanes → memory → evidence → automation
```

That is how Doorway becomes state of the art without becoming slop.

---

## 15. Final Product Sentence

```text
Doorway is the universal, evidence-backed command center for AI coding agents —
Codex-style parallelism, Claude-level reasoning, Cursor-style polish,
real terminal visibility, persistent workflow memory, and enterprise-grade replay.
```
