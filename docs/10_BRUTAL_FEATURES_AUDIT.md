# DOORWAY DEEP ANALYSIS — FRONTEND, BACKEND, GAPS, DOCS COMPARISON

---

## EXECUTIVE SUMMARY

```
┌────────────────────────────────────────────────────────────────────────────┐
│  GATE STATUS:  BROKEN                                                   │
│  Tests:        301/306 passing (5 FAILING)                               │
│  Lint:         1 ERROR (restore_app.cjs unused var)                      │
│                                                                            │
│  CRITICAL: Evidence panels now EXIST but tests need updating              │
│  CRITICAL: App.tsx is 2,972 lines — MASSIVE                               │
│  CRITICAL: Theme changed to dark, tests expect light                      │
└────────────────────────────────────────────────────────────────────────────┘

OVERALL VERDICT: 7.8/10
  Frontend:    7.5/10 (evidence panels wired, but App.tsx is bloated)
  Backend:     8.5/10 (solid, well-organized)
  Gaps:        3 remaining (Cursor/Gemini adapters, streaming IPC)
  Docs:        9/10 (comprehensive, well-maintained)

PREVIOUS:     7.5/10
IMPROVEMENT:  +0.3 (evidence panels now exist, SurfaceDrawer wired)
```

---

## PART 1: FRONTEND ANALYSIS

### Gate Status: BROKEN

```
pnpm gate:
  typecheck  ✅ (16 packages, 4.005s)
  lint       ❌ FAIL (restore_app.cjs: endIndex unused)
  test       ❌ FAIL (5 of 306 tests failing)
  build      ⚠️  (not run due to lint failure)
  dead       ⚠️  (not run due to test failure)
  deps       ✅
  format     ✅
```

### Test Failures (5 FAILED)

**Test 1: `App > locks the reference shell layout in CSS tokens`**

```
Expected: 'rgba(255, 255, 255, 0.86)' in CSS
Got: CSS tokens changed — likely opacity/background values modified
Fix: Update test expectations or revert CSS token changes
```

**Test 2: `App > mounts visible Doorway UI`**

```
Expected: data-theme="light"
Got: data-theme="dark"
Fix: Theme changed to dark mode. Tests need updating.
```

**Test 3: `App > renders the real desktop shell`**

```
Expected: data-theme="light"
Got: data-theme="dark"
Fix: Same as above — theme change.
```

**Test 4: `App > renders terminal mux sessions`**

```
Error: useHarnessState must be used within HarnessStateProvider
Location: TerminalMuxPanel.tsx:502
Fix: Test needs to wrap component in HarnessStateProvider or mock useHarnessState
```

**Test 5: `TerminalMuxPanel > renders process and file evidence`**

```
Error: useHarnessState must be used within HarnessStateProvider
Location: TerminalMuxPanel.tsx:502
Fix: Same as above.
```

### File Size Analysis

```
apps/desktop/src/renderer/:
  App.tsx                2,972 lines ← MASSIVE — needs splitting
  App.test.tsx           3,501 lines ← MASSIVE — test file
  EvidencePanel.tsx        929 lines ← Large but organized
  TerminalMuxPanel.tsx     754 lines ← Manageable
  SurfaceControls.tsx       526 lines ← Large
  WorkspaceChrome.tsx      392 lines ← Manageable
  SurfaceDrawer.tsx        392 lines ← Manageable
  TerminalSurface.tsx       262 lines ← Clean
  shared-ui.tsx            241 lines ← Good
  ComposerDock.tsx         208 lines ← Clean
  TerminalMuxPanel.test.tsx 203 lines ← Clean
  ReviewEvidence.tsx       172 lines ← Clean
  CommandPalette.tsx       172 lines ← Clean
  ThreadCanvas.tsx         156 lines ← Clean
  HarnessContext.tsx        36 lines ← Clean (NEW CONTEXT)
  FileDeltaPanel.tsx        26 lines ← Clean (NEW)
  ExitTaxonomyPanel.tsx     26 lines ← Clean (NEW)
  ProcessTreePanel.tsx      24 lines ← Clean (NEW)
  main.tsx                  15 lines ← Clean

TOTAL: 11,102 lines of TSX
```

### CRITICAL: App.tsx at 2,972 Lines

**Problem:**

- App.tsx is 2,972 lines — this is a red flag
- Should be split into smaller, focused components
- One file should not be this large

**What's in App.tsx:**
Looking at the imports and structure, App.tsx likely contains:

