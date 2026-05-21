# Doorway CTO Sprint Tasks
# 10-hour brutal sprint: 10/10 on everything

## PHASE 1: FRONTEND — Unicorn Standard (CRITICAL)

### F1: Glassmorphism Pass
**Why:** Zero backdrop-filter found. Linear/Raycast live on glassmorphism.
**Files:** styles.css, SurfaceDrawer.tsx, WorkspaceChrome.tsx, ComposerDock.tsx
**Change:** Add backdrop-filter: blur(12px) to surface-drawer, floating panels, command palette
**Rule:** border-white/10 + backdrop-blur. Not boxy borders.

### F2: Font Upgrade  
**Why:** DM Sans is not Geist/Inter. Unicorn standard requires Geist or Inter.
**Files:** tokens.css
**Change:** Replace DM Sans with Geist/Inter stack. Add font-smoothing. Add letter-spacing: +0.2px on dark bg.
**Rule:** Geist Mono for code. Never DM Sans in production.

### F3: Spring Animations
**Why:** All transitions are linear. Premium UIs use spring physics.
**Files:** App.tsx, SurfaceDrawer.tsx, TerminalMuxPanel.tsx
**Change:** Replace transition={{ duration: 0.18 }} with spring configs. Add layoutId transitions.
**Rule:** Framer-motion spring({ stiffness: 300, damping: 30 }) for panels.

### F4: Timing Fix
**Why:** 120ms is too fast. 200-250ms ease-out for hover states.
**Files:** styles.css
**Change:** All hover transitions → 200ms ease-out minimum. Focus states → 150ms.
**Rule:** If it feels snappy, it's too fast.

### F5: Noise Texture
**Why:** Comment says "removed — cleaner." Wrong call. Subtle grain = premium feel.
**Files:** tokens.css, styles.css
**Change:** Add subtle CSS noise via SVG filter on elevated surfaces.
**Rule:** opacity: 0.015-0.03. If you see it, it's too much.

### F6: Terminal Hero Treatment  
**Why:** Terminal is the star. It looks flat and engineering-scaffold.
**Files:** TerminalSurface.tsx, TerminalMuxPanel.tsx, styles.css
**Change:** Subtle glow on active tab. Better scroll treatment. Panel depth.
**Rule:** Make the terminal feel like a cockpit display, not a debug console.

### F7: Staggered Reveals
**Why:** Thread messages and worktree lists pop in flat.
**Files:** ThreadCanvas.tsx, WorkspaceChrome.tsx, App.tsx
**Change:** Animate list items with staggered delay (50ms between items).
**Rule:** Never mount a list without entrance animation.

### F8: Shared-UI Polish
**Why:** EmptyState, FirstRunProjectPanel are functional divs with text.
**Files:** shared-ui.tsx, FirstRunProjectPanel.tsx, ThreadStarterPanel.tsx
**Change:** Add subtle icons, better spacing, entrance animations.
**Rule:** Every panel should feel designed, not thrown together.

## PHASE 2: AUTOMATION — 0% → 100% (CRITICAL)

### A1: Automation Schema
**Why:** No automation table exists.
**Files:** packages/protocol/src/schema.sqlite, packages/core/src
**Change:** 
- Create automations table: id, thread_id, trigger_type, cron_expr, prompt, created_at, last_run, enabled
- Create automation_runs table: id, automation_id, status, started_at, completed_at, output
**Rule:** Every automation has evidence. No phantom automations.

### A2: Automation Runtime
**Why:** No scheduler, no runner.
**Files:** packages/orchestrator/src/automation.ts (new)
**Change:**
- Cron expression parser
- Schedule checker (runs every minute)
- Thread-to-automation converter
- Execution with result logging
**Rule:** Real cron. Real output. Real error handling.

### A3: Automation UI
**Why:** No UI to create/view/manage automations.
**Files:** apps/desktop/src/renderer/AutomationPanel.tsx (new)
**Change:**
- List automations
- Create from successful thread
- Enable/disable toggle
- View last run result
**Rule:** CRUD + evidence. No fake states.

### A4: /schedule Slash Command
**Why:** /schedule [cron] is in soul.md but not code.
**Files:** App.tsx, ComposerDock.tsx
**Change:** Parse /schedule command. Wire to automation creation.
**Rule:** Must feel natural. "Schedule this thread every morning at 9am?"

## PHASE 3: PLUGIN ECOSYSTEM — 0% → 100% (HIGH)

### P1: Plugin Manifest Parser
**Why:** doorway.plugin.json spec exists, no parser.
**Files:** packages/adapters/src/plugin-manifest.ts (new)
**Change:** Parse doorway.plugin.json. Validate schema. Load skills/connectors.
**Rule:** Fail gracefully. Missing plugin = warning, not crash.

