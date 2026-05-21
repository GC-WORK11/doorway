# Claude Code State Machine Map

**Purpose:** Document all major state machines in Claude Code as text diagrams for Doorway orchestration design.

---

## 1. CLI Entry State Machine

```
                    ┌─────────────────────────────────────────────┐
                    │                  START                      │
                    └─────────────────┬───────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────────────┐
                    │  cli.tsx bootstrap                          │
                    │  - Parse CLI args (fast path: --version)   │
                    │  - Set env vars for CCR                    │
                    │  - Route to specialized entrypoints        │
                    └─────────────────┬───────────────────────────┘
                                      │
                    ┌─────────────────┴──────────────────────────┐
                    ▼                                           ▼
        ┌───────────────────┐                     ┌─────────────────────────┐
        │ --version / early │                     │  main.tsx main()         │
        │ flag exit         │                     │  - Initialize state       │
        └───────────────────┘                     │  - Setup signal handlers  │
                                                  └────────────┬──────────────┘
                                                                 │
                              ┌────────────────────────────────────┼────────────┐
                              │                                    │            │
                              ▼                                    ▼            ▼
                   ┌──────────────────┐           ┌────────────────┐  ┌────────────┐
                   │ --print / -p mode │           │ Interactive    │  │ SDK mode  │
                   │ → runHeadless()   │           │ TTY detected   │  │ --sdk-url │
                   │ - StructuredIO    │           │ → launchRepl() │  │ → remoteIO│
                   │ - NDJSON stream   │           └────────────────┘  └────────────┘
                   │ - AbortController │
                   └──────────────────┘
```

---

## 2. Agent Loop State Machine (queryLoop)

```
                            ┌───────────────────────────────────┐
                            │           queryLoop()              │
                            │  Initial State: QueryParams        │
                            │  turnCount = 0                    │
                            └───────────────┬───────────────────┘
                                            │
                                            ▼
                    ┌─────────────────────────────────────────────┐
                    │  PREPROCESSING                              │
                    │  - memory prefetch (async, non-blocking)    │
                    │  - snip compaction                         │
                    │  - microcompact (content reduction)        │
                    │  - context collapse (CONTEXT_COLLAPSE)     │
                    │  - autocompact (if enabled + threshold)    │
                    └─────────────────────┬───────────────────────┘
                                          │
                                          ▼
                    ┌─────────────────────────────────────────────┐
                    │  MODEL STREAMING                            │
                    │  deps.callModel()                           │
                    │  - Yields content blocks as they arrive     │
                    │  - Collects tool_use blocks                 │
                    │  - Sets needsFollowUp = true if tools      │
                    └────────────┬────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
   ┌─────────────────────┐          ┌──────────────────────────┐
   │ needsFollowUp=false │          │ needsFollowUp=true        │
   │ (text only)         │          │ (tools requested)        │
   └──────────┬──────────┘          └──────────┬───────────────┘
              │                                 │
              │                                 ▼
              │            ┌─────────────────────────────────────┐
              │            │  TOOL EXECUTION                      │
              │            │  - Partition: concurrent vs serial    │
              │            │  - StreamingToolExecutor or runTools │
              │            │  - Collect tool results              │
              │            │  - Check abort signal                │
              │            │  - Process attachments                │
              │            └──────────────┬──────────────────────┘
              │                           │
              │            ┌──────────────┴───────────────┐
              │            ▼                              ▼
              │  ┌──────────────────────┐    ┌─────────────────────┐
              │  │ Abort signaled       │    │ Tools completed     │
              │  │ → RETURN            │    │ turnCount++         │
              │  │ { reason:          │    │ → CONTINUE          │
              │  │  'aborted_tools' }  │    │ (next iteration)   │
              │  └──────────────────────┘    └─────────────────────┘
              │
              ▼
   ┌─────────────────────────────────────┐
   │  STOP HOOKS CHECK                   │
   │  - runStopHooks()                   │
   │  - If hook blocked: RETURN          │
   │    { reason: 'stop_hook_prevented' }│
   └─────────────┬───────────────────────┘
                 │
                 ▼
   ┌─────────────────────────────────────┐
   │  TOKEN BUDGET CHECK                 │
   │  - checkTokenBudget()               │
   │  - If continue: inject nudge msg   │
   │    increment continuation count     │
   │  - If complete: log + stop          │
   └─────────────┬───────────────────────┘
                 │
                 ▼
   ┌─────────────────────────────────────┐
   │  RETURN { reason: 'completed' }     │
   └─────────────────────────────────────┘
```

