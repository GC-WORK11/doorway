# DOORWAY CORE FEATURES — TECHNICAL SPEC

## The 9 Features That Make Doorway 10/10

---

## FEATURE 1: TERMINAL HARNESS (PRIMARY)

### Definition
State-of-the-art terminal control that works like a human. NOT cheap PTY. Cross-OS (Mac/Win/Linux).

### Requirements

```typescript
// Cross-OS terminal backend
interface TerminalBackend {
  spawn(cmd: string, args: string[], opts: SpawnOptions): TerminalSession;
  read(sessionId: string): Promise<string>;
  write(sessionId: string, data: string): void;
  resize(sessionId: string, cols: number, rows: number): void;
  kill(sessionId: string, signal?: number): void;
}

// Must work on: macOS, Windows, Linux
// Must capture: stdout, stderr, exit codes, signals
// Must track: process tree, file changes, timing
```

### Capture Stack

```typescript
// Level 1: Raw I/O
pty.onData((data) => recordTerminalOutput(db, sessionId, data));
pty.onExit((code, signal) => recordExit(db, sessionId, code, signal));

// Level 2: Process tree
const tree = await captureProcessTree(pty.pid);
recordProcessSnapshot(db, sessionId, tree);

// Level 3: File system changes
const deltas = await captureFileDeltas(watchDir);
recordFileDelta(db, sessionId, deltas);

// Level 4: Exit classification
const exit = classifyExit(exitCode, signal);
recordExitTaxonomy(db, sessionId, exit);
// "Command not found" not "exit 127"
```

### Fault Detection + Recovery

```typescript
// Detect failures
interface FailureDetector {
  detectCrash(output: string): boolean;
  detectTimeout(startTime: Date, timeout: number): boolean;
  detectOOM(output: string): boolean;
  detectPanic(output: string): boolean;
}

// Auto-retry on failure
async function runWithRetry(
  prompt: string, 
  provider: string,
  maxRetries = 3
): Promise<RunResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await runAgent(provider, prompt);
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.log(`Attempt ${attempt} failed, retrying...`);
      await delay(1000 * attempt); // Exponential backoff
    }
  }
  throw new Error("All retries exhausted");
}
```

### Coordination Protocol

```typescript
// When Claude asks question in terminal
interface CoordinationProtocol {
  detectQuestion(output: string): boolean;
  relayToUser(output: string): void;  // Show in chat
  awaitUserResponse(): Promise<string>;
  relayToClaude(response: string): void;  // Prefill Claude's input
}

// When Codex finishes while Claude runs
interface MultiAgentCoordinator {
  trackProgress(agentId: string): AgentProgress;
  mergeOutputs(agents: AgentResult[]): UnifiedResult;
  showProgress(agents: AgentProgress[]): void;
}
```

---

## FEATURE 2: SELF-ADAPTING IDE

### Definition
Unlike hardcoded IDEs, Doorway adapts itself during conversation. Like pi agent but with IDE UI.

### Adaptation Triggers

```typescript
interface AdaptationTrigger {
  pattern: string | RegExp;
  action: 'adjust_compaction' | 'change_model' | 'add_context' | 'adapt_ui';
  confidence: number; // 0-1
}

// Example triggers
const triggers: AdaptationTrigger[] = [
  { pattern: /auto-?compact/i, action: 'adjust_compaction', confidence: 0.9 },
  { pattern: /use\s+(gpt|claude|gemini)/i, action: 'change_model', confidence: 0.8 },
  { pattern: /remember.*from.*project/i, action: 'add_context', confidence: 0.7 },
];
```

### Runtime Adaptation

```typescript
class SelfAdapter {
  async adapt(command: string): Promise<Adaptation> {
    const trigger = this.matchTrigger(command);
    if (!trigger) return null;
    
    switch (trigger.action) {
      case 'adjust_compaction':
        return this.adjustCompaction(trigger);
      case 'change_model':
        return this.changeModel(trigger);
      case 'adapt_ui':
        return this.adaptUI(trigger);
    }
  }
  
  async adjustCompaction(trigger: AdaptationTrigger): Promise<Adaptation> {
    // User: "setup auto-compact mode"
    // System: Configure auto-compaction threshold
    const config = await this.loadConfig();
    config.autoCompactThreshold = 0.8;
    config.enabled = true;
    await this.saveConfig(config);
    return { applied: true, message: "Auto-compact enabled at 80%" };
  }
}
```

### Learning Loop

