# DOORWAY
## Technical Vision Document
### Version 1.0 — Internal Specification

---

> *"One thread from idea to production."*

---

## Table of Contents

1. Executive Summary
2. Pillar 1 — Terminal Harness (The Core Engine)
3. Pillar 2 — Self-Adapting Brain
4. Pillar 3 — Unified Cross-Agent Thread
5. Pillar 4 — Peer-to-Peer Subagent Coworkers
6. Pillar 5 — Plugin + OAuth Infrastructure
7. Pillar 6 — Slash Commands & Smart Context
8. Pillar 7 — Automation & Scheduling
9. Pillar 8 — Technical Pillars (Worktree, Actions, Providers, Connectors)
10. Pillar 9 — Team Operating System
11. Bonus Innovations (Agent Blame, Prompt Archaeology, Routing Intelligence)
12. System Architecture Overview
13. Technology Stack Decisions

---

---

# 1. Executive Summary

Doorway is not another AI IDE wrapper.

Every existing AI coding tool — Cursor, Windsurf, Copilot, Cody — is fundamentally an API wrapper with a nice text editor built around it. They call the model programmatically, stream a response, render it in a diff view. The model is a black box being queried over HTTP. The terminal is an afterthought. The agent is sandboxed.

Doorway is architecturally different at the root.

Doorway controls CLI tools the same way a human developer would — by launching them in terminal sessions, watching their output, reading their questions, injecting responses, recovering from failures, and capturing everything into a structured intelligence layer. No SDK. No API wrapping. No forced subscription bundling. The user brings their own CLI subscriptions (Claude CLI, Codex CLI, Gemini CLI). Doorway is the orchestration layer that makes them work together as a unified system.

The result: a multi-agent development environment where Claude and Codex (and any other CLI) run in parallel, coordinate on shared context, and surface their combined work as a single beautiful thread — like having two senior engineers pair programming on your codebase while you watch and guide from above.

Beyond the solo developer, Doorway becomes the team's operating system for software development — collapsing Linear, GitHub, Slack, and Cursor into a single thread that runs from idea to deployed code without switching context.

The nine technical pillars that define Doorway are each described in full below.

---

---

# 2. Pillar 1 — Terminal Harness (The Core Engine)

## 2.1 The Problem With Every Existing Approach

### Why SDK/API Wrapping is Fragile

Tools like Cursor, T3 Chat, and Conductor call the model API directly. This means:

- They are billed at API rates, which they pass to users through their own subscription
- They are subject to programmatic access restrictions in model providers' Terms of Service
- They cannot use CLI-exclusive features (Claude CLI's project memory, Codex CLI's file watching, etc.)
- Users cannot bring their own existing subscriptions — they must subscribe through the tool

When Anthropic or OpenAI change API pricing, the tool's cost structure breaks. When they add API-only restrictions, the tool breaks. The dependency is total.

### Why Naive PTY is Insufficient

PTY (Pseudo Terminal) is the Unix mechanism for creating a terminal session that a program can read and write to, simulating a human at a keyboard. Every naive automation of CLI tools uses PTY — tools like `expect`, `pexpect`, old tmux scripting.

The problems with naive PTY usage:

**Raw byte stream pollution.** PTY gives you exactly what appears on screen — which includes VT100/VT220 ANSI escape sequences for colors, cursor movements, screen clearing, bold text. A Claude CLI output stream looks like:

```
\x1b[?2004h\x1b[1;36mClaude\x1b[0m \x1b[2mthinking\x1b[0m...\x1b[?2004l\r\n\x1b[2K
```

Parsing semantic content from this is brittle and breaks every time the CLI updates its color scheme or output formatting.

**No semantic understanding.** Raw PTY cannot tell you "Claude is thinking" vs "Claude is waiting for input" vs "Claude encountered an error and is asking for clarification." It only sees bytes.

**No structured session boundaries.** A PTY stream is a river of characters. There is no concept of "this prompt started here, this response ended here, this was a question."

**No cross-platform reliability.** Unix PTY and Windows ConPTY behave differently in fundamental ways. Code written for Linux PTY breaks on Windows and vice versa.

**No failure intelligence.** If a PTY session dies, all you know is the file descriptor closed. You don't know why, what state the agent was in, what it had completed, or how to resume.

Doorway does not use naive PTY. Doorway uses a four-layer terminal architecture that builds structured intelligence on top of the PTY substrate.

---

## 2.2 The Four-Layer Terminal Architecture

### Layer 0 — Cross-Platform PTY Substrate

The substrate layer handles OS differences transparently. On Unix (macOS, Linux) this uses the native `openpty()` system call. On Windows this uses ConPTY, Microsoft's modern pseudo-console API introduced in Windows 10.

**Technology choices:**

- **Rust:** `portable-pty` crate (used by WezTerm terminal emulator). Battle-tested, actively maintained, handles Linux/macOS/Windows ConPTY transparently. This is the correct choice.
- **Node.js/Electron:** `node-pty` (used by VS Code terminal). Mature, well-supported, same cross-platform coverage.

Do not write your own PTY abstraction. The edge cases (ConPTY scroll buffer behavior, Unix signal propagation, terminal resize events) will consume months.

The substrate provides:
- Spawn a process with a terminal attached
- Read bytes from the terminal's output
- Write bytes to the terminal's input
- Resize the terminal dimensions
- Kill the process (graceful SIGTERM or hard SIGKILL)
- Detect when the process exits and with what code

---

### Layer 1 — VT100/VT220 Parser (The Decoder)

The VT100 parser converts the raw byte stream from Layer 0 into structured terminal events. It understands every ANSI escape sequence and converts them into meaningful events rather than raw bytes.

Input (raw bytes):
```
\x1b[1;36mClaude\x1b[0m: Here is the fix for your auth bug:\n\x1b[32m+\x1b[0m const token = jwt.verify(...)
```

Output (structured events):
```
TextEvent { content: "Claude", style: { color: Cyan, bold: true } }
TextEvent { content: ": Here is the fix for your auth bug:", style: {} }
NewlineEvent {}
TextEvent { content: "+", style: { color: Green } }
TextEvent { content: " const token = jwt.verify(...)", style: {} }
```

**Technology choices:**