### Loop Exit Reasons

| State | Condition | Return |
|-------|-----------|--------|
| E1 | `needsFollowUp=false` + stop hooks pass | `{ reason: 'completed' }` |
| E2 | Abort during streaming | `{ reason: 'aborted_streaming' }` |
| E3 | Abort during tools | `{ reason: 'aborted_tools' }` |
| E4 | `nextTurnCount > maxTurns` | `{ reason: 'max_turns' }` |
| E5 | Stop hook blocked | `{ reason: 'stop_hook_prevented' }` |
| E6 | Stop hook prevented | `{ reason: 'hook_stopped' }` |
| E7 | Blocking token limit | `{ reason: 'blocking_limit' }` |
| E8 | Context collapse failed | `{ reason: 'prompt_too_long' }` |
| E9 | Model fallback retry | Continue with fallback model |

### Recovery Transitions

```
┌─────────────────────────────────────────────────────────────────┐
│                        RECOVERY STATES                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  R1: MAX OUTPUT TOKENS RECOVERY                                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ isWithheldMaxOutputTokens(lastMessage)?                     │ │
│  │   ├─ capEnabled + override=undefined                        │ │
│  │  │   → state.maxOutputTokensOverride = ESCALATED_64K        │ │
│  │  │   → CONTINUE                                            │ │
│  │   └─ recoveryCount < 3                                      │ │
│  │       → inject recovery message                             │ │
│  │       → recoveryCount++                                    │ │
│  │       → CONTINUE                                            │ │
│  │   └─ recoveryCount >= 3                                     │ │
│  │       → stop with error                                     │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  R2: PROMPT-TOO-LONG RECOVERY                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ isWithheld413(lastMessage)?                                 │ │
│  │   ├─ CONTEXT_COLLAPSE + drain available                     │ │
│  │  │   → contextCollapse.recoverFromOverflow()                │ │
│  │  │   → CONTINUE with drained messages                       │ │
│  │   └─ reactiveCompact enabled                                │ │
│  │       → tryReactiveCompact()                               │ │
│  │       → CONTINUE with compacted messages                    │ │
│  │   └─ both failed                                            │ │
│  │       → RETURN { reason: 'prompt_too_long' }                │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  R3: MODEL FALLBACK                                              │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ innerError instanceof FallbackTriggeredError?               │ │
│  │   → currentModel = fallbackModel                           │ │
│  │   → attemptWithFallback = true                             │ │
│  │   → clear assistantMessages, toolResults, toolUseBlocks    │ │
│  │   → stripSignatureBlocks(messagesForQuery)                  │ │
│  │   → CONTINUE with fallback model                           │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Tool Execution State Machine

```
┌────────────────────────────────────────────────────────────────┐
│                    TOOL EXECUTION FLOW                          │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  PARTITIONING                                               │  │
│  │  partitionToolCalls(toolUseMessages, toolUseContext)      │  │
│  │    → Batch[] = [{ isConcurrencySafe, blocks[] }]          │  │
│  │                                                              │  │
│  │  Rules:                                                      │  │
│  │  - Read-only tools (Glob, Grep, Read) → concurrent batch   │  │
│  │  - Stateful tools (Edit, Write, Bash) → serial batch       │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  For each Batch (in order):                                │  │
│  │                                                              │  │
│  │  ┌─────────────────┐    ┌─────────────────────────────┐   │  │
│  │  │ isConcurrency   │YES │ runToolsConcurrently(tools)  │   │  │
│  │  │ Safe=true       │    │ → parallel execution        │   │  │
│  │  └────────┬────────┘    └─────────────────────────────┘   │  │
│  │           │NO                                              │  │
│  │           ▼                                                │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │ runToolsSerially(tools)                              │ │  │
│  │  │ → sequential execution                              │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  For each tool in batch:                                  │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ 1. FIND TOOL                                         │  │  │
│  │  │    findToolByName(tools, name)                       │  │  │
│  │  │    ├─ Found → continue                              │  │  │
│  │  │    └─ Not found → synthetic error, skip              │  │  │
│  │  ├────────────────────────────────────────────────────┤  │  │
│  │  │ 2. VALIDATE INPUT                                    │  │  │
│  │  │    tool.inputSchema.safeParse(input)                  │  │  │
│  │  │    ├─ Valid → continue                              │  │  │
│  │  │    └─ Invalid → error message, skip                  │  │  │
│  │  ├────────────────────────────────────────────────────┤  │  │
│  │  │ 3. PERMISSION CHECK                                  │  │  │
│  │  │    canUseTool(tool, input, context)                  │  │  │
│  │  │    ├─ allow → continue                               │  │  │
│  │  │    ├─ deny → log denial, skip                        │  │  │
│  │  │    └─ ask → show prompt, wait for user               │  │  │
│  │  ├────────────────────────────────────────────────────┤  │  │
│  │  │ 4. PRE-TOOL HOOKS                                    │  │  │
│  │  │    runPreToolUseHooks(context, tool)                  │  │  │
│  │  ├────────────────────────────────────────────────────┤  │  │
│  │  │ 5. EXECUTE                                          │  │  │
│  │  │    tool.call(input, context, canUseTool, ...)        │  │  │
│  │  │    ├─ Success → result                              │  │  │
│  │  │    └─ Error → error result                          │  │  │
│  │  ├────────────────────────────────────────────────────┤  │  │
│  │  │ 6. POST-TOOL HOOKS                                   │  │  │
│  │  │    runPostToolUseHooks(context, tool, result)         │  │  │
│  │  ├────────────────────────────────────────────────────┤  │  │
│  │  │ 7. YIELD RESULT                                      │  │  │
│  │  │    → tool result wrapped as user message             │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 4. Permission State Machine

