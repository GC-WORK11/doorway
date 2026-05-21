# Doorway Frontend — Complete Rebuild Implementation Plan

## Goal

Rebuild the Doorway desktop frontend from a broken black-screen monolith into a **real, end-to-end connected, light-theme, multi-agent orchestration cockpit** — matching the [target mockup](file:///home/govinda/Doorway/ASSETS/DESIRED-UI/ChatGPT%20Image%20May%2018,%202026,%2008_06_08%20AM.png) and fulfilling all 7 PRDs. No fake data. No mock layers. No V1/V2 split. One working product.

---

## User Review Required

> [!IMPORTANT]
> **Stack confirmation needed:** The plan uses CSS Modules (`.module.css`) for styling per your directive. The PRD mentions Tailwind/Radix/shadcn — should I add those dependencies, or stick with CSS Modules + CSS custom properties only? CSS Modules are lighter and give full control matching the PRD token system.

> [!IMPORTANT]
> **Dead component verdict:** After tracing all 20 components back to their PRD origins (see §2 below), my recommendation is **delete all 20 and rebuild from scratch**. Every single one has hardcoded dark colors (`#09090B`, `#111418`, `#27272A`), uses inline `style={{}}` instead of CSS Modules, lacks the PRD's glass/frosted effects, and misses critical features (no @mentions, no orchestration capsule, no permission modes, no slash commands). Salvaging them would mean rewriting 90%+ of each file. A clean build is faster and cleaner.

> [!WARNING]
> **Framer-motion dependency:** Several dead components import `framer-motion`. The PRD says "120-180ms, ease-out, no bouncy animations." CSS transitions handle this perfectly. Plan removes `framer-motion` and uses CSS-only animations unless you want to keep it.

---

## Open Questions

> [!IMPORTANT]
> **Q1: Tailwind or CSS Modules?** Your message says "CSS Modules" but also mentions "Tailwind/Radix/shadcn." These are different approaches. I'll proceed with **CSS Modules + CSS custom properties** unless you say otherwise.

> [!IMPORTANT]
> **Q2: xterm.js in this build?** Adding xterm.js for the terminal drawer means a new dependency + integration with the existing `terminal-runtime` PTY backend via IPC. Should I include it in this build, or use a styled `<pre>` terminal view that reads real PTY output via IPC for now, then add xterm.js next?

---

## §1. Dead Component Autopsy — Why They Were Created, Why They Must Go

Before deleting anything, here's the forensic trace of every dead component back to its PRD origin:

### Components That Map to Real PRD Requirements

| Component         | Lines | PRD Source                                | Why It Was Created                          | Why It Must Be Rebuilt                                                                                                                                                                   |
| ----------------- | ----: | ----------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppShell`        |   209 | Frontend PRD §5-6                         | App frame with sidebar/main/right panels    | Hardcoded dark theme (`#111418`), uses `react-hot-toast` with dark styles, layout is topbar+sidebar+main (PRD wants rail+sidebar+canvas), inline styles everywhere                       |
| `LandingScreen`   |   359 | Frontend PRD §18.1                        | First-launch empty state with hero composer | Layout is sidebar+center+spacer (PRD wants rail+sidebar+canvas), has right spacer div doing nothing, hardcoded dark colors, missing: provider setup cards, local-first notice            |
| `Sidebar`         |   240 | Frontend PRD §7                           | Project/thread navigation                   | Hardcoded `#09090B` bg, 240px width (PRD: 310px), no "New chat" button, no "Search chats ⌘K", no "Pinned chats" section, no thread list with status badges                               |
| `ThreadPanel`     |   257 | Frontend PRD §18.2, Claude Code PRD §17.2 | Message display + agent steps               | All messages left-aligned (PRD: user=right, Doorway=left), avatar on every message (PRD: "no big avatars on every message"), hardcoded dark, no orchestration capsule, no evidence cards |
| `Composer`        |   108 | Frontend PRD §16, Cursor3 PRD §8.1        | Prompt input + provider selector            | Just a `<textarea>` + Send button, missing: `+` attachment, `/` slash commands, permission mode pill, primary tool selector, behavior selector, `@` mention system, send arrow           |
| `WorkspaceScreen` |   292 | Frontend PRD §18.2, Cursor3 PRD §10.1     | Three-pane workspace                        | Hardcoded dark IDE layout, doesn't use AppShell, doesn't follow rail+sidebar+canvas structure                                                                                            |
| `SettingsScreen`  |   713 | Frontend PRD §18.8                        | Provider/appearance/shortcut config         | Massive component, all hardcoded dark, would need 90% rewrite for light theme + CSS Modules                                                                                              |
| `CommandPalette`  |   202 | Frontend PRD §19.4                        | ⌘K command search                           | Uses `framer-motion`, hardcoded dark colors, needs full restyle                                                                                                                          |
| `DiffViewer`      |   241 | Cursor3 PRD §8.3                          | Side-by-side/unified diff display           | Uses `@monaco-editor/react` diff, actual logic is sound but styling is all dark inline                                                                                                   |
| `MonacoEditor`    |    39 | Cursor3 PRD §8.3                          | Code editor wrapper                         | Tiny wrapper, hardcoded dark theme, needs light theme config                                                                                                                             |

### Components That Map to Advanced PRD Features

| Component                | Lines | PRD Source                             | Why It Was Created                      | Verdict                                                                                |
| ------------------------ | ----: | -------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------- |
| `ReviewMergePanel`       |   411 | Cursor3 PRD §8.6, Claude Code PRD §16  | Review/merge workflow surface           | Maps to MergeJudge + integration branch flow. Complex but all dark-hardcoded. Rebuild. |
| `ReviewBoard`            |   135 | Cursor3 PRD §8.5                       | Run report / completion review          | Maps to RunReportService output. Rebuild with light theme.                             |
| `MergeJudgeScorecard`    |   143 | Cursor3 PRD §8.6                       | Blocked/Risky/Reviewable/Ready UI       | Direct PRD match. Rebuild with proper capsule styling.                                 |
| `PostTaskReportCard`     |   268 | Codex PRD §8.5, Claude Code PRD §17.4  | Evidence-backed completion card         | Maps to "every task ends with structured report." Rebuild.                             |
| `BrainActionTraceCard`   |   117 | Codex PRD §5.10                        | Action trace visualization              | Maps to FlightRecorder/ActionTrace. Rebuild.                                           |
| `FlightRecorderReplay`   |   196 | Codex PRD §5.2                         | Session replay from events              | Maps to rollout replay. Rebuild.                                                       |
| `BestOfNComparisonBoard` |   138 | Cursor3 PRD §14, P2-4                  | Multi-agent comparison                  | Maps to Cursor's `/best-of-n`. Rebuild.                                                |
| `WorktreeGraph`          |   135 | Cursor3 PRD §8.4                       | Git worktree visualization              | Maps to WorktreeGraphService output. Rebuild.                                          |
| `BrowserSurface`         |   204 | Codex PRD §5.10, Claude Code PRD §18.5 | Browser proof panel                     | Only component actually used. Rebuild with CSS Modules.                                |
| `SurfacePanel`           |    87 | Frontend PRD §18.4-5                   | Terminal/browser split surface          | Generic container. Rebuild as proper drawer.                                           |
| `TaskProgressHeader`     |    98 | Frontend PRD §15.3-4                   | Phase indicator (planning→running→done) | Small, useful concept. Rebuild.                                                        |

### Conclusion

**All 20 components were created to match real PRD requirements.** None are fake/speculative — they all trace to specific PRD sections. But they all share fatal flaws:

1. Hardcoded dark hex colors instead of CSS custom properties
2. Inline `style={{}}` instead of CSS Modules
3. Missing 60-80% of the features their PRD section requires
4. Wrong layout structure (none follow the rail+sidebar+canvas pattern from the mockup)

**Verdict: Delete all. Rebuild from scratch with CSS Modules, light theme, and complete PRD feature coverage.**

---

## §2. Competitor Lessons Applied

### From Cursor 3 Research

- **Agents Window** = dedicated full-screen for managing parallel agents (Doorway: orchestration capsule + agent rows in thread)
- **Git worktrees** for isolation per agent (Doorway: already has `git-engine` — wire it)
- **Design Mode** with visual annotations (Doorway: browser proof panel)
- **`@` mentions** for context targeting (Doorway: `@CloudCode`, `@Codex` in composer)
- **Command palette ⌘K** (Doorway: search + commands)
- **Best-of-N** comparison of agent outputs (Doorway: multi-agent orchestration capsule)
- **Agent-first, not file-first** (Doorway: thread canvas is the center, not an editor)

### From Codex Desktop Research

- **Permission configuration on first launch** (Doorway: permission mode in composer)
- **Skills & Automations** discovery (Doorway: rail → automations/plugins screens)
- **Progressive disclosure** — core features first, advanced later (Doorway: composer shows simple surface, slash menu reveals depth)
- **Session management** with parallel agents (Doorway: sidebar thread list + orchestration capsule)
- **Diff review** built into the flow (Doorway: DiffViewer in evidence surface)

### Doorway's Unique Position

Neither Cursor nor Codex shows **multiple different agents (Claude Code + Codex + Cursor CLI) coordinating in the same thread with visible terminals and evidence-backed merge safety.** This is Doorway's identity.

---

## §3. Proposed Changes — Phase by Phase

All phases build on each other. Each produces a working, bootable app. No phase leaves dead code.

---

### Phase F0 — Kill Black Screen, Boot Real Shell

> App boots into a light-theme shell with real IPC data flow. No fake data.

#### [DELETE] Dead components + old App.tsx

Delete all 20 dead components from `packages/ui/src/components/` and the current monolithic `App.tsx` from `apps/desktop/src/renderer/`.

Files deleted:

- `packages/ui/src/components/app-shell/AppShell.tsx`
- `packages/ui/src/components/app-shell/CommandPalette.tsx`
- `packages/ui/src/components/composer/Composer.tsx`
- `packages/ui/src/components/landing/LandingScreen.tsx`
- `packages/ui/src/components/review/MergeJudgeScorecard.tsx`
- `packages/ui/src/components/review/ReviewBoard.tsx`
- `packages/ui/src/components/review/ReviewMergePanel.tsx`
- `packages/ui/src/components/settings/SettingsScreen.tsx`
- `packages/ui/src/components/sidebar/Sidebar.tsx`
- `packages/ui/src/components/surface/BrowserSurface.tsx`
- `packages/ui/src/components/surface/SurfacePanel.tsx`
- `packages/ui/src/components/thread/BestOfNComparisonBoard.tsx`
- `packages/ui/src/components/thread/BrainActionTraceCard.tsx`
- `packages/ui/src/components/thread/FlightRecorderReplay.tsx`
- `packages/ui/src/components/thread/PostTaskReportCard.tsx`
- `packages/ui/src/components/thread/TaskProgressHeader.tsx`
- `packages/ui/src/components/thread/ThreadPanel.tsx`
- `packages/ui/src/components/workspace/MonacoEditor.tsx`
- `packages/ui/src/components/workspace/WorkspaceScreen.tsx`
- `packages/ui/src/components/workspace/WorktreeGraph.tsx`
- `apps/desktop/src/renderer/App.tsx` (the 761-line monolith)

#### [NEW] Light-theme design tokens

- `apps/desktop/src/renderer/tokens.css` — rewrite with PRD light palette (`#F7F6F3` warm bg, `#FFFFFF` surfaces, `rgba(24,24,27,0.08)` borders, `#18181B` text, `#5B5BEF` accent)

#### [NEW] AppShell + Routing

- `apps/desktop/src/renderer/App.tsx` — new entry: `AppShellProvider` → screen router
- `apps/desktop/src/renderer/App.module.css` — CSS Module for shell layout
- `apps/desktop/src/renderer/screens/` — directory for screen components

#### [MODIFY] `packages/ui/src/index.ts`

Remove all dead exports, prepare for new component exports.

#### [MODIFY] `apps/desktop/src/renderer/index.html`

Fix CSP to allow font loading. Add Inter font.

#### [MODIFY] `apps/desktop/src/renderer/styles.css`

Reset to light-first base styles.

---

### Phase F1 — Core Visual Shell (Matches Mockup)

> Rail + Sidebar + Thread Canvas layout matches the target mockup pixel-level.

#### [NEW] UtilityRail

`apps/desktop/src/renderer/components/UtilityRail/`

- `UtilityRail.tsx` + `UtilityRail.module.css`
- Doorway logo SVG at top (from `ASSETS/ASSETS-TO-BE-USED/doorway-logo.svg`)
- Icons: Browser, Terminal, Plugins, Automations
- Settings gear at bottom
- Active/inactive states with accent indicator
- 64px wide, translucent bg

#### [NEW] RailSeparator

- 8px translucent frosted gap between rail and sidebar (PRD §6.4)

#### [NEW] MainSidebar

`apps/desktop/src/renderer/components/MainSidebar/`

- `MainSidebar.tsx` + `MainSidebar.module.css`
- Brand: "Doorway" text at top
- "+ New chat" button
- "Search chats ⌘K" input
- "Pinned chats" section with sparkle icon
- Thread list with real titles from IPC `getThreads()`
- "Projects" section with `+` button
- Project list with real names/paths from IPC `getProjects()`
- Thread count badges per project
- 310px width

#### [NEW] ThreadCanvas

`apps/desktop/src/renderer/components/ThreadCanvas/`

- `ThreadCanvas.tsx` + `ThreadCanvas.module.css`
- Thread header: title + dropdown arrow + `...` menu
- Message list (scrollable)
- ComposerDock at bottom

**All data from real IPC calls to the existing backend packages.**

---

### Phase F2 — Message System (Real Messages, Real Alignment)

> Messages render as polished capsules. User=right, Doorway=left. No avatars on every message. Timestamps. @mention chips.

#### [NEW] MessageCapsule

`apps/desktop/src/renderer/components/MessageCapsule/`

- `UserMessage.tsx` — right-aligned, warm-tinted capsule, 22px border-radius
- `DoorwayMessage.tsx` — left-aligned, white/glass capsule, can contain orchestration capsule
- `MessageTimestamp.tsx` — subtle time above message group
- `MentionChip.tsx` — `@CloudCode` / `@Codex` inline chips with accent color

**Messages loaded from real IPC `getMessages(threadId)` calls to `@doorway/core` thread-service.**

---

### Phase F3 — Composer Dock (Full PRD Feature Set)

> The composer matches the mockup: `+`, `/`, `Full control`, `Claude Code ▼`, `Auto ▼`, prompt input, `↑` send.

#### [NEW] ComposerDock

`apps/desktop/src/renderer/components/ComposerDock/`

- `ComposerDock.tsx` + `ComposerDock.module.css`
- **ComposerToolbar**: `+` (attachment), `/` (slash commands), permission mode pill, primary tool selector, behavior selector
- **ComposerInput**: Rich text area with `@` mention detection and highlighting
- **SendButton**: Arrow-up circle button
- Glass effect: `backdrop-filter: blur(18px)`, 24px border-radius, shadow

#### [NEW] SlashCommandMenu

- `/build`, `/debug`, `/review`, `/plan`, `/handoff`, `/test`, `/browser`, `/merge`
- Triggered by typing `/` in composer
- Reads available commands from backend

#### [NEW] MentionDropdown

- `@CloudCode`, `@Codex`, `@CursorCLI`, `@OpenCode`, `@GeminiCLI`
- Triggered by typing `@` in composer
- Shows provider SVG logos from `ASSETS/ASSETS-TO-BE-USED/`
- Shows auth/install status from real IPC `getProviders()`

#### [NEW] PermissionModePill

- Modes: Ask first, Full control, Auto update, Review only, Terminal only
- Stores selection via IPC to orchestrator

#### [NEW] PrimaryToolSelector

- Dropdown showing available CLI workers with real install status
- Uses `ASSETS/ASSETS-TO-BE-USED/` SVG logos

#### [NEW] BehaviorSelector

- Auto, Fast, Careful, Parallel, Review-heavy

**All selections wired to real IPC handlers that update orchestrator state.**

---

### Phase F4 — Orchestration Capsule (Multi-Agent Live Status)

> When agents run, the orchestration capsule appears inside Doorway's reply message. Shows live agent status with real terminal/worktree data.

#### [NEW] OrchestrationCapsule

`apps/desktop/src/renderer/components/OrchestrationCapsule/`

- `OrchestrationCapsule.tsx` + `OrchestrationCapsule.module.css`
- **CapsuleHeader**: "✦ Doorway is coordinating 2 agents in parallel · ● Live"
- **AgentStatusRow**: Tool icon (SVG from ASSETS) + worker name + task summary + status pill (Running/Waiting/Done/Failed)
- **SessionSummary**: terminal icon + "2 processes · Started 10:42 AM" + expand arrow
- Collapsed by default, expandable to show: terminal session links, worktree branch, changed files, latest command, test status

**Agent rows populated from real IPC `getAgentRuns(threadId)` calls. Status pills update via `onAgentEvent` IPC subscription.**

---

### Phase F5 — Backend Projection Wiring

> Every UI element reads from real backend data via IPC. No state without a source.

#### [MODIFY] `apps/desktop/src/renderer/hooks.ts`

Rewrite the monolithic `useDoorway()` into focused hooks:

- `useProjects()` — real project list from `@doorway/core`
- `useThreads(projectId)` — real thread list
- `useMessages(threadId)` — real message list
- `useAgentRuns(threadId)` — real agent run status
- `useWorktrees(projectId)` — real worktree state
- `useProviders()` — real provider/adapter install status
- `useTerminal(sessionId)` — real terminal output stream
- `useDiff(worktreeId)` — real git diff

Each hook calls real IPC handlers that already exist in `apps/desktop/src/main/handlers.ts`.

#### [MODIFY] IPC event subscriptions

Wire `onAgentEvent`, `onTerminalData`, `onDbChange` to update React state in real-time.

---

### Phase F6 — Utility Surfaces (Terminal, Browser, Plugins, Settings)

> Rail icons open real surfaces as drawers/panels.

#### [NEW] TerminalDrawer

`apps/desktop/src/renderer/components/TerminalDrawer/`

- Bottom sheet drawer, opens from rail terminal icon
- Tabs per active terminal session
- Reads real PTY output via `useTerminal()` hook
- Runtime badge: "Claude Code · Visible CLI · Worktree"
- Stop/interrupt button
- Search/copy
- (xterm.js integration if approved, otherwise styled `<pre>` with real data)

#### [NEW] BrowserDrawer

- Opens from rail browser icon
- Shows real browser preview URL
- Action trace (collapsed)
- Screenshot capture button
- Human takeover button

#### [NEW] PluginsScreen

- Opens from rail plugins icon
- Shows installed plugins from real plugin registry
- Capabilities, permissions, enabled/disabled toggle

#### [NEW] SettingsScreen

- Opens from rail gear icon
- Sections: Appearance (light/dark/system), Providers (real API key config via vault.ts), CLI workers (real detection status), Brain role bindings, Permissions, Keyboard shortcuts
- Real data from IPC `getSettings()` / `setSettings()`

---

### Phase F7 — Review, Completion & Evidence Cards

> Every agent run ends with evidence-backed cards in the thread.

#### [NEW] CompletionCard

- Changed files list (real git diff)
- Test results (real test run status)
- Permission receipts
- Terminal session link
- Next actions: Review diff, Handoff, Run tests, Create PR, Archive

#### [NEW] PermissionCard

- What the agent wants to do
- Risk classifier result
- Allow/Deny buttons
- Saved receipt confirmation

#### [NEW] MergeJudgeCard

- Score: Blocked/Risky/Reviewable/Ready
- Evidence checklist (diff exists, tests passed, etc.)
- Create PR button

#### [NEW] DiffViewer

- Side-by-side or unified diff
- Real git diff from `useDiff()` hook
- Changed file tree
- Hunk navigation

**All cards populated from real evidence via IPC. No card renders without backend data.**

---

## §4. File Structure After Rebuild

```
apps/desktop/src/renderer/
├── App.tsx                          # Shell + router
├── App.module.css                   # Shell layout
├── main.tsx                         # Entry point (unchanged)
├── index.html                       # Fixed CSP + Inter font
├── tokens.css                       # Light-first design tokens
├── styles.css                       # Reset + base styles
├── hooks/
│   ├── useProjects.ts
│   ├── useThreads.ts
│   ├── useMessages.ts
│   ├── useAgentRuns.ts
│   ├── useWorktrees.ts
│   ├── useProviders.ts
│   ├── useTerminal.ts
│   └── useDiff.ts
├── components/
│   ├── UtilityRail/
│   ├── MainSidebar/
│   ├── ThreadCanvas/
│   ├── MessageCapsule/
│   ├── ComposerDock/
│   ├── OrchestrationCapsule/
│   ├── TerminalDrawer/
│   ├── BrowserDrawer/
│   ├── PluginsScreen/
│   ├── SettingsScreen/
│   ├── CompletionCard/
│   ├── PermissionCard/
│   ├── MergeJudgeCard/
│   └── DiffViewer/
└── screens/
    ├── LandingScreen.tsx
    └── WorkspaceScreen.tsx

packages/ui/src/
├── index.ts                         # Cleaned exports (only shared primitives)
├── diff-viewer/                     # Keep if shared, otherwise move to renderer
└── (dead component directories deleted)
```

---

## §5. SVG Assets Integration

The 8 SVGs in `ASSETS/ASSETS-TO-BE-USED/` will be used as:

| Asset              | Used In                                                           |
| ------------------ | ----------------------------------------------------------------- |
| `doorway-logo.svg` | UtilityRail top icon, LandingScreen brand                         |
| `claude-code.svg`  | PrimaryToolSelector, OrchestrationCapsule agent rows, MentionChip |
| `codex-dark.svg`   | PrimaryToolSelector, OrchestrationCapsule agent rows, MentionChip |
| `cursor.svg`       | PrimaryToolSelector, MentionChip                                  |
| `opencode.svg`     | PrimaryToolSelector, MentionChip                                  |
| `gemini.svg`       | PrimaryToolSelector, MentionChip                                  |
| `openai.svg`       | SettingsScreen provider config                                    |
| `github-mono.svg`  | PR export, review integration                                     |

---

## §6. Verification Plan

### Automated Tests

- `pnpm typecheck` — strict TypeScript compilation
- `pnpm lint` — zero warnings
- `pnpm test` — existing backend tests still pass
- `pnpm build` — production build succeeds
- `pnpm dead` — knip reports zero dead code (the whole point of this rebuild)

### Manual Verification

1. `pnpm desktop:view` → app boots with light theme, no black screen
2. Sidebar shows real projects/threads from SQLite
3. Clicking a thread loads real messages
4. Composer sends real prompt → creates thread + message in DB
5. `@CloudCode` mention in composer triggers real adapter detection
6. Agent run → orchestration capsule appears with real status
7. Terminal drawer shows real PTY output
8. Agent completion → evidence cards appear with real diff/test data
9. Settings screen shows real provider status
10. ⌘K opens command palette with real commands

### Build Gate

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Must pass after every phase.

---

## §7. What This Plan Does NOT Include (Future Work)

| Feature                    | Reason for deferral                                                  |
| -------------------------- | -------------------------------------------------------------------- |
| Dark theme toggle          | PRD says light-first. Add dark after light is perfect.               |
| Rust crates                | Per your directive: TypeScript first, Rust later for performance.    |
| Monaco code editor         | Focus on thread/composer/orchestration. Editor is P2.                |
| Best-of-N comparison board | Requires multi-model orchestration. Build after core flow works.     |
| FlightRecorder replay      | Requires rollout JSONL persistence. Build after core evidence works. |
| Plugin marketplace         | Build after local plugin registry works.                             |
| Inline hunk accept/reject  | Build after DiffViewer is stable.                                    |
| PR export to GitHub        | Build after MergeJudge is stable.                                    |
