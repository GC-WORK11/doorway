# Doorway Self-Evolving Harness Rules

## 0. Goal

Doorway may improve its own harness, parsers, workflows, and automations over time — but never silently and never unsafely.

Self-improvement is allowed only through reviewable worktrees and gates.

---

## 1. What Can Be Improved

Allowed self-improvements:

- terminal prompt detectors
- output parsers
- completion patterns
- tool profiles
- slash commands
- workflow templates
- plugin manifests
- documentation
- tests
- UI capsule rendering
- automation suggestions

Restricted self-improvements:

- auth logic
- billing/payment logic
- permission weakening
- sandbox restrictions
- audit logging
- secret handling

Restricted areas require explicit human approval and stronger review.

---

## 2. Self-Improvement Flow

```text
Harness issue detected
→ improvement proposal
→ self-worktree
→ agent patch
→ gates run
→ diff review
→ user approval
→ apply
→ rollback snapshot
```

No direct modification to current running app.

---

## 3. Proposal Requirements

Every proposal needs:

- title
- reason
- evidence refs
- affected subsystem
- risk level
- proposed files
- test plan

---

## 4. Gates

Before applying:

```text
typecheck
lint
tests
harness regression tests
parser tests if parser touched
frontend build if UI touched
manual review
rollback snapshot
```

---

## 5. Never Allowed

Never allow self-improver to:

- access secrets
- auto-approve permissions
- disable audit/evidence
- weaken safety checks
- auto-apply production changes
- delete user data
- change payment/auth without explicit review

---

## 6. Definition of Done

```text
[ ] proposal created
[ ] self-worktree created
[ ] patch generated
[ ] gates pass
[ ] user approved
[ ] rollback exists
[ ] event recorded
```