```
┌────────────────────────────────────────────────────────────────┐
│                    PERMISSION CHECK FLOW                        │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  hasPermissionsToUseTool(tool, input, context)                  │
│                       │                                        │
│                       ▼                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. BYPASS CHECK                                           │  │
│  │    context.options.bypassPermissions?                    │  │
│  │    ├─ YES → check dangerous-file immune list              │  │
│  │    │        ├─ Is dangerous file? → DENY (bypass-immune) │  │  │
│  │    │        └─ Not dangerous → ALLOW (bypass)           │  │  │
│  │    └─ NO → continue                                     │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 2. DENY RULES CHECK                                      │  │
│  │    checkRule('deny', tool.name, input)                    │  │
│  │    ├─ Matches → DENY                                     │  │
│  │    └─ No match → continue                               │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 3. ASK RULES CHECK                                       │  │
│  │    checkRule('ask', tool.name, input)                     │  │
│  │    ├─ Matches → ASK (show prompt)                        │  │
│  │    └─ No match → continue                               │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 4. TOOL-SPECIFIC CHECK                                  │  │
│  │    tool.checkPermissions?(input, context)                │  │
│  │    ├─ allow → continue                                  │  │
│  │    ├─ deny → DENY                                       │  │
│  │    └─ ask → ASK                                         │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 5. ALWAYS-ALLOWED CHECK                                 │  │
│  │    isAlwaysAllowedTool(tool.name)?                       │  │
│  │    ├─ YES → ALLOW                                       │  │
│  │    └─ NO → continue                                    │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 6. MODE CHECK                                           │  │
│  │    mode = context.options.permissionMode                 │  │
│  │    ├─ 'dontAsk' → DENY (silent)                         │  │
│  │    ├─ 'acceptEdits' + FileWriteTool? → ALLOW            │  │
│  │    └─ 'default' → ASK (show prompt)                      │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 7. USER RESPONSE                                         │  │
│  │    Dialog shown → user selects:                          │  │
│  │    ├─ Allow once → ALLOW (session-scoped)               │  │
│  │    ├─ Allow session → ALLOW (session-scoped)            │  │
│  │    ├─ Allow always → ALLOW (persisted to localSettings) │  │
│  │    ├─ Deny → DENY                                       │  │
│  │    └─ Deny + remember → DENY (persisted)                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Permission Modes

| Mode | Behavior |
|------|----------|
| `default` | Prompt for approval |
| `plan` | Limited permissions (plan mode) |
| `acceptEdits` | Auto-accept file edits in working directory |
| `bypassPermissions` | Skip all checks (except dangerous-file immune) |
| `dontAsk` | Deny all prompts silently |
| `auto` (ANT) | AI classifier decides, with denial limits |

### Denial Limits (auto mode)

```
denialCount exceeded?
  ├─ maxConsecutive >= 3 → fallback to prompting
  └─ maxTotal >= 20 → fallback to prompting
       └─ In headless mode → AbortError
