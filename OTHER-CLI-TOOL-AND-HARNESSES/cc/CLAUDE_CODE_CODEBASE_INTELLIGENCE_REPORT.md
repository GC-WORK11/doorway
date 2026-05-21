# Claude Code Codebase Intelligence Report for Doorway

**Research date:** 2026-05-17
**Target:** Claude Code source at `/home/govinda/analysis/cc/src`
**Purpose:** Extract architecture, orchestration, terminal-agent, context, permission, persistence, and human-in-the-loop workflow lessons for Doorway's local-first agentic coding cockpit.

---

## 1. Executive Summary

Claude Code is a terminal-native coding agent built on React/Ink for terminal rendering, a query-loop agent architecture, Zod-validated tool definitions, a layered permission system, and JSONL-based session persistence. It distinguishes interactive mode (full TUI via Ink) from headless mode (NDJSON via `StructuredIO`), uses git worktrees for subagent isolation, and implements auto-compaction to manage context window pressure.

**Doorway's key takeaways:**
- Terminal-visible execution is trust-building — Doorway must preserve this
- Permission prompts are product-critical — needs formal receipts
- Project instructions (CLAUDE.md) are the DNA of context — Doorway needs equivalent
- Session persistence via JSONL works but truncates large outputs — Doorway needs full evidence layer
- Agents should be workers, not orchestrators — Doorway coordinates, CC executes
- Context compaction is mandatory at scale — Doorway needs its own compaction strategy
- Hook system is powerful but complex — Doorway needs simpler event lanes

---

## 2. Codebase Map

```
/home/govinda/analysis/cc/src/
├── main.tsx                    # Commander.js CLI, main() entry, run() command setup
├── commands.ts                 # Command registry, slash command definitions
├── Tool.ts                     # Tool interface, buildTool(), findToolByName()
├── tools.ts                    # getAllBaseTools(), assembleToolPool()
├── tools/                      # 44 subdirs, one per tool (BashTool, FileEditTool, etc.)
├── query.ts                    # query() async generator, queryLoop() state machine
├── QueryEngine.ts              # submitMessage(), outer SDK wrapper
├── coordinator/                # Coordinator mode for multi-agent orchestration
├── context.ts                   # getSystemContext(), getUserContext()
├── setup.ts                    # Project onboarding, first-run setup
├── history.ts                  # Global prompt history, ~/.claude/history.jsonl
├── hooks/                      # Hook system: 24 event types, shell/prompt/agent/http
├── skills/                     # Skill loading, SKILL.md frontmatter parsing
├── plugins/                    # Plugin discovery and loading
├── state/                      # AppStateStore, in-memory state
├── services/                   # Compact service, permissions, analytics
├── utils/
│   ├── sessionStorage.ts       # JSONL transcript persistence
│   ├── fileHistory.ts          # File snapshot/rewind system
│   ├── toolResultStorage.ts    # Large tool result offloading
│   ├── conversationRecovery.ts # Session resume logic
│   ├── permissions/            # Permission modes, rules, classifier, denial tracking
│   ├── git.ts                  # findGitRoot(), canonical root resolution
│   ├── gitDiff.ts              # Git diff/stats fetching
│   ├── claudemd.ts             # CLAUDE.md loading, @include directive
│   └── gracefulShutdown.ts     # Cleanup registry, signal handling
├── ink/                        # Ink React reconciler, Yoga layout, ANSI parsing
├── ink.ts                      # Ink entry point with ThemeProvider
├── interactiveHelpers.tsx      # renderAndRun(), React mount helpers
├── replLauncher.tsx            # launchRepl() for interactive REPL
├── screens/                   # REPL, Setup, Permission screens
├── components/                 # App shell, dialogs, permission UI
├── entrypoints/
│   ├── cli.tsx                 # Fast-path bootstrap (--version, env setup)
│   └── init.ts                 # Initialization logic
├── cli/
│   ├── print.ts                # Headless mode via -p/--print
│   ├── structuredIO.ts         # NDJSON streaming for SDK
│   └── remoteIO.ts             # WebSocket remote execution
├── tasks/                      # Task types: local_bash, local_agent, remote_agent
├── memdir/                     # Auto-memory system, daily logs
├── migrations/                 # Session format migrations
└── native-ts/                  # Native TypeScript utilities
```

---

## 3. Entry Points and Command Lifecycle

### CLI Entrypoint Chain

```
cli.tsx (bootstrap)
  → main.tsx (Commander.js, main())
    → run() (Commander command setup)
      → launchRepl() (interactive) OR runHeadless() (headless)
```