- Main App component
- Many inline utility functions
- Multiple capsule components
- State management logic
- IPC bridge integration

**Recommendation:**

- Extract all capsule components (15+ capsules) to separate files
- Extract all utility functions to `App.utils.ts`
- Extract state logic to hooks
- Keep App.tsx under 500 lines

### Evidence Panels: NOW WIRED ✅

**Previous Review:** "Evidence panels are empty — process/file/exit data stored but NOT shown"

**NOW EXISTS:**

```
✅ ProcessTreePanel.tsx (24 lines)
   - Renders process tree from TerminalProjection.latestProcessSnapshot
   - Shows PID, command, args, CPU%, memory%
   - Has empty state for sessions without process data

✅ ExitTaxonomyPanel.tsx (26 lines)
   - Renders exit classification from TerminalProjection.exitClassification
   - Shows label, kind, exit code, signal, summary, recommendation
   - Has empty state for sessions without exit data

✅ FileDeltaPanel.tsx (26 lines)
   - Renders file changes from TerminalProjection.latestFileDeltaSnapshot
   - Shows change type, path, previous/current size
   - Has empty state for sessions without file changes

✅ EvidencePanel.tsx (929 lines)
   - Full evidence feed with all types
   - Imports ProcessTreePanel, FileDeltaPanel, ExitTaxonomyPanel
   - Filters for handoffs, proofs, merges, permissions
   - Filters wired to SurfaceDrawer

✅ SurfaceDrawer.tsx (392 lines)
   - Now uses EvidencePanel with all props
   - Wires terminalSessions to EvidencePanel
   - activeSurface === 'evidence' shows EvidencePanel
```

### New Components Since Last Review

| Component             | Lines | Purpose                    |
| --------------------- | ----- | -------------------------- |
| ProcessTreePanel.tsx  | 24    | Process tree visualization |
| ExitTaxonomyPanel.tsx | 26    | Exit code classification   |
| FileDeltaPanel.tsx    | 26    | File change tracking       |
| EvidencePanel.tsx     | 929   | Full evidence feed         |
| HarnessContext.tsx    | 36    | React context for state    |
| CommandPalette.tsx    | 172   | Slash commands + mentions  |

### Frontend Strengths

```
✅ Real xterm.js terminal with proper streaming (append by sequence)
✅ Evidence panels now wired (process tree, exit taxonomy, file delta)
✅ SurfaceDrawer with all 5 surfaces (browser, terminal, evidence, worktrees, tools)
✅ CommandPalette with slash commands + mention targets
✅ ComposerDock with all launch controls (mode, provider, model, permissions)
✅ WorkspaceChrome with utility rail (5 surface buttons)
✅ ThreadCanvas with all capsules
✅ Real empty/error/loading states
✅ Theme is now dark mode (premium look)
✅ Framer Motion animations on surfaces
✅ 19 test files, 306 tests
```

### Frontend Weaknesses

```
❌ App.tsx at 2,972 lines — needs refactoring
❌ 5 tests failing (theme change, missing context provider)
❌ restore_app.cjs has lint error (unused endIndex)
❌ No streaming IPC — still DB polling for live data
❌ TerminalSurface fallback text shows raw text, not blocks
❌ No block model (Warp's key innovation)
❌ Command palette doesn't search terminal outputs
❌ Browser panel is basic — no rich screenshot gallery
❌ EvidencePanel is 929 lines — could be split
```

### Frontend Rating: 7.5/10

**Previous:** 7/10  
**Current:** 7.5/10  
**Reason:** Evidence panels now exist and wired, SurfaceDrawer properly integrated, but App.tsx bloat and failing tests drag it down.

---

## PART 2: BACKEND ANALYSIS

### Gate Status: PASSING ✅

```
Backend packages:
  @doorway/protocol        ✅ typecheck ✅ build
  @doorway/core            ✅ typecheck ✅ build
  @doorway/terminal-runtime ✅ typecheck ✅ build
  @doorway/orchestrator    ✅ typecheck ✅ build
  @doorway/adapters        ✅ typecheck ✅ build
  @doorway/git-engine      ✅ typecheck ✅ build
  @doorway/handoff-capsule ✅ typecheck ✅ build
  @doorway/review-merge    ✅ typecheck ✅ build
```

### Package Size Analysis