```

---

## 5. Session Resume State Machine

```
┌────────────────────────────────────────────────────────────────┐
│                    SESSION RESUME FLOW                         │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  --continue OR --resume {session-id}                            │
│                       │                                        │
│                       ▼                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ LOCATE SESSION                                            │  │
│  │ loadMessageLogs(sessionId) OR direct path                 │  │
│  │   → Session[] (all sessions for project)                  │  │
│  │   → Select by sessionId or most recent                   │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ DESERIALIZE                                              │  │
│  │ loadFullLog() → Message[]                                │  │
│  │   - Parse JSONL lines                                    │  │
│  │   - Migrate legacy attachment types                      │  │
│  │   - Filter unresolved tool uses + orphaned thinking       │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ INTERRUPTION DETECTION                                    │  │
│  │ lastMessage.type?                                         │  │
│  │   ├─ 'assistant' → completed turn, no interruption       │  │
│  │   ├─ 'user' + isMeta/isCompactSummary → no interruption  │  │
│  │   ├─ 'user' + tool_result (brief mode) → completed turn │  │
│  │   ├─ 'user' + tool_result (other) → interrupted_turn    │  │
│  │   ├─ 'user' (plain) → interrupted_prompt               │  │
│  │   └─ 'attachment' → interrupted_turn                    │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ RESTORATION STEPS                                         │  │
│  │ 1. If interrupted_turn/prompt:                            │  │
│  │    append "Continue from where you left off."             │  │
│  │ 2. Copy file history backups (hard-link)                   │  │
│  │ 3. Restore worktree state (process.chdir)                 │  │
│  │ 4. Reconstruct content replacement state                  │  │
│  │ 5. Restore attribution state from snapshots               │  │
│  │ 6. Extract todos from transcript                          │  │
│  │ 7. Commit context-collapse commit log                     │  │
│  │ 8. If interrupted: append sentinel assistant message       │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ RESUME COMPLETE                                          │  │
│  │   → queryLoop() continues with restored messages         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 6. Context Compaction State Machine

