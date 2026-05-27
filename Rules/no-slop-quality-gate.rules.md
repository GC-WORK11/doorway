# Doorway No-Slop Quality Gate

This file exists because agents often generate impressive-looking but broken code.

Doorway does not accept that.

---

## 1. Fake Code Kill List

Immediately reject code containing production usage of:

```text
mockProjects
mockThreads
fakeTestResult
dummyTerminalOutput
sampleAgentRuns
setTimeout fake progress
hardcoded success
catch (e) {}
|| true
as any without reason
empty service class
interface-only package
```

Exception:

- tests
- fixtures
- stories
- explicitly dev-only mocks

---

## 2. Before Writing Code

Agent must reason through:

```text
What real user path am I fixing?
What real backend state powers this?
What exact files need change?
What tests prove it?
What fake state must be removed?
```

---

## 3. During Coding

Rules:

- edit smallest possible surface
- delete obsolete code
- prefer real projection types
- use typed states
- write behavior tests
- do not invent backend methods that do not exist
- do not create disconnected components
- do not create fake UI data to make screenshots look good

---

## 4. After Coding

Run/check:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

If unavailable or failing, report honestly.

---

## 5. Design Taste Gate

Frontend changes fail if they add:

- clutter
- emoji icons
- muddy dark colors
- fake right panel
- noisy dashboard cards
- repeated avatars
- oversized controls
- non-premium spacing

Frontend changes pass if they improve:

- message capsules
- composer clarity
- sidebar minimalism
- light theme
- agent capsule
- real empty states
- typography

---

## 6. Infrastructure Taste Gate

Backend changes fail if they add:

- empty services
- fake state machines
- non-persistent runtime claims
- direct process spawning inside adapters
- untracked terminal output
- hidden errors
- untested prompt detection

Backend changes pass if they add:

- real terminal sessions
- typed state transitions
- persisted events
- evidence refs
- tests
- deterministic hot path logic