- **Rust:** `vte` crate (from the Alacritty terminal project). Extremely fast, complete VT220 coverage, event-driven API. Industry standard for Rust terminal emulators.
- **Node.js:** `xterm.js` parser layer. This is exactly what VS Code's terminal uses internally. You don't need the full xterm.js rendering stack — just the parser.

The output of Layer 1 is a clean, structured stream of terminal events with no escape codes. From this point, all processing works on clean text and semantic events.

---

### Layer 2 — Semantic State Machine (The Understander)

This is Doorway's primary innovation over all existing terminal automation tools. The semantic layer converts the stream of clean terminal events into meaningful agent states.

Every managed terminal session runs through a state machine:

```
        ┌─────────────────────────────────────────────────────┐
        │                                                     │
   ┌────▼────┐    spawn     ┌──────────┐   first output  ┌───────────┐
   │  IDLE   │─────────────►│ LAUNCHED │────────────────►│ THINKING  │
   └─────────┘              └──────────┘                 └─────┬─────┘
                                                               │
                         ┌──────────────────────────────────────┤
                         │                                      │
                    streaming                            prompt detected
                    output                               (waiting for input)
                         │                                      │
                  ┌──────▼──────┐                    ┌──────────▼──────────┐
                  │ OUTPUTTING  │                    │  AWAITING_RESPONSE  │
                  └──────┬──────┘                    └──────────┬──────────┘
                         │                                      │
                  output ends,                          user/system
                  prompt returns                        injects response
                         │                                      │
                  ┌──────▼──────┐                              │
                  │  COMPLETE   │◄─────────────────────────────┘
                  └──────┬──────┘
                         │
              ┌──────────┴──────────┐
              │                     │
           success               non-zero
           exit                  exit / crash
              │                     │
         ┌────▼────┐          ┌──────▼──────┐
         │ SUCCESS │          │    ERROR    │
         └─────────┘          └─────────────┘
```

**How each state is detected:**

**LAUNCHED → THINKING:** First bytes arrive from the process stdout after spawn.

**THINKING → OUTPUTTING:** Content blocks detected — multi-line code, prose, structured output. Claude CLI has characteristic output patterns (fenced code blocks, numbered lists, explanatory text) that distinguish streaming generation from prompt display.

**THINKING/OUTPUTTING → AWAITING_RESPONSE:** This is the critical detection. Multiple signals are combined:

1. **Prompt pattern matching:** Claude CLI displays specific prompt patterns when waiting for input. These are regex-matched against the current terminal state. Pattern library is maintained and updated as CLI versions change.

2. **Process stdin blocking:** The process is blocked waiting for stdin input. This is detectable at the OS level:
   - Linux: `/proc/{PID}/status` shows the process in "S" (sleeping, interruptible) state, and `/proc/{PID}/wchan` shows it's waiting on `pipe_read` or `tty_read`
   - macOS: `proc_pidinfo()` with `PROC_PIDTHREADINFO` shows thread wait channel
   - Windows: Job Object state + thread wait reason via NtQueryInformationThread

3. **Output silence duration:** No new bytes for >500ms while process is still running, combined with process state showing stdin-blocked.

4. **Question pattern detection:** NLP pattern matching on the last N characters of output to detect question forms ("What would you like...", "Should I...", "Can you clarify...", "Which approach...").

**AWAITING_RESPONSE → COMPLETE:** Response injected via Layer 0 stdin write, process resumes outputting.

**Any state → ERROR:** Non-zero exit code, specific error patterns ("API error", "Rate limited", "Context window exceeded"), or process crash (file descriptor closed unexpectedly).

---

### Layer 3 — Process Supervisor (The Guardian)

The supervisor wraps each terminal session and implements failure recovery, health monitoring, and context-preserving restart.

**Health Monitoring:**

Every terminal session has a watchdog timer. The supervisor checks session health on a configurable interval (default 500ms):

```
HealthCheck {
  - Is process still running? (file descriptor open, PID exists)
  - If THINKING: Has output advanced in last N seconds? (configurable, default 30s)
  - If AWAITING_RESPONSE: Has question been routed to response handler?
  - If OUTPUTTING: Is byte rate above minimum threshold?
}
```

**Failure Classification:**

When a health check fails, the supervisor classifies the failure:

- **Hang:** Process running, state machine in THINKING, no output progress for >30s. Action: inject a newline first (sometimes unsticks), wait 5s, then hard restart.
- **Crash:** Process exited unexpectedly. Action: capture exit code and last N lines of output, classify as recoverable or fatal.
- **Rate Limit:** Error pattern "rate limit" detected. Action: wait with exponential backoff, retry.
- **Context Overflow:** Error pattern "context window" detected. Action: compact context (summarize prior output), restart with summary.
- **API Error:** Network/auth errors from the CLI. Action: surface to user immediately, do not auto-retry.

**Context-Preserving Restart:**

When a recoverable failure occurs, the supervisor does not simply re-run the original prompt. It reconstructs context:

```
RecoveryContext {
  original_prompt: String,
  completed_subtasks: Vec<String>,  // parsed from output before failure
  current_progress: String,          // last coherent output block
  failure_reason: FailureType,
  resume_instruction: String,        // "You were in the middle of X. Continue from Y."
}
```

The reconstructed prompt is: `[Original prompt] + [Context summary] + [Resume instruction]`. The new session picks up where the failed one left off. From the user's perspective in the unified thread, nothing visibly failed — they may see a brief "[Reconnecting...]" indicator if the restart takes more than 2 seconds.

---

### Layer 4 — Async Event Bus (The Broadcaster)

All terminal sessions publish structured events to a central async event bus. This is the bridge between the terminal layer and the Doorway brain/UI layer.

**Event Schema:**

```rust
pub struct TerminalEvent {
    pub session_id: SessionId,
    pub agent: AgentType,           // Claude | Codex | Gemini | Custom
    pub timestamp: Timestamp,
    pub event_type: EventType,
    pub content: EventContent,
    pub metadata: EventMetadata,
}

pub enum EventType {
    OutputChunk,           // streaming text from agent
    OutputComplete,        // agent finished a response block
    QuestionDetected,      // agent is asking for input
    TaskComplete,          // agent signaled task completion
    Error(ErrorType),      // something went wrong
    StateTransition,       // session state changed
    TokenEstimate,         // approximate token usage
}

pub struct EventMetadata {
    pub session_uptime_ms: u64,
    pub output_byte_count: usize,
    pub last_state: SessionState,
    pub recovery_count: u8,        // how many times this session has been restarted
}
```