```typescript
// Learn from user behavior
interface UserBehavior {
  commands: string[];      // What user types
  corrections: string[];   // When user corrects agent
  preferences: Record<string, any>;  // User preferences
}

// After session: update patterns
async function learnFromSession(session: Session): Promise<void> {
  const patterns = extractPatterns(session);
  for (const pattern of patterns) {
    await upsertPattern(db, pattern);
  }
}
```

---

## FEATURE 3: UNIFIED THREAD

### Definition
Multiple terminals/models/tools work as ONE chat unless new thread created.

### Thread Unification

```typescript
interface UnifiedThread {
  id: ThreadId;
  agents: AgentLane[];       // All running agents
  messages: Message[];        // All messages (from all agents)
  context: ThreadContext;    // Merged context
  projection: ThreadProjection; // Computed view for UI
}

interface ThreadContext {
  goals: string[];           // All active goals
  files: FileReference[];    // All referenced files
  decisions: Decision[];     // All decisions made
  learnings: Pattern[];      // Patterns learned this thread
}
```

### Agent Coordination

```typescript
// Prefilled prompt for coordination
function createCoordinationPrompt(
  agent: AgentId,
  context: ThreadContext
): string {
  return `
You are ${agent}. Thread context:
Goals: ${context.goals.join(', ')}
Files in scope: ${context.files.map(f => f.path).join(', ')}

Previous agent outputs:
${formatPreviousOutputs(context.agents)}

Your task: ${getCurrentTask(agent)}

Coordination rules:
- If you need info from another agent, ask via terminal
- If another agent needs your output, provide it
- Report completion in terminal
`;
}
```

### Unified Output

```typescript
// How UI shows unified thread
interface UnifiedMessage {
  id: MessageId;
  source: 'user' | 'claude' | 'codex' | 'doorway';
  content: string;
  terminal?: TerminalSessionId;  // Which terminal if terminal output
  timestamp: Date;
  attachments?: Attachment[];
}

// Render in thread as single conversation
// But: show terminal attribution when needed
<Thread>
  <Message source="user" content="Build auth system" />
  <Message source="codex" content="Implementing..." terminal="term_1" />
  <Message source="claude" content="Codex done. I'll add tests." terminal="term_2" />
  <Message source="doorway" content="Pull request created" />
</Thread>
```

---

## FEATURE 4: ORCHESTRATED SUBAGENTS

### Definition
Not just launching — true peer-to-peer orchestration. Agents talk to each other.

### Agent Communication

```typescript
interface AgentMesh {
  register(agent: AgentLane): void;
  send(from: AgentId, to: AgentId, message: string): void;
  broadcast(from: AgentId, message: string): void;
  onMessage(handler: (from: AgentId, message: string) => void): void;
}

// Example: Claude asks Codex for help
async function coordinateAgents(task: string): Promise<void> {
  const claude = launchAgent('claude', task);
  const codex = launchAgent('codex', task);
  
  // Register mesh
  mesh.register(claude);
  mesh.register(codex);
  
  // If Claude needs Codex's output
  mesh.onMessage(async (from, msg) => {
    if (from === 'claude' && msg.includes('need codex help')) {
      const codexContext = await codex.getContext();
      mesh.send('doorway', 'claude', codexContext);
    }
  });
}
```

### Autonomous Config Changes

```typescript
// Agents can modify system config
interface ConfigAuthority {
  canModify(agent: AgentId, configPath: string): boolean;
  modify(agent: AgentId, configPath: string, value: any): void;
}

// Careful: Only certain agents, certain configs
const authority = new ConfigAuthority({
  'claude': ['.clauderc', 'package.json'],
  'codex': ['.codex.json', 'package.json'],
  'doorway': ['*'], // Doorway can modify anything
});
```

---

## FEATURE 5: PLUGIN ECOSYSTEM

### Definition
Like Codex's 300+ plugins. OAuth infrastructure. Users build/share plugins.

### Plugin Manifest

```typescript
interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  
  // Permissions
  permissions: Permission[];
  
  // OAuth (if needed)
  oauth?: OAuthConfig;
  
  // Commands offered
  commands: PluginCommand[];
  
  // Triggers
  triggers?: Trigger[];
}

interface Permission {
  type: 'filesystem' | 'network' | 'api' | 'terminal';
  scope: string; // e.g., "read:~/documents", "api:github"
}

interface PluginCommand {
  name: string;
  description: string;
  execute(params: Record<string, any>): Promise<CommandResult>;
}
```

### Built-in Plugins

