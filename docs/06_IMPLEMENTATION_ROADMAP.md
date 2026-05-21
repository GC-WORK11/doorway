# IMPLEMENTATION ROADMAP

## Phase-by-Phase Build Guide for Doorway

---

## OVERVIEW

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    DOORWAY IMPLEMENTATION ROADMAP                           │
│                                                                            │
│  Phase 1: Terminal Harness      Weeks 1-4                                 │
│  Phase 2: Memory & Learning     Weeks 5-8                                 │
│  Phase 3: Evidence & Orchestration Weeks 9-12                            │
│  Phase 4: Enterprise            Weeks 13-16                                │
│  Phase 5: Evolution            Weeks 17-20                                │
│                                                                            │
│  Total: 20 weeks to full implementation                                   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## PHASE 1: TERMINAL HARNESS (Weeks 1-4)

### Goal

Build the layered terminal harness. PTY (node-pty) is the execution mechanism — NOT the intelligence. Layer process tree capture, exit code taxonomy, file delta tracking, and evidence persistence on top of PTY. See docs/07_STATE_OF_THE_ART_TERMINAL_CAPTURE_ANALYSIS.md for why PTY alone is 1990s tech.

### Key Insight

From research: ForgeCode (81.8% on Terminal-Bench 2.0) and AHE (69.7%→77.0% via harness evolution) prove that **harness architecture outperforms model upgrades**. Doorway must build a layered harness, not just a better PTY wrapper.

> ⚠️ **PTY is 1990s tech.** node-pty is fine for shell spawning. The breakthrough is the LAYERED OBSERVABILITY HARNESS on top: process tree, exit taxonomy, file delta, evidence, verification.

### Week 1: Wire xterm.js to PTY

```
┌────────────────────────────────────────────────────────────────────────────┐
│  WEEK 1: Connect Frontend to PTY Backend                                   │
└────────────────────────────────────────────────────────────────────────────┘

TASKS:
─────────────────────────────────────────────────────────────────────────────
□ Modify TerminalMuxPanel.tsx to connect to PTY backend
□ Set up WebSocket connection between renderer and main process
□ Implement PTY output streaming (real-time, not mock)
□ Handle ANSI escape codes for proper terminal rendering
□ Add resize handling for PTY

FILES TO MODIFY:
─────────────────────────────────────────────────────────────────────────────
apps/desktop/src/renderer/TerminalMuxPanel.tsx
apps/desktop/src/main/handlers/pty-handler.ts
apps/desktop/src/main/ipc/pty-websocket.ts

SUCCESS CRITERIA:
─────────────────────────────────────────────────────────────────────────────
✓ Terminal shows live output from actual PTY
✓ User can type commands in terminal
✓ Output is rendered with ANSI colors
✓ Terminal is resize-responsive
```

### Week 2: Process Tree Tracking

```
┌────────────────────────────────────────────────────────────────────────────┐
│  WEEK 2: Child Process Tree Tracking                                       │
└────────────────────────────────────────────────────────────────────────────┘

TASKS:
─────────────────────────────────────────────────────────────────────────────
□ Implement process tree capture (Linux: ps --forest, macOS: process info)
□ Track parent/child relationships for each PTY session
□ Monitor process start/exit events
□ Display process tree in UI (ProcessTreePanel.tsx)
□ Track resource usage (CPU, memory) per process

FILES TO CREATE:
─────────────────────────────────────────────────────────────────────────────
packages/terminal-runtime/src/process-tracker.ts
packages/terminal-runtime/src/linux-process.ts
packages/terminal-runtime/src/darwin-process.ts

FILES TO MODIFY:
─────────────────────────────────────────────────────────────────────────────
apps/desktop/src/renderer/ProcessTreePanel.tsx
apps/desktop/src/main/ipc/process-ipc.ts

SUCCESS CRITERIA:
─────────────────────────────────────────────────────────────────────────────
✓ User can see all child processes spawned by a command
✓ Process tree updates in real-time
✓ Each process shows CPU/memory usage
✓ Process exit is captured with exit code
```

### Week 3: Exit Code Taxonomy

