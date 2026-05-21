# Claude Code Context and Prompt Patterns

**Purpose:** Document context assembly, prompt construction, and message compaction patterns from Claude Code for Doorway's brain lane design.

---

## 1. Context Assembly Order

Claude Code assembles context in this priority order (later = higher model attention):

### System Context (`context.ts`)

```typescript
getSystemContext() → {
  gitStatus,      // First - most relevant for coding
  userContext,   // Second - user-level context
  // ... rest of system prompt
}
```

### Full Context Order (getUserContext + system)

1. **System prompt** (git status first, then user context)
2. **Built-in tools** (with Zod schemas)
3. **MCP tools** (from configured MCP servers)
4. **Custom agents** (user-defined agent types)
5. **Memory files** (CLAUDE.md, rules, memory)
6. **Skills** (invoked during session)
7. **Messages** (conversation history)
8. **Free space buffer** (reserved for output)

### Memory File Loading Order

```typescript
getClaudeMds() → [
  // Loaded in this order (later overrides earlier):
  managedMd,      // /etc/claude-code/CLAUDE.md (system-wide)
  userMd,         // ~/.claude/CLAUDE.md (user-wide)
  projectMd,      // CLAUDE.md, .claude/CLAUDE.md (checked in)
  projectRules,   // .claude/rules/*.md (modular rules)
  localMd,        // CLAUDE.local.md (local overrides)
]
```

---

## 2. CLAUDE.md Patterns

### Standard Format

```markdown
---
name: project-instructions
description: Project-wide coding standards and patterns
type: project
---

# Project Instructions

## Overview
Brief description of the project and its purpose.

## Coding Standards
- Use TypeScript for all new code
- Prefer functional components in React
- ...

## Architecture
Key architectural decisions and patterns.

## Testing
- Always write tests alongside new features
- Use jest for unit tests
- ...

@include @./rules/auth.md
@include @./rules/api.md
```

### Frontmatter Fields

| Field | Purpose | Example |
|-------|---------|---------|
| `name` | Identifier for the memory | `project-instructions` |
| `description` | One-line summary | `Project coding standards` |
| `type` | Taxonomy: `user`, `feedback`, `project`, `reference` | `project` |
| `paths` | Conditional activation globs | `["src/**/*.ts", "tests/**/*.py"]` |

### `@include` Directive

```markdown
@path                → /etc/claude-code/CLAUDE.md
@./relative/path    → relative to current file
@~/home/path         → expand ~ to home directory
@/absolute/path     → absolute path
#heading            → fragment (stripped, not resolved)
```

**Resolution rules:**
- Max depth: 5 levels to prevent infinite loops
- Fragment identifiers stripped before resolution
- Works in leaf text nodes only (not inside code blocks/strings)

### Path-Based Conditional Rules

```markdown
---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# TypeScript Guidelines

For TypeScript files...
```

---

## 3. Message Format

### User Message

```typescript
{
  type: 'user',
  content: [
    { type: 'text', text: 'user prompt' },
    // OR for tool results:
    { type: 'tool_result', content: result, tool_use_id: 'xxx' },
    // OR for attachments:
    { type: 'attachment', file_path: '/path', messageId: 'xxx' },
  ],
  timestamp: number,
  uuid: string,
  parentUuid?: string,  // Links to parent message for threading
}
```

### Assistant Message

```typescript
{
  type: 'assistant',
  message: {
    content: [
      { type: 'text', text: 'response text' },
      // OR tool calls:
      {
        type: 'tool_use',
        id: 'toolu_xxx',
        name: 'Bash',
        input: { command: 'ls -la' },
      },
      // OR thinking:
      {
        type: 'thinking',
        thinking: '...',
        signature: '...',
      },
    ],
  },
  timestamp: number,
  uuid: string,
  parentUuid?: string,
}
```

### Tool Use Block

```typescript
{
  type: 'tool_use',
  id: 'toolu_xxx',       // Unique per-request ID
  name: 'Bash',          // Tool name
  input: {               // Zod-validated input
    command: 'ls -la',
    timeout: 30,
  },
}
```

### Tool Result Block

```typescript
{
  type: 'tool_result',
  content: 'total 12\ndrwxr-xr-x  4 govinda govinda 4096 May 17 22:00 .\n',  // string or error
  is_error?: boolean,
  tool_use_id: 'toolu_xxx',  // Links to request
}
```

---

## 4. Context Compaction Patterns

### When Compaction Triggers

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Auto-compact | `AUTOCOMPACT_BUFFER_TOKENS = 13,000` | Trigger auto-compact |
| Warning | `WARNING_THRESHOLD_BUFFER_TOKENS = 20,000` | Warn user |
| Error | `ERROR_THRESHOLD_BUFFER_TOKENS = 20,000` | Block + error |
| Manual | User runs `/compact` | Immediate compact |

### Compaction Algorithm

**Step 1: Micro-compact (pre-processing)**

