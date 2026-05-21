# Doorway Interactive Cockpit — Main PRD

**Purpose:** How Doorway deeply integrates with Claude Code's **interactive terminal mode** so it runs Claude Code exactly as a human would — zero programmatic detection, zero server-side judgment, zero API billing routing.

---

## Core Principle

> Doorway is not a wrapper. Doorway is a **shared terminal** — like two people sitting at the same keyboard. Claude Code sees a human. The server sees a human session. Doorway just makes that human smarter with receipts, evidence, and orchestration.

---

## 1. The "Human Detection" Problem

Claude Code has **multiple layered signals** that determine if a session is human-driven or programmatic. If Doorway gets any of these wrong, Claude Code (or the server) will treat the session as automated and switch to API billing or restrict capabilities.

### 1.1 How Claude Code Detects "Not Human"

From `main.tsx:797-812`:

```typescript
const hasPrintFlag = cliArgs.includes('-p') || cliArgs.includes('--print');
const hasInitOnlyFlag = cliArgs.includes('--init-only');
const hasSdkUrl = cliArgs.some(arg => arg.startsWith('--sdk-url'));
const isNonInteractive = hasPrintFlag || hasInitOnlyFlag || hasSdkUrl || !process.stdout.isTTY;
```

**Any of these triggers programmatic mode:**

| Trigger | Effect |
|---------|--------|
| `-p` / `--print` flag | Switches to headless NDJSON mode, API billing |
| `--init-only` flag | Skips trust dialog, immediate exit |
| `--sdk-url` argument | Routes to API endpoint, structured I/O |
| `!process.stdout.isTTY` | Detects piped output, routed to headless |
| `CLAUDE_CODE_SIMPLE=1` / `--bare` | Skips hooks, LSP, plugins, auto-memory |
| `GITHUB_ACTIONS` env | Treated as CI/CD pipeline, restricted |

**The entrypoint cascade** (`main.tsx:517-540`):
```typescript
process.env.CLAUDE_CODE_ENTRYPOINT = isNonInteractive ? 'sdk-cli' : 'cli';
```

This `clientType` flows into analytics, billing attribution, and server-side decisions.

### 1.2 The State Propagation

From `bootstrap/state.ts:300, 1057-1067`:
```typescript
STATE.isInteractive = !isNonInteractive  // Set once at startup
```

From `Tool.ts:168` — `isNonInteractiveSession` is embedded in `ToolUseContext.options` and **propagates to every tool call and query**.

### 1.3 What Changes Between Modes

| Aspect | Interactive Mode | Programmatic Mode |
|--------|-----------------|-------------------|
| UI | Ink React TUI | None (NDJSON) |
| Billing | Console account | API key / Org |
| Trust dialog | Shown on first run | Skipped |
| Grove (privacy) | Client-side checks | Server-side checks |
| ULTRAPLAN feature | Enabled | Disabled |
| `isNonInteractiveSession` | `false` | `true` |

---

## 2. Doorway's Spawn Strategy

### 2.1 Pure Interactive Spawn

**Doorway MUST spawn Claude Code with:**
- **No `-p` / `--print` flags**
- **No `--sdk-url` argument**
- **No `--init-only` flag**
- **No `--bare` / `--simple` flags**
- **PTY attached** (real terminal, not piped)
- **`process.stdout.isTTY = true`** (detected by Claude Code)
- **`GITHUB_ACTIONS` env NOT set**
- **`CLAUDE_CODE_ENTRYPOINT = 'cli'`** (default, no override needed)
- **`TERM_PROGRAM`** set appropriately (e.g., `Apple_Terminal`, `iTerm2`)

### 2.2 Spawn Command

```typescript
// Doorway spawns Claude Code like this:
const child = spawn('claude', [], {
  stdio: ['pty', 'pty', 'pty'],  // PTY for stdin/stdout/stderr
  env: {
    ...process.env,
    // DO NOT: unset TERM, set GITHUB_ACTIONS, set CLAUDE_CODE_ENTRYPOINT
    // DO: preserve TERM, TERM_PROGRAM, TERM_SESSION_ID
  },
  cwd: worktreePath,
})
```

### 2.3 PTY Attachment (Critical)

Claude Code checks `process.stdout.isTTY` to determine session type. A PTY (pseudo-terminal) makes Claude Code believe it's connected to a real terminal.