**Key files:**
- `entrypoints/cli.tsx:1` — Bootstrap: env setup, fast-path for `--version`
- `main.tsx:585` — `export async function main()` — primary entry
- `main.tsx:884` — `async function run()` — Commander setup and execution
- `cli/print.ts` — `runHeadless()` for `-p` mode

### CLI Args Parsing

**Library:** `@commander-js/extra-typings` (Commander.js with TypeScript)

Global options: `--print/-p`, `--bare`, `--init`, `--init-only`, `--output-format`, `--input-format`, `--model`, `--agent`, `--mcp-config`, `--continue`, `--resume`, `--settings`, `--maintenance`, `--verbose`, `--debug`, `--add-dir`, `--tmux`, `--worktree`.

### Interactive vs Headless Detection

```typescript
// main.tsx:797-803
const isNonInteractive = hasPrintFlag || hasInitOnlyFlag || hasSdkUrl || !process.stdout.isTTY;
```

| Mode | UI | Input | Output |
|------|----|-------|--------|
| Interactive | Ink React TUI | TTY keyboard | ANSI terminal |
| Headless (-p) | None | stdin pipe | NDJSON stream |
| SDK (--sdk-url) | None | StructuredIO | JSON lines |

### Signal Handling

- **SIGINT interactive:** `process.exit(0)` in `main.tsx:598`
- **SIGINT headless:** AbortController abort → `gracefulShutdown()` in `cli/print.ts:1024`
- **SIGTERM/SIGHUP:** Exit codes 143/129 via `gracefulShutdownSync()`

---

## 4. Agent Loop Architecture

### Central Loop: `queryLoop()` in `query.ts`

**Type:** Async generator (`async function*`)

**State shape:**
```typescript
type State = {
  messages: Message[]
  toolUseContext: ToolUseContext
  autoCompactTracking: AutoCompactTrackingState | undefined
  maxOutputTokensRecoveryCount: number
  hasAttemptedReactiveCompact: boolean
  maxOutputTokensOverride: number | undefined
  pendingToolUseSummary: Promise<ToolUseSummaryMessage | null> | undefined
  stopHookActive: boolean | undefined
  turnCount: number
  transition: Continue | undefined
}
```

### State Machine (Text Form)

```
ENTRY: queryLoop(QueryParams)
  ├─► Preprocessing: memory prefetch, snip compaction, microcompact, autocompact
  ├─► Model Streaming: deps.callModel() → yields content blocks as they arrive
  │     └─► Collects tool_use blocks into toolUseBlocks[], sets needsFollowUp=true
  ├─► Decision: needsFollowUp?
  │     ├─► FALSE → stop hooks → token budget → RETURN { reason: 'completed' }
  │     └─► TRUE → execute tools → collect results → CONTINUE (next turn)
  └─► EXIT: RETURN { reason: 'completed' | 'aborted_streaming' | 'aborted_tools' |
                       'max_turns' | 'hook_stopped' | 'stop_hook_prevented' |
                       'blocking_limit' | 'prompt_too_long' }
```

### Tool Execution Paths

**Path A — StreamingToolExecutor (concurrent):**
- Tools added as they stream in from model
- Concurrency-safe tools run in parallel
- Non-concurrent tools serialized

**Path B — Sequential (`toolOrchestration.ts:19-82`):**
- Tools partitioned into concurrency-safe batches
- Read-only batch: concurrent via `runToolsConcurrently()`
- Non-read-only: serial via `runToolsSerially()`

### QueryEngine Wrapper (`QueryEngine.ts:209-1156`)

`submitMessage()` is the outer wrapper:
```
processUserInput() → shouldQuery? → yield buildSystemInitMessage()
  → for await (message of query()) → normalize and yield messages
  → yield result (success/error)
```

### Loop Exit Reasons

| Reason | Condition |
|--------|-----------|
| `completed` | No tool calls needed, stop hooks pass |
| `aborted_streaming` | Abort during model streaming |
| `aborted_tools` | Abort during tool execution |
| `max_turns` | `nextTurnCount > maxTurns` |
| `hook_stopped` | Stop hook prevented continuation |
| `stop_hook_prevented` | Stop hook blocked |
| `blocking_limit` | Hard token limit reached |
| `prompt_too_long` | Context collapse failed |

### Recovery Mechanisms

1. **Max output tokens recovery** (max 3 attempts): escalate to 64k cap, inject recovery message
2. **Prompt-too-long recovery**: drain context-collapse staged collapses, then reactive compact
3. **Model fallback**: switch to fallback model on `FallbackTriggeredError`

### Coordinator Mode

When `COORDINATOR_MODE` enabled, main agent is coordinator directing worker subagents. Workers get restricted tools (`CLAUDE_CODE_SIMPLE`: Bash, Read, Edit only). Task notifications delivered as XML-tagged user messages.

