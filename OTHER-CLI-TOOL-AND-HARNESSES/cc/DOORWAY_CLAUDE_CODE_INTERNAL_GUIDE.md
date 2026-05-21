# Doorway × Claude Code: Internal Structure Guide

**Purpose:** For Doorway implementers — the exact Claude Code internal structures, state machines, and interception points needed to build the interactive cockpit.

---

## 1. Session Type State Machine (How Claude Code Decides What It Is)

### 1.1 Startup State Transition

```
cli.tsx bootstrap
    │
    ├─ Check CLI args: -p, --print, --init-only, --sdk-url, --bare
    ├─ Check process.stdout.isTTY
    └─ isNonInteractive = any(flag) || !TTY
            │
            ▼
    setIsInteractive(!isNonInteractive)
            │
            ├─ TRUE → initializeEntrypoint('cli')
            └─ FALSE → initializeEntrypoint('sdk-cli')
            │
            ▼
    STATE.isInteractive set, never changes during session
```

### 1.2 The `isNonInteractiveSession` Flag

This flag is **set once at startup** and propagates everywhere:

```typescript
// ToolUseContext.options — passed to every tool
interface ToolUseContext {
  options: {
    isNonInteractiveSession: boolean;  // === !STATE.isInteractive
    permissionMode: PermissionMode;
    bypassPermissions?: boolean;
    model?: string;
  }
}
```

**Doorway goal:** Keep `isNonInteractiveSession = false` throughout.

### 1.3 ClientType Detection

```typescript
// main.tsx:818-834 — set once at startup
const clientType = (() => {
  if (isEnvTruthy(process.env.GITHUB_ACTIONS)) return 'github-action';
  if (process.env.CLAUDE_CODE_ENTRYPOINT === 'sdk-ts') return 'sdk-typescript';
  if (process.env.CLAUDE_CODE_ENTRYPOINT === 'sdk-py') return 'sdk-python';
  if (process.env.CLAUDE_CODE_ENTRYPOINT === 'sdk-cli') return 'sdk-cli';  // ← programmatic
  if (process.env.CLAUDE_CODE_ENTRYPOINT === 'claude-vscode') return 'claude-vscode';
  if (process.env.CLAUDE_CODE_ENTRYPOINT === 'remote') return 'remote';
  if (process.env.CLAUDE_CODE_ENTRYPOINT === 'claude-desktop') return 'claude-desktop';
  return 'cli';  // ← interactive (default)
})();
```

**Doorway goal:** Let `clientType = 'cli'` (the default). Never set `CLAUDE_CODE_ENTRYPOINT`.

---

## 2. Permission System (The Human Decision Points)

### 2.1 The 7 Checkpoints (In Order)

```
Tool execution requested
    │
    ├─ CHECK 1: Deny rules (Deny(Bash), etc.)
    │       └─ DENY immediately
    │
    ├─ CHECK 2: Ask rules (Ask(Bash), etc.)
    │       └─ ASK (unless sandbox-auto-allowable)
    │
    ├─ CHECK 3: Tool.checkPermissions() — for Bash: 23 security checks
    │       ├─ fail → DENY immediately
    │       └─ pass → passthrough
    │
    ├─ CHECK 4: bypassPermissions mode
    │       └─ ALLOW (except bypass-immune paths)
    │
    ├─ CHECK 5: Always-allowed tools (Allow(Bash) exact match)
    │       └─ ALLOW immediately
    │
    ├─ CHECK 6: Content/prefix rules (Allow(Bash(python:*)), etc.)
    │       ├─ matches Allow → ALLOW
    │       ├─ matches Ask → ASK
    │       └─ no match → ASK (default)
    │
    └─ CHECK 7: auto mode classifier (ANT only)
            ├─ classifier approves → ALLOW
            └─ classifier blocks → DENY (with denial tracking)
```

### 2.2 The `behavior: 'ask'` Path (Doorway's Intercept Point)

```typescript
// permissions.ts — the decision
function hasPermissionsToUseTool(tool, input, context) {
  // ... checks 1-5 ...
  // ... check 6 returns 'passthrough' ...
  // passthrough → 'ask'
  const result = toolPermissionResult.behavior === 'passthrough'
    ? { ...toolPermissionResult, behavior: 'ask' as const }
    : toolPermissionResult
  // 'ask' means → interactiveHandler.ts races hooks + dialog
  return result  // { behavior: 'ask', message, updatedInput }
}
```