```typescript
// Using node-pty or similar
import * as pty from 'node-pty';

const ptyProcess = pty.spawn('claude', [], {
  name: 'xterm-256color',
  cols: process.stdout.columns || 80,
  rows: process.stdout.rows || 24,
  cwd: worktreePath,
  env: {
    ...process.env,
    // Preserve terminal environment
  } as Record<string, string>,
});
```

---

## 3. Permission Interception (The Human-in-the-Loop)

### 3.1 Where Claude Code Asks for Human Decision

Claude Code has **7 permission check points** before any tool executes. The 6th point (`content/rule-based`) is where most human decisions happen:

From `permissions.ts:1299-1319`:
```typescript
// If tool permission check returns 'passthrough' (passed security),
// and no allow rules match → behavior becomes 'ask'
const result = toolPermissionResult.behavior === 'passthrough'
  ? { ...toolPermissionResult, behavior: 'ask' as const }
  : toolPermissionResult
```

**`behavior: 'ask'` means Claude Code pauses and waits for human approval.**

### 3.2 The Interactive Permission Handler

From `interactiveHandler.ts` — the `interactiveHandler` races:
1. **Hooks** — custom permission handlers
2. **Classifier** — auto-mode AI classifier (ant-only)
3. **User dialog** — terminal UI prompt
4. **CCR bridge** — remote approval via claude.ai
5. **Channel relay** — Telegram/iMessage/Discord notification

**Doorway must replace the user dialog** — instead of Claude Code showing its own prompt, Doorway surfaces the permission request in its orchestration UI and feeds the decision back.

### 3.3 Detecting Permission Prompts

Claude Code's permission prompts appear as **text output to the PTY**. Doorway must:

1. **Parse the PTY output stream** for permission request patterns
2. **Pause the agent** (don't feed more input)
3. **Surface the request** to the user with full context
4. **Feed the user's decision** back as keystrokes to the PTY

**Permission prompt patterns to detect:**

```typescript
// Patterns Claude Code outputs when waiting for permission
const PERMISSION_PATTERNS = [
  /Press Enter to allow/i,
  /Allow this command\?/i,
  /\[y\/N\]/i,
  /Allow.*once/i,
  /Allow.*session/i,
  /Allow.*always/i,
  /Deny/i,
  /Permission required/i,
  /This command is dangerous/i,
  // Claude Code's actual dialog text varies — needs real pattern extraction
];

// When detected, Doorway:
// 1. Stops feeding input to PTY
// 2. Shows permission request in orchestration UI
// 3. Waits for user decision
// 4. Feeds 'y\n', 'n\n', or arrow keys + Enter to PTY
```

### 3.4 Feeding Decisions Back

```typescript
// Doorway feeds permission decisions to Claude Code via PTY
function feedPermissionDecision(pty: pty.IPty, decision: 'allow' | 'deny'): void {
  switch (decision) {
    case 'allow':
      pty.write('y\n');  // or Enter for default
      break;
    case 'deny':
      pty.write('n\n');
      break;
    case 'allow_once':
      // May need arrow key navigation + Enter
      pty.write('\x1B[B'); // Down arrow
      pty.write('\n');      // Enter
      break;
    case 'allow_session':
      pty.write('\x1B[B'); // Down arrow
      pty.write('\x1B[B'); // Down arrow
      pty.write('\n');      // Enter
      break;
  }
}
```

### 3.5 What Permission Moments Look Like

**Bash Permission Prompt (Claude Code output):**
```
The model wants to run this command:
  rm -rf /tmp/test-dir

[?] Dangerous command detected: removal of directories

Type 'y' to allow, 'n' to deny.
```

**File Write Permission Prompt:**
```
The model wants to write to:
  /project/src/auth/config.ts

[?] This will modify an existing file

Type 'y' to allow, 'n' to deny.
```

**Dangerous Path Prompt:**
```
The model wants to access:
  /home/user/.ssh/id_rsa

[?] Protected path — this file is important and dangerous to modify

Type 'y' to allow, 'n' to deny.
```

---

## 4. The 5 Dangerous Moments (Where Claude Code Judges)

Beyond permissions, there are **5 internal "judgment" moments** where Claude Code decides how to behave:

### 4.1 Session Type Judgment (Startup)

**Location:** `main.tsx:797-812`
**Judgment:** "Is this interactive or programmatic?"
**Doorway fix:** Spawn with PTY, no `-p` flag, TTY preserved.

### 4.2 Trust Dialog Judgment (First Run)

**Location:** `setup.ts`
**Judgment:** "Show trust dialog or skip?"
**Trigger:** `getIsNonInteractiveSession()` — skipped in programmatic mode
**Doorway fix:** Interactive mode shows trust dialog — **this is correct behavior**. User should see and approve it. This is the first human-in-the-loop moment.

### 4.3 Permission Mode Judgment (Per-Tool)

**Location:** `permissions.ts` (7 check points)
**Judgment:** "Auto-approve, deny, or ask?"
**Doorway fix:** Intercept `behavior: 'ask'` moments, surface to user.

### 4.4 Tool Execution Security Judgment (Bash)

**Location:** `bashSecurity.ts` (23 security checks)
**Judgment:** "Is this command safe enough to even ask about?"
**Doorway fix:** These checks are local security — they're good. Commands that fail check #1-23 get `behavior: 'deny'` with no user prompt. Only safe-enough commands reach the `ask` stage.

### 4.5 Auto-Mode Classifier Judgment (ANT only)

**Location:** `yoloClassifier.ts`
**Judgment:** "Should an AI classifier auto-approve this?"
**Doorway fix:** If using Claude Code with `auto` mode, the classifier is non-deterministic AI-on-AI. **Doorway should disable `auto` mode** and use `default` mode with explicit rules. This prevents server-side AI judgment.

---

## 5. Zero-Server-Judgment Checklist

To ensure **the server never judges** that this is an automated session:

### 5.1 Spawn Requirements (All Required)

- [ ] Claude Code invoked with **no `-p` / `--print` / `--headless`**
- [ ] **PTY attached** (stdin/stdout/stderr connected to terminal)
- [ ] **`TERM` environment variable set** (e.g., `xterm-256color`)
- [ ] **`TERM_PROGRAM` set** if applicable (iTerm2, Apple_Terminal, etc.)
- [ ] **`TERM_SESSION_ID` set** (macOS Terminal)
- [ ] **`GITHUB_ACTIONS` NOT set**
- [ ] **`CLAUDE_CODE_ENTRYPOINT` NOT overridden** (let it default to `'cli'`)
- [ ] **`CLAUDE_CODE_SIMPLE` NOT set**
- [ ] **`DISABLE_COMPACT` NOT set** (don't signal "running in automation")
- [ ] **No `--sdk-url` argument**
- [ ] **`process.stdout.isTTY = true`** (PTY ensures this)

### 5.2 Runtime Requirements

- [ ] Interactive permission mode (`default`) — NOT `auto` (which uses AI classifier)
- [ ] User approves all `behavior: 'ask'` moments
- [ ] Doorway does NOT auto-approve permission requests
- [ ] Doorway does NOT feed keystrokes without user action
- [ ] Session transcript remains in terminal (not redirected to a pipe)

### 5.3 Network Requirements

- [ ] No `CLAUDE_CODE_SESSION_ACCESS_TOKEN` env var (forces remote/CCR mode)
- [ ] No `CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR` (forces remote mode)
- [ ] No `--remote` / `--bridge` flags

---

## 6. PTY Integration Architecture

### 6.1 Spawn and Attach

```typescript
interface DoorwaySpawnOptions {
  prompt?: string;          // Initial prompt (optional)
  worktreePath: string;     // Git worktree for isolation
  metadata?: {
    laneId: string;
    threadId: string;
  };
}

class ClaudeCodeLane {
  private pty: pty.IPty;
  private outputBuffer: string = '';
  private permissionPromptMatcher: RegExp[];
  private onPermissionRequest: (request: PermissionRequest) => void;
  private userDecisions: Map<string, 'allow' | 'deny'>;

  spawn(opts: DoorwaySpawnOptions): void {
    // Preserve full terminal environment
    const env = { ...process.env };

    // DO NOT strip: TERM, TERM_PROGRAM, TERM_SESSION_ID
    // DO NOT set: GITHUB_ACTIONS, CLAUDE_CODE_ENTRYPOINT, CLAUDE_CODE_SIMPLE

    this.pty = pty.spawn('claude', opts.prompt ? [opts.prompt] : [], {
      name: process.env.TERM || 'xterm-256color',
      cols: process.stdout.columns || 120,
      rows: process.stdout.rows || 40,
      cwd: opts.worktreePath,
      env,
    });

    this.pty.onData((data) => {
      this.handleOutput(data);
    });

    this.pty.onExit(({ exitCode }) => {
      this.handleExit(exitCode);
    });
  }
}
```

### 6.2 Output Stream Parsing

```typescript
private handleOutput(data: string): void {
  this.outputBuffer += data;

  // Forward to Doorway's terminal display (real-time)
  this.emit('output', data);

  // Check for permission prompts
  for (const pattern of this.permissionPromptMatcher) {
    const match = this.outputBuffer.match(pattern);
    if (match) {
      this.pauseAgent();  // Stop feeding input
      const request = this.parsePermissionRequest(match);
      this.onPermissionRequest(request);  // Surface to user
      return;
    }
  }

  // Check for other blocking moments (Ctrl+C, errors, etc.)
  if (this.isBlockingOutput(this.outputBuffer)) {
    this.pauseAgent();
  }
}
```

### 6.3 Input Feeding

```typescript
// Only feed input when user explicitly acts
feedInput(input: string): void {
  // Validate input is human-initiated (from Doorway UI, not automatic)
  if (!this.isHumanInput(input)) {
    throw new Error('Input must be human-initiated');
  }
  this.pty.write(input);
}

resumeAgent(): void {
  // Claude Code continues from where it was paused
  // No special resume signal needed — just start feeding output again
  this.agentState = 'running';
}
```

### 6.4 Permission Request Structure

```typescript
interface PermissionRequest {
  id: string;
  tool: 'Bash' | 'Write' | 'Edit' | 'Read' | 'Agent' | 'MCP';
  command?: string;          // For Bash
  filePath?: string;         // For Write/Edit/Read
  dangerLevel: 'low' | 'medium' | 'high' | 'critical';
  detectedPatterns?: string[]; // Which security checks triggered
  preview?: string;           // What Claude Code would do
  rawText: string;           // Raw Claude Code output text
  timestamp: number;
}

interface PermissionDecision {
  requestId: string;
  choice: 'allow' | 'deny' | 'allow_once' | 'allow_session';
  timestamp: number;
  humanReason?: string;       // Optional user justification
}
```

---

## 7. Capturing the Evidence Layer

### 7.1 Permission Receipts

Every `behavior: 'ask'` → user decision becomes a **formal receipt**:

```typescript
interface PermissionReceipt {
  id: string;
  timestamp: number;

  // What was requested
  tool: string;
  inputHash: string;          // SHA-256 of tool input
  command?: string;           // For Bash
  filePath?: string;         // For Write/Edit

  // Decision
  decision: 'allow' | 'deny';
  choice: 'once' | 'session' | 'always';

  // Context
  laneId: string;
  threadId: string;
  sessionId: string;

  // Proof
  rawPromptText: string;      // Claude Code's exact prompt text
  userTyped: string;          // What the user typed to decide
  terminalState: 'paused' | 'resumed';
}
```

### 7.2 Event Ledger

Every PTY output event is logged:

```typescript
interface LedgerEntry {
  id: string;
  timestamp: number;
  laneId: string;
  threadId: string;

  event: 'pty_output' | 'permission_request' | 'permission_decision' |
         'tool_execution' | 'tool_result' | 'agent_pause' | 'agent_resume';

  data: Record<string, unknown>;

  // For tool events
  toolName?: string;
  toolInputHash?: string;
  exitCode?: number;

  // For ledger continuity
  previousEntryId: string;
}
```

### 7.3 Session Transcript

Full PTY transcript stored as:
```
~/.doorway/sessions/{threadId}/{laneId}/{timestamp}.terminal
```

Format: Raw terminal output (can be replayed with `script` command or asciinema).

---

## 8. Multi-Lane Coordination

### 8.1 Each Lane is Independent PTY

```typescript
class DoorwayOrchestrator {
  private lanes: Map<string, ClaudeCodeLane> = new Map();

  spawnLane(laneId: string, opts: SpawnOptions): ClaudeCodeLane {
    const lane = new ClaudeCodeLane({
      laneId,
      threadId: this.threadId,
      onPermissionRequest: (req) => this.handlePermission(req),
      onOutput: (laneId, data) => this.renderLaneOutput(laneId, data),
    });

    lane.spawn(opts);
    this.lanes.set(laneId, lane);
    return lane;
  }

  // Each lane:
  // - Own PTY → own TTY → own interactive Claude Code session
  // - Independent permission interception
  // - Independent evidence capture
}
```

### 8.2 User Sees All Lanes Simultaneously

Doorway renders multiple PTY outputs in **split panes or labeled regions** — like tmux, but each pane is a live Claude Code session.

```typescript
// Doorway's terminal layout (conceptual)
┌─────────────────────────────────────────────────────────┐
│ Doorway: auth-refactor thread          [Lane A] [Lane B]│
├──────────────────────────┬──────────────────────────────┤
│ Lane A: claude-code     │ Lane B: aider                │
│ ────────────────────    │ ──────────────────────────   │
│ $ fix the auth test     │ $ improve error handling      │
│ > Running auth tests...  │ > Refactoring validate_user() │
│ .                        │ .                             │
│ [PERMISSION: rm -rf?]   │ .                             │
│ [Type y/n]              │ .                             │
├──────────────────────────┴──────────────────────────────┤
│ Event Ledger                            [Permission A]   │
│ 10:23:01 Lane A: tool_use Bash(rm -rf)                 │
│ 10:23:02 Lane A: permission_request raised              │
│ 10:23:05 Lane A: permission_decision allow_once        │
└─────────────────────────────────────────────────────────┘
```

### 8.3 Coordination Events

Lanes can signal each other via **lane events** (not Claude Code messages):

```typescript
// Lane A finishes a task that Lane B needs
laneA.on('complete', (result) => {
  laneB.feedInput(`The auth refactor is done. Here's what changed:\n${result.diff}\n`);
});
```

---

## 9. What NOT to Do (Dangerous Patterns)

| Pattern | Why It Breaks Human Detection |
|---------|------------------------------|
| `claude -p "prompt"` | Routes to API billing immediately |
| `claude --print "prompt"` | Same as above |
| Pipe output: `claude \| cat` | Kills `process.stdout.isTTY` |
| `script` wrapper without PTY | May not preserve TTY detection |
| Set `CLAUDE_CODE_ENTRYPOINT=sdk-cli` | Forces programmatic mode |
| Set `GITHUB_ACTIONS=true` | Flags as CI/CD |
| `ssh host claude` (without PTY forwarding) | TTY lost over SSH |
| Use `--bare` flag | Skips hooks, auto-memory — signals automation |
| Auto-mode (`auto` permission mode) | AI classifier judges for you — not human |
| Feed keystrokes programmatically without user action | Becomes automation, not orchestration |

---

## 10. Key Files Reference (Claude Code Internals)

| File | What It Does | Doorway Relevance |
|------|--------------|------------------|
| `main.tsx:797-812` | Detects interactive vs programmatic | **Critical** — follow these rules |
| `main.tsx:517-540` | Sets `CLAUDE_CODE_ENTRYPOINT` | Don't override to `'sdk-cli'` |
| `bootstrap/state.ts:300,1057` | `isInteractive` state | Verify it's `true` |
| `Tool.ts:168` | `isNonInteractiveSession` in context | Must be `false` |
| `cli/print.ts` | Headless mode | **Never use this path** |
| `cli/structuredIO.ts` | SDK structured I/O | **Never use this path** |
| `setup.ts` | Trust dialog, first-run | **This is correct** — let it show |
| `permissions.ts` (7 checkpoints) | Permission flow | Intercept `'ask'` behavior |
| `tools/BashTool/bashSecurity.ts` | 23 security checks | Good — don't bypass |
| `interactiveHandler.ts` | Permission handler | **Doorway replaces this** |
| `yoloClassifier.ts` | AI auto-approval (ANT) | **Disable `auto` mode** |

---

## 11. Summary: The Human-in-the-Loop Contract

**Doorway's contract with Claude Code:**
1. Spawn me in a real terminal (PTY) → I see a human
2. Route my session as interactive (not programmatic) → I bill to console
3. Show me permission prompts → I wait for human approval
4. Let me see the human's decision → I log it and proceed

**What Doorway gets:**
1. Full interactive Claude Code — exactly as a human would experience
2. Every permission moment surfaced to the human operator
3. Formal receipts for every dangerous decision
4. Full PTY transcript as evidence
5. Multi-lane orchestration with isolated sessions
6. Zero server-side judgment or API billing routing

**What Doorway must never do:**
- Spawn with `-p`, `--print`, `--sdk-url`
- Redirect PTY output to a pipe
- Set `GITHUB_ACTIONS` or `CLAUDE_CODE_ENTRYPOINT=sdk-cli`
- Enable `auto` permission mode (AI judges for you)
- Feed keystrokes without human action
- Skip the trust dialog (it's the first human-in-the-loop moment)
