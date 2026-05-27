# DOORWAY
## The Three-In-One Core Pillar
### Terminal Harness · Agentic Brain · Chat Interface

*Version 1.0 — Master PRD*

---

> *"Doorway is not an IDE. It is a thinking orchestration layer that happens to have an IDE's face."*

---

## Overview

This document covers the three pillars that make Doorway real:

1. **Terminal Harness** — How Doorway controls CLI tools at the OS level, reads their output intelligently, recovers from failures, and routes inputs back — without SDK wrappers, without API billing, without breaking ToS.

2. **Agentic Brain** — How Doorway reads a user's prompt, decomposes it into tasks, delegates each task to the right CLI tool, monitors progress, detects failure, self-recovers, and produces a unified result. Inspired by the pi agent's extensible harness architecture.

3. **Chat Interface** — The single surface the user sees. Minimal. Chat-first. Clean enough to compete with the best tools in the world.

These three pillars are not separate modules bolted together. They are one product. The terminal reads for the brain. The brain speaks to the interface. The interface speaks to the user.

---

---

# PILLAR ONE — TERMINAL HARNESS

## The Execution Layer

---

## 1.1 What This Layer Does

The terminal harness is the engine room. The user never sees it directly. But every response the agentic brain produces comes from something this layer captured, cleaned, and routed.

It does five things:

1. **Spawns** CLI processes inside a PTY — so they think they're talking to a human terminal
2. **Reads** their raw output — cleaning VT100/ANSI escape garbage into structured clean text
3. **Detects** what state each CLI is in — thinking, outputting, waiting for input, done, crashed
4. **Injects** input back — answering questions, sending follow-up prompts, pressing keys
5. **Recovers** — if a CLI crashes, hangs, or fails, it restarts it with context and continues

This is already fully described in the Layer 1 Terminal Harness Specification (separate document). What this pillar covers is the **orchestration-facing interface** of the terminal layer — how the brain talks to it.

---

## 1.2 The Terminal Session API

The brain does not touch PTY file descriptors directly. It talks to the terminal harness through a clean API.

```typescript
interface TerminalHarness {
  // Spawn a new CLI session
  spawn(config: SpawnConfig): Promise<SessionId>

  // Send a prompt to a running session
  sendPrompt(sessionId: SessionId, prompt: string): Promise<void>

  // Inject a response to a CLI question
  respondToQuestion(sessionId: SessionId, response: string): Promise<void>

  // Send a slash command into a session
  sendCommand(sessionId: SessionId, command: SlashCommand): Promise<void>

  // Gracefully close a session
  close(sessionId: SessionId): Promise<void>

  // Kill a hung session
  kill(sessionId: SessionId): Promise<void>

  // Get current state of a session
  getState(sessionId: SessionId): SessionState

  // Subscribe to events from a session
  on(sessionId: SessionId, event: SessionEventType, handler: EventHandler): Unsubscribe

  // Subscribe to ALL sessions (brain uses this)
  onAny(event: SessionEventType, handler: EventHandler): Unsubscribe
}
```

Every CLI interaction goes through this API. The brain never manipulates PTY file descriptors directly. This separation is critical — it means the terminal harness can be rewritten, improved, or swapped without changing the brain.

---

## 1.3 Session Events — What the Brain Receives

The terminal harness emits a stream of structured events. The brain subscribes to these and updates its internal model of what each CLI is doing.

```typescript
type SessionEvent =
  | { type: 'output_chunk';      sessionId: SessionId; content: string; timestamp: number }
  | { type: 'output_complete';   sessionId: SessionId; fullOutput: string; duration_ms: number }
  | { type: 'question_detected'; sessionId: SessionId; question: string; questionType: QuestionType }
  | { type: 'task_complete';     sessionId: SessionId; summary: string; filesChanged: string[] }
  | { type: 'state_changed';     sessionId: SessionId; from: SessionState; to: SessionState }
  | { type: 'error';             sessionId: SessionId; errorType: ErrorType; lastOutput: string }
  | { type: 'crashed';           sessionId: SessionId; crashType: CrashType; recoverable: boolean }
  | { type: 'recovered';         sessionId: SessionId; recoveryAttempt: number }
  | { type: 'token_estimate';    sessionId: SessionId; estimated_tokens: number; threshold_pct: number }
```

These events are the brain's only window into what CLIs are doing. Everything the brain does — task tracking, recovery, unified thread construction — is built from these events.

---

## 1.4 Provider Definitions — CLI Tool Intelligence

Each supported CLI tool has a `ProviderDefinition` that encodes Doorway's deep knowledge of how that tool works.

This is one of the most important structures in Doorway. Getting this right is what makes the "Doorway understands each CLI deeply" claim real.