```
┌────────────────────────────────────────────────────────────────┐
│                    CONTEXT COMPACTION FLOW                       │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  AutoCompact Trigger (isAutoCompactEnabled + threshold reached) │
│                       │                                        │
│                       ▼                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ PRE-COMPACT                                               │  │
│  │ 1. microcompactMessages()                                 │  │
│  │    - Strip images/documents (→ [image]/[document])       │  │
│  │    - Group messages by API round trip                     │  │
│  │ 2. If CONTEXT_COLLAPSE enabled:                           │  │
│  │    - contextCollapse.stageCollapse()                      │  │
│  │    - stage collapses before next API call                │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ COMPACTION                                                │  │
│  │ compactConversation(messages, options)                    │  │
│  │   - Summarize old messages into compact form             │  │
│  │   - Replace tool result chains with summaries            │  │
│  │   - Preserve essential context (system, memory files)    │  │
│  │   - Truncate skills to 5000 tokens max                    │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ POST-COMPACT RESTORATION                                 │  │
│  │ postCompactCleanup()                                      │  │
│  │   - Restore up to 5 files                               │  │
│  │   - Budget: 50000 tokens total, 5000 per file            │  │
│  │   - Restore pinned cache edits                           │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ CIRCUIT BREAKER                                           │  │
│  │ consecutiveFailures >= 3?                                 │  │
│  │   ├─ YES → disable auto-compact, notify user            │  │
│  │   └─ NO → continue                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 7. Subagent Lifecycle State Machine

```
┌────────────────────────────────────────────────────────────────┐
│                    SUBAGENT LIFECYCLE                           │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  AgentTool.call(input, context)                                 │
│                       │                                         │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ CREATE WORKTREE (if worktree isolation enabled)           │  │
│  │ createAgentWorktree(slug)                                 │  │
│  │   ├─ Hook-based creation (if WorktreeCreate hook)        │  │
│  │   ├─ Git worktree fallback                               │  │
│  │   ├─ Sparse checkout (if configured)                     │  │
│  │   └─ Symlink shared dirs (node_modules, etc.)            │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ CREATE SUBAGENT CONTEXT                                  │  │
│  │ createSubagentContext(parent, overrides)                  │  │
│  │   - Clone readFileState (cache optimization)             │  │
│  │   - New abortController (linked to parent)               │  │
│  │   - shouldAvoidPermissionPrompts = true                  │  │
│  │   - Mutation callbacks → no-op                          │  │
│  │   - Fresh localDenialTracking                            │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ EXECUTE                                                   │  │
│  │ runAgent() generator                                      │  │
│  │   - Register SubagentStart hook                           │  │
│  │   - Run queryLoop in child context                       │  │
│  │   - Yield messages to parent                             │  │
│  │   - Register SubagentStop hook on completion             │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│              ┌──────────────────┴──────────────────┐           │
│              ▼                                      ▼           │
│  ┌─────────────────────┐               ┌────────────────────────┐│
│  │ COMPLETED            │               │ ABORTED/FAILED        ││
│  │ → extractResultText │               │ → cleanup worktree    ││
│  │ → yield completion  │               │ → yield error         ││
│  └─────────────────────┘               └────────────────────────┘│
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 8. File Edit State Machine