### P2: MCP Connector Runtime
**Why:** MCP is the connector protocol. No integration.
**Files:** packages/adapters/src/mcp-connector.ts (new)
**Change:** MCP client connecting to stdio servers. Tool discovery.
**Rule:** Standard MCP handshake. No vendor lock-in.

### P3: Plugin Directory UI
**Why:** No UI for managing plugins.
**Files:** apps/desktop/src/renderer/PluginDirectory.tsx (new)
**Change:** List installed plugins. Show connector status. Enable/disable.
**Rule:** One click enable. No restart required.

### P4: Skills Loader
**Why:** SKILL.md format defined but not loaded.
**Files:** packages/adapters/src/skill-loader.ts (new)
**Change:** Load SKILL.md from plugin directories. Parse instructions.
**Rule:** Skills are read-only unless explicitly installed.

## PHASE 4: PEER ORCHESTRATION — 30% → 80% (HIGH)

### O1: Agent Awareness Protocol
**Why:** Agents don't know about each other. "Collaboration" is false advertising.
**Files:** packages/orchestrator/src/peer-protocol.ts (new)
**Change:**
- Agents register with mesh when starting
- Agents can query: "who else is running?"
- Agents can emit: status updates, blockers, completions
- Mesh broadcasts to other agents in same thread
**Rule:** Real messages. Not just logging.

### O2: Task Division
**Why:** BestOfN does parallel same-task. Not collaborative division.
**Files:** packages/orchestrator/src/task-splitter.ts (new)
**Change:** When launching N agents, split the goal into N sub-tasks.
- Agent A: implement feature
- Agent B: write tests
- Agent C: review and document
**Rule:** Divide labor. Not duplicate effort.

### O3: PeerMessages UI
**Why:** PeerMessagesCapsule exists but agents never send peer messages.
**Files:** packages/orchestrator/src/peer-protocol.ts
**Change:** Wire peer protocol to actual agent output parsing.
- Parse agent output for peer-intent markers
- Route to appropriate agent mailbox
**Rule:** If agent says "@reviewer: check the auth module", it goes there.

## PHASE 5: SELF-ADAPTING — 40% → 80% (MEDIUM)

### S1: Pattern Surface in UI
**Why:** Pattern learning exists in DB. Nothing shows it to the user.
**Files:** apps/desktop/src/renderer/PatternPanel.tsx (new)
**Change:**
- Show learned patterns: "You ran `npm test` 12 times"
- Suggest automation: "Turn into daily test automation?"
**Rule:** Evidence-based. Show the data, not a guess.

### S2: Auto-Tune Hooks
**Why:** No self-improvement from observed success/failure.
**Files:** packages/orchestrator/src/auto-tuner.ts (new)
**Change:**
- Track success rate by provider/model
- Track success rate by command pattern
- Auto-suggest: "claude-sonnet succeeds here 80%, switch default?"
**Rule:** Conservative. Never break what works.

### S3: Proposal Generation
**Why:** self-evolving-harness.rules.md has proposal flow. Not implemented.
**Files:** packages/orchestrator/src/proposal-service.ts (new)
**Change:**
- Detect repeated failure patterns
- Generate improvement proposal
- Present to user as actionable item
**Rule:** Concrete. "Your timeout is too short for this project" not "improve something."

## PHASE 6: TESTING (HIGH)

### T1: Frontend Component Tests
**Why:** 96 desktop tests. Most are App.test.tsx integration tests.
**Change:** Add unit tests for:
- Glassmorphism CSS application
- Slash command parsing
- Surface routing
- Hook state management
**Rule:** Every component has a test. No exceptions.

### T2: Backend Path Tests
**Change:** Add integration tests for:
- Automation CRUD
- Plugin manifest loading
- Peer protocol message routing
- Exit taxonomy edge cases
**Rule:** Happy path AND error path.

### T3: Render Tests
**Change:** Add Playwright smoke tests:
- App loads without crash
- Terminal connects
- Thread creation flow works
**Rule:** No screenshot comparisons. Only functional verification.

## PHASE 7: QUALITY GATE (ALWAYS ON)

### Q1: Kill List — Reject on Sight
- Mock data in production code → REJECT
- Empty catch blocks → REJECT  
- `|| true` in test assertions → REJECT
- console.log in production → REJECT (use proper logger)
- `as any` casts → REJECT unless documented
- TODO/HACK comments shipped → REJECT
- Hardcoded credentials → REJECT

### Q2: Code Review Checklist
- Does it match the unicorn frontend standard?
- Does it follow Karpathy rules (simplicity, surgical)?
- Is there evidence or honest unknown state?
- Is it a vertical slice or architecture theater?
- Does it pass the visual taste gate?

