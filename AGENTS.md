# Doorway Agent Entry

Doorway agents must start from `Rules/rules.md` and follow the rule pack in `Rules/`.

**Also read:** `~/.pi/agent/agents/user/CLAUDE.md` for coding guidelines (Andrej Karpathy principles).

Non-negotiables:

- no fake production UI, terminal output, proofs, diffs, projects, threads, or agent status
- no hidden failures or `|| true` in gates
- visible CLI workers run through real PTY sessions owned by Doorway
- renderer state must come from backend projections or honest loading, empty, error, or unconfigured states
- competitor/resource source trees are research fixtures, not production Doorway code