```
┌────────────────────────────────────────────────────────────────┐
│                    FILE EDIT FLOW                               │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FileEditTool.call({ file_path, old_string, new_string })       │
│                       │                                        │
│                       ▼                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. LOCATE FILE                                           │  │
│  │    resolve(file_path) → absolute path                    │  │
│  │    readFileState.get(absolutePath)?                      │  │
│  │    ├─ Has cached read → use cached content             │  │
│  │    └─ No cache → read file from disk                   │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 2. VALIDATE old_string                                    │  │
│  │    content.includes(old_string)?                         │  │
│  │    ├─ YES → continue                                     │  │
│  │    └─ NO → attempt quote normalization                  │  │
│  │            ├─ Curly quotes in file                      │  │
│  │            │   → preserveQuoteStyle()                   │  │
│  │            │   → retry with normalized new_string        │  │
│  │            └─ Still no match → error                     │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 3. APPLY EDIT                                             │  │
│  │    applyEditToFile(content, old_string, new_string)      │  │
│  │    ├─ replace_all = false → content.replace()           │  │
│  │    └─ replace_all = true → content.replaceAll()         │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 4. TOCTOU CHECK                                           │  │
│  │    stat(absolutePath).mtime > lastRead.timestamp?        │  │
│  │    ├─ YES → content matches lastRead.content?           │  │
│  │    │        ├─ YES → safe, proceed                      │  │
│  │    │        └─ NO → FILE_UNEXPECTEDLY_MODIFIED_ERROR    │  │
│  │    └─ NO → safe, proceed                               │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 5. WRITE FILE                                            │  │
│  │    writeFile(absolutePath, newContent)                   │  │
│  │    ├─ Create parent dirs if needed                       │  │
│  │    ├─ Atomic write (temp file + rename)                  │  │
│  │    └─ Update readFileState                               │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 6. GENERATE DIFF                                         │  │
│  │    getPatchFromContents(oldContent, newContent)          │  │
│  │    → structuredPatch() from diff library                │  │
│  │    → hunks with 3 context lines                         │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 7. YIELD RESULT                                          │  │
│  │    { filePath, oldString, newString, structuredPatch }   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 9. Bash Command Security State Machine

```
┌────────────────────────────────────────────────────────────────┐
│                    BASH SECURITY FLOW                           │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  BashTool.call({ command })                                     │
│                       │                                         │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. PARSE COMMAND                                          │  │
│  │    splitCommandWithOperators(command)                      │  │
│  │    → Array of { cmd, operator }                           │  │
│  │    ├─ Split by: &&, ||, |, ;, newline                     │  │
│  │    └─ Each subcommand checked separately                  │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│              ┌─────────────────┴─────────────────┐             │
│              ▼                                   ▼             │
│  ┌────────────────────────┐        ┌─────────────────────────┐ │
│  │ For each subcommand:   │        │ OPERATOR CHECK          │ │
│  │                        │        │ checkCommandOperatorPerm │ │
│  │ 2. INCOMPLETE CHECK   │        │ ├─ Read op → ALLOW       │ │
│  │    validateIncomplete  │        │ ├─ Write op → check    │ │
│  │    ├─ Starts with tab  │        │ └─ Dangerous → DENY    │ │
│  │    ├─ Starts with flag │        └─────────────────────────┘ │
│  │    └─ Fragment → DENY  │                                    │
│  │                        │                                    │
│  │ 3. PATTERN CHECKS     │                                    │
│  │    validateDangerous   │                                    │
│  │    Patterns:           │                                    │
│  │    ├─ COMMAND_SUBST    │                                    │
│  │    │   ($(), backticks)│                                    │
│  │    ├─ INPUT_REDIR      │                                    │
│  │    │   (< file)        │                                    │
│  │    ├─ OUTPUT_REDIR      │                                    │
│  │    │   (> file)        │                                    │
│  │    ├─ IFS_INJECTION    │                                    │
│  │    ├─ NEWLINES         │                                    │
│  │    └─ DANGEROUS_PATHS  │                                    │
│  │        (/proc, /dev)   │                                    │
│  │                        │                                    │
│  │ 4. ZSH SPECIFIC CHECK │                                    │
│  │    validateZshDangerous │                                    │
│  │    ├─ zmodload         │                                    │
│  │    ├─ emulate         │                                    │
│  │    ├─ sysopen          │                                    │
│  │    └─ zpty            │                                    │
│  │                        │                                    │
│  │ 5. PATH VALIDATION    │                                    │
│  │    isDangerousRemoval  │                                    │
│  │    Path(absolutePath)  │                                    │
│  │    ├─ /. /home, /etc   │                                    │
│  │    ├─ /.git (partial)  │                                    │
│  │    └─ /.vscode         │                                    │
│  └────────────────────────┘                                    │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 6. PERMISSION MATCH                                      │  │
│  │    bashToolHasPermission(context, parsedCommand)          │  │
│  │    ├─ Rule matches → return rule behavior                │  │
│  │    └─ No match → ASK                                     │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 7. RESULT                                                │  │
│  │    ├─ ALLOW → execute                                   │  │
│  │    ├─ DENY → log + return error                        │  │
│  │    └─ ASK → show permission dialog                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 10. Doorway Lane State Machine (Recommended)