---

## 5. Terminal I/O and Command Execution Model

### Rendering Stack

**Framework:** Ink (React for CLIs) on **Yoga** layout engine (Facebook flexbox)

**Data flow:**
```
React Component Tree
  → Ink Reconciler (creates DOMElement tree with yoga nodes)
  → renderNodeToOutput() (walks tree, applies styles, writes to Output)
  → Output.get() (flushes operations to Screen buffer)
  → LogUpdate.render() (diffs prev Screen vs next Screen)
  → Diff patches → ANSI sequences → stdout.write()
```

### Key Files

| File | Responsibility |
|------|---------------|
| `ink/ink.tsx` | Main Ink class (~1000 lines), render loop, resize, SIGCONT |
| `ink/screen.ts` | Screen buffer (Int32Array packing), StylePool, CharPool, diffEach |
| `ink/output.ts` | Collects write/blit/clear operations from render tree |
| `ink/log-update.ts` | Diffs prev/next screens, generates patches, scroll optimization |
| `ink/renderer.ts` | Creates Frame from yoga layout |
| `ink/terminal.ts` | Terminal capability detection, writeDiffToTerminal |
| `ink/parse-keypress.ts` | Keyboard input parsing (CSI u, modifyOtherKeys, mouse) |
| `ink/termio/` | ANSI parsing: CSI, OSC, SGR, tokenizer |

### Input Capture

- Node.js `stdin` with `setRawMode(true)` for character-by-character input
- `parse-keypress.ts` tokenizes escape sequences into `ParsedKey`/`ParsedInput`
- Supports: standard keypresses, modifiers (Ctrl/Shift/Alt/Meta), Kitty keyboard protocol, xterm modifyOtherKeys, mouse events (SGR), bracketed paste mode

### Terminal Compatibility

**Detection layers:**
1. Environment variables (`TERM_PROGRAM`, `TERM`, `TMUX`, `STY`)
2. XTVERSION probe (async, survives SSH)
3. Feature detection via DECRQM queries

**Atomic updates:** DEC 2026 (BSU/ESU) prevents visual tearing during redraws — supported by iTerm2, WezTerm, Ghostty, kitty, Windows Terminal, foot, Alacritty, VS Code.

**Scroll optimization:** DECSTBM + hardware scroll instead of rewriting rows.

### Damage Tracking

- Each `setCellAt()` call expands `screen.damage` rectangle
- `diffEach()` only compares cells within damage region
- Unchanged regions blit via `TypedArray.set()`

---

## 6. Tool/File Editing Model

### Tool Interface (`Tool.ts:362-695`)

```typescript
type Tool<Input, Output, P> = {
  name: string
  aliases?: string[]
  inputSchema: Input
  outputSchema?: z.ZodType<unknown>
  call(args, context, canUseTool, parentMessage, onProgress?): Promise<ToolResult<Output>>
  description(input, options): Promise<string>
  isConcurrencySafe(input): boolean
  isReadOnly(input): boolean
  isDestructive?(input): boolean
  validateInput?(input, context): Promise<ValidationResult>
  checkPermissions(input, context): Promise<PermissionResult>
  renderToolResultMessage?(content, progressMessages, options): React.ReactNode
  renderToolUseMessage?(input, options): React.ReactNode
}
```

Built with `buildTool<D>()` helper which applies `TOOL_DEFAULTS` (all optional fields have sensible no-op defaults).

### Core Tools Inventory

| Tool | File | Purpose |
|------|------|---------|
| BashTool | `tools/BashTool/BashTool.tsx` | Shell command execution |
| FileReadTool | `tools/FileReadTool/` | File reading with state cache |
| FileEditTool | `tools/FileEditTool/` | In-place editing via old_string/new_string |
| FileWriteTool | `tools/FileWriteTool/` | Full file write/overwrite |
| GlobTool | `tools/GlobTool/` | Pattern matching |
| GrepTool | `tools/GrepTool/` | Text search |
| WebSearchTool | `tools/WebSearchTool/` | Web searches |
| WebFetchTool | `tools/WebFetchTool/` | URL content fetching |
| AgentTool | `tools/AgentTool/` | Sub-agent spawning |
| TaskStopTool | `tools/TaskStopTool/` | Cancel tasks |
| EnterWorktreeTool | `tools/WorktreeTool/` | Git worktree management |
| MCPTool | `tools/McpTool/` | MCP server tools |
| NotebookEditTool | `tools/NotebookEditTool/` | Jupyter notebook editing |
| SkillTool | `tools/SkillTool/` | Skill execution |

### File Edit Flow