```typescript
interface ProviderDefinition {
  id: string                          // "claude" | "codex" | "gemini" | "pi"
  displayName: string
  binaryName: string                  // what to look for on PATH
  
  // Spawn configuration
  defaultArgs: string[]               // e.g. ["--dangerously-skip-permissions"]
  recommendedEnvVars: Record<string, string>
  
  // What this CLI is best at (used by routing engine)
  strengths: TaskClass[]
  
  // Deep feature knowledge
  features: ProviderFeatures
  
  // Output parsing patterns (feeds Layer 2 semantic detector)
  patterns: ProviderPatterns
  
  // Auth method
  authMethod: AuthMethod
}

interface ProviderFeatures {
  // Slash commands this CLI supports
  slashCommands: SlashCommandDef[]
  
  // Does it support /compact or equivalent?
  supportsContextCompaction: boolean
  compactionCommand: string | null
  
  // Does it support model switching mid-session?
  supportsModelSwitching: boolean
  modelSwitchCommand: string | null
  
  // Does it support plan mode?
  supportsPlanMode: boolean
  planModeCommand: string | null
  
  // Does it support file context injection?
  supportsFileContext: boolean
  fileContextSyntax: string | null       // e.g. "@filename" or "--file"
  
  // Does it support background/non-interactive mode?
  supportsNonInteractive: boolean
  nonInteractiveFlag: string | null
  
  // Does it use alternate screen buffer? (Codex does)
  usesAlternateScreenBuffer: boolean
  
  // Maximum reliable context (tokens) before compaction needed
  effectiveContextWindow: number
}
```

### Built-in Provider Definitions

**Claude CLI:**
```typescript
const CLAUDE_PROVIDER: ProviderDefinition = {
  id: "claude",
  displayName: "Claude",
  binaryName: "claude",
  defaultArgs: ["--dangerously-skip-permissions"],
  features: {
    slashCommands: [
      { cmd: "/compact",  description: "Compress context" },
      { cmd: "/clear",    description: "Clear conversation" },
      { cmd: "/model",    description: "Switch model" },
      { cmd: "/memory",   description: "View memory files" },
      { cmd: "/status",   description: "Show auth status" },
      { cmd: "/cost",     description: "Show session cost" },
      { cmd: "/doctor",   description: "Check installation" },
    ],
    supportsContextCompaction: true,
    compactionCommand: "/compact",
    supportsModelSwitching: true,
    modelSwitchCommand: "/model",
    supportsPlanMode: false,  // Claude asks to proceed by default
    supportsFileContext: true,
    fileContextSyntax: "@filename",
    usesAlternateScreenBuffer: false,
    effectiveContextWindow: 180000,  // conservative estimate
  },
  authMethod: { type: "cli_native" },  // delegates entirely to `claude auth`
}
```

**Codex CLI:**
```typescript
const CODEX_PROVIDER: ProviderDefinition = {
  id: "codex",
  displayName: "Codex",
  binaryName: "codex",
  defaultArgs: ["--approval-policy", "auto-edit"],
  features: {
    slashCommands: [
      { cmd: "/model",    description: "Switch model" },
      { cmd: "/history",  description: "View session history" },
    ],
    supportsContextCompaction: false,
    supportsPlanMode: true,
    planModeCommand: "/plan",
    supportsFileContext: true,
    fileContextSyntax: "@filename",
    usesAlternateScreenBuffer: true,   // CRITICAL — see Layer 1 spec
    effectiveContextWindow: 120000,
  },
  authMethod: { type: "cli_native" },
}
```

**Gemini CLI:**
```typescript
const GEMINI_PROVIDER: ProviderDefinition = {
  id: "gemini",
  displayName: "Gemini",
  binaryName: "gemini",
  defaultArgs: [],
  features: {
    supportsContextCompaction: false,
    supportsModelSwitching: true,
    usesAlternateScreenBuffer: false,
    effectiveContextWindow: 800000,   // Gemini 2.0 Flash has huge context
  },
  authMethod: { type: "cli_native" },
}
```

---

## 1.5 The BYO (Bring Your Own) Auth Model

Doorway's auth model is the cleanest possible: **we do nothing.** The user authenticates with each CLI tool directly, using that tool's own auth mechanism. Doorway spawns the CLI and the CLI uses whatever credentials it already has.

This is exactly how T3 Code handles Claude support — it spawns the `claude` binary directly, checks `claude auth status`, and never touches OAuth tokens. Result: not blocked by Anthropic's April 2026 policy change.

```typescript
type AuthMethod =
  | { type: "cli_native" }           // CLI manages its own auth — Doorway does nothing
  | { type: "env_api_key"; keyName: string }   // User sets API key in environment
  | { type: "doorway_api_key" }      // User pastes API key into Doorway settings

// Auth check — run on startup and before each session spawn
async function checkProviderAuth(provider: ProviderDefinition): Promise<AuthStatus> {
  if (provider.authMethod.type === "cli_native") {
    // Run `claude auth status` or equivalent and parse output
    const result = await runQuiet(provider.binaryName, ["auth", "status"])
    return parseAuthStatus(result.stdout, provider.id)
  }
  // ... other methods
}
```

**Auth status is surfaced in the UI** — each provider in the provider selector shows a green/red/yellow dot indicating auth state. If a provider is not authenticated, Doorway shows instructions for logging in with that provider's own CLI.

### Provider Configuration in Settings

```
Providers
─────────────────────────────────────────────
● Claude        Authenticated (Max plan)
● Codex         Authenticated
○ Gemini        Not connected   [Setup →]
○ Doorway API   —               [Add key →]
─────────────────────────────────────────────

Doorway API Key (optional — for Doorway's own brain)
[sk-ant-xxxxxxxxxx                    ] [Save]

BYO API Keys (optional — override CLI auth)
ANTHROPIC_API_KEY    [xxxxxxxxxx]
OPENAI_API_KEY       [xxxxxxxxxx]
GOOGLE_API_KEY       [xxxxxxxxxx]
```