```
┌────────────────────────────────────────────────────────────────────────────┐
│  WEEK 3: Exit Code Taxonomy & Semantic Parser                              │
└────────────────────────────────────────────────────────────────────────────┘

TASKS:
─────────────────────────────────────────────────────────────────────────────
□ Implement exit code classification system
□ Add signal handling (SIGSEGV, SIGKILL, SIGABRT, etc.)
□ Create semantic output parser (error patterns, warnings)
□ Build user-friendly error explanations
□ Add "suggestion" system based on exit codes

FILES TO CREATE:
─────────────────────────────────────────────────────────────────────────────
packages/terminal-runtime/src/exit-taxonomy.ts
packages/terminal-runtime/src/output-parser.ts
packages/terminal-runtime/src/auto-retry-detector.ts

FILES TO MODIFY:
─────────────────────────────────────────────────────────────────────────────
apps/desktop/src/renderer/TerminalMuxPanel.tsx (add exit code display)
apps/desktop/src/renderer/ProcessTreePanel.tsx (add signal info)

SUCCESS CRITERIA:
─────────────────────────────────────────────────────────────────────────────
✓ Exit codes are classified (success, error, signal, usage)
✓ SIGSEGV shows "Segmentation fault - likely memory corruption"
✓ SIGKILL shows "Process killed - likely OOM or timeout"
✓ Exit 127 shows "Command not found - check PATH"
✓ Semantic parser extracts errors/warnings from output
✓ Auto-retry detector identifies hidden retries
```

### Week 4: File Delta Tracking

```
┌────────────────────────────────────────────────────────────────────────────┐
│  WEEK 4: File Delta Tracking                                               │
└────────────────────────────────────────────────────────────────────────────┘

TASKS:
─────────────────────────────────────────────────────────────────────────────
□ Implement file watcher (inotify Linux, FSEvents macOS)
□ Track CREATE, MODIFY, DELETE, RENAME events
□ Show file changes in UI (FileDeltaPanel.tsx)
□ Integrate with git diff for change visualization
□ Add ignore patterns (.gitignore support)

FILES TO CREATE:
─────────────────────────────────────────────────────────────────────────────
packages/terminal-runtime/src/file-watcher.ts
packages/terminal-runtime/src/inotify-watcher.ts (Linux)
packages/terminal-runtime/src/fsevents-watcher.ts (macOS)
packages/terminal-runtime/src/git-diff-service.ts

FILES TO MODIFY:
─────────────────────────────────────────────────────────────────────────────
apps/desktop/src/renderer/FileDeltaPanel.tsx
apps/desktop/src/main/ipc/file-watcher-ipc.ts

SUCCESS CRITERIA:
─────────────────────────────────────────────────────────────────────────────
✓ User can see all files changed during execution
✓ File changes are categorized (created, modified, deleted)
✓ Git diff is shown for modified files
✓ Files are filtered by .gitignore patterns
```

### Phase 1 Deliverables

```
┌────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1 DELIVERABLES (End of Week 4)                                     │
└────────────────────────────────────────────────────────────────────────────┘

✓ Terminal connected to live PTY (real output, not mock)
✓ Process tree visible (all child processes)
✓ Exit code taxonomy (user-friendly explanations)
✓ File delta tracking (what files changed)
✓ Semantic output parser (errors, warnings, retries)
✓ Basic UI panels (Terminal, Process Tree, File Delta)
```

---

## PHASE 2: MEMORY & LEARNING (Weeks 5-8)

### Goal

Build persistent memory, pattern learning, and model routing.

### Week 5-6: Memory System

```
┌────────────────────────────────────────────────────────────────────────────┐
│  WEEKS 5-6: Persistent Memory System                                      │
└────────────────────────────────────────────────────────────────────────────┘

TASKS:
─────────────────────────────────────────────────────────────────────────────
□ Design memory data model (project, session, pattern, cross-project)
□ Implement SQLite storage for memory
□ Build project context detection (tech stack, conventions)
□ Store session history (files, errors, decisions, commands)
□ Build memory retrieval system

FILES TO CREATE:
─────────────────────────────────────────────────────────────────────────────
packages/orchestrator/src/memory/memory-store.ts
packages/orchestrator/src/memory/project-memory.ts
packages/orchestrator/src/memory/session-memory.ts
packages/orchestrator/src/memory/pattern-memory.ts
packages/orchestrator/src/memory/memory-retrieval.ts

FILES TO MODIFY:
─────────────────────────────────────────────────────────────────────────────
packages/orchestrator/src/memory.ts (refactor to new structure)
apps/desktop/src/renderer/MemoryView.tsx

SUCCESS CRITERIA:
─────────────────────────────────────────────────────────────────────────────
✓ Project context is detected and stored
✓ Session history persists across restarts
✓ User can see "what Doorway remembers" in UI
✓ Memory is organized (project, session, pattern)
```

