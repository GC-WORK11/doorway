# Subagent Orchestration Architecture Spec

## 1. Overview
The Doorway Subagent Orchestration system defines how multiple autonomous CLI agents (subagents) collaborate, manage their internal state, assert authority, and interact with the underlying system configurations. This architecture ensures that agents can operate complex, multi-step workflows while strictly adhering to Doorway's non-negotiable rules: all work must be real, verifiable, and executed through visible PTY sessions without fake UI or simulated outcomes.

## 2. Core Principles
- **No Simulation**: All agent actions, including peer communication and config changes, must result in actual system state changes or real PTY execution.
- **Visible Work**: Subagent orchestration is tracked in the `TerminalRuntime`. Every subagent gets its own terminal lane and worktree context.
- **Traceable Authority**: Subagents operate under scoped, explicit permissions granted by the user or the parent agent.
- **Evidence-Based**: All peer-to-peer exchanges and system modifications must generate verifiable evidence (logs, diffs, terminal traces).

## 3. Peer-to-Peer Coworkers (The Agent Mesh)
Subagents act as a swarm of autonomous workers capable of delegating tasks and coordinating outcomes. They interact via the **Peer Agent Mesh**.

### 3.1 Mailbox Tools
Agents communicate using a standardized set of controlled mailbox tools:
- `list_agents`: Retrieve the registry of active subagents, their roles, and current statuses.
- `send_message`: Dispatch a structured payload (with context and evidence refs) to a specific subagent.
- `pull_messages`: Read incoming requests or responses from a subagent's isolated queue.
- `wait_for_response`: Suspend execution (with a `waiting` state) until a peer fulfills a contract.
- `request_verification`: Ask a peer (e.g., a "QA subagent") to validate a specific worktree state or test output.

### 3.2 Routing and Visibility
- The Orchestrator intercepts peer messages and routes them through the `Doorway Backend`.
- All inter-agent communication is recorded in the overarching GoalSession.
- The UI projects these exchanges honestly; if an agent is waiting on a peer, the UI reflects `waiting_on_peer`.

## 4. Self-Communication (Talking to Themselves)
Agents must manage their own context limits and strategic planning without relying on invisible "magic" or fake terminal output.

### 4.1 Internal Reflection Streams
- Subagents can spawn a private, secondary loop (a "thought lane") that runs a distinct CLI process (like a local LLM or a specialized reasoning script) to rubber-duck problems.
- These thoughts are persisted in the session logs but projected distinctly in the UI to separate action from planning.

### 4.2 Self-Compacting
- When a subagent detects context exhaustion, it triggers a `/compact` routine on itself.
- It summarizes its current goal, state, files changed, and commands run into a checkpoint file or internal memory store, then respawns or clears its PTY to continue fresh.

## 5. Possessing Authority
Subagents do not operate with implicit root access; they possess dynamic, explicit authority that they can assert and prove.

### 5.1 Scoped Permissions
- Every subagent lane is initialized with a permission profile (e.g., `read-only`, `execute-tests`, `modify-source`, `network-access`).
- Subagents possess the authority to execute commands within their profile without asking the user.

### 5.2 Authority Delegation
- A parent agent with `modify-source` authority can spawn a subagent and delegate a subset of its permissions.
- If a subagent hits an authority boundary, it must use the Orchestrator to escalate the request to the user or its parent agent. 
- The escalation is visible in the terminal output watcher (e.g., detecting a permission prompt).

## 6. Altering Official CLI System Configs
Subagents are empowered to configure their own environments and the overarching Doorway CLI systems, provided the changes are real and persistent.

### 6.1 Modifying Tool Profiles
- Subagents can write to Doorway config files (e.g., `~/.pi/agent/profiles/*.json`) to tweak adapter settings, model choices, or context limits for future lanes.
- These changes are executed via standard shell commands (e.g., `sed`, `jq`, or writing a new file via `echo`) in the agent's PTY.

### 6.2 Modifying the Agent Mesh
- Agents can dynamically alter routing rules by updating the Orchestrator's configuration files. 
- Example: An agent identifying a recurring error can rewrite an adapter's default flag configuration to prevent future failures.

### 6.3 Verifiable Configuration State
- No configuration change is valid unless a real file is modified and the change is tracked in version control (if applicable) or logged.
- The UI will read directly from the updated config files to reflect the new state, maintaining the rule of honest renderer state.

## 7. Safety and Constraints
- **Loop Prevention**: The Orchestrator monitors the Peer Agent Mesh and Self-Communication streams to forcefully terminate cyclic message loops or infinite self-compaction cycles.
- **Depth Limits**: Subagent spawning depth is capped to prevent resource exhaustion.
- **No Fake Statuses**: The status of a subagent altering a system config is derived entirely from the exit code and `stdout`/`stderr` of the PTY modifying the config file.
