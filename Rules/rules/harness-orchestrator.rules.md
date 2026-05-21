# Doorway Harness + Orchestrator Rules

## 0. Goal

The Doorway backend must turn real CLI tools into visible, manageable, adaptive workers.

Core loop:

```text
User prompt
→ Orchestrator routing
→ Agent lane
→ Terminal PTY
→ Worktree
→ Output watcher
→ Evidence
→ UI projection
→ Follow-up / compact / automation / review
```

---

## 1. Terminal Harness Rules

### 1.1 Use real PTY

Visible worker lanes must run in real PTYs.

MVP:

```text
node-pty + xterm.js
```

Future:

```text
doorwayd native/Rust PTY core
```

### 1.2 TerminalRuntime owns process execution

Adapters only produce launch specs.

Correct:

```text
ClaudeCodeAdapter.buildLaunchSpec()
TerminalRuntime.startSession(spec)
```

Wrong:

```text
ClaudeCodeAdapter.spawn()
```

### 1.3 Store every session

For every terminal:

- session id
- tool profile
- cwd
- worktree id
- thread id
- goal id
- lane id
- start time
- exit time
- exit code
- status

### 1.4 Capture input/output

Store:

- raw ANSI output
- clean text output
- user input events
- orchestrator input events
- permission decisions
- interrupts

### 1.5 Never fake terminal state

If no real session exists, UI says:

```text
No terminal session active
```

---

## 2. Agent Lane Rules

Every running tool is a lane.

Lane has:

- tool profile
- terminal session
- worktree
- role
- status
- latest activity
- evidence refs

Statuses:

```text
starting
running
waiting_for_input
needs_approval
quiet
possibly_stuck
stuck
done
failed
cancelled
```

---

## 3. Orchestrator Routing Rules

When user sends a message, decide:

```text
reuse existing lane
launch new lane
fork lane
handoff to another tool
compact then continue
ask user
```

Routing must consider:

- @mentions
- slash command
- selected primary tool
- active goal
- lane status
- worktree status
- context exhaustion
- user permission mode

Always persist routing decision with reason.

---

## 4. Long-Running Goals

`/goal` creates a GoalSession.

GoalSession tracks:

- goal text
- active lanes
- worktrees
- checkpoints
- status
- policies

Do not block UI during long goals.

Use:

- output watcher
- completion confidence
- attention states
- periodic checkpointing

---

## 5. Completion Confidence

No universal terminal “done” signal exists.

Use score based on:

- process exit
- terminal prompt returned
- final summary detected
- no child process
- test finished
- git diff stable
- question detected
- permission prompt detected
- repeated loop
- quiet threshold

Completion confidence may mark UI as:

```text
probably done
reviewable
failed
stuck
waiting
```

It must not auto-merge.

---

## 6. Output Watcher

Hot path must be deterministic.

Detect:

- permission prompt
- question prompt
- auth/setup prompt
- command start/end
- test result
- errors
- file paths
- URLs
- port numbers
- done/failure phrases

Do not call LLM on every line.

---

## 7. /compact

Doorway-level compact creates a checkpoint:

```text
goal
current state
files changed
commands run
tests
known failures
last important terminal lines
next action
```

Native CLI compact is adapter-specific and optional.

---

## 8. Peer Agent Mesh

Agents can communicate through controlled mailbox tools:

```text
list_agents
send_message
wait_for_response
pull_messages
request_verification
```

Doorway must:

- record messages
- show peer exchange
- prevent loops
- limit depth
- attach evidence

---

## 9. Adaptive Workflow Memory

Record useful patterns:

- tool chosen for task type
- commands run
- tests used
- browser proof URL
- review flow
- connector usage

Do not store secrets.

Suggest automation only after repeated pattern.

---

## 10. Harness Tests

Required:

- fake PTY stream tests
- prompt detection tests
- completion confidence tests
- lane routing tests
- compact tests
- worktree attribution tests
- permission prompt tests
- stuck/loop tests

No harness feature is complete without tests.