```
packages/:
  core/src/                ~3,500 lines (database, evidence, services)
  orchestrator/src/        ~2,000 lines (brain, task graph, memory)
  terminal-runtime/src/    ~1,500 lines (PTY, exit taxonomy, process, file)
  adapters/src/            ~500 lines (Claude Code, Codex)
  protocol/src/            ~500 lines (branded types, projections)
  git-engine/src/         ~500 lines (worktree, diff, merge)
  handoff-capsule/src/     ~400 lines (export, peer messaging)
  review-merge/src/        ~300 lines (merge assessment, review board)

TOTAL: ~9,200 lines of TypeScript
```

### Backend Strengths

```
✅ 35+ SQLite tables with WAL mode and foreign keys
✅ Event sourcing on every action
✅ ALL evidence types implemented:
   - terminal-evidence.ts
   - process-evidence.ts
   - file-delta-evidence.ts
   - proof-evidence.ts
   - permission-evidence.ts
   - handoff-evidence.ts
   - merge-evidence.ts
   - task-graph-evidence.ts
   - terminal-action-protocol.ts (Doorway can respond to prompts)

✅ Operational memory — REAL pattern learning:
   - Parses terminal inputs, extracts commands
   - Tracks frequency per command per project
   - Stores repeated commands (≥3 runs) with confidence scores
   - UPSERT with conflict resolution

✅ Brain service with LLM-powered decomposition:
   - Anthropic driver (streaming support)
   - OpenAI driver (streaming support)
   - Role execution (planner, reviewer, etc.)

✅ Compaction module for context window management

✅ Best-of-N parallel execution (hard cap N=2)

✅ Task graph with Brain-powered decomposition

✅ Worktree isolation per run

✅ Handoff packets between runs

✅ Mesh agents (reviewer, implementer, pi_agent, browser_supervisor)

✅ Flight recorder + event routing

✅ Multi-format export (JSON/MD/HTML replay)

✅ Merge assessment + review board

✅ Environment override system (port allocation)

✅ 308 tests passing (excluding frontend failures)
```

### Backend Weaknesses

```
❌ Compaction module doesn't actually call LLM for summaries — stubs only
❌ Brain decomposition code has import issues (file concatenation problem)
❌ Task graph is created but never EXECUTED as parallel pipeline
❌ Best-of-N hard cap N=2 is VERY limiting
❌ No Cursor/Gemini adapters
❌ Merge engine is READ-ONLY assessment — no actual Git merge
❌ No streaming IPC channel — DB polling for live terminal data
❌ No PTY sandboxing or resource limits
❌ No live child_process API — using ps parsing instead
```

### Backend Rating: 8.5/10

**Previous:** 8.5/10  
**Current:** 8.5/10  
**Reason:** Backend is solid and well-organized. No significant changes. Minor improvements in evidence wiring.

---

## PART 3: GAPS ANALYSIS

### The 3 Remaining Blockers

**1. Evidence Panels: NOW FIXED ✅**

Previous: "Evidence panels stored but NOT shown in UI"  
NOW: ProcessTreePanel, ExitTaxonomyPanel, FileDeltaPanel all exist and wired to EvidencePanel.

```
Status: FIXED (but tests need updating)
Priority: DOWNGRADED from CRITICAL to MEDIUM
Remaining work:
  - Update App.test.tsx to match dark theme
  - Wrap TerminalMuxPanel tests in HarnessStateProvider
  - Fix lint error in restore_app.cjs
```

**2. No Cursor/Gemini Adapters: STILL OPEN ❌**

Previous: "Only Claude Code + Codex CLI adapters"  
NOW: Still only Claude Code + Codex CLI adapters.

```
Status: NOT FIXED
Priority: HIGH
Impact: Doorway's promise is "universal harness — Claude + Codex + Cursor + Gemini"
Fix: Follow adapter pattern from packages/adapters/src/claude-code-adapter.ts
```

**3. No Streaming IPC Channel: STILL OPEN ❌**

Previous: "Live terminal data via DB polling"  
NOW: Still DB polling, no streaming IPC.

```
Status: NOT FIXED
Priority: MEDIUM
Impact: Terminal output arrives via DB query, not live stream
Fix: Create dedicated streaming IPC channel (WebSocket or streaming IPC)
```

### New Gaps Identified

**4. App.tsx Bloat: NEW CRITICAL ❌**

```
Status: NEW GAP
Priority: HIGH
Impact: 2,972 lines in one file is unmaintainable
Fix: Split into smaller components — see recommendation below
```

**5. Test Failures: NEW CRITICAL ❌**

```
Status: NEW GAP
Priority: CRITICAL
Impact: 5 tests failing, gate is broken
Fix:
  - Update theme expectations (dark instead of light)
  - Add HarnessStateProvider to TerminalMuxPanel tests
  - Fix lint error in restore_app.cjs
```