1. Model sends `old_string` + `new_string` + `file_path`
2. `applyEditToFile()` does string replacement (not true diff/patch)
3. Quote normalization: curly quotes in file matched with straight quotes from model
4. TOCTOU protection: timestamp check before write, content fallback on Windows
5. `structuredPatch` from `diff` library generates human-readable diff
6. `readFileState` cache updated after write

### Bash Security

20 security checks in `bashSecurity.ts`:
- Fragment detection (incomplete commands)
- Command substitution (`$()`, backticks)
- Input/output redirection
- Zsh dangerous commands (`zmodload`, `emulate`, `sysopen`, `zpty`)
- `/proc/*/environ` access blocking
- Sed constraints
- Path traversal validation
- Dangerous path detection: `/`, `/home`, `/etc`, `/usr`, `/bin`, `/sbin`, `/tmp`, `/var`, `/Library`, `/System`, `.git`, `.vscode`, `.idea`, `.claude`

### Tool Concurrency

Tools partitioned into batches:
- **Concurrency-safe** (read-only): Glob, Grep, FileRead → parallel execution
- **Non-concurrent** (stateful): Bash, Edit, Write → serialized

---

## 7. Context Loading and Project Memory

### Project Root Detection (`utils/git.ts`)

```typescript
findGitRootImpl = memoizeWithLRU(max=50) → walk up for .git directory/file
findCanonicalGitRoot() → resolves through worktrees via .git → gitdir: → commondir
```

### CLAUDE.md Loading (`utils/claudemd.ts`)

**Hierarchy (loaded in order, later higher priority):**
1. Managed: `/etc/claude-code/CLAUDE.md` — global, all users
2. User: `~/.claude/CLAUDE.md` — private global
3. Project: `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/*.md` — checked into codebase
4. Local: `CLAUDE.local.md` — private project-specific

**`@include` directive:** `@path`, `@./relative`, `@~/home`, `@/absolute` with max 5 levels deep, fragment stripping.

**Frontmatter:** `paths:` for conditional rules (glob patterns), `type:` for memory taxonomy.

### Context Compaction

**Auto-compact triggers at:**
- `AUTOCOMPACT_BUFFER_TOKENS = 13,000` reserved buffer
- `WARNING_THRESHOLD_BUFFER_TOKENS = 20,000`
- Circuit breaker: stops after 3 consecutive failures

**Process (`microcompactMessages()`):**
- Strips images/documents (replaced with `[image]`/`[document]` markers)
- Groups messages by API round trip
- Large tool results truncated with `[Old tool result content cleared]`
- Skills truncated to 5,000 tokens max post-compaction

**Post-compact restoration:** Up to 5 files, 50,000 token budget, 5,000 tokens per file.

### Git Context

- **Status:** `getGitStatus()` — branch, main branch, git user, short status, recent commits (last 5). Truncated to 2,000 chars.
- **Diff:** `fetchGitDiff()` — max 50 files, 1MB per file, 400 lines per file, skip files larger than threshold. Uses `--shortstat` probe before expensive operations.
- **Untracked files:** via `git ls-files --others --exclude-standard`

### Memory Files (`memdir/`)

- Stored at `~/.claude/projects/{sanitized-cwd}/memory/` or custom `MEMORY.md` path
- Index: `MEMORY.md` with topic files (`*.md`)
- Daily logs: `memory/logs/YYYY/MM/YYYY-MM-DD.md`
- `buildSearchingPastContextSection()` searches memory + transcripts via grep

### Context Order

1. System prompt (git status first)
2. Built-in tools
3. MCP tools
4. Custom agents
5. Memory files
6. Skills
7. Messages
8. Free space buffer

Later-loaded memory files have higher priority (model pays more attention).

---

## 8. Prompt Assembly and Context Compaction

### Prompt Assembly (`context.ts`)

```typescript
getSystemContext() → gitStatus + userContext
getUserContext() → claudeMd content + currentDate
```

### Context Analysis (`analyzeContext.ts`)

Tracks token counts for:
- System prompt
- Built-in tools
- MCP tools (deferred shown separately)
- Custom agents
- Memory files
- Skills
- Messages
- Reserved buffer (autocompact or manual compact)
- Free space

Display order: system → tools → MCP → agents → memory → skills → messages → buffer → free.

### Auto-Compaction (`autoCompact.ts`)

- Enabled by default unless `DISABLE_COMPACT` env var
- `CLAUDE_CODE_AUTO_COMPACT_WINDOW` overrides context window
- Circuit breaker after 3 consecutive failures
- `CONTEXT_COLLAPSE` feature: stages collapses before API call

### Token Budget (`checkTokenBudget` in query.ts)