```typescript
function microcompactMessages(messages: Message[]): Message[] {
  // 1. Strip images from user messages
  messages = messages.map(m => {
    if (m.type === 'user') {
      return {
        ...m,
        content: m.content.map(c =>
          c.type === 'image' ? { type: 'text', text: '[image]' } : c
        ),
      }
    }
    return m
  })

  // 2. Group by API round trip
  const groups = groupMessagesByApiRound(messages)

  // 3. Truncate large tool results
  for (const group of groups) {
    for (const msg of group) {
      if (msg.type === 'user' && hasLargeToolResult(msg)) {
        truncateToolResult(msg, MAX_CHARS)
      }
    }
  }

  return messages
}
```

**Step 2: Full Compaction**

```typescript
function compactConversation(messages, options): CompactedMessages {
  // 1. Identify summarizable ranges (oldest messages)
  const summarizable = identifySummarizableRange(messages, options)

  // 2. Generate summary via model
  const summary = await callModel({
    prompt: `Summarize this conversation concisely:\n${summarizable}`,
    // ...compact-specific params
  })

  // 3. Replace range with summary message
  return {
    messages: [
      ...messages.slice(0, SUMMARY_START),
      createCompactSummary(summary),
      ...messages.slice(SUMMARY_END),
    ]
  }
}
```

**Step 3: Post-compact Restoration**

```typescript
function postCompactCleanup(compacted, original): RestorationPlan {
  // 1. Identify pinned edits
  const pinnedEdits = getPinnedCacheEdits()

  // 2. Select files to restore (up to 5, 50K tokens total)
  const toRestore = selectFilesForRestoration(pinnedEdits, {
    maxFiles: 5,
    maxTokens: 50000,
    maxPerFile: 5000,
  })

  // 3. Return restoration plan
  return { filesToRestore: toRestore }
}
```

### Compact Summary Message Format

```typescript
{
  type: 'system',
  subtype: 'compact_summary',
  content: 'Previous conversation covered: ...',
  originalMessageCount: 47,
  tokensSaved: 12000,
  timestamp: number,
}
```

---

## 5. Prompt Templates

### System Prompt Structure

```
[Git Status]
[Project Instructions from CLAUDE.md]
[Memory files content]
[Skills content]
[Available tools]
[User message]
```

### Tool Description Generation

```typescript
// Tool.ts: description() method
async description(input, options): Promise<string> {
  // Returns formatted description for the tool
  // Includes: name, description, parameter info
  return `${this.name}: ${this.description}\nParams: ${paramsString}`
}
```

### Stop Hook Prompt

```typescript
const STOP_HOOK_PROMPT = `You are Claude Code. The user has sent a stop signal.

Review what you've done and provide a summary of:
1. What you accomplished
2. What you didn't finish
3. Any important information the next instance should know

Be concise but complete.`
```

### Error Recovery Prompt

```typescript
const RECOVERY_MESSAGE = `Output token limit was reached. Resume your work directly.
Do not repeat previous steps. Continue from where you left off.`
```

---

## 6. Token Budget Management

### Budget Tracking

```typescript
interface TokenBudget {
  maxTokens: number
  usedTokens: number
  outputReserved: number  // 13,000 for response
  freeSpace: number        // maxTokens - usedTokens - outputReserved
}

// Thresholds
const AUTOCOMPACT_BUFFER_TOKENS = 13_000
const WARNING_THRESHOLD_BUFFER_TOKENS = 20_000
const ERROR_THRESHOLD_BUFFER_TOKENS = 20_000
```

### Budget Actions

| Free Space | Action |
|------------|--------|
| > 13,000 | Normal operation |
| 6,500 - 13,000 | Auto-compact triggers |
| 0 - 6,500 | Warning displayed |
| < 0 | Error, block new requests |

---

## 7. Git Context Patterns

### Git Status Format

```text
Branch: feature/auth-refactor
Main branch: main
User: Your Name <you@example.com>

Changes:
M  src/auth/login.ts
?? src/auth/new-file.ts

Recent commits:
abc1234 Add login form validation
def5678 Initial auth setup
```

### Git Diff Format

```text
diff --git a/src/auth/login.ts b/src/auth/login.ts
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -10,7 +10,7 @@ export function login(username: string, password: string) {
   if (!username || !password) {
-    throw new Error('Username and password required')
+    throw new Error('Username and password are required')
   }
   // ... rest of diff
```

### Diff Truncation Rules

| Rule | Limit |
|------|-------|
| Max files | 50 |
| Max size per file | 1MB |
| Max lines per file | 400 |
| Untracked files | Fetched via `git ls-files --others` |

---

## 8. Session Metadata Format

### Stored in Transcript

```json
{"type": "custom-title", "value": "Auth refactor", "timestamp": 1715980800}
{"type": "tag", "value": "auth", "timestamp": 1715980800}
{"type": "agent-name", "value": "claude-3-5-sonnet", "timestamp": 1715980800}
{"type": "mode", "value": "auto", "timestamp": 1715980800}
{"type": "worktree-state", "worktree": "feature-auth", "timestamp": 1715980800}
{"type": "pr-link", "value": "https://github.com/org/repo/pull/123", "timestamp": 1715980800}
```