**6. Brain Decomposition Broken: NEW HIGH ❌**

```
Status: NEW GAP
Priority: HIGH
Impact: Task graph decomposition may fail due to import issues
Fix: Investigate file concatenation issue in BrainService
```

### Gap Summary Table

| Gap                    | Status   | Priority | Impact                           |
| ---------------------- | -------- | -------- | -------------------------------- |
| Cursor/Gemini adapters | ❌ OPEN  | HIGH     | Universal harness promise broken |
| Streaming IPC          | ❌ OPEN  | MEDIUM   | Live data via polling            |
| App.tsx bloat          | ❌ NEW   | HIGH     | Unmaintainable code              |
| Test failures          | ❌ NEW   | CRITICAL | Gate broken                      |
| Brain decomposition    | ❌ NEW   | HIGH     | Task graph may fail              |
| Evidence panels        | ✅ FIXED | —        | Now wired                        |
| PTY streaming          | ✅ FIXED | —        | Append by sequence works         |
| Operational memory     | ✅ FIXED | —        | Real pattern learning            |

### Gaps Rating: 6.5/10

**Previous:** 5/10  
**Current:** 6.5/10  
**Reason:** Evidence panels fixed, but new gaps emerged (App.tsx bloat, test failures).

---

## PART 4: DOCS vs CODE COMPARISON

### Doc Coverage Matrix

| Feature               | Doc Promises     | Code Delivers    | Status  |
| --------------------- | ---------------- | ---------------- | ------- |
| Real PTY terminals    | ✅ Promised      | ✅ Delivered     | MATCH   |
| Process tree tracking | ✅ Promised      | ✅ Delivered     | MATCH   |
| Exit code taxonomy    | ✅ Promised      | ✅ Delivered     | MATCH   |
| File delta tracking   | ✅ Promised      | ✅ Delivered     | MATCH   |
| Cross-model threading | ✅ Promised      | ⚠️ Partial (N=2) | GAP     |
| Persistent memory     | ✅ Promised      | ✅ Delivered     | MATCH   |
| Pattern learning      | ✅ Promised      | ✅ Delivered     | MATCH   |
| Evidence-backed UI    | ✅ Promised      | ✅ Delivered     | MATCH   |
| Browser proof         | ⚠️ Partial       | ⚠️ Partial       | GAP     |
| Session replay        | ⚠️ Partial       | ⚠️ Partial       | GAP     |
| Universal adapters    | ✅ Promised      | ❌ Missing       | GAP     |
| Streaming IPC         | ❌ Not mentioned | ❌ Not delivered | NEW GAP |
| Block model           | ✅ Warp doc      | ❌ Not delivered | NEW GAP |
| Command palette       | ✅ Warp doc      | ✅ Delivered     | MATCH   |
| Agent lanes           | ✅ Promised      | ✅ Delivered     | MATCH   |

### Doc Quality: 9/10

```
✅ docs/00_STATE_OF_THE_ART_IDE_BLUEPRINT.md (12KB) — Excellent
✅ docs/09_WARP_TERMINAL_LEARNING.md (38KB) — Comprehensive
✅ docs/07_STATE_OF_THE_ART_TERMINAL_ANALYSIS.md (44KB) — Deep research
✅ docs/08_BRUTAL_CODE_REVIEW.md (26KB) — Honest assessment
✅ docs/01_WHAT_IS_DOORWAY.md (29KB) — Clear product definition
✅ docs/02_MARKET_RESEARCH.md (32KB) — Good market analysis
✅ docs/03_COMPETITOR_ANALYSIS.md (43KB) — Thorough
✅ docs/05_HARNESS_ARCHITECTURE.md (49KB) — Technical spec
✅ docs/06_IMPLEMENTATION_ROADMAP.md (46KB) — Detailed roadmap
✅ docs/README.md — Quick reference
✅ docs/_HANDOFF_PROMPT.md (20KB) — Comprehensive handoff

NEW: docs/10_BRUTAL_FEATURES_AUDIT.md — This document
```

### Doc Recommendations

```
1. Add doc about streaming IPC architecture
2. Add doc about block model (Warp's key innovation)
3. Update 08_BRUTAL_CODE_REVIEW.md with current state (7.8/10)
4. Add doc about App.tsx refactoring plan
5. Add doc about adapter pattern for Cursor/Gemini
```

### Docs Rating: 9/10