```
┌────────────────────────────────────────────────────────────────┐
│                 DOORWAY LANE STATE MACHINE                      │
│              (Recommended for Doorway implementation)           │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│                     ┌─────────────────┐                        │
│                     │     IDLE        │                        │
│                     │  (lane created) │                        │
│                     └────────┬────────┘                        │
│                              │ start()                         │
│                              ▼                                 │
│                     ┌─────────────────┐                        │
│                     │   STARTING      │                        │
│                     │ - create worktree│                       │
│                     │ - spawn worker   │                       │
│                     │ - wait for init │                       │
│                     └────────┬────────┘                        │
│                              │ worker ready                   │
│                              ▼                                 │
│                     ┌─────────────────┐                        │
│            ┌───────│    RUNNING       │                       │
│            │       │  - process tasks │                       │
│            │       └────────┬────────┘                        │
│            │                │                                 │
│  ┌─────────┴────────┐      │ task received                   │
│  │   SUSPENDED     │      │                                 │
│  │ (parent paused) │      ▼                                 │
│  └─────────┬────────┘ ┌─────────────────┐                     │
│            │          │   TASK_QUEUE    │                      │
│            │          │ - queue task    │                      │
│            │          │ - notify worker│                      │
│            │          └─────────────────┘                      │
│            │                                               │    │
│  resume()  │                                               │    │
│            │                                               ▼    │
│            │              ┌─────────────────────────────────┐ │
│            │              │        TOOL_EXECUTION            │ │
│            │              │  - partition by concurrency      │ │
│            │              │  - check permissions            │ │
│            │              │  - execute with receipts        │ │
│            │              │  - emit ledger events           │ │
│            │              └──────────────┬──────────────────┘ │
│            │                             │                     │
│            │         ┌───────────────────┴───────────────┐   │
│            │         ▼                                   ▼   │
│            │  ┌──────────────┐              ┌──────────────┐│
│            │  │   SUCCESS    │              │    ERROR     ││
│            │  │ - emit result│              │ - emit error ││
│            │  │ - ledger     │              │ - ledger     ││
│            │  │ - continue   │              │ - retry?     ││
│            │  └──────┬───────┘              └──────┬───────┘│
│            │         │                              │        │
│            │         │◄── maxRetries exceeded ───────┘        │
│            │         │                                         │
│            │         ▼                                         │
│            │  ┌─────────────────────────────────────────────┐ │
│            │  │  FINAL: emit lane event                    │ │
│            │  │  { type: 'lane:stop', reason, summary }   │ │
│            │  └─────────────────────────────────────────────┘ │
│            │                                                 │
│            │  ┌─────────────────────────────────────────────┐ │
│            │  │  Lane lifecycle:                             │ │
│            │  │  idle → starting → running → stopping → stopped │
│            │  │  running → suspended → running               │ │
│            │  │  running → error → (retry) → running        │ │
│            │  │  running → task_queue → tool_execution      │ │
│            │  └─────────────────────────────────────────────┘ │
│            │                                                 │
│            └─────────────────┘                               │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Lane Events (Doorway)

| Event | Payload | Handler |
|-------|---------|---------|
| `lane:start` | `{ laneId, workerType }` | Orchestrator |
| `lane:stop` | `{ laneId, reason, summary }` | Orchestrator |
| `lane:error` | `{ laneId, error }` | Supervisor |
| `lane:tool_use` | `{ laneId, tool, input }` | EventLedger |
| `lane:tool_result` | `{ laneId, tool, result }` | EventLedger |
| `lane:permission_required` | `{ laneId, tool, input }` | PermissionReceipt |
| `lane:idle` | `{ laneId, idleMs }` | Supervisor |
| `lane:resumed` | `{ laneId }` | Orchestrator |

---

## 11. Signal Handling State Machine

```
┌────────────────────────────────────────────────────────────────┐
│                    SIGNAL HANDLING STATES                       │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SIGINT (Ctrl+C)                                                │
│       │                                                         │
│       ├── Interactive mode:                                     │
│       │   main.tsx:598 → process.exit(0)                       │
│       │                                                         │
│       └── Headless mode (-p):                                   │
│           cli/print.ts:1024                                     │
│               │                                                 │
│               ├─ abortController.abort('interrupt')            │
│               └─ gracefulShutdown(0)                           │
│                                                                 │
│  SIGTERM                                                        │
│       │                                                         │
│       └─ gracefulShutdownSync(143) → process.exit(143)         │
│                                                                 │
│  SIGHUP                                                         │
│       │                                                         │
│       └─ gracefulShutdownSync(129) → process.exit(129)         │
│                                                                 │
│  SIGCONT (after Ctrl+Z suspend)                                │
│       │                                                         │
│       └─ ink.tsx handleResize()                                 │
│           └─ restore terminal modes                             │
│           └─ render(currentNode)                                │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## 12. Hook Event State Machine