```typescript
// PR Checking plugin
const prCheckPlugin: PluginManifest = {
  id: 'pr-check',
  name: 'PR Checker',
  commands: [
    { name: 'check-pr', description: 'Check PR status', execute: async (params) => { ... } },
    { name: 'review-pr', description: 'Review PR diff', execute: async (params) => { ... } },
  ],
  permissions: [{ type: 'api', scope: 'github' }],
};

// GitHub Actions plugin
const githubActionsPlugin: PluginManifest = {
  id: 'github-actions',
  name: 'GitHub Actions',
  commands: [
    { name: 'run-workflow', execute: async (params) => { ... } },
    { name: 'check-status', execute: async (params) => { ... } },
  ],
  permissions: [{ type: 'api', scope: 'github' }],
};
```

### Plugin Discovery

```typescript
interface PluginStore {
  list(): Promise<PluginManifest[]>;
  install(id: string): Promise<void>;
  uninstall(id: string): Promise<void>;
  update(id: string): Promise<void>;
}

// Marketplace at doorway.plugins.dev
```

---

## FEATURE 6: SLASH COMMANDS

### Definition
40+ commands like Claude Code. Extensible command palette.

### Core Commands

```typescript
const slashCommands: SlashCommand[] = [
  // Navigation
  { name: '/browse', description: 'Open browser', aliases: ['/b'] },
  { name: '/terminal', description: 'Open terminal', aliases: ['/t'] },
  { name: '/files', description: 'File explorer', aliases: ['/f'] },
  
  // Agent control
  { name: '/claude', description: 'Switch to Claude', aliases: ['/c'] },
  { name: '/codex', description: 'Switch to Codex', aliases: ['/co'] },
  { name: '/model', description: 'Select model', aliases: ['/m'] },
  
  // Session management
  { name: '/compact', description: 'Compact context', aliases: ['/comp'] },
  { name: '/clear', description: 'Clear thread', aliases: ['/cl'] },
  { name: '/export', description: 'Export thread', aliases: ['/e'] },
  
  // Thinking
  { name: '/think', description: 'Show thinking', aliases: ['/t'] },
  { name: '/reason', description: 'Step-by-step reasoning', aliases: ['/r'] },
  
  // Task management
  { name: '/goal', description: 'Set thread goal', aliases: ['/g'] },
  { name: '/loop', description: 'Repeat until done', aliases: ['/l'] },
  { name: '/continue', description: 'Continue task', aliases: ['/cont'] },
  
  // Plugins
  { name: '/pr', description: 'Check PR status', aliases: ['/pr'] },
  { name: '/actions', description: 'GitHub Actions', aliases: ['/gh'] },
  
  // Utility
  { name: '/help', description: 'Show help', aliases: ['/h'] },
  { name: '/settings', description: 'Open settings', aliases: ['/s'] },
  { name: '/quit', description: 'Quit Doorway', aliases: ['/q'] },
];
```

### Command Palette

```typescript
interface CommandPalette {
  open(): void;
  close(): void;
  search(query: string): SlashCommand[];
  execute(command: SlashCommand): Promise<void>;
}

// Keyboard shortcut: Cmd+K (Mac) / Ctrl+K (Win/Linux)
```

### Extensible Commands

```typescript
// From plugins
plugin.commands.forEach(cmd => {
  slashCommands.push({
    name: `/${cmd.name}`,
    description: cmd.description,
    source: 'plugin',
    pluginId: plugin.id,
  });
});
```

---

## FEATURE 7: AUTOMATION / SCHEDULING

### Definition
Schedule prompts with plugins at specific times.

### Automation Definition

```typescript
interface Automation {
  id: string;
  name: string;
  description: string;
  
  // Trigger
  trigger: AutomationTrigger;
  
  // Action
  action: AutomationAction;
  
  // Schedule (if recurring)
  schedule?: CronExpression;
  
  // Notification
  notify: NotificationConfig;
}

interface AutomationTrigger {
  type: 'schedule' | 'webhook' | 'event';
  config: Record<string, any>;
}

interface AutomationAction {
  type: 'prompt' | 'workflow';
  prompt?: string;
  workflow?: WorkflowStep[];
}
```

### Automation Examples