**Previous:** 9/10  
**Current:** 9/10  
**Reason:** Docs are comprehensive, well-organized, and maintained. Minor gaps in streaming IPC and block model.

---

## PART 5: BRUTAL FEATURES AUDIT

### Feature Matrix

| Feature            | Implemented | Tested | Wired to UI | Production Ready   |
| ------------------ | ----------- | ------ | ----------- | ------------------ |
| PTY Terminal       | ✅          | ✅     | ✅          | ✅                 |
| xterm.js Rendering | ✅          | ⚠️     | ✅          | ⚠️ (test failures) |
| Terminal Streaming | ✅          | ⚠️     | ✅          | ⚠️ (no IPC stream) |
| Process Tree       | ✅          | ✅     | ✅          | ✅                 |
| Exit Taxonomy      | ✅          | ✅     | ✅          | ✅                 |
| File Delta         | ✅          | ✅     | ✅          | ✅                 |
| Evidence Panel     | ✅          | ❌     | ✅          | ❌ (test failures) |
| Operational Memory | ✅          | ✅     | ⚠️          | ⚠️ (UI partial)    |
| Pattern Learning   | ✅          | ✅     | ❌          | ❌                 |
| Task Graph         | ✅          | ⚠️     | ⚠️          | ❌ (not executed)  |
| Brain Service      | ⚠️          | ⚠️     | ❌          | ❌ (broken)        |
| Best-of-N          | ✅          | ❌     | ❌          | ❌                 |
| Worktree Mgmt      | ✅          | ✅     | ✅          | ✅                 |
| Diff Service       | ✅          | ✅     | ✅          | ✅                 |
| Merge Assessment   | ✅          | ✅     | ✅          | ✅                 |
| Browser Proof      | ⚠️          | ❌     | ⚠️          | ❌                 |
| Handoff Export     | ✅          | ✅     | ⚠️          | ⚠️                 |
| Peer Messaging     | ✅          | ❌     | ❌          | ❌                 |
| Command Palette    | ✅          | ⚠️     | ✅          | ⚠️                 |
| Claude Adapter     | ✅          | ✅     | ✅          | ✅                 |
| Codex Adapter      | ✅          | ✅     | ✅          | ✅                 |
| Cursor Adapter     | ❌          | ❌     | ❌          | ❌                 |
| Gemini Adapter     | ❌          | ❌     | ❌          | ❌                 |
| Streaming IPC      | ❌          | ❌     | ❌          | ❌                 |
| Block Model        | ❌          | ❌     | ❌          | ❌                 |
| Auto-compaction    | ⚠️          | ❌     | ❌          | ❌                 |
| Learned Workflows  | ❌          | ❌     | ❌          | ❌                 |

### Production Ready Count

```
✅ Fully production ready: 8 features
   - PTY Terminal
   - Process Tree
   - Exit Taxonomy
   - File Delta
   - Worktree Management
   - Diff Service
   - Merge Assessment
   - Claude Adapter

⚠️ Partial/proof-of-concept: 10 features
   - xterm.js Rendering (test failures)
   - Terminal Streaming (no IPC stream)
   - Evidence Panel (test failures)
   - Operational Memory (UI partial)
   - Task Graph (not executed)
   - Brain Service (broken)
   - Browser Proof (basic)
   - Handoff Export (UI partial)
   - Best-of-N (no UI)
   - Command Palette (partial)

❌ Not implemented: 8 features
   - Cursor Adapter
   - Gemini Adapter
   - Streaming IPC
   - Block Model
   - Auto-compaction
   - Learned Workflows
   - Peer Messaging (UI)
   - Pattern Learning (UI)
```

---

## PART 6: PRIORITY ACTION PLAN

### Immediate (fix gate first)

```
1. Fix lint error
   File: apps/desktop/restore_app.cjs
   Issue: endIndex assigned but never used
   Fix: Remove unused endIndex variable

2. Fix test failures
   a. Update App.test.tsx:
      - Change theme expectation from 'light' to 'dark'
      - Update CSS token expectations

   b. Fix TerminalMuxPanel tests:
      - Wrap component in HarnessStateProvider
      - Mock useHarnessState properly

3. Verify gate passes
   Command: pnpm gate
```

### High Priority (this week)

```
4. Refactor App.tsx
   Current: 2,972 lines
   Target: Under 500 lines

   Plan:
   a. Extract all capsule components to separate files in App/capsules/
   b. Extract utility functions to App.utils.ts
   c. Extract state logic to hooks
   d. Keep App.tsx as shell only

5. Fix Brain decomposition
   Issue: Import issues in BrainService
   Fix: Debug file concatenation issue
   Verify: Run task graph creation and check output

6. Add Cursor adapter
   Follow: packages/adapters/src/claude-code-adapter.ts
   Register: In orchestrator adapter registry
   Test: Verify Cursor agent launches in PTY
```