**Bus Implementation:**

- Rust: `tokio::sync::broadcast` channel for fan-out to multiple subscribers (UI, brain, logger)
- Node.js: `EventEmitter` with async listeners, or a local `EventEmitter2` for wildcard subscriptions

The Doorway Brain subscribes to all events from all sessions. The UI subscribes to rendered events. The session logger subscribes for persistence.

---

## 2.3 Question Routing — The Human Relay

When a AWAITING_RESPONSE state is detected on any terminal session, the event bus fires a `QuestionDetected` event. The Doorway Brain receives this and must decide:

**Option A — Auto-resolve:** The question can be answered from existing context (user's previous instructions, codebase analysis, prior conversation). Brain injects the answer directly via Layer 0 stdin write. Agent continues without user involvement.

**Option B — Route to user:** The question requires human judgment. Brain surfaces it in the Doorway chat UI with the original question text and an input field. User types their answer. Brain injects it into the terminal. Agent continues.

**Option C — Parallel query:** The question is addressable by another agent. Brain routes to another terminal session and injects the answer when received.

This mechanism is what makes Doorway feel like you're "directly talking to Claude and Codex" — because in the relay model, you effectively are. The terminal is just the medium.

---

## 2.4 Cross-OS Compatibility Matrix

| Capability | Linux | macOS | Windows |
|---|---|---|---|
| PTY substrate | openpty() | openpty() | ConPTY (Win10+) |
| Process state detection | /proc filesystem | proc_pidinfo() | NtQueryInformationThread |
| Stdin blocking detection | /proc/PID/wchan | kqueue wait event | NtQueryInformationThread |
| Signal sending | kill(PID, SIGTERM) | kill(PID, SIGTERM) | TerminateProcess() |
| Async I/O | epoll | kqueue | IOCP |
| PTY library | portable-pty / node-pty | portable-pty / node-pty | portable-pty / node-pty |

Windows is the hardest target. ConPTY scrollback behavior differs from Unix PTY. The most important limitation: ConPTY does not support all VT sequences that Unix terminals do. The VT100 parser (Layer 1) must handle a ConPTY-compatible subset on Windows.

**Recommended approach:** Abstract all OS-specific calls behind a `PlatformAdapter` trait (Rust) or interface (TypeScript). Each platform has its own implementation. The upper layers never touch OS APIs directly.

---

# 3. Pillar 2 — Self-Adapting Brain

## 3.1 The Problem With Hardcoded IDEs

Every current IDE is hardcoded. Cursor's context window strategy is fixed. VS Code's agent behavior is fixed. You cannot tell Cursor "I'm going offline for two hours, switch to local model mode and reduce verbosity." You cannot tell it "we're in a crunch, prioritize speed over explanation quality." You cannot tell it "this codebase uses a non-standard pattern, adjust how you suggest changes."

Current IDEs are mature but static. Doorway's brain is designed to be dynamic — it changes its own configuration, prompt strategy, model routing, and behavior based on:

1. User instructions (explicit)
2. Project context (inferred)
3. Session history (learned)
4. System state (observed)

## 3.2 Adaptation Dimensions

### Prompt Strategy Adaptation

The Brain maintains a `PromptStrategy` configuration per session:

```
PromptStrategy {
  verbosity: Terse | Normal | Detailed,
  explanation_mode: CodeOnly | Brief | Full,
  confirmation_threshold: Auto | AskAlways | AskForDestructive,
  context_injection: Minimal | Relevant | Full,
  error_handling: SilentRetry | NotifyAndRetry | AskUser,
}
```

This strategy is adjusted by:

- **Explicit user command:** "Go into silent mode" → verbosity: Terse, confirmation_threshold: Auto
- **Time of day / session length:** Long sessions → Brain gradually reduces context injection to preserve context window
- **Task type detection:** Brain classifies incoming tasks (debugging, feature building, refactoring, documentation) and adjusts strategy per class
- **Error frequency:** If agents are failing frequently, Brain increases confirmation_threshold and notification level

### Context Window Management

Claude CLI has a context window. As a session grows, the Brain monitors estimated token usage (from `TokenEstimate` events on the event bus) and acts proactively:

- **75% full:** Brain starts injecting compact summaries instead of full context
- **85% full:** Brain triggers a "compact" operation — generates a structured summary of everything accomplished so far, stores it, starts a fresh session seeded with the summary
- **Compact mode on-demand:** User says "compact" → immediate compaction regardless of usage level

This is the equivalent of Claude CLI's `/compact` command but automated, intelligent, and triggered before the context limit becomes a problem rather than after.

### Model Routing Adaptation

Brain maintains a routing table:

```
RoutingTable {
  task_type: TaskType,
  preferred_agent: AgentType,
  fallback_agent: Option<AgentType>,
  confidence: f32,
  sample_count: u32,
}
```

Over time, as Doorway observes which agent completes which task types faster and with fewer retries, it updates this table. The user can also set manual overrides ("always use Claude for architecture decisions"). The result is a routing system that gets smarter the more it's used.

### Behavioral Adaptation on Instruction

"I'm going out, set yourself up on auto-compact mode, minimize questions, finish the auth refactor."

Brain parses this instruction and configures:
- verbosity: Terse
- confirmation_threshold: Auto (no questions unless absolutely necessary)
- error_handling: SilentRetry (retry failures up to 3 times before surfacing)
- auto_compact: true
- goal: "Complete auth refactor" (stored as the active goal for this session)

When the user returns, Brain presents a summary of everything done, all decisions made autonomously, and any unresolved items that require human judgment.

## 3.3 The Goal Loop

Brain supports a "goal loop" mode — give it a high-level goal, let it run.

```
GoalLoop {
  goal: String,                      // "Ship the user profile feature"
  success_criteria: Vec<String>,     // ["all tests pass", "PR opened", "no TypeScript errors"]
  allowed_actions: ActionSet,        // what Brain is permitted to do autonomously
  checkpoint_interval: Duration,     // surface updates to user every N minutes
  abort_conditions: Vec<String>,     // "if touching auth module, stop and ask"
}
```

Brain decomposes the goal into tasks, delegates to agents, monitors progress, handles failures, checks success criteria, and reports completion. This is not just prompt chaining — it's a full planning and execution loop with observability.

---

# 4. Pillar 3 — Unified Cross-Agent Thread

## 4.1 The Problem This Solves

If you run Claude in one terminal and Codex in another, you have two disconnected streams of output. No shared context. No coordination. If Claude builds the backend and Codex builds the frontend and they make incompatible decisions, nobody catches it until integration.

The unified thread solves this by:
1. Merging all agent output into one coherent narrative
2. Sharing context between agents before tasks are delegated
3. Detecting and resolving conflicts between agent decisions
4. Presenting the whole session as a single readable conversation

## 4.2 Thread Architecture

A Thread is the fundamental unit of work in Doorway.

```
Thread {
  id: ThreadId,
  title: String,
  created_at: Timestamp,
  participants: Vec<Participant>,   // Claude, Codex, User, Brain
  messages: Vec<Message>,
  context: SharedContext,
  status: ThreadStatus,
  metadata: ThreadMetadata,
}

Message {
  id: MessageId,
  thread_id: ThreadId,
  author: Participant,
  timestamp: Timestamp,
  content: MessageContent,
  provenance: Provenance,           // which terminal session this came from
  parent_message_id: Option<MessageId>,  // for replies/branches
  tags: Vec<Tag>,
}

SharedContext {
  codebase_snapshot: Option<CodebaseSnapshot>,
  active_files: Vec<FilePath>,
  recent_changes: Vec<Change>,
  thread_summary: Option<String>,   // auto-generated summary of thread so far
  injected_context: Vec<ContextBlock>,  // explicit context additions
}
```

## 4.3 Context Merging

When Brain delegates a task to an agent, it pre-fills the agent's prompt with:

1. **Thread summary:** What has been done so far in this thread
2. **Relevant file context:** Files that are relevant to the delegated subtask
3. **Sibling agent output:** What the other agent(s) have produced that's relevant
4. **Explicit constraints:** "Claude is handling auth, do not modify auth files"
5. **Shared decisions:** Architectural decisions already made in this thread

This context injection ensures agents aren't working in isolation — they have the full picture of what their colleagues are doing.

## 4.4 Conflict Detection

When both agents modify overlapping parts of the codebase, Brain detects the conflict:

- Both agents touched the same file → conflict flagged
- Agent A's output assumes a function signature that Agent B modified → semantic conflict detected
- Agent A made an architectural decision that contradicts Agent B's assumption → surfaced to user

Conflict resolution options:
- **User resolves:** Both versions shown, user picks or merges
- **Brain arbitrates:** Based on which agent was assigned authority over that domain
- **Re-delegation:** Brain asks the relevant agent to revise in light of the conflict

## 4.5 Thread Rendering

The unified thread renders like a beautiful chat conversation, but with richer content types:

- **Text messages:** Explanations, questions, decisions
- **Code blocks:** With file attribution, diff view, accept/reject controls
- **Agent status pills:** Subtle indicators showing Claude and Codex are running
- **Decision cards:** When Brain makes an autonomous decision, it's surfaced as a card with the reasoning
- **Conflict banners:** When conflicts are detected, prominent resolution UI appears
- **Checkpoint summaries:** Periodic auto-generated summaries of thread progress

New threads are created by user action. Everything within a thread is one continuous conversation. Switching to a new thread is like opening a new browser tab — prior thread state is preserved, indexed, and searchable.

---

# 5. Pillar 4 — Peer-to-Peer Subagent Coworkers

## 5.1 Current State of the Art

Existing multi-agent frameworks (LangGraph, OpenAI Swarm, AutoGen) use a hub-and-spoke model. A central orchestrator calls agents, collects responses, and calls the next agent. The orchestrator holds all context. Agents cannot initiate communication with each other.

Doorway V1 also uses hub-and-spoke (Brain as orchestrator). This is correct for V1.

But the vision for Doorway V2+ is genuine peer-to-peer agent coworking — agents that can message each other directly without routing through Brain, negotiate task boundaries, and coordinate on shared resources.

## 5.2 The P2P Agent Model

Each CLI agent session has a message inbox:

```
AgentInbox {
  session_id: SessionId,
  messages: Queue<AgentMessage>,
  sender_permissions: HashMap<SessionId, Permission>,
}

AgentMessage {
  from: SessionId,
  to: SessionId,
  message_type: MessageType,  // Question | Information | TaskRequest | StatusUpdate
  content: String,
  requires_response: bool,
  timeout: Option<Duration>,
}
```

When Agent A needs information that Agent B has, it sends a message to Agent B's inbox. Agent B's supervisor detects the incoming message, injects it into Agent B's terminal at an appropriate pause point, captures the response, and routes it back to Agent A.

This creates the appearance of agents directly conversing — which is exactly what's happening at the Doorway orchestration layer.

## 5.3 Authority Delegation

For true P2P coworking, agents need domain authority — defined boundaries of what each agent owns.

```
AuthorityMap {
  agent: SessionId,
  owns: Vec<DomainPattern>,     // e.g., ["src/auth/**", "src/middleware/**"]
  can_read: Vec<DomainPattern>,  // read-only access to other domains
  can_request: Vec<SessionId>,   // which agents can be messaged for help
}
```

Brain sets up the authority map at task delegation time. Agents respect domain boundaries. If an agent needs to work outside its domain, it must send a request to the owning agent.

## 5.4 CLI Configuration Modification

One of the most advanced capabilities: Doorway can modify the configuration of running CLI tools to change their behavior mid-session.

Claude CLI supports configuration via `~/.claude/settings.json` and via `/` commands within a session. Codex CLI similarly has configuration paths.

Doorway's configuration manager:
- Reads current CLI configuration on startup
- Maintains a shadow configuration that can be modified at runtime
- Injects configuration changes via terminal commands (e.g., `/model claude-opus-4` to switch models within a Claude session)
- Restores original configuration when Doorway closes

This is what enables the self-adaptation in Pillar 2 — adapting the actual CLI configuration rather than just prompt strategy.

---

# 6. Pillar 5 — Plugin + OAuth Infrastructure

## 6.1 Why Plugins Are Essential

Codex Desktop's 300+ plugins are not a gimmick — they are the reason developers use it for tasks far beyond coding. Email management, calendar scheduling, browser control, GitHub PR review, mathematical computation, document generation. The plugin ecosystem transforms a coding tool into a general developer assistant.

Doorway needs this. But building 300 plugins is not the goal for V1. Building the *infrastructure* that makes plugins easy to create, install, and run is the goal.

## 6.2 Plugin Architecture

Every Doorway plugin is a self-contained module:

```
DoorwayPlugin {
  manifest: PluginManifest,
  runtime: PluginRuntime,
  auth: Option<OAuthConfig>,
  tools: Vec<ToolDefinition>,
}

PluginManifest {
  id: String,
  name: String,
  version: SemVer,
  description: String,
  author: String,
  permissions: Vec<Permission>,  // what the plugin is allowed to do
  triggers: Vec<Trigger>,        // what activates this plugin
}
```

Plugins are activated by:
- **Slash command:** `/github check-pr 42`
- **Agent request:** Agent's output includes a structured tool call that matches a plugin
- **Automation trigger:** Scheduled or event-based (see Pillar 7)
- **User explicit:** Clicking a plugin in the plugin panel

## 6.3 Plugin Runtime & Sandboxing

Plugins run in a sandboxed environment. They cannot:
- Access files outside the project directory (without explicit permission)
- Make network requests to domains not in their manifest's allowlist
- Modify terminal sessions directly (must go through Brain's API)
- Access other plugins' data

**Sandboxing mechanism:**
- **Node.js plugins:** `vm2` sandbox (restricted module access, no `require('fs')` without permission)
- **WebAssembly plugins:** WASI-based sandboxing (strongest isolation)
- **Shell script plugins:** Restricted shell (`rbash`) with environment controls

## 6.4 OAuth Infrastructure

Plugins that connect to external services (GitHub, Gmail, Notion, Jira, etc.) need OAuth. Doorway provides a reusable OAuth infrastructure:

**Flow:**
1. Plugin declares OAuth requirements in manifest: `{ provider: "github", scopes: ["repo", "pull_requests"] }`
2. User runs `/connect github` or clicks "Connect" on plugin
3. Doorway opens system browser to provider's OAuth page
4. Provider redirects to `doorway://oauth/callback/{plugin_id}`
5. Doorway intercepts the callback (custom URL scheme handler)
6. Exchanges code for tokens
7. Stores tokens in system keychain (not in Doorway's own storage)
8. Plugin receives tokens via Doorway's credential API

**Token storage:**
- macOS: Keychain Services
- Linux: libsecret / GNOME Keyring
- Windows: Windows Credential Manager

Tokens never leave the user's machine. Doorway does not see or store OAuth tokens on any server.

## 6.5 First-Party Plugins (V1 Priority)

These 5 plugins ship with Doorway V1, built to production quality:

| Plugin | What It Does |
|---|---|
| GitHub | PR creation, review, branch management, issue linking |
| Browser Use | Headless browser control (Playwright) for research and testing |
| File System | Smart file operations, search, directory analysis |
| Terminal | Direct shell command execution with output capture |
| Docs | Auto-generate README, changelog, API docs from codebase |

These are not wrappers — they are deep integrations built specifically for agent use.

---

# 7. Pillar 6 — Slash Commands & Smart Context

## 7.1 Command Architecture

Slash commands are the user's direct interface to Doorway's capabilities. They bypass the conversational layer for actions that need to be explicit and immediate.

Every slash command is registered in the command registry:

```
CommandDefinition {
  trigger: String,            // "/compact"
  aliases: Vec<String>,       // ["/c", "/compress"]
  description: String,
  arguments: Vec<ArgDef>,
  permissions: Vec<Permission>,
  handler: CommandHandler,
  context_sensitive: bool,    // does the command change based on current context?
}
```

## 7.2 Core Command Set

**Model & Session:**

| Command | Action |
|---|---|
| `/model [name]` | Switch active model for current session |
| `/agent [name]` | Switch active CLI agent |
| `/new` | Start new thread |
| `/thread [id]` | Switch to existing thread |
| `/compact` | Compact current session context |
| `/clear` | Clear current terminal session |
| `/reset` | Full session reset |

**Context:**

| Command | Action |
|---|---|
| `/add [file/dir]` | Add file or directory to active context |
| `/drop [file]` | Remove from context |
| `/context` | Show current context contents |
| `/snapshot` | Save current codebase state as reference point |
| `/diff [snapshot]` | Show changes since snapshot |

**Goals & Automation:**

| Command | Action |
|---|---|
| `/goal [description]` | Set active goal for goal loop mode |
| `/plan` | Generate execution plan for current goal |
| `/loop` | Start goal loop (autonomous execution) |
| `/pause` | Pause goal loop, surface current state |
| `/schedule [cron] [prompt]` | Schedule automated task |

**Intelligence:**

| Command | Action |
|---|---|
| `/blame [file:line]` | Show agent blame for a specific line |
| `/why` | Explain why the last change was made |
| `/archaeology [query]` | Search historical prompt/outcome database |
| `/route [task]` | Show which agent Brain would route a task to |

**Plugins:**

| Command | Action |
|---|---|
| `/connect [service]` | Connect OAuth service |
| `/plugins` | Show installed plugins |
| `/install [plugin]` | Install plugin from registry |

## 7.3 Smart Context Commands

Context-sensitive commands that know what you're looking at:

- If cursor is on a function: `/explain` explains that specific function
- If a test is failing: `/debug` automatically adds test context
- If in a PR review: `/suggest` generates inline suggestions
- If agent output visible: `/accept`, `/reject`, `/revise` act on that specific output

---

# 8. Pillar 7 — Automation & Scheduling

## 8.1 Why Developer Automation is Different

General automation tools (n8n, Make, Zapier) are built around API connectors and HTTP webhooks. They're excellent for business process automation but poor for developer workflows that require:

- Understanding code context
- Running terminal commands
- Making judgment calls about code quality
- Generating and committing code changes
- Interacting with running processes

Doorway's automation layer is developer-native — it runs actual agent sessions with full codebase context, not just HTTP requests.

## 8.2 Automation Architecture

An Automation is a saved, schedulable Doorway workflow:

```
Automation {
  id: AutomationId,
  name: String,
  trigger: AutomationTrigger,
  workflow: Vec<WorkflowStep>,
  plugins: Vec<PluginId>,           // which plugins this automation uses
  context: AutomationContext,
  output: OutputConfig,
  notifications: NotificationConfig,
}

AutomationTrigger {
  // Schedule-based
  cron: Option<CronExpression>,
  // Event-based  
  on_git_push: Option<BranchPattern>,
  on_pr_opened: Option<RepoPattern>,
  on_test_failure: bool,
  on_sentry_alert: bool,
  // Manual
  on_demand: bool,
}

WorkflowStep {
  agent: AgentType,
  prompt: String,
  plugins: Vec<PluginId>,
  on_failure: FailureAction,
  output_to_next: bool,  // pass output to next step as context
}
```

## 8.3 Example Automations

**Morning PR Review (runs at 9am):**
```
Trigger: Cron "0 9 * * 1-5"
Step 1: GitHub plugin → fetch open PRs
Step 2: Claude → review each PR for code quality, security issues, breaking changes
Step 3: Docs plugin → generate review summary markdown
Step 4: GitHub plugin → post summary as PR comment
Output: Slack notification with summary
```

**Test Failure Auto-Debug:**
```
Trigger: on_test_failure
Step 1: Terminal plugin → capture failing test output and stack trace
Step 2: Claude → analyze failure, identify root cause
Step 3: Claude → attempt fix
Step 4: Terminal plugin → re-run tests
Step 5: If tests pass → GitHub plugin → create PR with fix
Output: Notification with result
```

**Weekly Architecture Review:**
```
Trigger: Cron "0 18 * * 5" (Friday 6pm)
Step 1: File System plugin → scan codebase for complexity metrics
Step 2: Codex → identify technical debt, coupling issues, performance hotspots
Step 3: Claude → generate prioritized refactoring recommendations
Step 4: Docs plugin → generate architecture health report markdown
Output: Save to /docs/architecture-health/ with date
```

## 8.4 Automation Runtime

Automations run as isolated Doorway sessions — they don't interfere with the user's active session. They have their own terminal sessions, their own thread (visible in the Automations panel), and their own context.

When an automation completes, the user sees:
- Notification (configurable: push, email, Slack)
- Automation thread link — full record of everything the automation did
- Output artifacts — any files generated, PRs opened, reports created

---

# 9. Pillar 8 — Technical Pillars

## 9.1 Worktree Management

Git worktrees allow multiple branches to be checked out simultaneously in separate directories. Doorway integrates natively with worktrees to enable parallel agent work on different branches without conflicts.

```
WorktreeManager {
  project_root: PathBuf,
  worktrees: HashMap<BranchName, WorktreePath>,
  agent_assignments: HashMap<SessionId, WorktreePath>,
}
```

When multiple agents are working in parallel:
- Agent A works in `worktrees/feature-auth`
- Agent B works in `worktrees/feature-payments`
- Neither touches the other's working tree
- Brain monitors both, merges completed work back to main via PR

This eliminates the "merge conflict from parallel agents" problem entirely.

## 9.2 Thread Persistence

Every thread is persisted to a local SQLite database. This is not optional — it is always on.

Schema:
```sql
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at INTEGER,
  status TEXT,
  project_path TEXT
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT REFERENCES threads(id),
  author TEXT,
  content TEXT,
  content_type TEXT,
  timestamp INTEGER,
  session_id TEXT,
  provenance TEXT
);

CREATE TABLE agent_sessions (
  id TEXT PRIMARY KEY,
  thread_id TEXT REFERENCES threads(id),
  agent_type TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  recovery_count INTEGER,
  final_state TEXT
);

CREATE TABLE context_snapshots (
  id TEXT PRIMARY KEY,
  thread_id TEXT REFERENCES threads(id),
  timestamp INTEGER,
  files_json TEXT,
  summary TEXT
);
```

Threads are indexed for full-text search. The `/archaeology` command searches this database.

## 9.3 Terminal Actions

Beyond reading terminal output, Doorway can execute structured terminal actions:

```
TerminalAction {
  action_type: ActionType,
  target_session: SessionId,
  parameters: ActionParameters,
  requires_confirmation: bool,
}

ActionType:
  RunCommand { command: String },
  InjectInput { text: String },
  PressKey { key: KeySequence },
  ResizeTerminal { cols: u16, rows: u16 },
  SendSignal { signal: Signal },
  CompactSession,
  SwitchModel { model: String },
```

Terminal actions are logged to the thread as action events, creating a full audit trail of every programmatic interaction with terminal sessions.

## 9.4 Document Creation

Doorway agents can generate documents as structured outputs, not just code:

- **README generation:** Analyze codebase, generate comprehensive README with sections, examples, API docs
- **Architecture Decision Records (ADRs):** When a significant decision is made in a thread, offer to create an ADR
- **Changelog generation:** Diff-based changelog from git history, formatted for release
- **Test documentation:** Generate human-readable test documentation from test suites
- **API reference:** Generate API reference from code analysis

Documents are created in the project directory under `/docs/doorway/` by default, committed to git as regular files.

## 9.5 Provider Abstraction

Doorway is not locked to Claude and Codex. The provider system abstracts any CLI tool:

```
ProviderDefinition {
  id: ProviderId,
  name: String,
  cli_binary: String,           // "claude" | "codex" | "gemini" | "ollama"
  launch_args: Vec<String>,
  prompt_patterns: PromptPatterns,  // for Layer 2 state detection
  question_patterns: Vec<Regex>,
  completion_patterns: Vec<Regex>,
  config_path: Option<PathBuf>,
  supports_model_switching: bool,
}
```

Built-in providers: Claude CLI, Codex CLI, Gemini CLI, Ollama (local models).

Custom providers: Users can define their own provider config for any interactive CLI tool.

## 9.6 Connector System

Connectors are lightweight integrations that pull external data into Doorway context:

| Connector | What It Provides |
|---|---|
| GitHub | PR status, issues, code review comments |
| Jira/Linear | Ticket context, sprint status |
| Sentry | Recent errors and stack traces |
| Datadog | Metrics, alerts, log queries |
| Notion | Documentation context |
| Slack | Relevant thread context |

Connectors are read-only by default. Write operations go through plugins (Pillar 5).

---

# 10. Pillar 9 — Team Operating System

## 10.1 The Team Context Problem

Current developer tools are fundamentally single-player. Cursor, VS Code, even GitHub Copilot — designed for one developer, one editor, one context. "Collaboration" means sharing a code review, not sharing a live development session.

Doorway threads are natively shareable. A thread opened by Developer A can be joined by Developer B in real time or asynchronously. This is not screen sharing — it's context sharing. Both developers see the same thread, the same agent outputs, the same decisions. Both can issue instructions. Both can see the same unified history.

## 10.2 The Living PR

A traditional PR is a static snapshot: "here is the diff, here are some comments."

A Doorway Living PR is the complete history of work that produced the diff:

```
LivingPR {
  pr_id: PRId,
  thread_id: ThreadId,     // the entire Doorway thread that produced this PR
  title: String,
  diff: GitDiff,
  story: PRStory,          // auto-generated narrative of the work
  decisions: Vec<Decision>, // every significant decision made during the work
  agents_involved: Vec<AgentType>,
  human_touchpoints: Vec<HumanAction>,  // where the developer made decisions
}
```

When reviewers open the PR, they see not just the diff but the full story. They can ask questions to the agents that wrote the code (via the thread). Agents can respond to review comments autonomously if the comments are addressable without human judgment.

## 10.3 Bug Archaeology

When a bug is filed, Doorway's archaeology system traces back through session history:

1. Identify the file and line where the bug manifests
2. Find all Doorway sessions that touched that file/line
3. Retrieve the context of each session — what was the prompt, what was the reasoning, what decision was made
4. Synthesize a "why this code exists" explanation

This converts "why did this break" from a multi-hour investigation into a 30-second query.

## 10.4 Async Agent Handoff

Developer A works until midnight on a feature. Delegates remaining tasks to agents. Goes to sleep. Doorway runs autonomously.

Developer B (different timezone) opens Doorway at 9am. Sees the thread with all progress. Agent sessions may still be running. Developer B can:
- Read the full thread history
- Continue issuing instructions
- Pick up where Developer A left off
- Resume agent sessions that completed overnight

The thread is the handoff. No standup message. No Slack summary. Everything is already there.

## 10.5 The Standup Killer

Doorway's daily briefing:

At a configured time each morning, Doorway generates a team briefing:

```
Daily Briefing — May 24, 2026

Yesterday across the team:
- 4 bugs fixed (Claude: 3, Codex: 1)
- auth-refactor branch: 847 lines changed, PR #42 opened
- test coverage improved: 78% → 83%
- 2 automations ran: PR review (5 PRs reviewed), dependency check (3 updates available)

Today in queue:
- 3 tasks assigned to agents, running now
- PR #41 has 2 review comments awaiting response
- payment-module thread paused, awaiting decision from @developer

Needs your attention:
- Architecture decision required: see thread "payment-refactor" message from Claude
```

Nobody writes standup updates. Doorway has it.

## 10.6 Agent Coworker Communication

When an agent running in Developer A's session needs information that Developer B possesses:

1. Agent's question is detected by supervisor
2. Brain determines the question requires Developer B's domain knowledge
3. Brain sends a notification to Developer B: "Claude is working on auth and has a question about the payment module you wrote"
4. Developer B answers in the notification or opens the thread
5. Answer is injected into Agent A's session
6. Work continues

This is async agent-to-human routing across a team. No tool does this today.

---

# 11. Bonus Innovations

## 11.1 Agent Blame Tracking

Every code change made by an agent in a Doorway session is tagged with:
- Which agent made it (Claude, Codex, etc.)
- Which developer session it came from
- Which thread it was part of
- The prompt context that led to the change
- The timestamp

This data is stored in a local SQLite database alongside the thread persistence layer.

The `/blame` command surfaces this: `/blame src/auth/token.ts:42` shows not just git blame but *agent blame* — "this line was written by Claude in thread 'auth-refactor' on Tuesday, here was the context."

Over time, the agent blame database reveals patterns: which agents write code that gets changed again quickly (low quality signal), which agents write code that stays untouched (high quality signal). This feeds directly into the routing intelligence.

## 11.2 Prompt Archaeology

Every prompt sent to every agent, and the corresponding outcome (success/failure, how quickly the task completed, whether the output was accepted or revised), is stored locally.

The `/archaeology` command makes this searchable: "find me how I handled that race condition last month." Doorway searches the prompt database and surfaces the relevant session, the exact prompt that worked, and the agent's output.

Over time this becomes each developer's personal library of proven prompts for their specific codebase. No other tool builds this.

## 11.3 Agent Routing Intelligence

Brain maintains per-developer, per-project routing statistics:

```
RoutingStats {
  agent: AgentType,
  task_class: TaskClass,       // bug_fix | feature | refactor | test | docs
  language: Option<String>,    // Rust | TypeScript | Python | etc.
  avg_completion_time_ms: u64,
  success_rate: f32,           // tasks completed without retry
  acceptance_rate: f32,        // outputs accepted without revision
  sample_count: u32,
}
```

When Brain decides which agent to assign a task, it uses these stats. The routing gets better with every session because the stats are always being updated.

Manual override is always available. The routing intelligence is a default behavior, not a forced constraint.

## 11.4 Diff Narrative

After agents complete work, Doorway generates a human-readable narrative of what changed and why:

Not:
```diff
- const token = req.headers.authorization
+ const token = req.headers.authorization?.split(' ')[1]
```

But:
> "Claude modified the token extraction in `src/auth/middleware.ts` line 34. The original code would fail if the Authorization header was present but malformed (e.g., missing the 'Bearer' prefix). The fix adds optional chaining and splits on the space character to extract only the token value. This was triggered by the failing test `auth.test.ts:TokenExtraction` which sent a malformed header."

This narrative becomes part of the Living PR, the git commit message, and the agent blame record.

## 11.5 Collaborative Session Sharing

The most advanced team feature — two developers, one Doorway thread, real time.

Developer A and Developer B both have Doorway open. A shares a thread with B (via a local network link or a relay server for remote teams). Both see the same thread state. Both can issue instructions. Both can accept/reject agent outputs.

This is fundamentally different from screen sharing because:
- Both developers have their own cursor and input
- Both can interact with the thread simultaneously
- The thread handles concurrent instructions with merge semantics
- Agents receive a unified context from both developers

For remote teams, the relay server handles only event synchronization (small JSON events) — it never sees code, credentials, or terminal output. These stay local.

---

# 12. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DOORWAY FRONTEND                            │
│         (Electron shell, React, Doorway Design System)              │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  ┌───────────────┐  │
│  │  Thread  │  │  File Tree   │  │  Terminal │  │  Automations  │  │
│  │   View   │  │   + Diff     │  │  Status   │  │    Panel      │  │
│  └────┬─────┘  └──────┬───────┘  └─────┬─────┘  └───────┬───────┘  │
└───────┼───────────────┼───────────────┼─────────────────┼───────────┘
        │               │               │                 │
┌───────▼───────────────▼───────────────▼─────────────────▼───────────┐
│                         DOORWAY BRAIN (IPC)                         │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  ┌───────────┐  │
│  │  Orchestr-  │  │   Context    │  │  Routing   │  │  Goal     │  │
│  │   ator      │  │   Manager    │  │  Engine    │  │  Loop     │  │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘  └─────┬─────┘  │
│         └───────────────┬┘                └────────────────┘        │
│                   ┌─────▼──────┐                                    │
│                   │ Event Bus  │                                    │
│                   └─────┬──────┘                                    │
└─────────────────────────┼──────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
┌───────▼────────┐ ┌──────▼─────────┐ ┌────▼───────────┐
│ Terminal Layer │ │ Terminal Layer │ │ Terminal Layer │
│   (Claude CLI) │ │  (Codex CLI)   │ │  (Custom CLI)  │
│                │ │                │ │                │
│ ┌────────────┐ │ │ ┌────────────┐ │ │ ┌────────────┐ │
│ │  Layer 3   │ │ │ │  Layer 3   │ │ │ │  Layer 3   │ │
│ │ Supervisor │ │ │ │ Supervisor │ │ │ │ Supervisor │ │
│ ├────────────┤ │ │ ├────────────┤ │ │ ├────────────┤ │
│ │  Layer 2   │ │ │ │  Layer 2   │ │ │ │  Layer 2   │ │
│ │ Semantic   │ │ │ │ Semantic   │ │ │ │ Semantic   │ │
│ ├────────────┤ │ │ ├────────────┤ │ │ ├────────────┤ │
│ │  Layer 1   │ │ │ │  Layer 1   │ │ │ │  Layer 1   │ │
│ │  VT100     │ │ │ │  VT100     │ │ │ │  VT100     │ │
│ ├────────────┤ │ │ ├────────────┤ │ │ ├────────────┤ │
│ │  Layer 0   │ │ │ │  Layer 0   │ │ │ │  Layer 0   │ │
│ │   PTY      │ │ │ │    PTY     │ │ │ │    PTY     │ │
│ └────────────┘ │ │ └────────────┘ │ │ └────────────┘ │
└────────────────┘ └────────────────┘ └────────────────┘
        │                  │                   │
        └──────────────────┴───────────────────┘
                           │
                    ┌──────▼──────┐
                    │  OS Layer   │
                    │  (Mac/Win/  │
                    │   Linux)    │
                    └─────────────┘
```

---

# 13. Technology Stack Decisions

## 13.1 Core Runtime

**Electron** for the application shell. Not because it's the best performance choice but because:
- Node.js process side handles IPC, plugin system, automation runtime
- Chromium renderer handles the UI
- Native OS integration (system keychain, URL scheme handling, notifications)
- Single codebase for Mac/Windows/Linux

**Rust for the terminal harness.** The four-layer terminal stack runs as a Rust binary that the Electron app spawns as a sidecar process and communicates with over IPC (Unix domain sockets on Mac/Linux, named pipes on Windows). Rust because:
- PTY and process control require low-level OS APIs — Rust handles this safely
- Performance matters here — processing terminal output at low latency
- `portable-pty` and `vte` crates exist and are production-quality
- Memory safety prevents the class of bugs that crash terminal sessions silently

## 13.2 Key Dependencies

**Terminal Layer (Rust sidecar):**
- `portable-pty` — cross-platform PTY
- `vte` — VT100/VT220 parser
- `tokio` — async runtime
- `serde_json` — IPC serialization
- `rusqlite` — thread and session persistence

**Brain + Plugin Runtime (Node.js in Electron main):**
- `ipc-main` / `ipc-renderer` — Electron IPC
- `better-sqlite3` — synchronous SQLite for fast queries
- `node-schedule` — cron-style automation scheduling
- `keytar` — system keychain access (wraps macOS Keychain, libsecret, Windows Credential Manager)
- `@octokit/rest` — GitHub integration
- `playwright` — browser use plugin

**UI (Renderer):**
- React 19
- Tailwind CSS (utility layer only)
- Custom Doorway Design System (see design doc)
- `monaco-editor` — code diff views
- `xterm.js` — terminal display (display only, not orchestration)
- `framer-motion` — transitions

## 13.3 IPC Protocol Between Rust Sidecar and Node Brain

Communication is line-delimited JSON over a Unix domain socket / named pipe:

```json
// Rust sidecar → Node Brain (event)
{"type":"terminal_event","session_id":"cl-001","event_type":"output_chunk","content":"Here is the fix...","timestamp":1716537600000}

// Node Brain → Rust sidecar (command)  
{"type":"terminal_command","session_id":"cl-001","command":"inject_input","data":"yes, proceed with option 2\n"}

// Node Brain → Rust sidecar (spawn command)
{"type":"spawn_session","session_id":"cl-002","provider":"claude","args":["--dangerously-skip-permissions"],"working_dir":"/projects/myapp"}
```

This protocol is versioned. Breaking changes require a version bump and migration.

## 13.4 Data Storage

All data is local. Nothing goes to Doorway servers except:
- Telemetry (opt-in, anonymized, no code content)
- Plugin registry API (package metadata only, no user data)
- Team relay for collaborative sessions (event sync only, no code/credentials)

Local storage paths:
- `~/.doorway/db/` — SQLite databases (threads, sessions, archaeology, routing stats)
- `~/.doorway/plugins/` — installed plugin packages
- `~/.doorway/config/` — user configuration
- `~/.doorway/logs/` — terminal session logs (rotating, 30 day retention default)
- `{project}/.doorway/` — project-specific configuration (committed to git)

---

*End of Document*

---

**Doorway Technical Vision v1.0**
*Classification: Internal — Litchi Studio*
*Total pillars: 9 core + 3 innovation layers*
*Next: Frontend Design System (separate document)*