**This is where Doorway must intercept.**

### 2.3 The Interactive Permission Handler

```typescript
// interactiveHandler.ts — simplified flow
async function interactiveHandler(context, tool, input) {
  // 1. Run pre-tool hooks (optional, can intercept)
  const hookResult = await runPreToolHooks(context, tool)
  if (hookResult?.outcome === 'blocking') return hookResult

  // 2. If 'ask' behavior, race: user dialog OR classifier OR CCR bridge
  if (permissionResult.behavior === 'ask') {
    // Race: user dialog ← Doorway replaces this
    const userResponse = await showPermissionDialog({
      tool: tool.name,
      input: input,
      message: permissionResult.message,
    })
    // userResponse = 'allow' | 'deny' | 'allow_once' | 'allow_session'

    if (userResponse === 'allow') {
      return { behavior: 'allow' }
    } else {
      return { behavior: 'deny', message: 'User denied' }
    }
  }
}
```

### 2.4 Bash Security Checks (What Gets Blocked Before Asking)

```typescript
// bashSecurity.ts — 23 checks, any fail → immediate DENY

CHECKS = [
  'INCOMPLETE_COMMANDS',      // Fragment: starts with | or --
  'JQ_SYSTEM_FUNCTION',        // jq -f / --from-file
  'JQ_FILE_ARGUMENTS',        // jq reading arbitrary files
  'OBFUSCATED_FLAGS',         // Hidden flag arguments
  'SHELL_METACHARACTERS',     // ; | & operators in unsafe contexts
  'DANGEROUS_VARIABLES',      // $VAR in redirects
  'NEWLINES',                 // Embedded newlines
  'COMMAND_SUBSTITUTION',     // $(...) backticks <()
  'INPUT_REDIRECTION',        // < redirection
  'OUTPUT_REDIRECTION',       // > redirection
  'IFS_INJECTION',            // IFS= manipulation
  'GIT_COMMIT_SUBSTITUTION',  // git commit -C
  'PROC_ENVIRON_ACCESS',      // /proc/*/environ reads
  'MALFORMED_TOKEN_INJECTION',
  'BACKSLASH_ESCAPED_WHITESPACE',
  'BRACE_EXPANSION',
  'CONTROL_CHARACTERS',
  'UNICODE_WHITESPACE',
  'MID_WORD_HASH',
  'ZSH_DANGEROUS_COMMANDS',   // zmodload emulate sysopen zpty ztcp
  'BACKSLASH_ESCAPED_OPERATORS',
  'COMMENT_QUOTE_DESYNC',
  'QUOTED_NEWLINE',
]
```

**These run before any permission prompt.** Commands that fail these checks are denied silently (no user prompt).

### 2.5 Bypass-Immune Paths

Even `bypassPermissions` mode cannot override these:

```typescript
// filesystem.ts
const DANGEROUS_FILES = [
  '.gitconfig', '.gitmodules', '.bashrc', '.bash_profile',
  '.zshrc', '.zprofile', '.profile', '.ripgreprc',
  '.mcp.json', '.claude.json'
]

const DANGEROUS_DIRECTORIES = ['.git', '.vscode', '.idea', '.claude']
```

---

## 3. Tool Execution State Machine

### 3.1 The Tool Call Flow

```
ToolUseBlock { id, name, input }
    │
    ▼
findToolByName(tools, name)
    │
    ├─ Found → validateInput(schema)
    │       ├─ Valid → checkPermissions()
    │       └─ Invalid → return error result (no prompt)
    │
    └─ Not found → return synthetic error (no prompt)
            │
            ▼
    checkPermissions() → behavior: 'allow' | 'ask' | 'deny' | 'passthrough'
            │
            ├─ 'allow' → execute
            ├─ 'deny' → return deny result (no prompt)
            ├─ 'ask' → interactiveHandler → races user dialog
            └─ 'passthrough' → check content rules → 'ask'
            │
            ▼
    Pre-tool hooks (PreToolUse)
            │
            ▼
    tool.call(input, context, canUseTool, parentMessage, onProgress)
            │
            ▼
    Post-tool hooks (PostToolUse)
            │
            ▼
    ToolResult wrapped as user message
```

### 3.2 The `canUseTool` Function