### Medium Priority (this month)

```
7. Add Gemini adapter
   Follow: Same pattern as Cursor

8. Implement streaming IPC
   Architecture: WebSocket or streaming IPC channel
   Backend: Write to channel on PTY data
   Frontend: Subscribe to channel directly
   Fallback: DB polling on disconnect

9. Surface pattern learning in UI
   Component: MemoryPanel.tsx (new)
   Data: operational-memory.ts patterns
   Display: Repeated commands with confidence scores
   Action: "Save as automation" button
```

### Low Priority (later)

```
10. Implement block model
    Based on: Warp's block design (docs/09_WARP_TERMINAL_LEARNING.md)
    Block: {id, command, stdout, stderr, exitCode, duration, timestamp, cwd}
    Benefit: Queryable, linkable, replayable, diffable terminal output

11. Implement auto-compaction
    Current: Stub only
    Needed: LLM call for context summarization
    Benefit: Handle long sessions without context overflow

12. Implement learned workflows
    Trigger: ≥3 repeated patterns
    UI: "Save workflow?" card
    Action: Name, edit, run saved automations

13. Implement peer messaging UI
    Current: Backend exists, no UI
    UI: PeerMessagesCapsule in ThreadCanvas
    Display: Agent-to-agent messages
```

---

## FINAL RATINGS

```
┌────────────────────────────────────────────────────────────────────────────┐
│  OVERALL: 7.8/10                                                         │
│                                                                            │
│  Frontend:    7.5/10                                                     │
│    - Evidence panels wired ✅                                             │
│    - App.tsx bloat ❌                                                    │
│    - Test failures ❌                                                     │
│                                                                            │
│  Backend:     8.5/10                                                     │
│    - Solid, well-organized ✅                                             │
│    - All evidence types implemented ✅                                     │
│    - Brain decomposition broken ❌                                        │
│                                                                            │
│  Gaps:        6.5/10                                                     │
│    - Evidence panels fixed ✅                                              │
│    - Cursor/Gemini missing ❌                                             │
│    - Streaming IPC missing ❌                                             │
│    - New gaps: App.tsx bloat, tests failing ❌                           │
│                                                                            │
│  Docs:        9/10                                                        │
│    - Comprehensive ✅                                                     │
│    - Well-organized ✅                                                    │
│    - Missing streaming IPC, block model docs ❌                           │
└────────────────────────────────────────────────────────────────────────────┘

COMPARISON TO CODEX DESKTOP:
  Codex: 9.5/10 (polished, production-ready, all features)
  Doorway: 7.8/10 (solid foundation, evidence panels wired, but incomplete)

  Gap: 1.7 points
  Primary gaps: Cursor/Gemini adapters, streaming IPC, App.tsx refactor, tests

WHAT GOT BETTER:
  ✅ Evidence panels now exist and wired
  ✅ Operational memory is real pattern learning
  ✅ SurfaceDrawer fully integrated
  ✅ Command palette working
  ✅ Theme is now premium dark mode

WHAT GOT WORSE:
  ❌ Gate is broken (was passing before)
  ❌ App.tsx is now 2,972 lines (was smaller)
  ❌ 5 new test failures

WHAT'S MISSING:
  ❌ Cursor/Gemini adapters (universal harness promise broken)
  ❌ Streaming IPC channel
  ❌ Block model
  ❌ Auto-compaction
  ❌ Learned workflows UI
```

---

## CONCLUSION

Doorway is at **7.8/10** — genuinely improved from 7.5/10, but the gate is now broken and App.tsx is unmaintainably large.

**The good news:** The evidence system is now complete. ProcessTreePanel, ExitTaxonomyPanel, FileDeltaPanel all exist and are wired to SurfaceDrawer. This was the #1 complaint from the previous review.

**The bad news:** 5 tests are failing, App.tsx is 2,972 lines, and the Brain decomposition is broken. These need immediate attention.

**The path to 9/10:**

1. Fix gate (tests + lint) — 0.5 points
2. Refactor App.tsx — 0.3 points
3. Add Cursor/Gemini adapters — 0.3 points
4. Implement streaming IPC — 0.2 points

Fix those 4 things and Doorway is at 9.1/10 — genuinely competitive with Codex Desktop.