### Week 7: Pattern Learning

```
┌────────────────────────────────────────────────────────────────────────────┐
│  WEEK 7: Pattern Learning Algorithm                                        │
└────────────────────────────────────────────────────────────────────────────┘

TASKS:
─────────────────────────────────────────────────────────────────────────────
□ Implement pattern observation system
□ Track success/failure for each task/approach
□ Calculate confidence scores
□ Build recommendation engine
□ Integrate pattern learning into orchestrator

FILES TO CREATE:
─────────────────────────────────────────────────────────────────────────────
packages/orchestrator/src/learning/pattern-observer.ts
packages/orchestrator/src/learning/confidence-calculator.ts
packages/orchestrator/src/learning/recommendation-engine.ts

FILES TO MODIFY:
─────────────────────────────────────────────────────────────────────────────
packages/orchestrator/src/brain.ts (add learning)
apps/desktop/src/renderer/MemoryView.tsx (show patterns)

SUCCESS CRITERIA:
─────────────────────────────────────────────────────────────────────────────
✓ Patterns are observed and stored
✓ Confidence scores reflect actual success rates
✓ Doorway learns from successes and failures
✓ Recommendations are based on learned patterns
```

### Week 8: Model Routing

```
┌────────────────────────────────────────────────────────────────────────────┐
│  WEEK 8: Cross-Model Routing                                               │
└────────────────────────────────────────────────────────────────────────────┘

TASKS:
─────────────────────────────────────────────────────────────────────────────
□ Implement task classifier
□ Build model selection algorithm
□ Integrate learned patterns into routing
□ Implement Claude Code adapter (full)
□ Implement Codex CLI adapter (full)
□ Implement Cursor adapter

FILES TO CREATE:
─────────────────────────────────────────────────────────────────────────────
packages/orchestrator/src/routing/task-classifier.ts
packages/orchestrator/src/routing/model-selector.ts
packages/orchestrator/src/routing/router.ts
packages/adapters/src/claude-code-adapter.ts (enhance)
packages/adapters/src/codex-cli-adapter.ts (enhance)
packages/adapters/src/cursor-adapter.ts (new)

FILES TO MODIFY:
─────────────────────────────────────────────────────────────────────────────
packages/orchestrator/src/brain.ts (add routing)

SUCCESS CRITERIA:
─────────────────────────────────────────────────────────────────────────────
✓ Tasks are classified automatically
✓ Best model is selected for each task
✓ Learned patterns influence model selection
✓ Claude Code, Codex CLI, and Cursor adapters work
```

### Phase 2 Deliverables

```
┌────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2 DELIVERABLES (End of Week 8)                                     │
└────────────────────────────────────────────────────────────────────────────┘

✓ Persistent memory (project, session, pattern)
✓ Pattern learning (success/failure tracking)
✓ Model routing (best model for each task)
✓ Cross-model adapters (Claude, Codex, Cursor)
✓ Memory UI (see what Doorway remembers)
```

---

## PHASE 3: EVIDENCE & ORCHESTRATION (Weeks 9-12)

### Goal

Add evidence recording, session replay, and full orchestration.

### Week 9: Evidence Recording

```
┌────────────────────────────────────────────────────────────────────────────┐
│  WEEK 9: Evidence & Screenshot Capture                                     │
└────────────────────────────────────────────────────────────────────────────┘

TASKS:
─────────────────────────────────────────────────────────────────────────────
□ Integrate Playwright for browser automation
□ Implement screenshot capture at key moments
□ Build evidence storage (screenshots, diffs, timeline)
□ Create EvidencePanel.tsx
□ Implement browser proof (verify visual changes)

FILES TO CREATE:
─────────────────────────────────────────────────────────────────────────────
packages/evidence/src/screenshot-capture.ts
packages/evidence/src/browser-automation.ts
packages/evidence/src/evidence-store.ts
packages/evidence/src/index.ts

FILES TO MODIFY:
─────────────────────────────────────────────────────────────────────────────
apps/desktop/src/renderer/EvidencePanel.tsx
apps/desktop/src/main/ipc/evidence-ipc.ts

SUCCESS CRITERIA:
─────────────────────────────────────────────────────────────────────────────
✓ Screenshots captured at key moments
✓ Browser automation works (open page, take screenshot)
✓ Evidence stored and viewable in UI
✓ Visual diff comparison available
```