- `TOKEN_BUDGET` feature gates this
- `decision.action: 'continue'` → inject nudge message
- `decision.completionEvent` → log and stop

---

## 9. Permission and Approval Model

### Permission Modes

```typescript
const EXTERNAL_PERMISSION_MODES = [
  'default',     // Normal prompting
  'plan',        // Limited permissions in plan mode
  'acceptEdits',  // Auto-accept file edits in working directory
  'bypassPermissions', // Skip all checks (dangerous)
  'dontAsk',     // Deny all prompts silently
] as const
// ANT-only: 'auto', 'bubble'
```

### Rule Storage

| Source | Location | Persistence |
|--------|----------|-------------|
| `userSettings` | `~/.claude/settings.json` | Permanent |
| `projectSettings` | `.claude/settings.json` | Git-committed |
| `localSettings` | `.claude/settings.local.json` | Gitignored |
| `session` | In-memory | Session only |
| `flagSettings` | CLI flags | Ephemeral |

**Rule syntax:** `ToolName(content)` e.g., `Bash(git:*)`, `Edit(.claude/**)`.

### Shell Command Classification

**Pattern-based (all builds):**
- `CROSS_PLATFORM_CODE_EXEC`: python, node, deno, ruby, perl, php, lua, npx, bunx, bash, sh, ssh
- `DANGEROUS_BASH_PATTERNS`: adds zsh, fish, eval, exec, env, xargs, sudo

**Classifier-based (ANT-only, `yoloClassifier.ts`):**
- Stage 1 (fast): XML with `max_tokens=64`
- Stage 2 (thinking): Chain-of-thought for blocked actions

### Dangerous Paths (Bypass-immune)

```typescript
DANGEROUS_FILES = ['.gitconfig', '.gitmodules', '.bashrc', '.bash_profile',
                   '.zshrc', '.zprofile', '.profile', '.ripgreprc',
                   '.mcp.json', '.claude.json']
DANGEROUS_DIRECTORIES = ['.git', '.vscode', '.idea', '.claude']
```

### File Write Permission Flow

1. User requests file write
2. `checkPermissions()` in FileWriteTool checks path safety + existing rules
3. If needs approval, shows `FilePermissionDialog` with diff
4. Options: allow once / session / always / deny
5. Decision logged via `logPermissionDecision()` → analytics + `toolDecisions` Map

### Denial Tracking

```typescript
DENIAL_LIMITS = { maxConsecutive: 3, maxTotal: 20 }
// After limits: falls back to prompting (headless: AbortError)
```

### Audit Mechanism

- Analytics events: `tengu_tool_use_granted_*`, `tengu_tool_use_denied_*`
- OTel telemetry: `tool_decision` events
- `toolDecisions` Map in `toolUseContext` for downstream inspection
- **No formal receipt system** — only logging, not cryptographic receipts

---

## 10. Session Persistence and Resume Model

### What is Persisted

| Data | Location | Format |
|------|----------|--------|
| Transcript/messages | `~/.claude/projects/{cwd}/{sessionId}.jsonl` | JSONL |
| Prompt history | `~/.claude/history.jsonl` | JSONL |
| File history snapshots | `~/.claude/file-history/{sessionId}/` | Backed-up files |
| Tool results (>50K chars) | `{projectDir}/{sessionId}/tool-results/{id}.json` | JSON |
| Large pastes | `~/.claude/paste-cache/{hash}.txt` | Text |
| Memory | `~/.claude/projects/{cwd}/memory/` | Markdown |
| Agent metadata | `{sessionId}/subagents/agent-{id}.meta.json` | JSON |

### Session Discovery

- Path formula: `{projectDir}/{sessionId}.jsonl`
- Project dir: `~/.claude/projects/{sanitized-cwd}/`
- Sanitization: djb2/Bun.hash, truncated to 200 chars

### Message Format (JSONL)

Each line: `{type, ...fields}` where types include:
- `user`, `assistant`, `attachment`, `system`
- `file-history-snapshot`, `content-replacement`
- `custom-title`, `tag`, `last-prompt`, `agent-name`, `mode`, `worktree-state`, `pr-link`

`parentUuid` field chains messages into conversation. Supports sidechains for parallel agents.

### Resume Process

**Entry points:** `--continue` (most recent), `--resume {session-id}`

**Flow (`loadConversationForResume`):**
1. Locate session via `loadMessageLogs()` or direct path
2. Fork handling: if `--fork-session`, keep fresh startup session ID
3. Copy file history backups: hard-link from previous session to current
4. Restore worktree state: `process.chdir()` to last worktree