```typescript
// Morning PR check
const morningPRCheck: Automation = {
  id: 'morning-pr-check',
  name: 'Morning PR Check',
  description: 'Check PRs and GitHub Actions at 7 AM',
  trigger: { type: 'schedule', config: { hour: 7, minute: 0 } },
  action: {
    type: 'prompt',
    prompt: 'Check all open PRs. Report status and any failing CI.',
  },
  notify: { type: 'push', title: 'PR Morning Report' },
};

// Before-meeting prep
const meetingPrep: Automation = {
  id: 'meeting-prep',
  name: 'Meeting Prep',
  trigger: { type: 'webhook', config: { url: '/webhooks/meeting' } },
  action: {
    type: 'workflow',
    workflow: [
      { prompt: 'Summarize recent commits' },
      { prompt: 'Check current branch status' },
      { prompt: 'Draft meeting agenda' },
    ],
  },
};
```

### Workflow Engine

```typescript
class WorkflowEngine {
  async execute(steps: WorkflowStep[]): Promise<WorkflowResult[]> {
    const results: WorkflowResult[] = [];
    
    for (const step of steps) {
      const result = await this.executeStep(step);
      results.push(result);
      
      if (step.condition && !this.evaluate(step.condition, results)) {
        break; // Stop on failed condition
      }
    }
    
    return results;
  }
}
```

---

## FEATURE 8: UI AESTHETICS

### Definition
Raycast/Linear/Vercel/Cursor/Conductor style. Sleek, minimal, modern.

### Design Tokens

```css
:root {
  /* Colors */
  --bg-primary: #0a0a0b;
  --bg-secondary: #121214;
  --bg-elevated: #1a1a1d;
  --border: rgba(255, 255, 255, 0.06);
  --border-active: rgba(255, 255, 255, 0.12);
  
  --text-primary: #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.7);
  --text-tertiary: rgba(255, 255, 255, 0.5);
  
  --accent: #6366f1;
  --accent-hover: #818cf8;
  
  --success: #22c55e;
  --warning: #f59e0b;
  --danger: #ef4444;
  
  /* Typography */
  --font-sans: 'Inter', -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  
  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  
  /* Radii */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
}
```

### Component Standards

```typescript
// Button
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  size: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
}

// Input
interface InputProps {
  size: 'sm' | 'md' | 'lg';
  state: 'default' | 'focus' | 'error' | 'disabled';
  label?: string;
  hint?: string;
}

// Card
interface CardProps {
  padding: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}
```

### Motion Principles

```typescript
// Subtle, purposeful motion
const transitions = {
  fast: '150ms ease-out',
  normal: '250ms ease-out',
  slow: '400ms ease-out',
};

// Respect reduced-motion
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; }
}
```

---

## FEATURE 9: TECHNICAL PILLARS

### Core Systems

| Pillar | Purpose | Key Files |
|--------|---------|-----------|
| Terminal Harness | Real PTY, capture, fault handling | `terminal-runtime/src/pty-backend.ts` |
| Evidence Layer | Proof of work, audit trail | `core/src/*-evidence.ts` |
| Operational Memory | Pattern learning, persistence | `core/src/operational-memory.ts` |
| Orchestration | Task graph, agent coordination | `orchestrator/src/index.ts` |
| Thread Management | Unified context, message history | `core/src/thread-service.ts` |
| Worktree Isolation | Safe parallel execution | `git-engine/src/` |
| Handoff System | Agent-to-agent context transfer | `handoff-capsule/src/` |
| Provider Routing | Multi-provider support | `orchestrator/src/brain/` |
| Event Bus | Real-time updates | `core/src/event-bus.ts` |

### Data Flow

```
User Input → Thread → Orchestrator → Provider Routing
                                    ↓
                            [claude | codex | gemini]
                                    ↓
                            Terminal Harness
                                    ↓
                    ┌───────────────┼───────────────┐
                    ↓               ↓               ↓
              Process Tree    Exit Taxonomy    File Deltas
                    ↓               ↓               ↓
                    └───────────────┼───────────────┘
                                    ↓
                            Evidence Layer
                                    ↓
                            UI Projection
                                    ↓
                              Thread View
```

---

## IMPLEMENTATION PRIORITY

| Feature | Priority | Complexity | Time |
|---------|----------|------------|------|
| 1. Terminal Harness | P0 | High | 4 weeks |
| 2. Self-Adapting | P1 | Medium | 2 weeks |
| 3. Unified Thread | P0 | High | 3 weeks |
| 4. Orchestrated Subagents | P1 | High | 3 weeks |
| 5. Plugin Ecosystem | P2 | High | 4 weeks |
| 6. Slash Commands | P1 | Low | 1 week |
| 7. Automation | P2 | Medium | 3 weeks |
| 8. UI Aesthetics | P0 | Low | Ongoing |
| 9. Technical Pillars | P0 | High | Foundation |

---

**END OF FEATURES SPEC**