### Week 10: Session Replay

```
┌────────────────────────────────────────────────────────────────────────────┐
│  WEEK 10: Session Replay & Timeline                                        │
└────────────────────────────────────────────────────────────────────────────┘

TASKS:
─────────────────────────────────────────────────────────────────────────────
□ Build event timeline storage
□ Implement timeline scrubbing (jump to moment)
□ Create replay UI (ThreadCanvas.tsx enhancement)
□ Add event markers (errors, warnings, changes)
□ Implement pause/resume/seek controls

FILES TO CREATE:
─────────────────────────────────────────────────────────────────────────────
packages/core/src/event-timeline.ts
packages/core/src/timeline-storage.ts

FILES TO MODIFY:
─────────────────────────────────────────────────────────────────────────────
apps/desktop/src/renderer/ThreadCanvas.tsx (add timeline)
apps/desktop/src/renderer/hooks.ts (add timeline hooks)

SUCCESS CRITERIA:
─────────────────────────────────────────────────────────────────────────────
✓ Full event timeline is recorded
✓ User can scrub through timeline
✓ Jump to any moment in session
✓ Events are marked (errors, file changes, etc.)
```

### Week 11: Cross-Model Threads

```
┌────────────────────────────────────────────────────────────────────────────┐
│  WEEK 11: Cross-Model Thread Orchestration                                │
└────────────────────────────────────────────────────────────────────────────┘

TASKS:
─────────────────────────────────────────────────────────────────────────────
□ Implement parallel thread execution
□ Build thread coordination (sequential, parallel, fan-out)
□ Create unified thread view (all models in one)
□ Implement thread communication (mailbox)
□ Add thread state management (running, paused, done, error)

FILES TO CREATE:
─────────────────────────────────────────────────────────────────────────────
packages/orchestrator/src/threads/thread-manager.ts
packages/orchestrator/src/threads/thread-coordinator.ts
packages/orchestrator/src/threads/thread-state.ts
packages/orchestrator/src/threads/mailbox.ts

FILES TO MODIFY:
─────────────────────────────────────────────────────────────────────────────
apps/desktop/src/renderer/ThreadCanvas.tsx (parallel threads)

SUCCESS CRITERIA:
─────────────────────────────────────────────────────────────────────────────
✓ Multiple threads can run in parallel
✓ Each thread uses its own model
✓ All threads visible in unified view
✓ Threads can coordinate (sequential, parallel)
✓ Thread state is tracked (running, paused, done, error)
```

### Week 12: Full Integration

```
┌────────────────────────────────────────────────────────────────────────────┐
│  WEEK 12: Full System Integration                                         │
└────────────────────────────────────────────────────────────────────────────┘

TASKS:
─────────────────────────────────────────────────────────────────────────────
□ Integrate all Phase 1-3 components
□ End-to-end testing
□ Performance optimization
□ Bug fixes
□ Documentation

SUCCESS CRITERIA:
─────────────────────────────────────────────────────────────────────────────
✓ All components work together
✓ Full end-to-end flow works
✓ Performance is acceptable
✓ No critical bugs
```

### Phase 3 Deliverables

```
┌────────────────────────────────────────────────────────────────────────────┐
│  PHASE 3 DELIVERABLES (End of Week 12)                                    │
└────────────────────────────────────────────────────────────────────────────┘

✓ Evidence recording (screenshots, browser proof)
✓ Session replay (timeline, scrubbing, jump to moment)
✓ Cross-model threads (parallel execution, unified view)
✓ Full integration of all components
```

---

## PHASE 4: ENTERPRISE (Weeks 13-16)

### Goal

Add enterprise features: audit trail, RBAC, compliance.

### Week 13-14: Audit Trail