**Interruption detection:**
- `assistant` → completed turn
- `user + isMeta/isCompactSummary` → no interruption
- `user + tool_result` → `interrupted_turn` (unless brief mode terminal)
- `user (plain)` → `interrupted_prompt`
- `attachment` → `interrupted_turn`

### File History

- Up to 100 snapshots per session
- Backup naming: `{hash}@v{version}`
- `fileHistoryRewind()` restores to snapshot state
- `fileHistoryCanRestore()` checks if message ID has snapshot

### Write Buffering

- 100ms flush interval
- 100MB chunk size before splitting writes
- Pending writes tracked for cleanup coordination
- Cleanup handler awaits all writes before exit

### Gaps in Claude Code Persistence

- Large tool results truncated at 50K, full content offloaded
- No formal receipts — only analytics logging
- Progress messages (`bash_progress`, `sleep_progress`) are ephemeral
- No native replay capability (only asciicast for `/share`)

---

## 11. Hooks, Skills, Subagents, and Extension Model

### 24 Hook Events

```typescript
const HOOK_EVENTS = [
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'Notification', 'UserPromptSubmit', 'SessionStart', 'SessionEnd',
  'Stop', 'StopFailure', 'SubagentStart', 'SubagentStop',
  'PreCompact', 'PostCompact', 'PermissionRequest', 'PermissionDenied',
  'Setup', 'TeammateIdle', 'TaskCreated', 'TaskCompleted',
  'Elicitation', 'ElicitationResult', 'ConfigChange',
  'WorktreeCreate', 'WorktreeRemove', 'InstructionsLoaded',
  'CwdChanged', 'FileChanged'
]
```

### Hook Types

| Type | Execution Model |
|------|----------------|
| `command` | Shell command execution |
| `prompt` | LLM query with prompt template |
| `agent` | Multi-turn LLM agent (stop hooks) |
| `http` | HTTP request |
| `function` | In-memory TypeScript callback (session-scoped only) |

### Hook Source Priority

1. `userSettings` — `~/.claude/settings.json`
2. `projectSettings` — `.claude/settings.json`
3. `localSettings` — `.claude/settings.local.json`
4. `sessionHook` — in-memory
5. `pluginHook` — from plugins
6. `builtinHook` — internal registration

### Skills Discovery

**Sources:**
- Managed skills: `<managed-path>/.claude/skills`
- User skills: `~/.claude/skills`
- Project skills: `<cwd>/.claude/skills` (walks up)
- Additional dirs: `--add-dir` flag
- Legacy `commands/` dirs
- Plugin skills

**Format:** Directory with `SKILL.md` (preferred) or single `skill.md` file.

**Frontmatter fields:**
- `name`, `description`, `when_to_use`, `argument-hint`
- `allowed-tools`, `model`, `disable-model-invocation`
- `user-invocable`, `context` (inline/fork), `agent`
- `effort`, `hooks`, `paths` (conditional activation)
- `shell` (shell execution config)

### Subagent Isolation

**Context cloning (`createSubagentContext`):**
- `readFileState`: cloned from parent (cache hit optimization)
- `abortController`: new child linked to parent (parent abort propagates)
- `getAppState`: wrapped with `shouldAvoidPermissionPrompts: true`
- Mutation callbacks: no-op by default
- `localDenialTracking`: fresh state

**Worktree-based isolation (`createAgentWorktree`):**
- Git worktree at `.claude/worktrees/<slug>`
- Sparse checkout via `settings.worktree.sparsePaths`
- Symlink dirs (e.g., `node_modules`) to avoid disk bloat
- `.worktreeinclude` for gitignored files
- 30-day stale cleanup

### Async Hook Support

Hooks return `{ async: true, asyncTimeout: ms }` to run asynchronously. Progress tracked via `registerPendingAsyncHook()`.

### Error Handling

- Hook execution wrapped in try/catch — errors logged but don't fail the hook
- Blocking errors: `outcome: 'blocking'` prevent continuation
- Non-blocking errors: `outcome: 'non_blocking_error'` — log and continue
- Plugin loading: partial failures don't block other plugins

---

## 12. Error, Stuck, Retry, and Interruption Handling

### Stuck Detection

- **Idle timeout manager:** `createIdleTimeoutManager()` detects event loop stalls
- **Loop detection:** `maxTurns` enforcement prevents infinite agent loops
- **Token budget:** `checkTokenBudget()` circuit breaker

### Retry Mechanisms

| Failure | Recovery |
|---------|----------|
| Max output tokens (3 attempts) | Escalate to 64k cap → inject recovery message |
| Prompt-too-long | Drain context-collapse → reactive compact |
| Model error | Fallback to fallback model |
| Invalid tool call | Return error via `createSyntheticErrorMessage()` |
| Abort signal | Early return with `aborted_*` reason |