```typescript
// Called from within tool.call() to check if still allowed
type CanUseToolFn = (tool: BuiltTool, input: unknown) => Promise<PermissionResult>

// Inside tool.call(), before dangerous operations:
// if (!(await canUseTool(tool, input)).allowed) {
//   throw new Error('Permission revoked')
// }
```

### 3.3 Tool Concurrency Partitioning

```typescript
// toolOrchestration.ts — tools split into batches

const CONCURRENT_TOOLS = ['Glob', 'Grep', 'FileRead', 'WebSearch', 'WebFetch']
const SERIAL_TOOLS = ['Bash', 'FileWrite', 'FileEdit', 'Agent', 'TaskCreate']

// Read-only + concurrent tools run in parallel
// Stateful + serial tools run one at a time
// This matters for Doorway: multiple agents may run concurrent tools in parallel
```

---

## 4. Query Loop State Machine

### 4.1 The Main Loop

```typescript
// query.ts — async function* queryLoop(state)
// Simplified state machine:

STATE = {
  messages: Message[],
  toolUseContext: ToolUseContext,
  turnCount: number,
  autoCompactTracking: AutoCompactTrackingState | undefined,
}

LOOP:
  turnCount++

  // PREPROCESSING: compaction, memory prefetch

  // STREAMING: callModel() → yields content blocks
  //   tool_use blocks collected → needsFollowUp = true

  if (needsFollowUp) {
    // TOOL EXECUTION
    toolResults = runTools(toolUseBlocks)  // concurrent + serial
    messages.push(...toolResults)
    CONTINUE  // next turn
  } else {
    // DONE
    return { reason: 'completed', messages }
  }
```

### 4.2 Exit Reasons

| Reason | Meaning | Doorway Relevance |
|--------|---------|-------------------|
| `completed` | No more tool calls needed | Session done normally |
| `aborted_streaming` | User interrupted during streaming | Ctrl+C during output |
| `aborted_tools` | User interrupted during tool execution | Ctrl+C during tool |
| `max_turns` | Hit turn limit | Config limit reached |
| `stop_hook_prevented` | Stop hook blocked continuation | Hook intervention |
| `prompt_too_long` | Context collapse failed | Need compaction |
| `blocking_limit` | Hard token limit | Context exhausted |

---

## 5. PTY Output Patterns (What Doorway Sees)

### 5.1 Permission Prompt Patterns

Claude Code outputs these to the PTY when waiting for permission:

```typescript
// These are the text patterns Doorway must detect in PTY output stream

const PERMISSION_PATTERNS = [
  // Bash dangerous command
  /The model wants to run this command:\s*\n\s+(\S+.*)/,

  // Permission request
  /Press Enter to allow/i,
  /Allow this command\?/i,
  /\[y\/N\]/i,
  /Type 'y' to allow, 'n' to deny/i,

  // File write
  /The model wants to write to:\s*\n\s+(\/.+)/i,
  /This will modify an existing file/i,
  /Create new file/i,

  // Dangerous path
  /Protected path/i,
  /This file is important and dangerous/i,

  // MCP tool
  /wants to use MCP tool:\s*(\S+)/i,

  // Agent spawn
  /wants to create a sub-agent/i,
]
```

### 5.2 Permission Decision Input Patterns

```typescript
// What Claude Code expects as input for permission decisions
// (fed via PTY stdin)

const PERMISSION_INPUTS = {
  allow: 'y\n',
  deny: 'n\n',
  allow_once: '\x1B[B\n',      // Down arrow + Enter
  allow_session: '\x1B[BB\n',  // Down + Down + Enter
  deny_silent: 'n\n',
}
```

### 5.3 Other Blocking Output

```typescript
// Ctrl+C acknowledgment
/Interrupted/

// Error output (non-blocking, continues)
/Error:/

// Session end
/Goodbye/

// Task complete
/done/i
```

---

## 6. State That Propagates

### 6.1 Global State (`bootstrap/state.ts`)

```typescript
// STATE is module-level singleton
interface GlobalState {
  isInteractive: boolean;           // Set once at startup
  projectRoot: string;             // Git root, stable during session
  currentSessionId: string;        // Changes on resume
  invokedSkills: Map<string, SkillInvocation>;
  toolPermissionContext: ToolPermissionContext;
  // ... many more
}
```

### 6.2 ToolUseContext (Per-Query State)

