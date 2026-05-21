# Doorway Connectors, Plugins, and Skills Rules

## 0. Goal

Doorway should connect tools, files, terminals, browsers, and external services into one adaptive IDE.

Connectors and plugins must be useful, explicit, permissioned, and evidence-backed.

---

## 1. Connectors

Supported connector concepts:

- GitHub
- GitLab
- Linear
- Jira
- Figma
- Notion
- Slack
- Sentry
- Vercel
- Supabase
- CI/CD
- local browser
- local filesystem

Connectors can provide:

- issues
- designs
- docs
- logs
- errors
- deployment state
- PR context
- comments

Connectors can perform actions only after configured permission.

---

## 2. Connector Rules

No connector may:

- act without user account/config
- write externally without approval
- expose secrets in logs
- inject untrusted content into agent prompts without marking source
- claim work was done without evidence

Every connector fetch/action creates EvidenceRef.

---

## 3. Plugin Manifest

Every plugin needs:

```yaml
id: com.example.plugin
name: Example Plugin
version: 0.1.0
capabilities:
  - terminal.observe
  - context.provide
permissions:
  filesystem:
    read: []
    write: []
  network:
    allowed_hosts: []
entry:
  command: node plugin.js
```

No plugin gets full filesystem/network by default.

---

## 4. Skill Definition

A skill is:

```text
instructions
+ context rules
+ tools
+ workflow steps
+ checks
+ UI presentation
```

Skill examples:

- React UI Polish
- Next.js Auth Debug
- Figma-to-PR
- Sentry Bug Fix
- Supabase Migration
- GitHub PR Review

---

## 5. Marketplace Quality

Do not add low-quality plugins.

A plugin/skill must have:

- clear purpose
- declared permissions
- tests or validation path
- user-facing docs
- uninstall path
- error handling
- evidence output

---

## 6. Definition of Done

```text
[ ] manifest parsed
[ ] permissions enforced
[ ] connector/plugin evidence created
[ ] UI shows configured/unconfigured state
[ ] no secrets leaked
[ ] failure state is clear
```