### Interruption Handling

- **SIGINT interactive:** `process.exit(0)` immediately
- **SIGINT headless:** AbortController → graceful shutdown
- **SIGTERM/SIGHUP:** Exit codes 143/129 via `gracefulShutdownSync()`
- **Stream abort:** `abortController.signal.aborted` checked at each await point

### Graceful Shutdown

```typescript
// gracefulShutdown() coordinates via cleanupRegistry
// - LSP manager shutdown
// - Session teams cleanup
// - MCP cleanup
// - Pending writes flush
// - Analytics flush
```

---

## 13. User-Visible Progress and Trust Signals

### Terminal UI

- **Ink-based TUI:** Full terminal UI with React component tree
- **Progress messages:** `bash_progress`, `sleep_progress`, `mcp_progress` displayed in real-time
- **Tool result rendering:** Custom React components per tool (`renderToolResultMessage`)
- **Diff display:** Structured diff output for file edits

### Trust-Building Elements

1. **Visible execution:** Every command shown before execution (with permission dialog)
2. **Permission receipts:** Decisions logged (though no formal receipt format)
3. **Diff preview:** File changes shown before applying
4. **Git operation tracking:** Analytics events for commits, pushes, PRs
5. **Progress indicators:** Real-time streaming output

### Permission UX

- **BashPermissionRequest:** Shows command, highlights dangerous patterns, allow/deny with remember option
- **FilePermissionDialog:** Shows file diff, create vs overwrite, IDE integration
- **PermissionDialog:** Generic dialog with color-coded borders

### Status Notices

`statusNoticeHelpers.ts` — Display transient status messages in terminal without disrupting layout.

---

## 14. Logging/Transcript/Event Model

### Transcript Format (JSONL)

Each entry is a JSON object on one line:
```json
{"type":"user","content":"...","timestamp":1234567890}
{"type":"assistant","content":[{"type":"text","text":"..."}],"tool_use":[...]}
{"type":"attachment","file_path":"/src/file.ts","messageId":"..."}
```

### Session Metadata

Appended at end of transcript: `custom-title`, `tag`, `last-prompt`, `agent-name`, `mode`, `worktree-state`, `pr-link`.

### Analytics Events

Key events:
- `tengu_tool_use_granted_*` / `tengu_tool_use_denied_*`
- `tengu_file_changed` (lines added/removed)
- `tengu_git_operation` (commit, push, merge, PR)
- `tengu_bash_command`

### OTel Telemetry

`tool_decision` events logged via OTel for observability.

### Asciicast Recording

Terminal sessions recorded to `{sessionId}.jsonl` in asciicast format for `/share` command.

---

## 15. Security and Secret-Handling Observations

### Secret Detection

- No dedicated secret scanner in base toolset
- Dangerous patterns include `/proc/*/environ` access blocking
- Shell history not explicitly scrubbed

### Dangerous Path Protection

Files like `.gitconfig`, `.bashrc`, `.mcp.json`, `.claude.json` are protected even in `bypassPermissions` mode.

### Shell Security

20 security checks in `bashSecurity.ts` before any command execution:
- Fragment detection
- Command substitution blocking
- Input/output redirection blocking
- Zsh module attack prevention
- Path traversal validation

### Sandbox

`BashTool` supports `dangerouslyDisableSandbox` flag. Default: sandboxed execution.

### MCP Security

MCP tools require explicit allowlist in settings. Unknown MCP tools trigger permission prompt.

---

## 16. What Doorway Should Adopt Conceptually

### Must Adopt

1. **Terminal-visible execution** — Every agent action visible, not hidden behind abstraction
2. **Permission prompts as product feature** — Not afterthought, core to user trust
3. **CLAUDE.md-style project instructions** — Doorway needs equivalent: `DOORWAY.md` or `.doorway/rules/*.md`
4. **Git worktree isolation for agents** — Strong filesystem isolation, not just process
5. **Session persistence as evidence** — JSONL transcripts with full tool result offloading
6. **Context compaction** — Mandatory at scale, Claude Code's auto-compact is well-designed
7. **Structured diff output** — File changes shown as diffs, not just "file written"
8. **Tool schema validation** — Zod schemas for all tool inputs, catches errors early
9. **Permission rules with wildcards** — `Bash(git:*)` pattern matching is elegant
10. **Multi-agent coordinator mode** — Orchestrator + workers pattern Doorway needs

### Should Adopt