```
┌────────────────────────────────────────────────────────────────────────────┐
│  WEEKS 13-14: Full Audit Trail                                            │
└────────────────────────────────────────────────────────────────────────────┘

TASKS:
─────────────────────────────────────────────────────────────────────────────
□ Implement comprehensive event logging
□ Build audit trail UI (who did what when)
□ Create audit export (JSON, CSV, PDF)
□ Add audit search and filtering
□ Implement audit retention policies

FILES TO CREATE:
─────────────────────────────────────────────────────────────────────────────
packages/enterprise/src/audit/audit-logger.ts
packages/enterprise/src/audit/audit-storage.ts
packages/enterprise/src/audit/audit-exporter.ts
packages/enterprise/src/audit/audit-search.ts

FILES TO MODIFY:
─────────────────────────────────────────────────────────────────────────────
apps/desktop/src/renderer/AuditPanel.tsx

SUCCESS CRITERIA:
─────────────────────────────────────────────────────────────────────────────
✓ Every action is logged with user, timestamp, details
✓ User can search/filter audit logs
✓ Audit logs can be exported (JSON, CSV, PDF)
✓ Audit retention policies configurable
```

### Week 15: RBAC & Permissions

```
┌────────────────────────────────────────────────────────────────────────────┐
│  WEEK 15: RBAC & Permissions                                               │
└────────────────────────────────────────────────────────────────────────────┘

TASKS:
─────────────────────────────────────────────────────────────────────────────
□ Implement role-based access control
□ Define roles (admin, developer, viewer, etc.)
□ Build permission system
□ Add API key management
□ Implement SSO integration (optional)

FILES TO CREATE:
─────────────────────────────────────────────────────────────────────────────
packages/enterprise/src/auth/rbac.ts
packages/enterprise/src/auth/permissions.ts
packages/enterprise/src/auth/api-keys.ts
packages/enterprise/src/auth/sso.ts

FILES TO MODIFY:
─────────────────────────────────────────────────────────────────────────────
packages/core/src/auth-service.ts

SUCCESS CRITERIA:
─────────────────────────────────────────────────────────────────────────────
✓ Roles are defined (admin, developer, viewer)
✓ Permissions are enforced (API, UI)
✓ API keys can be created/managed
✓ SSO works (if implemented)
```

### Week 16: Compliance

```
┌────────────────────────────────────────────────────────────────────────────┐
│  WEEK 16: EU AI Act & SOC2 Compliance                                     │
└────────────────────────────────────────────────────────────────────────────┘

TASKS:
─────────────────────────────────────────────────────────────────────────────
□ Implement EU AI Act requirements
□ Add transparency reports
□ Build human oversight logs
□ Implement BYOK for API keys
□ Add compliance documentation

FILES TO CREATE:
─────────────────────────────────────────────────────────────────────────────
packages/enterprise/src/compliance/eu-ai-act.ts
packages/enterprise/src/compliance/transparency.ts
packages/enterprise/src/compliance/human-oversight.ts
packages/enterprise/src/compliance/byok.ts

FILES TO MODIFY:
─────────────────────────────────────────────────────────────────────────────
packages/enterprise/src/compliance/index.ts

SUCCESS CRITERIA:
─────────────────────────────────────────────────────────────────────────────
✓ EU AI Act requirements met
✓ Transparency reports available
✓ Human oversight logs present
✓ BYOK works for API keys
✓ Compliance docs exported
```

### Phase 4 Deliverables

```
┌────────────────────────────────────────────────────────────────────────────┐
│  PHASE 4 DELIVERABLES (End of Week 16)                                    │
└────────────────────────────────────────────────────────────────────────────┘

✓ Full audit trail (searchable, exportable)
✓ RBAC (roles, permissions)
✓ API key management
✓ EU AI Act compliance
✓ BYOK support
```

---

## PHASE 5: EVOLUTION (Weeks 17-20)

### Goal

Build self-evolving harness that learns and improves.

### Week 17-18: Self-Evolution Engine

```
┌────────────────────────────────────────────────────────────────────────────┐
│  WEEKS 17-18: Self-Evolving Harness                                        │
└────────────────────────────────────────────────────────────────────────────┘

TASKS:
─────────────────────────────────────────────────────────────────────────────
□ Implement workflow optimization proposals
□ Build auto-tuning system (learn from successes)
□ Add safe apply (test in worktree before committing)
□ Implement failure analysis (why did it fail?)
□ Build improvement recommendation engine

FILES TO CREATE:
─────────────────────────────────────────────────────────────────────────────
packages/orchestrator/src/evolution/optimization-proposer.ts
packages/orchestrator/src/evolution/auto-tuner.ts
packages/orchestrator/src/evolution/safe-applier.ts
packages/orchestrator/src/evolution/failure-analyzer.ts

FILES TO MODIFY:
─────────────────────────────────────────────────────────────────────────────
apps/desktop/src/renderer/EvolutionView.tsx

SUCCESS CRITERIA:
─────────────────────────────────────────────────────────────────────────────
✓ Doorway proposes workflow improvements
✓ Auto-tuning adjusts parameters based on success
✓ Safe apply tests changes before committing
✓ Failure analysis explains why failures happened
```

