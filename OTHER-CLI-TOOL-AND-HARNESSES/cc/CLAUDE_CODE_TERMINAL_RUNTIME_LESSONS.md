# Claude Code Terminal Runtime Lessons

**Purpose:** Document terminal interaction, I/O rendering, and command execution lessons from Claude Code for Doorway's visible CLI worker lane design.

---

## 1. Terminal Rendering Architecture

### Rendering Stack

```
┌─────────────────────────────────────────────────────────────────────┐
│                        REACT COMPONENT TREE                          │
│  <App> → <REPL> → <AssistantMessage> → <ToolUseBlock> → ...        │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    INK RECONCILER (ink/reconciler.ts)                │
│  - Mounts React components to terminal output                        │
│  - Creates DOMElement tree with Yoga layout nodes                    │
│  - Walks tree during commit phase                                    │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    RENDER NODE TO OUTPUT                             │
│  renderNodeToOutput(element, context)                                │
│  - Applies styles from StylePool                                     │
│  - Writes to Output buffer                                           │
│  - Handles text, borders, cursor positioning                          │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    OUTPUT BUFFER (ink/output.ts)                      │
│  - Collects write/blit/clear operations                              │
│  - Output.get() flushes to Screen buffer                             │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SCREEN BUFFER (ink/screen.ts)                      │
│  - Int32Array packed screen state                                    │
│  - CharPool for string interning                                      │
│  - StylePool for style interning                                      │
│  - Damage tracking for partial redraws                                │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    LOG UPDATE (ink/log-update.ts)                     │
│  - Diffs prev vs next screen                                         │
│  - Generates patch operations                                        │
│  - Optimizes via DECSTBM hardware scroll                            │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    TERMINAL (ink/terminal.ts)                         │
│  - writeDiffToTerminal()                                             │
│  - ANSI escape sequence generation                                   │
│  - TTY detection for mode selection                                  │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    stdout.write()                                     │
│                      actual terminal                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Why | Doorway lesson |
|----------|-----|----------------|
| React reconciler for terminal | Reuse component model + fast iteration | Use Ink or build wrapper |
| Yoga layout engine | Flexbox for responsive layouts | Pass terminal cols as constraint |
| Damage tracking | Avoid full redraw flicker | Track dirty regions |
| Int32Array packed screen | Memory efficient, fast compare | Consider for high-frequency updates |
| Style pooling | Avoid repeated SGR string generation | Cache style transitions |
| Double buffering | Consistent diff even during render | Swap front/back frame each tick |

---

## 2. Input Handling

### Input Pipeline

```
stdin 'data' event
    │
    ▼
parseMultipleKeypresses(data)
    │
    ▼
termio/tokenize.ts (escape sequence tokenization)
    │
    ▼
ink/parse-keypress.ts (interpret sequences into ParsedKey)
    │
    ▼
InputEvent emitted via EventEmitter
    │
    ▼
useInput() callbacks fire in React components
    │
    ▼
KeybindingContext resolves to action
    │
    ▼