1. **Hook event system** — Simplified: Lane lifecycle events instead of 24 hook types
2. **Auto-compact circuit breaker** — 3 consecutive failures → stop trying
3. **File snapshot/rewind** — Useful for review before merge
4. **TOCTOU protection** — Timestamp + content fallback for file edits
5. **Quote normalization** — Handles curly/straight quote differences gracefully
6. **Progress message types** — Real-time feedback during long operations
7. **Tool result offloading** — Large outputs to disk, preview in transcript

---

## 17. What Doorway Must Not Copy

### Anti-Patterns to Avoid

1. **24 hook event types** — Over-engineered. Doorway: 6-8 lane lifecycle events max.
2. **JSON-only persistence** — Structured DB (SQLite) for audit queries at scale.
3. **No formal receipts** — Only analytics events. Doorway needs cryptographic receipts.
4. **Hook JSON protocol** — String parsing prone to breakage. Doorway: typed interfaces.
5. **In-process cloning for isolation** — Separate processes are safer.
6. **Ephemeral progress messages** — Store all events in evidence ledger.
7. **50K truncation threshold** — Too aggressive. Doorway: full content or configurable.
8. **Auto-mode AI classifier** — Non-deterministic. Doorway: deterministic rule-based safety.
9. **Context clone for subagents** — Hidden shared state. Doorway: explicit message passing.
10. **Settings.json for permissions** — Fine for small scale, bad for team policies. Doorway: proper policy engine.

---

## 18. Doorway Implementation Changes

Based on this analysis, Doorway should consider these implementation changes:

### Priority 1: Permission Receipt System

```typescript
interface PermissionReceipt {
  id: string
  timestamp: number
  toolName: string
  inputHash: string
  decision: 'allow' | 'deny'
  source: 'user' | 'classifier' | 'hook' | 'config'
  rulesApplied: string[]
  sessionId: string
  workerId?: string
}
```

**Package:** `packages/core/permissions`
**Acceptance test:** `rm -rf`, `git reset --hard`, `git push --force` produce permission receipt before execution.

### Priority 2: Event Ledger

```typescript
interface LedgerEntry {
  id: string
  timestamp: number
  workerId: string
  event: 'tool_use' | 'tool_result' | 'user_input' | 'permission' | 'file_change' | 'command'
  data: Record<string, unknown>
  threadId: string
}
```

**Package:** `packages/core/ledger`
**Acceptance test:** Ledger entry written for every agent action, queryable by thread.

### Priority 3: Worktree Manager for CLI Workers

**Package:** `packages/terminal-runtime`
- Launch Claude Code in git worktree per task
- Track worktree lifecycle
- Clean up stale worktrees

### Priority 4: Terminal Orchestrator Adapter

**Package:** `packages/adapters/claude-code`
- Wrap Claude Code CLI as visible worker
- Parse stdout for tool call events
- Feed permission decisions back
- Capture transcript for evidence layer

### Priority 5: DOORWAY.md Project Instructions

**Format:** Same as CLAUDE.md (including `@include` directive, `paths:` frontmatter, `type:` taxonomy).

**Package:** `packages/core/context`

---

## 19. Priority Tickets

| Priority | Ticket | Package | Why |
|----------|--------|--------|-----|
| P0 | PermissionReceiptService | `packages/core/permissions` | Trust-building is product-critical |
| P0 | EventLedger with full tool result storage | `packages/core/ledger` | Evidence layer is core promise |
| P0 | Worktree lifecycle manager | `packages/terminal-runtime` | Agent isolation is safety-critical |
| P1 | Claude Code adapter (visible worker) | `packages/adapters/claude-code` | Core integration point |
| P1 | DOORWAY.md project instructions | `packages/core/context` | Context is DNA of behavior |
| P1 | Terminal orchestrator UI | `packages/orchestrator` | User-facing cockpit |
| P2 | Deterministic safety rules engine | `packages/core/safety` | Replace AI classifier |
| P2 | Context compaction service | `packages/core/compact` | Scale to long sessions |
| P2 | Diff viewer for file changes | `packages/ui/diff` | Review before merge |
| P3 | Policy engine for team permissions | `packages/core/policy` | Enterprise team support |
| P3 | Asciicast session replay | `packages/core/replay` | `/share` equivalent |

---

## 20. Final Lesson

**Claude Code's core insight:** A terminal-native coding agent earns trust through **visible execution** — every command shown, every file change diffed, every危险 action prompted. The terminal is not a limitation, it's the UX.

**Doorway's opportunity:** Be the orchestration cockpit that makes Claude Code (and other agents) **safer, more reviewable, and more useful** by:
- Owning the evidence layer (not just the agent)
- Providing formal permission receipts (not just analytics)
- Managing worktree lifecycles (not just launching agents)
- Recording all events (not just messages)
- Letting humans review before merge (not just after)

**The agent is the worker. Doorway is the foreman. The user is the boss.**
