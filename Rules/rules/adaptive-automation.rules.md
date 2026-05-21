# Doorway Adaptive Automation Rules

## 0. Goal

Doorway should get better as the user works.

Not by collecting useless history.
By detecting repeated workflows and converting them into reusable automations.

---

## 1. What Doorway Learns

Allowed:

- repeated commands
- preferred tools
- common project tests
- browser proof URLs
- review patterns
- connector usage
- PR template preferences
- branch naming preferences
- recurring task types

Forbidden:

- secrets
- passwords
- API keys
- private tokens
- raw sensitive connector data unless explicitly approved

---

## 2. Pattern Detection

Detect sequences:

```text
user intent
→ tool selection
→ terminal commands
→ file changes
→ tests
→ browser proof
→ review
→ PR/export
```

Require repeated occurrence before suggesting automation.

Default threshold:

```text
3 similar workflows
```

---

## 3. Automation Suggestion

Show card:

```text
Doorway noticed a repeated workflow.

Save “UI Change Review”?
- Claude Code implementation
- pnpm typecheck
- Browser proof
- Codex review
```

Actions:

- Save
- Edit steps
- Ignore
- Never suggest this

---

## 4. Automation Format

Automation must be transparent.

Required fields:

- name
- trigger
- steps
- tools
- commands
- approvals
- checks
- risk level
- last edited

---

## 5. Automation Execution

Automations do not silently run destructive steps.

Any risky step requires user approval:

- deleting files
- force git operations
- publishing packages
- deployment
- database migration
- external connector write

---

## 6. Skill Packs

A skill pack is an automation plus instructions and UI.

Examples:

- React UI Polish
- Next.js Auth Debug
- Figma-to-PR
- Sentry Bug Fix
- GitHub PR Review
- Supabase Migration

Each skill must declare:

- tools
- connectors
- permissions
- steps
- checks
- outputs

---

## 7. UI Rules

Automation UI should be simple.

Show:

- what will run
- which tools
- which commands
- where approval is needed
- expected output

Hide:

- giant graph by default
- raw config unless user opens advanced mode

---

## 8. Definition of Done

```text
[ ] pattern detection works from real events
[ ] suggestions are not fake
[ ] user can save/edit automation
[ ] automation can run
[ ] risky steps require approval
[ ] run report created after automation
```