### Memory File Taxonomy

```markdown
---
name: user-role
description: User is a senior backend engineer
metadata:
  type: user
---

User is a senior backend engineer with 10+ years of experience.
Prefers detailed technical explanations.
Working on a Go microservices project.
```

### Memory Types

| Type | Purpose | Example |
|------|---------|---------|
| `user` | User's role, preferences, knowledge | "User is a data scientist" |
| `feedback` | Guidance on what works/doesn't | "Don't mock the database" |
| `project` | Project facts and decisions | "We use PostgreSQL for auth" |
| `reference` | External documentation pointers | "API docs at /docs/api.md" |

---

## 9. Tool Use Context Patterns

### ToolUseContext Shape

```typescript
interface ToolUseContext {
  options: {
    tools: Tool[]
    permissionMode: PermissionMode
    bypassPermissions?: boolean
    model?: string
    maxTurns?: number
    // ... other options
  }
  abortController: AbortController
  toolDecisions: Map<string, ToolDecision>
  readFileState: FileStateCache
  getAppState: () => AppState
  setAppState: (update: Partial<AppState>) => void
  // ... other state
}
```

### Context Propagation to Subagents

```typescript
function createSubagentContext(
  parent: ToolUseContext,
  overrides?: SubagentContextOverrides
): ToolUseContext {
  return {
    ...parent,
    // Cloned state
    readFileState: parent.readFileState.clone(),
    toolDecisions: new Map(),

    // Fresh state
    abortController: new AbortController(),
    localDenialTracking: freshState(),

    // Overrides applied
    ...overrides,
  }
}
```

---

## 10. Context Analysis Display

### Token Breakdown Display Order

```
=== CONTEXT ANALYSIS ===

System prompt:          8,234 tokens (12.3%)
Built-in tools:        12,456 tokens (18.7%)
MCP tools:             5,678 tokens (8.5%)
Custom agents:          2,345 tokens (3.5%)
Memory files:           3,456 tokens (5.2%)
Skills:                 4,567 tokens (6.8%)
Messages:              25,678 tokens (38.5%)
───────────────────────────────
Total:                 62,414 tokens

Reserved buffer:       13,000 tokens (19.5%)
Free space:            7,586 tokens (11.4%)

⚠️  Warning: approaching context limit
```

### Analysis Categories

| Category | Description | Always shown |
|----------|-------------|--------------|
| System prompt | Fixed overhead | Yes |
| Built-in tools | Core tools (Bash, Read, Edit, etc.) | Yes |
| MCP tools | From MCP servers | Yes |
| System tools (deferred) | Disabled/suspended tools | No |
| Custom agents | User-defined agents | Yes |
| Memory files | CLAUDE.md, rules, memory | Yes |
| Skills | Invoked skills | Yes |
| Messages | Conversation history | Yes |
| Reserved buffer | For output generation | Yes |
| Free space | Available for new content | Yes |

---

## 11. Doorway Brain Lane Equivalents

### Recommended Context Order for Doorway

```typescript
function buildDoorwayContext(request: UserRequest): Context {
  return {
    // 1. Safety lane state (first for every request)
    safetyState: getSafetyLaneState(),

    // 2. Thread ledger (what happened so far)
    ledger: getLedgerEntries(request.threadId),

    // 3. Git context
    gitStatus: await getGitStatus(request.projectRoot),
    gitDiff: await getGitDiff(request.projectRoot, { maxFiles: 50 }),

    // 4. Project instructions
    instructions: await loadDoorwayInstructions(request.projectRoot),

    // 5. Worker states (for multi-worker orchestration)
    workerStates: getWorkerStates(),

    // 6. Memory (semantic long-term)
    memories: await searchMemories(request.projectRoot, request.query),

    // 7. Skills/rules (task-specific)
    activeRules: getActiveRules(request.task),

    // 8. User request
    userRequest: request.prompt,

    // 9. Reserved for response
    outputBuffer: 13_000,
  }
}
```

### DOORWAY.md Equivalent

```markdown
---
name: doorway-project
description: Project configuration for Doorway orchestration
type: project
---

# Doorway Project Instructions

## Project Overview
Describe the project.

## Worker Configuration
- Which CLIs are available: claude-code, cursor, aider
- Default worktree pattern: .doorway/worktrees/{slug}
- Safety rules: [define dangerous commands]

## Permission Policies
- Auto-allow: Bash(git:*), Bash(npm test)
- Ask: Bash(*)
- Deny: Bash(rm -rf /), Bash(sudo *)

## Lane Configuration
- maxConcurrentLanes: 3
- defaultLaneTimeout: 30m

@include @./rules/workers.md
@include @./rules/safety.md
```

### Memory Taxonomy for Doorway

| Type | Purpose | Example |
|------|---------|---------|
| `user` | User preferences for orchestration | "User prefers verbose logging" |
| `feedback` | What works/doesn't in this codebase | "Don't run tests in parallel here" |
| `project` | Project facts | "This is a monorepo with 3 packages" |
| `reference` | External pointers | "Architecture doc at /docs/arch.md" |
