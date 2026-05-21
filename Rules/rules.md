# Doorway rules.md

This is the main entry file for AI coding agents working on Doorway.

Read in this order:

1. `AGENTS.md`
2. `rules/karpathy-do-not-slop.rules.md` ← **START HERE** — The 4 Karpathy principles + Doorway's non-negotiables
3. `rules/no-slop-quality-gate.rules.md` — Fake code kill list, design taste gate
4. `rules/frontend.rules.md` — Shell shape, evidence rules
5. `rules/harness-orchestrator.rules.md` — Terminal harness, agent lanes, orchestrator routing
6. `rules/backend-infrastructure.rules.md` — Layer boundaries, protocol first, SQLite
7. `rules/adaptive-automation.rules.md` — Pattern detection, automation suggestion
8. `rules/connectors-plugins-skills.rules.md` — Connector rules, plugin manifest
9. `rules/self-evolving-harness.rules.md` — Self-improvement flow, rollback requirements

Doorway’s north star:

```text
An adaptive AI IDE that runs real tools,
learns real workflows,
automates repeated work,
and shows real evidence.
```

If a change adds fake UI, dummy data, hidden failures, dead code, empty architecture, or fake terminal state, reject it.
