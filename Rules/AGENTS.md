# Doorway Agent Rules

## Purpose

Doorway is a local-first adaptive AI IDE. It runs real CLI tools in managed terminals, learns useful workflows, turns repeated work into automations, connects to external services, and presents the work through a premium frontend.

Doorway is not a demo app. Doorway is not a fake dashboard. Doorway is not a Claude/Codex wrapper. Doorway is not allowed to contain fake production state.

Core product:

```text
Visible CLI Harness
+ Adaptive Orchestration
+ Worktree Isolation
+ Workflow Memory
+ Plugins / Skills / Connectors
+ Evidence-backed UI
```

Every agent working in this repo must obey these rules.

---

## 1. Absolute Non-Negotiables

### 1.1 No fake production UI

Do not ship:

- fake chats
- fake projects
- fake tests
- fake terminal output
- fake diffs
- fake browser proof
- fake agent status
- fake progress
- fake file trees
- fake model lists
- hardcoded successful results
- `setTimeout` progress theatre

Allowed only in clearly marked locations:

- tests
- fixtures
- stories
- dev-only sandboxes

Production renderer must show real backend projection or honest loading, empty, disabled, or error state.

### 1.2 No dead code

Do not add unused:

- components
- services
- types
- exports
- packages
- configs
- routes
- migrations

If the current milestone does not need it, delete it or do not create it.

### 1.3 No architecture theatre

Do not create impressive-looking packages that do nothing.

Bad:

```text
packages/merge-judge exists but has no runtime behavior
packages/plugin-runtime has only interfaces
packages/harness has fake state machines
```

Good:

```text
one small working service
with tests
wired to protocol/UI
and real behavior
```

### 1.4 No hidden failures

Never use:

```json
"build": "vite build || true"
"test": "vitest || true"
"typecheck": "tsc || true"
```

No `|| true`.
No swallowed errors.
No silent catch blocks for critical flows.
No “temporary” broken gates.

### 1.5 No unsafe invisible terminal control

Doorway controls visible user-authorized terminals.

Do not implement:

- private auth scraping
- token extraction
- billing bypass logic
- hidden SDK fallback for visible workers
- silent permission approval
- fake human behavior
- opaque background command execution without user visibility

Visible worker lane means:

```text
real CLI
real PTY
real output
real user control
real evidence
```

---

## 2. Definition of Done

A task is not done until all relevant checks pass:

```text
[ ] Code compiles
[ ] Typecheck passes
[ ] Tests pass or failing reason is honest
[ ] Lint passes
[ ] No fake production state
[ ] No unused/dead files introduced
[ ] No hidden build/test failures
[ ] UI states are real: loading/empty/error/success
[ ] Errors are user-visible where relevant
[ ] Critical actions are evidence-backed
[ ] New behavior has tests
[ ] Docs updated if architecture changed
```

If any item fails, do not claim the task is complete.

---

## 3. Mandatory Engineering Style

### 3.1 Build vertical slices

Prefer:

```text
protocol type
→ backend service
→ persistence/event
→ IPC/API
→ frontend projection
→ UI component
→ test
```

Avoid:

```text
huge UI mock
+ fake state
+ no backend
```

### 3.2 Make state explicit

Every important runtime concept needs a state machine:

- terminal session
- agent lane
- goal session
- worktree
- automation
- connector
- browser proof
- permission request
- completion confidence

Do not use random booleans when a state enum is required.

### 3.3 Separate real layers

Doorway layers:

```text
UI
Protocol projections
IPC/API
Application services
Harness runtime
Persistence
External tools/connectors
```

React components must not invent backend state.

### 3.4 Evidence-first development

Any claim shown to the user must have evidence.

Examples:

```text
“Tests passed” -> TestRun evidence
“Claude is running” -> TerminalSession evidence
“3 files changed” -> git diff evidence
“Ready to merge” -> MergeJudge evidence
“Browser verified” -> BrowserProof evidence
```

If no evidence exists, show:

```text
Not run yet
Unknown
Waiting
Missing proof
```

---

## 4. Response Rules for Coding Agents

When reporting completion, use this format:

```text
Changed:
- ...

Verified:
- pnpm typecheck
- pnpm test
- pnpm lint

Remaining risks:
- ...

Files:
- ...
```

Do not say “production-ready”, “fully implemented”, “10/10”, or “complete” unless gates actually passed.

---

## 5. Doorway North Star

Every change must move Doorway toward:

```text
An adaptive AI IDE that runs real tools,
learns real workflows,
automates repeated work,
and shows real evidence.
```

If a change does not support this, do not add it.
