# Doorway Backend Infrastructure Rules

## 0. Goal

Doorway backend must be durable, honest, local-first, and evidence-backed.

No backend service should exist only as an interface. Every service must either:

- be implemented and tested
- be clearly marked experimental and excluded from production
- be deleted

---

## 1. Layer Boundaries

Use layers:

```text
protocol
services
runtime
persistence
adapters
ipc/api
ui projections
```

Do not let UI invent domain state.

---

## 2. Protocol First

Any state shown in UI must have protocol projection types.

Required projection families:

- ThreadProjection
- ComposerProjection
- AgentLaneProjection
- TerminalSessionProjection
- WorktreeProjection
- AutomationProjection
- ConnectorProjection
- EvidenceProjection
- CompletionReportProjection

---

## 3. Persistence

Use SQLite locally.

Rules:

- WAL enabled
- migrations versioned
- no destructive migrations without backup
- large blobs outside main DB
- terminal spam should not block state queries
- schema must match runtime types

Recommended split later:

```text
state.db
logs.db
proof/
```

---

## 4. Events

Important actions create events:

- thread created
- goal started
- lane launched
- terminal chunk
- terminal input
- permission requested
- permission decided
- worktree changed
- test finished
- browser proof captured
- automation suggested
- connector action
- compact checkpoint
- completion report

---

## 5. EvidenceRefs

User-facing claims need EvidenceRefs.

Evidence kinds:

```text
terminal_chunk
terminal_input
diff
test_result
browser_screenshot
connector_context
permission_receipt
automation_pattern
peer_message
```

---

## 6. Error Handling

Do not silently catch.

Critical service methods should return typed results:

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

Errors need:

- code
- message
- source
- recoverable boolean
- user-safe message

---

## 7. IPC/API

IPC handlers must:

- validate input
- return typed results
- not leak stack traces to UI
- log internal details locally
- never expose secrets

---

## 8. Secrets

Secrets must not be stored in plain SQLite.

Use:

- OS keychain / Electron safeStorage
- explicit env vars
- native CLI auth

Never read private auth stores from external tools.

---

## 9. Config

Config precedence:

```text
explicit project setting
→ user setting
→ environment variable
→ detected default
```

Show config source in settings.

---

## 10. Gates

Root gate must include:

```text
typecheck
lint
test
format/check
dead code check if available
build
```

Never claim production state if root gate fails.