Action handler invoked (scroll, select, exit, etc.)
```

### Supported Input Types

| Input Type | Protocol | Example |
|------------|----------|---------|
| Standard keys | Raw | `a`, `Enter`, `Backspace` |
| Modifier keys | Raw + modifier bitmask | `Ctrl+C`, `Shift+Enter` |
| Function keys | CSI sequences | `F1`-`F12` |
| Kitty keyboard | `CSI u` | `ESC[13;2u` = Shift+Enter |
| modifyOtherKeys | `CSI >4;m` | xterm extended keys |
| Mouse click | SGR `CSI < btn;col;row M` | Left/right click |
| Mouse scroll | SGR `CSI < a;col;row M` | Scroll wheel |
| Bracketed paste | OSC 2004 | `PASTE_START` + content + `PASTE_END` |

### Key Files

| File | Purpose |
|------|---------|
| `ink/parse-keypress.ts` | High-level key interpretation |
| `ink/termio/tokenize.ts` | Low-level escape sequence tokenization |
| `ink/hooks/use-input.ts` | React hook for input |
| `ink/events/input-event.ts` | InputEvent class |
| `ink/keybindings/resolver.ts` | Keybinding resolution |

### Doorway Recommendation

For Doorway's visible worker display:
- Use `setRawMode(true)` for character-by-character input
- Parse escape sequences for proper key handling
- Support bracketed paste mode for multi-line input
- Use keybinding context for all shortcuts

---

## 3. Terminal Compatibility

### Detection Strategy (layered)

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 1: Environment Variables (synchronous, fast)         │
│                                                              │
│  TERM_PROGRAM → iTerm2, VS Code, Ghostty, Apple_Terminal    │
│  TERM         → xterm, xterm-ghostty, xterm-256color        │
│  TMUX         → if set, we're in tmux                       │
│  STY          → if set, we're in GNU Screen                  │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼ (if tmux detected)
┌──────────────────────────────────────────────────────────────┐
│  LAYER 2: XTVERSION Probe (async, survives SSH)             │
│                                                              │
│  Send: DCS > | name ST                                       │
│  Wait for response via stdin                                 │
│  → identifies terminal name for xterm.js over SSH            │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼ (if further needed)
┌──────────────────────────────────────────────────────────────┐
│  LAYER 3: DECRQM Feature Queries (async)                    │
│                                                              │
│  Query specific DEC mode support                             │
│  Fallback to defaults for unrecognized terminals            │
└──────────────────────────────────────────────────────────────┘
```

### Feature Support Matrix

| Feature | Terminals |
|---------|-----------|
| DEC 2026 (BSU/ESU atomic updates) | iTerm2, WezTerm, Ghostty, kitty, Windows Terminal, foot, Alacritty, VS Code |
| DECSTBM (hardware scroll) | Same as above |
| Kitty keyboard protocol | iTerm2, kitty, WezTerm, Ghostty, tmux |
| OSC 8 hyperlinks | Most modern terminals |
| OSC 9;4 progress | iTerm2 3.6.6+, Ghostty 1.2.0+ |
| OSC 21337 tab status | Ghostty, iTerm2 |

### Multiplexer Passthrough

```typescript
// osc.ts handles DCS passthrough for tmux/Screen
function writeOSC(osc: string): void {
  if (process.env.TMUX) {
    // tmux: DCS passthrough
    process.stdout.write(`\x1BPtmux;${osc}\x1B\\`)
  } else if (process.env.STY) {
    // GNU Screen: DCS passthrough
    process.stdout.write(`\x1BP${osc}\x1B\\`)
  } else {
    process.stdout.write(osc)
  }
}
```

---

## 4. Screen Management

### Double Buffering

```typescript
// ink.tsx
private frontFrame: Frame = new Frame()
private backFrame: Frame = new Frame()

private render(node: React.ReactNode): void {
  // Render to back buffer
  this.backFrame = this.renderer.render(node)

  // Swap (blit optimization relies on prev screen integrity)
  const temp = this.frontFrame
  this.frontFrame = this.backFrame
  this.backFrame = temp
}
```

### Damage Tracking

```typescript
// screen.ts
setCellAt(x: number, y: number, cell: Cell): void {
  // Mark damage region
  this.damage.expand(x, y)

  // Write cell
  this.cells[y * this.cols + x] = cell
}

// Only diff damage region
diffEach(other: Screen, damage: Rect, callback): void {
  for (let y = damage.top; y < damage.bottom; y++) {
    for (let x = damage.left; x < damage.right; x++) {
      const thisCell = this.cells[y * this.cols + x]
      const otherCell = other.cells[y * this.cols + x]
      if (thisCell !== otherCell) {
        callback(x, y, thisCell, otherCell)
      }
    }
  }
}
```

### Scroll Optimization

```typescript
// log-update.ts
if (canUseHardwareScroll(prevFrame, nextFrame)) {
  // Use DECSTBM to set scroll region
  // Shift rows with CSI n S (scroll down) or CSI n T (scroll up)
  // Much faster than rewriting rows
} else {
  // Full redraw
}
```

---

## 5. ANSI Handling

### CSI (Control Sequence Introducer)

```typescript
// termio/csi.ts
export function cursorPosition(row: number, col: number): string {
  return `\x1B[${row};${col}H`  // CSI row;col H
}

export function setScrollRegion(top: number, bottom: number): string {
  return `\x1B[${top};${bottom}r`  // CSI top;bottom r
}

export function eraseInDisplay(mode: number): string {
  return `\x1B[${mode}J`  // CSI mode J
}
```

### SGR (Select Graphic Rendition)

```typescript
// termio/sgr.ts
export const COLORS = {
  black: 0, red: 1, green: 2, yellow: 3, blue: 4,
  magenta: 5, cyan: 6, white: 7,
} as const

export function foreground(color: number): string {
  return `\x1B[${30 + color}m`
}

export function bold(): string {
  return `\x1B[1m`
}

export function reset(): string {
  return `\x1B[0m`
}
```

### Style Pooling

```typescript
// screen.ts - StylePool class
class StylePool {
  private styles: Map<string, number> = new Map()
  private transitions: Map<string, string> = new Map()

  transition(fromId: number, toId: number): string {
    const key = `${fromId}→${toId}`
    let cached = this.transitions.get(key)
    if (!cached) {
      cached = this.styleToAnsi(fromId) + this.styleToAnsi(toId)
      this.transitions.set(key, cached)
    }
    return cached
  }
}
```

---

## 6. Command Execution Model

### BashTool Execution Flow

```
BashTool.call({ command, timeout?, description? })
    │
    ▼
bashSecurity.ts: bashCommandIsSafeAsync_DEPRECATED()
    │
    ├─ splitCommandWithOperators() → subcommands[]
    ├─ For each subcommand:
    │   ├─ validateIncompleteCommands()
    │   ├─ validateDangerousPatterns() (20 checks)
    │   ├─ validateZshDangerousCommands()
    │   └─ validatePathConstraints()
    │
    ▼
bashPermissions.ts: bashToolHasPermission()
    │
    ├─ checkRuleBasedPermissions()
    ├─ checkToolSpecificPermissions()
    └─ matchWildcardPattern()
    │
    ▼
Shell.js: exec()
    │
    ├─ Spawn child process
    ├─ stream stdout/stderr
    └─ handle exit code
    │
    ▼
interpretCommandResult() → semantic meaning
    │
    ▼
Tool result + analytics event
```

### Shell Security Checks (20 total)

| ID | Check | Blocks |
|----|-------|--------|
| 1 | INCOMPLETE_COMMANDS | Fragments like `\| grep` or `--flag` |
| 2 | JQ_SYSTEM_FUNCTION | `jq` with system execution |
| 3 | JQ_FILE_ARGUMENTS | `jq` reading arbitrary files |
| 4 | OBFUSCATED_FLAGS | Hidden flag arguments |
| 5 | SHELL_METACHARACTERS | Dangerous metacharacters |
| 6 | DANGEROUS_VARIABLES | Dangerous env vars |
| 7 | NEWLINES | Embedded newlines in commands |
| 8 | COMMAND_SUBSTITUTION | `$()`, backticks |
| 9 | INPUT_REDIRECTION | `< file` |
| 10 | OUTPUT_REDIRECTION | `> file` |
| 11 | IFS_INJECTION | `IFS=` manipulation |
| 12 | GIT_COMMIT_SUBSTITUTION | `git commit -m "$(cmd)"` |
| 13 | PROC_ENVIRON_ACCESS | `/proc/*/environ` reads |
| 14 | MALFORMED_TOKEN_INJECTION | Shell quote bugs |
| 15 | BACKSLASH_ESCAPED_WHITESPACE | Escaped whitespace |
| 16 | BRACE_EXPANSION | `{a,b}` expansion |
| 17 | CONTROL_CHARACTERS | Control chars in input |
| 18 | UNICODE_WHITESPACE | Unicode whitespace |
| 19 | MID_WORD_HASH | `#` in middle of words |
| 20 | ZSH_DANGEROUS_COMMANDS | zsh module attacks |

### Dangerous Path Patterns

```typescript
const DANGEROUS_DIRECTORIES = [
  '.git', '.vscode', '.idea', '.claude'
] as const

const DANGEROUS_FILES = [
  '.gitconfig', '.gitmodules', '.bashrc', '.bash_profile',
  '.zshrc', '.zprofile', '.profile', '.ripgreprc',
  '.mcp.json', '.claude.json'
] as const

const DANGEROUS_REMOVAL_PATHS = [
  '/', '/home', '/Users', '/etc', '/usr', '/bin', '/sbin',
  '/tmp', '/var', '/Library', '/System'
] as const
```

---

## 7. Long-Running Command Handling

### Background Execution

```typescript
// BashTool input schema
{
  command: string,
  timeout?: number,           // Max seconds
  description?: string,
  run_in_background?: boolean,  // Fork and return immediately
  dangerouslyDisableSandbox?: boolean,
}
```

### Progress Streaming

```typescript
// Tool progress callback
onProgress?: ToolCallProgress<P>

// Progress message types
type BashProgress = {
  type: 'bash_progress'
  progress: {
    rows: string[]      // Lines so far
    latestLine: string
    truncated: boolean
  }
}
```

### Timeout Handling

```typescript
const timeoutMs = input.timeout ?? DEFAULT_TIMEOUT
const timeout = setTimeout(() => {
  child.kill('SIGTERM')
  // After 5s, SIGKILL
  setTimeout(() => child.kill('SIGKILL'), 5000)
}, timeoutMs)
```

---

## 8. Terminal UI Components

### REPL Screen

```typescript
// screens/REPL.js
function REPL() {
  // - Renders conversation history
  // - Input area at bottom
  // - Uses useInput() for key capture
  // - ScrollBox for history
  // - Status bar with mode indicator
}
```

### Permission Dialogs

```typescript
// components/permissions/BashPermissionRequest/
function BashPermissionRequest({ command, dangerousPatterns }) {
  // - Shows command to execute
  // - Highlights dangerous patterns in red
  // - Options: Allow / Deny / Allow & Remember
}
```

### Tool Result Display

```typescript
// Tool-specific renderers
// BashToolResultMessage.tsx - command + truncated output
// FileEditResultMessage.tsx - diff with syntax highlighting
// GrepToolResultMessage.tsx - matches with context lines
```

### Status Indicators

```typescript
// Status bar shows:
// - Current model
// - Token count / budget
// - Whether in plan mode
// - Worktree name (if applicable)
// - Connected MCP servers
```

---

## 9. Signal and Process Handling

### Signal Priority

| Signal | Handler | Exit Code | Behavior |
|--------|---------|-----------|----------|
| SIGINT (Ctrl+C) | `main.tsx:598` or `print.ts:1024` | 0 (interactive) / graceful (headless) | Abort + shutdown |
| SIGTERM | `gracefulShutdown.ts` | 143 (128+15) | Graceful cleanup |
| SIGHUP | `gracefulShutdown.ts` | 129 (128+1) | Graceful cleanup |
| SIGCONT | `ink.tsx` | none | Restore + repaint |
| SIGWINCH | `ink.tsx:handleResize` | none | Resize + repaint |

### Graceful Shutdown Sequence

```typescript
// gracefulShutdown()
async function gracefulShutdown(exitCode: number): Promise<void> {
  // 1. Set exit code
  process.exitCode = exitCode

  // 2. Abort in-flight operations
  abortController.abort()

  // 3. Flush pending session writes
  await sessionStorage.flush()

  // 4. Run registered cleanups (reverse order)
  for (const cleanup of cleanupRegistry.reverse()) {
    await cleanup.fn()
  }

  // 5. Exit
  process.exit(exitCode)
}
```

---

## 10. Doorway Terminal Orchestration Recommendations

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DOORWAY ORCHESTRATOR                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Terminal Orchestrator                                       │   │
│  │  - Manages visible worker output windows                    │   │
│  │  - Renders Ink-based TUI for each worker                    │   │
│  │  - Coordinates input routing                                 │   │
│  │  - Handles resize events                                     │   │
│  │  - Routes signals to appropriate worker                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│          ┌───────────────────┼───────────────────┐                │
│          ▼                   ▼                   ▼                │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐        │
│  │ Claude Code  │    │  Cursor CLI  │    │   Aider      │        │
│  │ Worker Lane  │    │  Worker Lane │    │  Worker Lane │        │
│  │              │    │              │    │              │        │
│  │ PTY + Ink    │    │ PTY + parse  │    │ PTY + parse  │        │
│  └──────────────┘    └──────────────┘    └──────────────┘        │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Implementation Requirements

| Requirement | Approach | Why |
|-------------|----------|-----|
| Visible execution | PTY per worker, render to terminal | Trust through visibility |
| Non-blocking output | Streaming parse of worker stdout | Real-time feedback |
| Signal routing | Track which worker owns each PTY | Ctrl+C goes to right place |
| Resize handling | Pass terminal size to worker via env/pty | Layout adapts |
| Permission prompts | Intercept before worker stdout | User must see + approve |
| Structured output | Parse tool call patterns from stdout | Extract for ledger |
| Cleanup on exit | Register cleanup with orchestrator | No orphan processes |

### Worker Adapter Pattern

```typescript
interface WorkerAdapter {
  // Lifecycle
  start(worktreePath: string, prompt: string): void
  stop(): void
  interrupt(): void  // SIGINT to PTY

  // Output streaming
  onOutput(callback: (data: string) => void): void
  onError(callback: (error: Error) => void): void

  // Input (for permission prompts)
  feedInput(input: string): void

  // State
  getState(): WorkerState
  getToolCalls(): ToolCall[]
}

type WorkerState =
  | 'starting'
  | 'running'
  | 'waiting_for_permission'
  | 'idle'
  | 'stopping'
  | 'stopped'
```

### Permission Interception

```typescript
// Worker adapter must intercept permission moments
// before they reach the worker's stdout

class ClaudeCodeAdapter implements WorkerAdapter {
  private parseOutput(buffer: string): ParsedOutput | null {
    // Detect permission prompts from output pattern
    if (this.isPermissionPrompt(buffer)) {
      this.emit('permission_required', {
        tool: 'Bash',
        command: this.extractCommand(buffer),
      })
      // Pause worker output, show in orchestrator UI
      this.pauseOutput()
      return null
    }

    // Extract tool calls from output
    if (this.isToolCall(buffer)) {
      return this.parseToolCall(buffer)
    }

    return null
  }

  feedPermissionDecision(decision: PermissionDecision): void {
    // Resume worker with decision
    this.feedInput(decision === 'allow' ? 'y\n' : 'n\n')
    this.resumeOutput()
  }
}
```

### Session Persistence Integration

For each worker lane:
```typescript
interface LaneSession {
  workerId: string
  threadId: string
  startedAt: number
  transcript: string[]      // Raw output lines
  toolCalls: ToolCall[]
  permissions: PermissionReceipt[]
  exitCode: number | null
}
```

On lane completion:
```typescript
// Emit to event ledger
ledger.append({
  type: 'lane_completed',
  workerId,
  summary: extractSummary(transcript),
  toolCalls,
  permissions,
  exitCode,
})
```

---

## 11. Anti-Patterns to Avoid

| Anti-Pattern | Why | Correction |
|-------------|-----|------------|
| Hidden execution (background) | Breaks trust | Always show worker output visibly |
| Buffer-only output (no stream) | Delays feedback | Stream output as it arrives |
| Global stdin capture | Can't have multiple workers | Route input per worker PTY |
| One-size-fits-all terminal | Compatibility gaps | Feature detect, fallback gracefully |
| No resize handling | Broken layout on window change | Pass SIGWINCH to workers |
| Orphaned processes on exit | Resource leaks | Register cleanup, SIGTERM all workers |
| No permission interception | User bypasses safety | Pause + intercept + resume pattern |
| Unstructured output parsing | Fragile | Define patterns, handle edge cases |
| Direct stdout.write | Can interleave | Buffer + flush per worker |
| No progress indication | Appears frozen | Show streaming output progressively |