```typescript
// Passed to every tool call
interface ToolUseContext {
  options: {
    tools: BuiltTool[];
    permissionMode: PermissionMode;
    isNonInteractiveSession: boolean;  // Key flag
    model?: string;
    maxTurns?: number;
  };
  abortController: AbortController;
  toolDecisions: Map<string, ToolDecision>;  // Audit trail
  readFileState: FileStateCache;              // TOCTOU tracking
  getAppState: () => AppState;
  setAppState: (update: Partial<AppState>) => void;
}
```

### 6.3 Subagent Context Cloning

```typescript
// When Claude Code spawns AgentTool:
// createSubagentContext() clones ToolUseContext

// Doorway must track: each subagent has its own ToolUseContext
// but the parent sees all results via hook events
```

---

## 7. Session Persistence (What's Stored)

### 7.1 Transcript

```
~/.claude/projects/{sanitized-cwd}/{sessionId}.jsonl
```

Format: JSONL with message types:
- `user` — user messages
- `assistant` — responses (with tool_use blocks)
- `tool_result` — tool results (user message wrapping)
- `attachment` — file metadata
- `file-history-snapshot` — file state at message point
- `content-replacement` — large result offload references

### 7.2 File History

```
~/.claude/file-history/{sessionId}/{hash}@v{version}
```

Backs up file contents at each message turn. Used for rewind.

### 7.3 Tool Results

```
{projectDir}/{sessionId}/tool-results/{toolUseId}.json
```

Offloaded for results >50K chars. Preview in transcript.

### 7.4 Memory

```
~/.claude/projects/{sanitized-cwd}/memory/MEMORY.md
~/.claude/projects/{sanitized-cwd}/memory/*.md
```

Auto-memory files with taxonomy (user/feedback/project/reference).

---

## 8. Key Implementation Notes

### 8.1 PTY Must Preserve Environment

```typescript
// Wrong — strips terminal environment
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
};
// Claude Code sees: TERM undefined → may behave differently

// Correct — preserve terminal environment
const env = { ...process.env };
// Claude Code sees: TERM=xterm-256color, TERM_PROGRAM=iTerm2
// → behaves as interactive terminal session
```

### 8.2 Terminal Size Matters

```typescript
// Claude Code uses terminal size for rendering
// Wrong: default 80x24 may truncate UI
pty.spawn('claude', [], {
  cols: process.stdout.columns || 120,  // Match parent terminal
  rows: process.stdout.rows || 40,
});
```

### 8.3 Signal Handling

```typescript
// Claude Code handles SIGINT in main.tsx:598
// PTY: Ctrl+C → SIGINT sent to child process

// Doorway should:
// 1. Capture SIGINT in orchestrator (Ctrl+C on Doorway UI)
// 2. Forward SIGINT to PTY (interrupt Claude Code)
// 3. NOT kill the PTY — let Claude Code handle graceful shutdown

ptyProcess.onData((data) => {
  if (data.includes('Interrupted')) {
    // Claude Code acknowledged — check if session ended
  }
});
```

### 8.4 No `--resume` Flag

Doorway should manage its own session continuity. Using `claude --resume` routes through the resume flow which has different behavior.

### 8.5 `acceptEdits` Mode Is Fine

If user sets `acceptEdits` mode, file writes in CWD auto-approve. This is a user preference — Doorway should respect it and not intercept those permission moments.

---

## 9. What Doorway Must NOT Hook Into

| Don't Hook Into | Why |
|----------------|-----|
| `permissions.ts` internal logic | Not accessible from outside |
| `ToolUseContext.options` | Not modifiable after spawn |
| `cli/print.ts` | Headless path — we use interactive |
| `structuredIO.ts` | SDK path — we use interactive |
| `QueryEngine.submitMessage()` | Not used in interactive mode |
| `yoloClassifier.ts` | Auto-mode AI — not used in `default` mode |

**Doorway operates at the PTY layer only.** It reads PTY output and feeds PTY input. Everything else is Claude Code's internal business.

---

## 10. The One Rule

> **If Doorway feeds input to Claude Code without a human deciding that input, Doorway is automation.**
>
> **If a human decides, and Doorway feeds it, Doorway is orchestration.**

Claude Code will detect programmatic input patterns if Doorway isn't careful. The PTY layer is the boundary — keep it human.