The Doorway API itself (the brain's own cloud calls) uses a separate key — entirely optional. The brain can also run on local models via Ollama. The default configuration runs the brain on the user's own Claude subscription, routed through the CLI.

---

---

# PILLAR TWO — AGENTIC BRAIN

## The Orchestration Intelligence

---

## 2.1 What the Brain Does

The brain is Doorway's intelligence. It sits between the user and the terminal sessions.

When a user types a prompt and hits enter, the brain:

1. **Parses** the prompt — extracts intent, mentioned tools (@claude, @codex), file references (@filename), and slash commands
2. **Plans** — decides which tasks need to happen, in what order, by which CLI
3. **Delegates** — spawns sessions and sends each CLI its specific task with proper context
4. **Monitors** — watches all session events, tracks task progress, detects failures
5. **Recovers** — if a CLI fails or gets stuck, the brain restarts it with context and resumes
6. **Follows up** — after all CLIs signal completion, the brain audits their output against the original intent
7. **Synthesizes** — combines all outputs into a single structured thread response

This is not a simple prompt router. The brain understands what was asked, what was actually done, and what the gap between them is.

---

## 2.2 Pi Agent Inspiration

The pi agent (earendil-works/pi) is a minimal terminal coding harness built on the principle of self-extensibility. Instead of shipping every feature, it ships a clean core and lets users extend it through TypeScript extensions, skills, and prompt templates.

From pi, Doorway borrows:

**The Skills system.** Pi's skills are Markdown files that inject specialized knowledge into the agent's context progressively — "progressive disclosure without busting the prompt cache." Doorway's brain uses the same pattern for provider knowledge: before delegating to Claude CLI, the brain injects a skill describing how Claude CLI works, what slash commands it supports, what its failure modes are.

**The session JSONL format.** Pi stores sessions as newline-delimited JSON. Every message, tool call, and result is a record. Doorway's thread persistence uses the same pattern — every event is a JSONL record that can be replayed, searched, and audited.

**The self-modification principle.** Pi ships without sub-agents and plan mode — but you can ask pi to build what you want. Doorway's brain is designed to evolve its own behavior: it can modify its delegation strategy, its recovery patterns, and its follow-up logic based on what works in practice.

**The RPC/SDK mode.** Pi has four modes: interactive, print/JSON, RPC, and SDK. The RPC mode allows external processes to control pi programmatically — which is exactly what Doorway's terminal harness does when it runs Claude CLI.

---

## 2.3 Prompt Parsing

The brain's first job is understanding what the user actually wants.

```typescript
interface ParsedPrompt {
  rawText: string
  intent: Intent
  mentionedProviders: ProviderMention[]   // @claude, @codex etc
  mentionedFiles: FileMention[]           // @filename, @directory
  slashCommands: SlashCommand[]           // /compact, /model etc
  taskClauses: TaskClause[]               // distinct sub-tasks extracted
  constraints: Constraint[]              // "don't touch auth module"
  urgency: Urgency                        // detected from phrasing
}

// Example:
// "analyze the codebase @claude then @codex fix the payment bug and don't touch auth"
// →
{
  intent: "multi_task",
  mentionedProviders: [
    { name: "claude", task: "analyze the codebase" },
    { name: "codex",  task: "fix the payment bug" }
  ],
  constraints: [{ type: "file_exclusion", pattern: "auth" }],
  taskClauses: [
    { id: "t1", description: "analyze codebase", assignedTo: "claude" },
    { id: "t2", description: "fix payment bug",  assignedTo: "codex" },
  ]
}
```

**Parser implementation:** A combination of regex patterns for mentions/commands and a lightweight LLM call for intent extraction. The LLM call uses the brain's own provider (configurable — Claude API, local Ollama, etc.). For simple single-CLI prompts with no @mentions, skip the LLM call entirely — regex is sufficient.

---

## 2.4 The Delegation Engine

After parsing, the brain creates a `DelegationPlan`:

```typescript
interface DelegationPlan {
  planId: string
  threadId: ThreadId
  originalPrompt: string
  tasks: DelegatedTask[]
  executionOrder: ExecutionOrder    // Sequential | Parallel | Mixed
  sharedContext: SharedContext
}

interface DelegatedTask {
  taskId: string
  assignedProvider: string
  prompt: string                    // constructed delegation prompt
  dependsOn: string[]               // other task IDs that must complete first
  authorityDomain: string[]         // files/directories this task "owns"
  successCriteria: string[]
  maxRetries: number
  status: TaskStatus
}

type ExecutionOrder = "sequential" | "parallel" | "mixed"
```

**Prompt construction for delegation:**

The brain does not send the user's raw prompt to the CLI. It constructs a structured delegation prompt:

```
[DOORWAY DELEGATION — Task t2 of 2]

Context: You are working on the Doorway project at /projects/doorway.
Sibling task: @claude is currently analyzing the codebase (task t1).

Your specific task: Fix the payment bug.

Constraints:
- Do NOT modify any files under src/auth/
- Changes must include corresponding tests
- If you need information about the auth module, ask and Doorway will relay to @claude

Proceed with the fix. When complete, summarize what you changed and confirm tests pass.
```

This delegation prompt does several things:
- Names the task explicitly within the overall plan
- Tells the CLI who else is working and what they're doing
- Sets authority domain constraints
- Explains the relay mechanism for cross-agent questions
- Specifies completion criteria

---

## 2.5 Task Monitoring — The Status Tracker

The brain maintains a live task graph. Every event from the terminal harness updates this graph.

```typescript
class TaskTracker {
  private tasks: Map<string, TaskState>
  
  updateFromEvent(event: SessionEvent): void {
    const task = this.getTaskForSession(event.sessionId)
    
    switch (event.type) {
      case 'output_chunk':
        task.lastOutput = event.content
        task.lastActivityAt = event.timestamp
        break
        
      case 'output_complete':
        task.outputHistory.push(event.fullOutput)
        break
        
      case 'question_detected':
        task.status = 'awaiting_response'
        task.pendingQuestion = event.question
        this.routeQuestion(task, event)  // → relay engine
        break
        
      case 'task_complete':
        task.status = 'complete'
        task.completionSummary = event.summary
        task.filesChanged = event.filesChanged
        this.checkPlanCompletion()  // → follow-up engine
        break
        
      case 'crashed':
        task.status = 'failed'
        task.crashInfo = { type: event.crashType, recoverable: event.recoverable }
        this.initiateRecovery(task)  // → recovery engine
        break
    }
  }
}
```

The task graph is surfaced in the UI as **agent status pills** — subtle indicators below the chat input showing which agents are running, their current state, and elapsed time.

---

## 2.6 The Recovery Engine

Recovery is not a fallback — it is a designed feature. When a CLI fails, Doorway does not surface an error to the user. It fixes it silently.

```typescript
class RecoveryEngine {
  async initiateRecovery(task: TaskState): Promise<void> {
    const strategy = this.classifyRecovery(task.crashInfo.type)
    
    switch (strategy.type) {
      case 'retry_with_context': {
        await this.delay(strategy.delayMs)
        const resumePrompt = this.buildResumePrompt(task)
        const newSessionId = await harness.spawn(task.provider)
        await harness.sendPrompt(newSessionId, resumePrompt)
        task.sessionId = newSessionId
        task.status = 'running'
        task.recoveryCount++
        break
      }
      
      case 'compact_and_retry': {
        // Context overflow — summarize and continue
        const summary = await this.compactHistory(task)
        const newSessionId = await harness.spawn(task.provider)
        await harness.sendPrompt(newSessionId, this.buildCompactedPrompt(task, summary))
        break
      }
      
      case 'rate_limit_wait': {
        // Show user a subtle "rate limited, waiting Xs" indicator
        this.emit('rate_limit', { taskId: task.id, waitMs: strategy.waitMs })
        await this.delay(strategy.waitMs)
        await this.retry(task)
        break
      }
      
      case 'needs_human': {
        // Cannot auto-recover — surface to user
        this.emit('recovery_failed', { task, suggestion: strategy.suggestion })
        break
      }
    }
  }
  
  private buildResumePrompt(task: TaskState): string {
    return `
[RECOVERY — attempt ${task.recoveryCount + 1}]

Previous session encountered an issue: ${task.crashInfo.type}

Original task: ${task.originalPrompt}

${task.completedSubtasks.length > 0 ? `Already completed:
${task.completedSubtasks.map(s => `- ${s}`).join('\n')}` : ''}

Last progress before interruption:
${task.lastCoherentOutput}

Please continue from where you left off. Do not repeat completed work.
    `.trim()
  }
}
```

**Recovery is invisible to the user.** The thread shows a subtle `[recovering...]` indicator for <2 second restarts. For longer recoveries (rate limit waits), a small status chip shows "Rate limited — resuming in 45s." The conversation continues normally once recovery completes.

---

## 2.7 The Question Relay Engine

When a CLI asks a question mid-task, the brain must decide: can I answer this automatically, or does it need the user?

```typescript
class RelayEngine {
  async routeQuestion(task: TaskState, event: QuestionDetectedEvent): Promise<void> {
    const resolution = await this.classify(event.question, task)
    
    switch (resolution.type) {
      case 'auto_resolve': {
        // Brain can answer from context
        await harness.respondToQuestion(task.sessionId, resolution.answer)
        // Log in thread as: "Claude asked: [question] → Doorway: [answer]"
        this.emitThreadEvent('auto_response', { question: event.question, answer: resolution.answer })
        break
      }
      
      case 'peer_resolve': {
        // Another agent can answer this
        const peerTask = this.findPeerForQuestion(event.question)
        const answer = await this.queryPeer(peerTask, event.question)
        await harness.respondToQuestion(task.sessionId, answer)
        break
      }
      
      case 'user_resolve': {
        // Needs human judgment — surface to chat UI
        this.emitThreadEvent('question_for_user', {
          fromAgent: task.provider,
          question: event.question,
          taskContext: task.originalPrompt,
          taskId: task.taskId,
        })
        // Brain waits. User answers in chat. Answer flows back here.
        break
      }
    }
  }
  
  // Called when user answers a relayed question
  async receiveUserAnswer(taskId: string, answer: string): Promise<void> {
    const task = this.tracker.getTask(taskId)
    await harness.respondToQuestion(task.sessionId, answer)
    this.emitThreadEvent('user_response', { taskId, answer })
  }
}
```

In the UI, a relayed question looks like:

```
┌─────────────────────────────────────────────────────┐
│ ⚡ Claude is asking                                  │
│                                                     │
│ "Should I also update the PaymentService tests,     │
│  or just the integration tests?"                    │
│                                                     │
│ ┌───────────────────────────────────┐ [Send →]      │
│ │ Type your answer...               │               │
│ └───────────────────────────────────┘               │
└─────────────────────────────────────────────────────┘
```

Once the user answers, the conversation continues without interruption.

---

## 2.8 The Follow-Up Audit

This is one of the most important features. After all tasks signal completion, the brain does not immediately show the result. It audits.

The follow-up audit asks: **"Did we actually do what the user asked?"**

```typescript
class FollowUpEngine {
  async auditCompletion(plan: DelegationPlan): Promise<AuditResult> {
    const allOutputs = plan.tasks.map(t => ({
      taskId: t.taskId,
      provider: t.assignedProvider,
      originalPrompt: t.prompt,
      output: t.completionSummary,
      filesChanged: t.filesChanged,
    }))
    
    // Build audit prompt
    const auditPrompt = `
Original user request: "${plan.originalPrompt}"

What was actually done:
${allOutputs.map(o => `
${o.provider} (task: "${o.originalPrompt}"):
${o.output}
Files changed: ${o.filesChanged.join(', ')}
`).join('\n')}

Evaluate:
1. Was the user's full request fulfilled?
2. Are there any gaps between what was asked and what was done?
3. Are there any conflicts between what different agents did?
4. What should the user know about what was done?

Respond in JSON: { fulfilled: boolean, gaps: string[], conflicts: string[], summary: string }
    `
    
    // Run through brain's own model (fast, cheap call)
    const result = await brain.evaluate(auditPrompt)
    return result
  }
  
  async handleAuditResult(plan: DelegationPlan, audit: AuditResult): Promise<void> {
    if (!audit.fulfilled || audit.gaps.length > 0) {
      // Re-delegate the gaps
      for (const gap of audit.gaps) {
        await this.delegateGapTask(plan, gap)
      }
    }
    
    if (audit.conflicts.length > 0) {
      // Surface conflicts to user for resolution
      this.emitThreadEvent('conflict_detected', { conflicts: audit.conflicts })
    }
    
    // Synthesize final response
    await this.synthesizeResponse(plan, audit)
  }
}
```

The follow-up loop continues until either:
- The audit confirms full completion
- Maximum retry depth reached (default: 3 follow-up rounds)
- A conflict requires human resolution

---

## 2.9 Response Synthesis

After the audit confirms completion, the brain synthesizes the final thread response.

This is not a dump of all CLI outputs. It is a structured, readable summary:

```typescript
async function synthesizeResponse(plan: DelegationPlan, audit: AuditResult): Promise<ThreadResponse> {
  const synthPrompt = `
User asked: "${plan.originalPrompt}"

Work completed:
${formatAllOutputs(plan.tasks)}

Create a clear, structured response that:
1. Directly answers what the user asked
2. Shows what was done (with file references if relevant)
3. Highlights any decisions made and why
4. Notes anything the user should review
5. Keeps it tight — no padding, no repeating what's obvious

Format: use headers sparingly, show changed files as a clean list, keep explanations brief.
  `
  
  const response = await brain.generate(synthPrompt)
  
  return {
    content: response.text,
    agentContributions: buildContributionMap(plan.tasks),
    filesChanged: collectAllChangedFiles(plan.tasks),
    decisions: extractDecisions(plan.tasks),
    threadEvents: collectThreadEvents(plan.threadId),
  }
}
```

The synthesized response is what appears in the chat thread as the final message.

---

## 2.10 Self-Evolution — Pi's Influence

Pi's core principle: **adapt pi to your workflows, not the other way around.** The agent stays small at the core and is extended through TypeScript.

Doorway's brain adopts this. The brain has a `BrainConfig` that evolves over time:

```typescript
interface BrainConfig {
  // How to route tasks by type (updates based on observed success rates)
  routingTable: RoutingTable
  
  // How aggressive to be with autonomous recovery (learned from user feedback)
  recoveryAggression: number  // 0.0 (always ask) to 1.0 (never ask)
  
  // How to handle context compaction (when to trigger, how to summarize)
  compactionStrategy: CompactionStrategy
  
  // Skills injected before delegation (per-provider knowledge docs)
  providerSkills: Map<string, Skill>
  
  // Custom delegation prompt templates (user-editable)
  delegationTemplates: Map<TaskClass, string>
  
  // Audit strictness (how hard to check completion)
  auditStrictness: number  // 0.0 (trust CLIs) to 1.0 (verify everything)
}
```

Users can modify their `BrainConfig` in Settings. Advanced users can write custom provider skills (Markdown files that inject knowledge about how a specific CLI behaves in their specific project). Over time, the brain learns from session history which routing decisions worked and adjusts its defaults.

---

---

# PILLAR THREE — CHAT INTERFACE

## The Only Surface That Matters

---

## 3.1 Design Philosophy

Looking at the screenshots:

**Image 1 & 2** — The empty state. Pure, flat gray background. A floating input card centered on screen. Nothing else competes for attention. The input card has a project selector, a text area, a model chip, and a context indicator at the bottom. It looks expensive. It looks quiet. It looks confident.

This is the design direction. Not dark mode with neon. Not glass morphism. Not gradient mesh backgrounds. Just structure, whitespace, and typography doing all the work.

**Image 3 & 4** — The plan card. Before starting a complex task, Doorway shows what it intends to do. Five items. Circular progress rings on the left. Edit, Cancel, Start buttons. Clean card with subtle border. This is how you earn user trust — show your plan before executing it.

**Image 5** — The result card. Research completed in 38 minutes. 26 citations. 348 searches. A completed task shown as a document card with a title, download button, and expand button. Evidence of work done.

The interface is a **chat that occasionally surfaces cards.** The chat is the primary surface. Cards are how complex results are presented. There are no dashboards, no sidebars competing with the conversation, no tool panels.

---

## 3.2 Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ ≡  ←  →                                              [+] Profile│  ← titlebar (frameless)
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                  │
│  Projects    │                                                  │
│  ──────────  │                                                  │
│  > doorway   │                                                  │
│    thread 1  │                                                  │
│    thread 2  │           MAIN THREAD AREA                       │
│  > project2  │                                                  │
│    thread 1  │                                                  │
│              │                                                  │
│  ──────────  │                                                  │
│  Scheduled   │                                                  │
│              │                                                  │
│  ──────────  │                                                  │
│  ⚙ Settings  │                                                  │
│              │  ┌────────────────────────────────────────────┐  │
│              │  │  INPUT CARD                                │  │
│              │  └────────────────────────────────────────────┘  │
└──────────────┴──────────────────────────────────────────────────┘
```

**Sidebar:** Collapsible. Shows projects, threads under each project, scheduled tasks, settings. Same pattern as Claude.ai, Cursor, Gemini. Not novel — familiar.

**Main area:** The thread. Messages from user (right-aligned, subtle background), messages from Doorway (left-aligned, structured). Agent status chips when CLIs are running. Cards for complex outputs. Empty state: the floating input card centered in the window.

**Input card:** Always visible at the bottom. Expands on focus. Project selector above input. Model selector and context indicator below input.

---

## 3.3 The Input Card — Specification

This is the most important UI component. Every interaction starts here.

```
┌─────────────────────────────────────────────────────────────────┐
│  📁 doorway  ∨                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Ask anything, @ to mention, / for actions                      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  + Gemini 3.5 Flash (High)  ∨                       🎙          │
│  ──────────────────────────────────────────────────────────     │
│  🖥 Local  ∨                                                    │
└─────────────────────────────────────────────────────────────────┘
```

**Project selector (top):** Shows current project folder. Click to switch project or open a new one. Breadcrumb style with folder icon.

**Text area (middle):** Auto-expanding. Placeholder text: "Ask anything, @ to mention, / for actions." Supports:
- `@claude`, `@codex`, `@gemini` — mention specific CLI agents
- `@filename`, `@directory` — include file context
- `/compact`, `/model`, `/clear` — slash commands (autocomplete dropdown appears)

**Bottom row 1 — Model selector:** Shows current brain model. Click for dropdown: Gemini 3.5 Flash, Claude Sonnet, Claude Opus, Local (Ollama). The `+` icon adds context (files, URLs, images).

**Bottom row 2 — Context indicator:** Shows current working context. "Local" = the current project directory. Can be expanded to show which files are in context.

**Visual spec:**
- Background: `#F4F4F4` (light mode) / `#111111` (dark mode)
- Border: 1px `#E0E0E0` (light) / `#2A2A2A` (dark), `border-radius: 12px`
- Card shadow: `0 2px 8px rgba(0,0,0,0.08)` (light) / none (dark)
- Text: 14px, `font-family: 'Geist', system-ui`, weight 400
- Placeholder: `#9A9A9A`
- Project selector: 13px, weight 500, with `📁` icon
- Model chip: 13px, pill shape, background `#EBEBEB`

---

## 3.4 The Thread — Message Rendering

**User messages:**
```
                           ┌─────────────────────────────┐
                           │ analyze the codebase @claude│
                           │ then @codex fix the payment │
                           │ bug                         │
                           └─────────────────────────────┘
```
Right-aligned. `background: #1A1A1A` (light mode) / `#F0F0F0` (dark). White text. `border-radius: 16px 16px 4px 16px`. Max width 70%.

**Doorway messages (agent output):**
Left-aligned. No background (just text on page background). Markdown rendered. Code blocks with syntax highlighting. Max width 85%.

**Agent status chips (while CLIs are running):**
```
● Claude   analyzing...   12s        ● Codex   running...   8s
```
Subtle row below the last user message. Small dot indicator (animated pulse for active, solid for complete). Provider name, current state label, elapsed time. Disappear when all agents complete.

**The plan card (before execution):**

Shown when the brain detects a complex multi-step task and wants user confirmation before starting.

```
┌────────────────────────────────────────────────────┐
│  Codebase Analysis + Payment Bug Fix               │
│                                                    │
│  ◌  Analyze codebase with Claude CLI               │
│  ◌  Pass analysis context to Codex                 │
│  ◌  Fix payment bug (excluding auth module)        │
│  ◌  Run tests to confirm fix                       │
│  ◌  Generate summary of changes                   │
│                                                    │
│  [Edit]              [Cancel]    [Start  →]        │
└────────────────────────────────────────────────────┘
```
Circular progress rings on the left (empty circles before start, filling as tasks complete). Edit button lets user modify the plan before execution. Start button launches the delegation engine.

**The question relay card (when CLI asks a question):**

```
┌────────────────────────────────────────────────────┐
│  ⚡ Claude is asking                               │
│                                                    │
│  "Should I update the PaymentService tests, or     │
│   just the integration tests?"                     │
│                                                    │
│  ┌──────────────────────────────────┐  [→]         │
│  │ Both — integration and unit...   │              │
│  └──────────────────────────────────┘              │
└────────────────────────────────────────────────────┘
```

**The completion card (structured final result):**

```
┌────────────────────────────────────────────────────┐
│  ✓ Task Complete   38s   2 agents                  │
│                                                    │
│  Payment bug fixed. Auth module untouched.         │
│                                                    │
│  Changed files:                                    │
│  src/payments/service.ts                           │
│  src/payments/service.test.ts                      │
│  src/payments/utils.ts                             │
│                                                    │
│  Claude (analysis) · Codex (implementation)       │
│                                                    │
│  [View diff →]              [↓ Download report]    │
└────────────────────────────────────────────────────┘
```

---

## 3.5 Visual Design System

### Color System

```css
:root {
  /* Backgrounds */
  --bg-primary:     #F2F2F2;   /* main window */
  --bg-secondary:   #FFFFFF;   /* cards, sidebar */
  --bg-tertiary:    #EBEBEB;   /* chips, pills */
  --bg-input:       #FFFFFF;   /* input card */
  
  /* Text */
  --text-primary:   #111111;
  --text-secondary: #666666;
  --text-tertiary:  #999999;
  --text-inverse:   #FFFFFF;
  
  /* Borders */
  --border-light:   #E0E0E0;
  --border-medium:  #C8C8C8;
  
  /* Agents */
  --claude-color:   #D97706;   /* amber — Claude's identity */
  --codex-color:    #2563EB;   /* blue — Codex */
  --gemini-color:   #7C3AED;   /* purple — Gemini */
  --doorway-color:  #111111;   /* black — Doorway itself */
  
  /* Status */
  --status-running: #F59E0B;   /* amber pulse */
  --status-done:    #10B981;   /* green */
  --status-error:   #EF4444;   /* red */
  --status-waiting: #6B7280;   /* gray */
  
  /* Shadows */
  --shadow-card:    0 1px 4px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04);
  --shadow-input:   0 2px 8px rgba(0,0,0,0.06);
}

/* Dark mode */
[data-theme="dark"] {
  --bg-primary:     #111111;
  --bg-secondary:   #1A1A1A;
  --bg-tertiary:    #222222;
  --bg-input:       #1A1A1A;
  --text-primary:   #F0F0F0;
  --text-secondary: #888888;
  --text-tertiary:  #555555;
  --border-light:   #2A2A2A;
  --border-medium:  #333333;
  --shadow-card:    none;
  --shadow-input:   none;
}
```

### Typography

```css
/* Primary font — clean, modern, developer-grade */
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&display=swap');

/* Monospace — for code, terminal output, file paths */
@import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&display=swap');

:root {
  --font-sans: 'Geist', system-ui, -apple-system, sans-serif;
  --font-mono: 'Geist Mono', 'Fira Code', monospace;
  
  /* Scale */
  --text-xs:   11px;
  --text-sm:   13px;
  --text-base: 14px;
  --text-md:   15px;
  --text-lg:   16px;
  --text-xl:   18px;
  --text-2xl:  22px;
  
  /* Leading */
  --leading-tight:  1.3;
  --leading-normal: 1.5;
  --leading-relaxed: 1.7;
  
  /* Letter spacing */
  --tracking-tight:  -0.02em;
  --tracking-normal: -0.01em;
  --tracking-wide:   0.02em;
}

body {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  letter-spacing: var(--tracking-normal);
  color: var(--text-primary);
  background: var(--bg-primary);
  -webkit-font-smoothing: antialiased;
}
```

### Spacing System

```css
:root {
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-8:  32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```

### Border Radius

```css
:root {
  --radius-sm:   6px;   /* chips, small elements */
  --radius-md:   8px;   /* buttons, small cards */
  --radius-lg:   12px;  /* input card, cards */
  --radius-xl:   16px;  /* message bubbles */
  --radius-full: 9999px; /* pills, dots */
}
```

### Motion

All transitions: `transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1)`

Agent status pulse animation:
```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.agent-running .status-dot {
  animation: pulse 1.4s ease-in-out infinite;
}
```

Plan card task completion ring:
```css
.task-ring {
  transition: stroke-dashoffset 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

## 3.6 The Slash Command System — UI Layer

When user types `/` in the input, a dropdown appears immediately above the input card.

```
┌────────────────────────────────────────────────────┐
│  /compact    Compress session context              │
│  /clear      Clear current thread                  │
│  /model      Switch brain model                    │
│  /plan       Show current task plan                │
│  /loop       Start autonomous goal loop            │
│  /blame      Show agent blame for a file           │
│  /schedule   Schedule a recurring task             │
│  /connect    Connect an external service           │
│  /providers  Manage CLI providers                  │
└────────────────────────────────────────────────────┘
```

Dropdown filters as user types. Arrow keys navigate. Enter selects. Escape closes.

Each command has:
- Short name + description
- Keyboard shortcut if applicable
- Argument hints (e.g. `/model [provider] [model-name]`)

---

## 3.7 The Settings Screen

Settings is a modal, not a page. Opens from the `⚙` icon in sidebar. Tabs:

**Providers**
- List of known providers with auth status dots
- Setup/disconnect buttons per provider
- BYO API key inputs

**Brain**
- Brain model selector (which model powers Doorway's own intelligence)
- Recovery aggressiveness slider
- Audit strictness slider
- Autonomous mode toggle

**Appearance**
- Light / Dark / System theme
- Font size (Small / Medium / Large)
- Compact / Comfortable density

**Keyboard shortcuts**
- Full table of shortcuts
- User-configurable

**About**
- Version, changelog link
- Feedback button

---

## 3.8 Empty State — The Floating Input

When no thread is active, the input card floats centered in the main area (as shown in screenshots 1 and 2). This is Doorway's home screen.

The sidebar is still visible. The project selector in the input card shows the last opened project. The user can start typing immediately.

No welcome banner. No "Get started" cards. No tutorial overlay. Just the input, ready to go.

This is the most important first impression Doorway makes. It needs to feel calm, confident, and fast.

---

## 3.9 The Sidebar Detail

The sidebar mirrors Claude.ai's project structure but with developer-specific additions:

```
┌────────────────────────────────┐
│  + New Conversation            │
│                                │
│  ↺ Conversation History        │
│  🕐 Scheduled Tasks            │
│                                │
│  Projects                 ≡ +  │
│  ────────────────────────────  │
│  📁 doorway                    │
│     Terminal Harness PRD  6h   │
│     Streaming IPC impl    2d   │
│                                │
│  📁 aether-studio              │
│     Physics engine        13d  │
│                                │
│  📁 business-automation        │
│     Apple Dev integration  9d  │
│                                │
│  ────────────────────────────  │
│  ⚙ Settings                   │
└────────────────────────────────┘
```

Projects come from the user's local filesystem — when you open a directory in Doorway, it becomes a project. Threads are saved per-project.

---

---

# APPENDIX A — The Three Pillars Together

## How A Single User Prompt Flows Through All Three Layers

**Prompt:** `"@claude analyze the codebase and @codex fix the payment module bug, don't touch auth"`

```
1. USER TYPES PROMPT
   └─► Input card captures text

2. BRAIN — PARSE
   └─► Extracts: 2 tasks, 2 providers, 1 constraint
   └─► Builds DelegationPlan with tasks t1 (claude) and t2 (codex)

3. UI — PLAN CARD SHOWN
   └─► "Codebase Analysis + Payment Fix" with 5 steps shown
   └─► User clicks [Start →]

4. BRAIN — DELEGATE
   ├─► t1: Spawns Claude CLI session
   │       Sends delegation prompt with codebase context
   │
   └─► t2: Spawns Codex CLI session (parallel)
           Sends delegation prompt with constraint: no auth

5. TERMINAL HARNESS — BOTH SESSIONS RUNNING
   ├─► Claude CLI: PTY spawned, VT100 parsed, THINKING state
   └─► Codex CLI: PTY spawned (alt screen), THINKING state

6. UI — AGENT STATUS CHIPS APPEAR
   └─► "● Claude  analyzing...  8s   ● Codex  running...  8s"

7. HARNESS — QUESTION DETECTED
   └─► Codex asks: "Should I update integration tests too?"
   └─► Event: question_detected → Brain → Relay Engine
   └─► Classification: auto_resolve
   └─► Brain: "Yes, update both unit and integration tests"
   └─► Harness: inject response into Codex session

8. TERMINAL HARNESS — COMPLETION DETECTED
   ├─► Claude: return-to-prompt pattern → task_complete event
   └─► Codex: return-to-prompt pattern → task_complete event

9. BRAIN — FOLLOW-UP AUDIT
   └─► Checks: did both tasks fulfill the original request?
   └─► Result: fulfilled=true, no gaps, no conflicts

10. BRAIN — SYNTHESIZE RESPONSE
    └─► Builds structured summary of both outputs

11. UI — COMPLETION CARD SHOWN IN THREAD
    └─► "✓ Task Complete  47s  2 agents"
    └─► Summary, changed files, agent contributions
    └─► [View diff →]  [↓ Download report]
```

Total time from Enter to completion card: ~47 seconds for a real codebase analysis + bug fix.
User interventions required: 0 (question was auto-resolved).
User keystrokes required: the original prompt + [Start →] click.

---

# APPENDIX B — Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| App shell | Electron | Cross-platform, native OS access |
| Terminal harness | Rust sidecar + portable-pty | Performance, safety, cross-platform |
| Brain runtime | Node.js (Electron main) | Async, rich npm ecosystem |
| UI framework | React 19 | Industry standard, component model |
| Styling | CSS variables + Tailwind utilities | Precision + speed |
| Font | Geist + Geist Mono | Modern, developer-grade, free |
| IPC | Unix socket / Named pipe | Low latency sidecar comms |
| Persistence | SQLite (better-sqlite3) | Local-first, no server needed |
| Auth | System keychain (keytar) | Secure, OS-native |
| Diff view | Monaco editor | VS Code quality, diff mode |

---

# APPENDIX C — V1 Scope Decision

Ship in V1:
- Terminal harness (Claude CLI + Codex CLI)
- Brain: prompt parsing, delegation, monitoring, recovery, follow-up audit, synthesis
- UI: input card, thread, plan card, question relay card, completion card, sidebar, settings
- Providers: Claude CLI, Codex CLI (BYO auth via cli_native)
- Slash commands: /compact, /clear, /model, /plan, /status

Roadmap (post-V1):
- Gemini CLI, pi CLI provider definitions
- Doorway API key (brain cloud calls)
- Plugin/OAuth infrastructure
- Scheduling and automation
- Team/collaboration features
- Peer-to-peer subagent communication

---

*End of Document*

---

**Doorway — Three-In-One Core Pillar PRD**
*Classification: Internal — Litchi Studio*
*References: earendil-works/pi (harness architecture), pingdotgg/t3code (BYO auth pattern)*