### Week 19-20: Polish & Launch

```
┌────────────────────────────────────────────────────────────────────────────┐
│  WEEKS 19-20: Polish & Launch                                             │
└────────────────────────────────────────────────────────────────────────────┘

TASKS:
─────────────────────────────────────────────────────────────────────────────
□ Performance optimization
□ UX polish
□ Documentation
□ Beta testing
□ Launch preparation

SUCCESS CRITERIA:
─────────────────────────────────────────────────────────────────────────────
✓ Performance is optimized
✓ UX is polished
✓ Docs are complete
✓ Beta users are happy
✓ Launch is ready
```

### Phase 5 Deliverables

```
┌────────────────────────────────────────────────────────────────────────────┐
│  PHASE 5 DELIVERABLES (End of Week 20)                                    │
└────────────────────────────────────────────────────────────────────────────┘

✓ Self-evolving harness
✓ Workflow optimization proposals
✓ Auto-tuning based on success
✓ Safe apply with testing
✓ Failure analysis
✓ Launch-ready product
```

---

## THE COMPLETE ROADMAP

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    DOORWAY 20-WEEK ROADMAP                                 │
└────────────────────────────────────────────────────────────────────────────┘

WEEK  │ PHASE              │ DELIVERABLES
──────┼────────────────────┼────────────────────────────────────────────────
1     │ Terminal Harness   │ Wire xterm.js to PTY
2     │ Terminal Harness   │ Process tree tracking
3     │ Terminal Harness   │ Exit code taxonomy + semantic parser
4     │ Terminal Harness   │ File delta tracking
──────┼────────────────────┼────────────────────────────────────────────────
5-6   │ Memory & Learning  │ Persistent memory system
7     │ Memory & Learning  │ Pattern learning algorithm
8     │ Memory & Learning  │ Model routing + adapters
──────┼────────────────────┼────────────────────────────────────────────────
9     │ Evidence & Orch.   │ Evidence recording + screenshots
10    │ Evidence & Orch.   │ Session replay + timeline
11    │ Evidence & Orch.   │ Cross-model threads
12    │ Evidence & Orch.   │ Full integration
──────┼────────────────────┼────────────────────────────────────────────────
13-14 │ Enterprise         │ Full audit trail
15    │ Enterprise         │ RBAC + permissions
16    │ Enterprise         │ EU AI Act compliance + BYOK
──────┼────────────────────┼────────────────────────────────────────────────
17-18 │ Evolution          │ Self-evolving harness
19-20 │ Evolution          │ Polish & launch

TOTAL: 20 weeks to full implementation
```

---

## THE BOTTOM LINE

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   PHASE 1 (Weeks 1-4): THE FOUNDATION                                      ║
║   Wire terminal to frontend, add process tree, exit codes, file tracking.   ║
║   This makes Doorway USABLE.                                               ║
║                                                                              ║
║   PHASE 2 (Weeks 5-8): THE INTELLIGENCE                                    ║
║   Add memory, pattern learning, model routing.                               ║
║   This makes Doorway SMART.                                                ║
║                                                                              ║
║   PHASE 3 (Weeks 9-12): THE DIFFERENTIATOR                                 ║
║   Evidence, replay, cross-model threads.                                    ║
║   This makes Doorway UNIQUE.                                               ║
║                                                                              ║
║   PHASE 4 (Weeks 13-16): THE ENTERPRISE                                    ║
║   Audit, RBAC, compliance.                                                  ║
║   This makes Doorway ENTERPRISE-READY.                                     ║
║                                                                              ║
║   PHASE 5 (Weeks 17-20): THE EVOLUTION                                     ║
║   Self-evolving harness.                                                    ║
║   This makes Doorway AUTO-IMPROVING.                                       ║
║                                                                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```