```
┌────────────────────────────────────────────────────────────────┐
│                    HOOK EXECUTION FLOW                          │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Event occurs (e.g., PreToolUse, PostToolUse, etc.)            │
│                       │                                         │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ FIND HOOKS                                                │  │
│  │ getHooksForEvent(event)                                   │  │
│  │   - Check sources in priority order:                     │  │
│  │     userSettings → projectSettings → localSettings →    │  │
│  │     sessionHook → pluginHook → builtinHook               │  │
│  └──────────────────────────────┬─────────────────────────────┘  │
│                                 │                                │
│                                 ▼                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ FOR EACH HOOK (in order):                                │  │
│  │                                                            │  │
│  │  ┌─────────────────┐  ┌─────────────────────────────────┐ │  │
│  │  │ Hook type?     │  │ Execute:                        │ │  │
│  │  │                 │  │                                 │ │  │
│  │  │ command         │→ │ spawn(command, shell)            │ │  │
│  │  │                 │  │ - capture stdout               │ │  │
│  │  │                 │  │ - return output                │ │  │
│  │  │ prompt          │→ │ callModel(prompt template)     │ │  │
│  │  │                 │  │ - return model response        │ │  │
│  │  │ agent           │→ │ runAgent(agent config)        │ │  │
│  │  │                 │  │ - multi-turn agent             │ │  │
│  │  │ http            │→ │ fetch(url, options)           │ │  │
│  │  │                 │  │ - return response              │ │  │
│  │  │ function        │→ │ invoke(callback)               │ │  │
│  │  │ (session only)  │  │ - in-memory execution          │ │  │
│  │  └─────────────────┘  └─────────────────────────────────┘ │  │
│  │         │                                                 │  │
│  │         └─────────────┬───────────────────────────────────┘  │
│  │                       │                                     │
│  │                       ▼                                     │
│  │  ┌──────────────────────────────────────────────────────┐  │
│  │  │ ERROR HANDLING                                       │  │
│  │  │ try/catch around hook body                           │  │
│  │  │   ├─ throw → log error, continue to next hook        │  │
│  │  │   ├─ outcome: 'blocking' → stop processing          │  │
│  │  │   └─ outcome: 'non_blocking_error' → log, continue  │  │
│  │  └──────────────────────────────────────────────────────┘  │
│  │                                                             │
│  │  ┌──────────────────────────────────────────────────────┐  │
│  │  │ ASYNC HOOKS                                          │  │
│  │  │ if (result.async) {                                  │  │
│  │  │   registerPendingAsyncHook(id, result.asyncTimeout)  │  │
│  │  │ }                                                    │  │
│  │  └──────────────────────────────────────────────────────┘  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Hook Outcome Types

| Outcome | Meaning | Behavior |
|---------|---------|----------|
| (none) | Success | Continue |
| `outcome: 'blocking'` | Error, stop chain | Stop processing, prevent action |
| `outcome: 'non_blocking_error'` | Warning, continue | Log, continue to next hook |
| `outcome: 'cancelled'` | Aborted/timeout | Stop processing |
