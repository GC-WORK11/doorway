# Doorway Computer-Use, Browser-Use & Plugin System PRD

**Version:** 1.0  
**Date:** 2026-05-17  
**Status:** Final  
**Source Intelligence:** Codex Desktop Linux codebase analysis (6-agent parallel research pass)

---

## 1. Executive Summary

Doorway is a local-first agentic coding cockpit. Its next phase (Phase 7+) requires a world-class **computer-use + browser-use + plugin surface** that lets an agent verify changes in a real browser or desktop application, record every action as traceable proof, and connect that proof to diffs, tests, and MergeJudge.

This PRD defines what Doorway must build: the BrowserSurface, BrowserSupervisor role, PluginSystem, FlightRecorder evidence layer, and the human-takeover model — all grounded in intelligence extracted from the Codex Desktop codebase.

### Key Intelligence from Codex

The single most important finding: **Codex Computer Use is NOT browser automation. It is native Linux desktop automation via AT-SPI2 + Wayland Portal.** It controls real desktop applications (Firefox, Chrome, terminal apps) through their accessibility APIs, not through an embedded headless browser. Screenshots are real desktop screenshots. The accessibility tree is the real OS-level accessibility tree. Proof is authentic.

Browser Use (upstream DMG) is a separate CDP-based browser automation system. The two are architecturally distinct.

### What We Are Building

| Component | Purpose |
|-----------|---------|
| **BrowserSurface** | Embedded desktop browser (real Firefox/Chrome via AT-SPI/Portal) with URL bar, session state, action trace panel, screenshot proof, console/network summaries, human takeover |
| **BrowserSupervisor** | Agent role that observes browser state, selects actions, enforces safety checks, detects completion |
| **PluginSystem** | Plugin registry with manifest, capability declarations, permission boundaries, tool registration, audit |
| **FlightRecorder** | Persistent action trace with screenshot refs, accessibility tree refs, terminal chunks, diff refs, test refs, permission receipts |
| **ProofPanel** | Right-side evidence browser with timeline, screenshot gallery, replay mode, completion card |

### What We Are NOT Building

- A headless browser (Playwright/Puppeteer-style)
- A chatbot-only interface
- A cloud-dependent service
- A clone of Codex Desktop

---

## 2. Problem Statement

### 2.1 The Agent Verification Gap

Today, Doorway agents can write code, run tests, and produce diffs. But the agent cannot **verify that the code actually works in the user-facing surface** — a browser, a desktop app, a UI. The only verification is test suites. Tests don't catch UI breakage, CSS bugs, DOM regressions, or functionality that requires a human to see.

### 2.2 The Proof Gap

When an agent makes a change, there is no **verifiable proof** that the change works. The diff shows what changed. The tests show unit-level assertions. But neither shows a screenshot of the feature working in a real browser, nor captures the console errors that appeared during the flow, nor records the exact sequence of actions the agent took.

### 2.3 The Trust Gap

Users must trust agent-produced changes. Trust requires evidence: screenshots, action traces, console logs, network logs. Without these, every agent merge is a leap of faith.

### 2.4 The Plugin Gap

Doorway cannot extend its capabilities without a plugin system. Third parties — and Doorway itself — need a way to add tools, UI panels, context providers, and browser-use skills with clear permission boundaries.

---

## 3. Design Principles

### 3.1 Authentic Evidence Over Synthetic

The agent must verify against **real** browsers and desktop applications, not headless replicas. Real screenshots. Real accessibility trees. Real console logs. Real network captures. Proof is only valuable if it reflects what the user actually sees.

### 3.2 Local-First

All evidence lives locally. No cloud dependency for proof storage. Screenshot store, action trace, flight recorder — all on the user's machine at `~/.doorway/`.

### 3.3 Compositor-Native, Not Browser-Native

On Linux, control browsers via AT-SPI2 + Wayland Portal. On other platforms, use equivalent native APIs. Do not embed a headless browser as the primary automation target.

### 3.4 Every Action is Traceable

Every agent action produces: an action event, a screenshot (or screenshot ref), a tree state, and optionally console/network evidence. Nothing happens silently. The flight recorder is the source of truth.

### 3.5 Human-in-the-Loop by Design

The agent can be paused at any moment. Human takeover is a first-class state — `Running → Paused → UserDriving → Resume`. The agent never fully surrenders control.

### 3.6 Plugin Safety via Permissions

Plugins declare capabilities and are granted permissions. Dangerous tools require user approval. Nothing runs without the user's consent or an explicit auto-approve policy.

---

## 4. Architecture

### 4.1 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Doorway                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Brain API   │  │ CLI Workers  │  │ MergeJudge       │  │
│  │ (models)   │  │ (visible)   │  │                  │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                │                     │              │
│         └────────────────┴─────────────────────┘              │
│                          │                                   │
│                   ┌──────▼──────┐                            │
│                   │  Supervisor  │                            │
│                   │  (Browser,   │                            │
│                   │   Terminal,  │                            │
│                   │   Git)       │                            │
│                   └──────┬──────┘                            │
│                          │                                   │
│    ┌─────────────────────┼─────────────────────┐            │
│    │                     │                     │            │
│    ▼                     ▼                     ▼            │
│ ┌────────────┐   ┌──────────────┐   ┌──────────────────┐   │
│ │ Browser    │   │ Terminal     │   │ Git              │   │
│ │ Surface    │   │ Surface      │   │ Surface          │   │
│ └─────┬──────┘   └──────────────┘   └──────────────────┘   │
│       │                                                        │
│       ▼                                                        │
│ ┌────────────────────────────┐                               │
│ │  FlightRecorder            │                               │
│ │  (evidence store)          │                               │
│ └────────────────────────────┘                               │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │  Native Automation Layer  │
              │  AT-SPI2 + Wayland      │
              │  Portal (Linux)          │
              │  Accessibility Tree      │
              │  Screenshot Capture      │
              │  Input Injection         │
              └─────────────────────────┘
```

### 4.2 Component Boundaries

| Component | Responsibility | Boundaries |
|-----------|----------------|-----------|
| **BrowserSurface** | Render browser state, URL bar, action trace, screenshots | Receives observations from BrowserSupervisor; emits user actions |
| **BrowserSupervisor** | Observe, select actions, enforce safety, detect completion | Reads browser state; writes action events to FlightRecorder |
| **FlightRecorder** | Store all evidence: screenshots, trees, chunks, diffs, receipts | Read by ProofPanel; written by all supervisor tools |
| **PluginSystem** | Discover, load, run, audit plugins | Plugins emit tools; PluginSystem enforces permissions |
| **ProofPanel** | Display evidence timeline, screenshots, replay | Reads FlightRecorder; no writeback |
| **NativeAutomation** | AT-SPI tree read, Portal input, screenshot capture | Called by BrowserSupervisor tools; returns structured data |

### 4.3 Data Flow

```
Agent decides: "click the login button"
  → BrowserSupervisor observes (get_app_state)
    → NativeAutomation: AT-SPI tree + screenshot
    → FlightRecorder: RecordAction { screenshot_ref, tree_ref }
    → ObservationPacket → Agent
  → Agent selects: click({ element_index: 42 })
    → NativeAutomation: Portal click
    → ActionOutput { ok, action, received }
    → FlightRecorder: RecordAction { action: "click", params, result }
  → BrowserSupervisor observes again (verify)
    → NativeAutomation: new screenshot + tree
    → FlightRecorder: RecordAction { screenshot_ref }
  → Loop until completion detected
  → CompletionCard rendered in ProofPanel
  → EvidenceBundle attached to MergeJudge
```

---

## 5. BrowserSurface

### 5.1 Overview

BrowserSurface is the embedded desktop browser view in Doorway. It is NOT an iframe or webview of a running browser tab. It is a **real browser window** (Firefox, Chrome) observed via AT-SPI and controlled via Wayland Portal, presented to the user inside Doorway's window with Doorway's chrome around it.

### 5.2 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  🔒 https://app.example.com              ⟳  ↗  [━━━━━━━━]  ⏸  │
│  ──────────────────────────────────────────────────────────────  │
│                                                                  │
│                    (Browser Content Area)                        │
│                  Real screenshot from Portal/AT-SPI              │
│                                                                  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  🌐 Console (2 errors) │ Network (1 failed) │ Trace (12 actions)│
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Components

#### 5.3.1 URL Bar

- Displays current URL (read from AT-SPI window title or CDP `Page.frameStartedLoading`)
- Manual navigation: typing an address sends `navigate` action
- Security indicator: lock icon for HTTPS, warning for HTTP
- Copy URL button
- **Not editable while agent is running** — user must pause first

#### 5.3.2 Navigation Controls

- **Back / Forward** — browser history navigation
- **Reload** — refresh current page
- **Hard Reload** — bypass cache
- **Open External** — open current URL in system browser
- All controls disabled while agent is driving unless in `Paused` state

#### 5.3.3 Browser Content Area

- **Real screenshot** from Portal/AT-SPI, refreshed after each action
- Click-to-inspect: click anywhere to highlight the AT-SPI element
- Element highlight: red border on hovered element, blue on selected
- Zoom: 50%, 75%, 100%, 125%, 150%, 200%

#### 5.3.4 Human Takeover Button

- **⏸ Pause Agent** — appears when agent is `Running`
- When clicked: BrowserSupervisor state → `Paused`
- Shows: "Agent paused. You are in control."
- **▶ Resume Agent** — appears when `Paused` or `UserDriving`
- When clicked: BrowserSupervisor state → `Running`

#### 5.3.5 Status Tabs

| Tab | Content |
|-----|---------|
| **Console** | Console errors and warnings since last action. Collapsed summary. Click to expand full log. Filter by error/warning/log |
| **Network** | Failed network requests since last action. URL, status code, error. Click to expand headers/body |
| **Trace** | Action timeline. Each entry: timestamp, action type, params, screenshot thumbnail. Click to expand full screenshot |

#### 5.3.6 Empty/Loading/Error States

| State | UI |
|-------|-----|
| **No browser open** | "Click 'Open Browser' to start" + browser selector (Firefox/Chrome) |
| **Loading** | Spinner + URL being loaded, page title "Loading..." |
| **Error** | Error icon + message (blocked, auth required, crashed). "Retry" button. "Open External" link |
| **AT-SPI unavailable** | Warning banner: "Accessibility not enabled. Some features may not work." + Doctor diagnostics link |
| **Agent complete** | CompletionCard overlays the content area |

### 5.4 Browser Selector

- User chooses default browser: Firefox or Chrome (or system default)
- On "Open Browser": BrowserSupervisor launches the selected browser via OS launcher
- Browser must be running for Doorway to connect
- If browser dies: BrowserSurface shows error state, BrowserSupervisor emits `browser_crashed` event

---

## 6. BrowserSupervisor Role

### 6.1 Role Definition

BrowserSupervisor is a **Doorway supervisor role** (like TerminalSupervisor, GitSupervisor). It runs in the agent's context. It observes browser/desktop state, selects actions, enforces safety checks, handles recovery, and detects completion.

### 6.2 State Machine

```
                    ┌─────────────────────────────────────────┐
                    │              IDLE                        │
                    │  (no browser session active)            │
                    └────────────────────┬────────────────────┘
                                         │ open_browser()
                                         ▼
                    ┌─────────────────────────────────────────┐
              ┌────►│            OBSERVING                     │
              │     │  (get_app_state → ObservationPacket)    │
              │     └──────────────┬──────────────────────────┘
              │                    │
              │                    │ agent selects action
              │                    ▼
              │     ┌─────────────────────────────────────────┐
              │     │          ACTING                        │
              │     │  (execute action → ActionOutput)       │
              │     └──────────────┬──────────────────────────┘
              │                    │
              │           ┌────────┴────────┐
              │           ▼                 ▼
              │     ┌──────────┐     ┌─────────────┐
              │     │  success  │     │   failure   │
              │     └─────┬────┘     └──────┬──────┘
              │           │                  │
              │           └────────┬─────────┘
              │                    ▼
              │           ┌──────────────┐
   pause()   │           │  COMPLETING  │◄────────── completion detected
              │           │  (verify     │
              │           │   + decide)  │
              │           └──────┬───────┘
              │                  │ no — more actions needed
              │                  ▼
              │           ┌──────────────┐
              │           │   back to    │
   ──────────┘           │   OBSERVING  │
   resume()               └──────────────┘

   PAUSED ──────────────────────────────────────────► USER_DRIVING
   (agent    (user clicks ⏸)                    (user takes control)
    paused)
```

### 6.3 BrowserSupervisor States

| State | Agent | User | Allowed Transitions |
|-------|-------|------|---------------------|
| `IDLE` | blocked | can open browser | → `OBSERVING` (on open_browser) |
| `OBSERVING` | running | can pause | → `ACTING`, → `PAUSED`, → `USER_DRIVING` |
| `ACTING` | running | can pause | → `OBSERVING`, → `PAUSED`, → `USER_DRIVING` |
| `COMPLETING` | running | can pause | → `OBSERVING`, → `IDLE` (done), → `PAUSED` |
| `PAUSED` | blocked | can resume or drive | → `OBSERVING` (resume), → `USER_DRIVING` |
| `USER_DRIVING` | blocked | driving | → `OBSERVING` (user clicks Resume) |

### 6.4 ObservationPacket Schema

```typescript
interface ObservationPacket {
  session_id: string;
  turn_id: string;
  timestamp: string;           // ISO8601

  // Visual evidence
  screenshot_ref: ScreenshotRef;

  // Structural evidence
  accessibility_tree_ref: AccessibilityTreeRef;

  // Context
  window: {
    url: string | null;        // null if not detectable
    title: string | null;
    app_name: string;          // "firefox", "chrome", etc.
    geometry: { x: number; y: number; width: number; height: number };
  };

  // Console summary (errors/warnings since last action)
  console_summary: {
    errors: ConsoleEvent[];
    warnings: ConsoleEvent[];
    total_count: number;
  };

  // Network summary (failures since last action)
  network_summary: {
    failed_requests: NetworkEvent[];
    relevant_responses: NetworkEvent[];  // 4xx/5xx or relevant APIs
    total_count: number;
  };

  // Diagnostics
  diagnostics: DiagnosticReport;

  // Optional: highlighted element from last action
  last_action_element?: {
    role: string;
    name: string;
    bounds: Rect;
  };
}
```

### 6.5 Action Schema

```typescript
type BrowserAction =
  | { type: "click";          element: ElementSelector; }
  | { type: "type_text";       element: ElementSelector; text: string; }
  | { type: "scroll";          element?: ElementSelector; direction: "up" | "down" | "left" | "right"; amount: number; }
  | { type: "press_key";       key: string | string[]; }
  | { type: "navigate";        url: string; }
  | { type: "wait";            duration_ms: number; }
  | { type: "complete";        summary: string; }
  | { type: "screenshot"; }  // explicit screenshot capture

type ElementSelector =
  | { kind: "index";          index: number; }
  | { kind: "role";           role: string; name?: string; nth?: number; }
  | { kind: "xpath";          xpath: string; }
  | { kind: "coordinates";    x: number; y: number; }
```

### 6.6 Safety Checks

Before every action, BrowserSupervisor evaluates:

| Condition | Result | User Action |
|-----------|--------|-------------|
| Navigation to non-allowlisted domain | `requires_approval` | Prompt: "Allow navigation to {domain}?" |
| Click/type on credential field (password, CVV, etc.) | `blocked` | Action rejected, message shown |
| More than N consecutive same-element actions | `requires_approval` | "You're about to click {element} 5 times. Continue?" |
| Action would navigate away from target app | `requires_approval` | "This will navigate away from {app}. Continue?" |
| Browser session older than max_duration | `warning` | Log warning, continue |
| Screenshot capture failed | `error` | Log error, retry or skip |

### 6.7 Completion Detection

Completion is detected when ANY of:

1. **Explicit**: Agent calls `complete({ summary: "..." })`
2. **URL match**: Browser reached a target URL pattern
3. **Element found**: A specific element is present and matches expected state
4. **No change + steady state**: N consecutive `get_app_state` calls with identical tree and no errors
5. **Timeout**: Max steps or max time reached (configurable)

### 6.8 Recovery Handling

| Failure | Recovery |
|---------|----------|
| Browser process died | BrowserSurface shows error, user must relaunch |
| Portal session lost | Recreate Portal session, re-observe |
| AT-SPI bus unavailable | Run `setup_accessibility`, surface Doctor report |
| Screenshot capture failed | Retry 3x, then skip with diagnostic in output |
| Action returned `ok: false` | Log error, report to agent, let agent decide |
| Page auth required | Surface login URL, pause agent, request credentials |

---

## 7. PluginSystem

### 7.1 Overview

Doorway PluginSystem is the extension framework that lets plugins add: tools (MCP servers), UI panels, context providers, and browser-use skills. It replaces the need for build-time ASAR patching with a proper runtime API.

### 7.2 Plugin Manifest Schema

```typescript
interface PluginManifest {
  schema_version: "1.0";
  plugin: {
    id: string;                // unique: "doorway-browser-chrome"
    name: string;              // "Chrome Browser"
    version: string;           // "1.0.0"
    description: string;
    author?: { name: string; email?: string; };
    license?: string;
    homepage?: string;
  };

  capabilities: {
    tools?: ToolDeclaration[];
    panels?: PanelDeclaration[];
    context_providers?: ContextProviderDeclaration[];
    browser_skills?: BrowserSkillDeclaration[];
  };

  permissions: {
    filesystem: "none" | "readonly" | "readwrite";
    network: "none" | "allowlist" | "all";
    subprocesses: "none" | "allowlist" | "all";
    browser: "none" | "observation" | "automation";
  };

  evidence?: {
    auto_capture: ("screenshots" | "terminal_output" | "network_logs")[];
    retention: "session" | "persistent" | "ephemeral";
  };
}

interface ToolDeclaration {
  name: string;               // "browser_navigate"
  description: string;
  input_schema: object;      // JSON Schema
  output_schema?: object;
  dangerous?: boolean;        // requires user approval
  evidence?: {
    screenshots?: boolean;
    logs?: boolean;
    diffs?: boolean;
  };
}

interface PanelDeclaration {
  id: string;                 // "github-pr-panel"
  title: string;              // "GitHub PR"
  location: "right" | "bottom" | "tab";
  component: string;         // path or module spec
  icon?: string;
}

interface ContextProviderDeclaration {
  id: string;
  name: string;
  schema: object;             // JSON Schema for the context value
  priority?: number;          // higher = more relevant
}

interface BrowserSkillDeclaration {
  id: string;
  name: string;
  description: string;
  actions: BrowserAction[];   // actions this skill can perform
  observations: string[];     // observation types this skill consumes
}
```

### 7.3 Plugin Discovery and Loading

```
PluginDiscovery
  → Scan ~/.doorway/plugins/         (user plugins)
  → Scan {install_dir}/plugins/      (bundled plugins)
  → For each directory with plugin.json:
      → Validate schema
      → Check permissions against security policy
      → Register tools with ToolRegistry
      → Register panels with PanelRegistry
      → Register context providers with ContextRegistry
  → Emit "plugins_loaded" event
```

### 7.4 Tool Registration and Invocation

```typescript
// ToolRegistry
interface ToolRegistry {
  register(tool: ToolDeclaration, handler: ToolHandler): void;
  unregister(name: string): void;
  list(): ToolDeclaration[];
  get(name: string): ToolDeclaration | null;
}

interface ToolHandler {
  execute(params: unknown, context: ToolContext): Promise<ToolResult>;
}

interface ToolContext {
  session_id: string;
  thread_id: string;
  evidence_store: EvidenceStore;   // for screenshots, logs, diffs
  permissions: PluginPermissions;  // enforced by ToolRunner
}
```

### 7.5 Permission Enforcement

```
ToolRunner.Execute(tool_name, params, plugin_id)
  → Get ToolDeclaration from ToolRegistry
  → Get plugin manifest from PluginRegistry
  → Check: filesystem permission matches operation
  → Check: network URL is in allowlist (if network=allowlist)
  → Check: subprocess is in allowlist (if subprocesses=allowlist)
  → If dangerous tool:
      → Check if plugin has auto-approve policy
      → If not: Prompt user, create PermissionReceipt
  → Execute handler
  → Record audit event: { plugin, tool, params, result, duration_ms }
  → Return result
```

### 7.6 Error Isolation

Each plugin runs in isolation:

| Mechanism | Purpose |
|-----------|---------|
| Separate process | Plugin crash does not crash Doorway |
| Memory isolation | Plugin cannot access Doorway memory |
| Timeout | Plugin tool calls timeout after configurable limit (default 60s) |
| Quota | Plugin can be rate-limited per tool or per minute |
| Audit log | All plugin actions logged regardless of outcome |

### 7.7 Bundled Plugins

| Plugin | Purpose | Permissions |
|--------|---------|-------------|
| `browser-use` | Browser automation via CDP | `browser: automation`, `filesystem: readonly`, `network: allowlist` |
| `computer-use-linux` | Linux desktop automation via AT-SPI/Portal | `browser: none`, `filesystem: readonly`, `network: none` |
| `github` | GitHub API integration | `filesystem: readwrite`, `network: allowlist: [api.github.com]` |
| `terminal` | Terminal session management | `subprocesses: allowlist`, `filesystem: readwrite` |

---

## 8. FlightRecorder (Evidence Layer)

### 8.1 Overview

FlightRecorder is the persistent evidence store. Every agent action — browser, terminal, git — is recorded as an `ActionEvent` with references to screenshots, trees, chunks, diffs, and tests. The full evidence bundle is what gets attached to a MergeJudge review.

### 8.2 Core Types

```typescript
// Evidence References
interface ScreenshotRef {
  type: "screenshot";
  ref: string;               // storage key
  width: number;
  height: number;
  captured_at: string;       // ISO8601
  source: "browser" | "desktop" | "terminal";
}

interface AccessibilityTreeRef {
  type: "accessibility_tree";
  ref: string;               // storage key (JSON file)
  app_name: string;
  window_title: string;
  captured_at: string;
}

interface TerminalChunkRef {
  type: "terminal_chunk";
  ref: string;               // storage key
  session_id: string;
  offset: number;
  length: number;
}

interface DiffRef {
  type: "diff";
  ref: string;               // storage key
  file: string;
  before_ref?: string;       // ref to pre-action file snapshot
  after_ref?: string;        // ref to post-action file snapshot
  hunks: { start_line: number; lines: string[]; }[];
}

interface TestRef {
  type: "test_result";
  ref: string;
  test_file: string;
  test_name: string;
  passed: boolean;
  duration_ms: number;
  output?: string;            // stdout/stderr excerpt
}

interface PermissionReceipt {
  type: "permission_receipt";
  action_id: string;
  approved_at: string;
  approved_by: "user" | "auto";
  tool: string;
  params: Record<string, unknown>;
}

// Action Event
interface ActionEvent {
  id: string;                // UUID
  session_id: string;
  turn_id: string;
  agent_run_id: string;

  timestamp: string;         // ISO8601
  action: string;            // "click" | "type_text" | "navigate" | "terminal_write" | etc.
  tool: string;              // "browser.click" | "terminal.run" | etc.

  params: Record<string, unknown>;

  result: {
    ok: boolean;
    message: string;
    screenshot_ref?: ScreenshotRef;
    tree_ref?: AccessibilityTreeRef;
    console_events?: ConsoleEvent[];
    network_events?: NetworkEvent[];
    error?: string;
  };

  duration_ms: number;

  // Linkages
  diff_refs?: DiffRef[];
  test_refs?: TestRef[];
  permission_receipt?: PermissionReceipt;
}

// Evidence Bundle (exported for PR)
interface EvidenceBundle {
  schema_version: "1.0";
  bundle_id: string;
  session_id: string;
  agent_run_id: string;
  thread_id: string;

  created_at: string;
  agent_model: string;
  agent_prompt: string;

  events: ActionEvent[];

  summary: {
    total_actions: number;
    successful_actions: number;
    failed_actions: number;
    screenshots_captured: number;
    duration_seconds: number;
    console_errors: number;
    network_failures: number;
  };

  diffs: DiffRef[];
  test_results: TestRef[];
  permission_receipts: PermissionReceipt[];

  completion: {
    type: "explicit" | "url_match" | "element_found" | "steady_state" | "timeout" | "error";
    summary?: string;
    final_url?: string;
  };
}
```

### 8.3 Storage Layout

```
~/.doorway/
├── evidence/
│   ├── {session_id}/
│   │   ├── bundle.json              # EvidenceBundle manifest
│   │   ├── timeline.jsonl            # ActionEvent stream (append-only)
│   │   ├── screenshots/
│   │   │   └── {ts}_{action_id}.png
│   │   ├── trees/
│   │   │   └── {action_id}.json     # AccessibilityTree JSON
│   │   ├── terminal/
│   │   │   └── {session_id}.chunk.{offset}.bin
│   │   ├── diffs/
│   │   │   └── {diff_id}.json
│   │   ├── tests/
│   │   │   └── {test_id}.json
│   │   └── receipts/
│   │       └── {action_id}.json
│   └── index.jsonl                  # session_id → bundle_path mapping
├── plugins/
│   └── {plugin_id}/
│       ├── plugin.json
│       ├── dist/
│       └── logs/
└── config.toml
```

### 8.4 Screenshot Capture Integration

```typescript
// In BrowserSupervisor, on every get_app_state:
async function observe(): Promise<ObservationPacket> {
  const screenshot = await NativeAutomation.captureScreenshot();
  const tree = await NativeAutomation.getAccessibilityTree();

  // Persist to FlightRecorder
  const screenshot_ref = await FlightRecorder.saveScreenshot(
    screenshot,
    session_id,
    action_id
  );

  const tree_ref = await FlightRecorder.saveTree(
    tree,
    session_id,
    action_id
  );

  return {
    screenshot_ref,
    accessibility_tree_ref: tree_ref,
    ...
  };
}
```

### 8.5 Bundle Export

```typescript
// Generate PR-ready evidence bundle
async function exportBundle(session_id: string): Promise<EvidenceBundle> {
  const bundle = await FlightRecorder.getBundle(session_id);

  // Write to export directory
  const export_dir = `~/.doorway/exports/${bundle.bundle_id}/`;
  await fs.mkdir(export_dir, { recursive: true });

  // Write bundle.json
  await fs.writeFile(
    `${export_dir}/bundle.json`,
    JSON.stringify(bundle, null, 2)
  );

  // Copy screenshots
  for (const event of bundle.events) {
    if (event.result.screenshot_ref) {
      await copyScreenshot(
        event.result.screenshot_ref.ref,
        `${export_dir}/screenshots/${event.id}.png`
      );
    }
  }

  return bundle;
}
```

---

## 9. ProofPanel

### 9.1 Overview

ProofPanel is the right-side panel in Doorway that displays the flight recorder evidence for the active session. It is the primary UI for reviewing agent proof before a merge.

### 9.2 Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Proof: {session_id}                    [Export] [Replay] [✕]  │
├──────────────────────────────────────────────────────────────┤
│ Summary: 23 actions │ 21 ok │ 2 failed │ 18 screenshots     │
├──────────────────────────────────────────────────────────────┤
│ ▼ Action Timeline                                            │
│                                                              │
│ 10:23:01  🌐 get_app_state     ✓  [screenshot]             │
│ 10:23:02  🖱 click #42         ✓  [screenshot]  "Login btn" │
│ 10:23:03  ⌨ type_text #43     ✓  [screenshot]  "user@..." │
│ 10:23:04  🌐 get_app_state     ✓  [screenshot]             │
│ 10:23:05  🖱 click #44        ✓  [screenshot]  "Submit"   │
│ 10:23:06  🌐 get_app_state     ⚠  [screenshot]             │
│            └─ console: 2 errors                              │
│ 10:23:07  ⏸ paused            (user takeover)             │
│ 10:23:45  ▶ resumed                                           │
│ ...                                                           │
├──────────────────────────────────────────────────────────────┤
│ ▼ Screenshot Gallery                                         │
│  [thumb] [thumb] [thumb] [thumb] [thumb] [thumb] ...        │
├──────────────────────────────────────────────────────────────┤
│ ▼ Test Results                                               │
│  ✓ test_login.py::test_valid_login    234ms                  │
│  ✓ test_login.py::test_invalid_login  189ms                  │
│  ✗ test_form.py::test_submit          ERR: timeout          │
├──────────────────────────────────────────────────────────────┤
│ ▼ Console Errors (2)                                         │
│  [error] Refused to load: https://bad-tracker.com/...       │
│  [error] TypeError: Cannot read property 'value' of null     │
└──────────────────────────────────────────────────────────────┘
```

### 9.3 Action Timeline

- Each entry: timestamp, icon, action type, status (✓/⚠/✕), screenshot thumbnail
- Click entry → expands to show full screenshot + params + result details
- Filter bar: All | Actions | Errors | Pauses
- Search: filter by action type, element name, params
- Visual grouping: consecutive actions by same turn are grouped with a left border

### 9.4 Screenshot Gallery

- Horizontal scroll of thumbnails (120×80px)
- Click thumbnail → full-screen lightbox with zoom
- Hover → show action type + timestamp tooltip
- Comparison mode: select two screenshots → side-by-side diff view

### 9.5 Replay Mode

- Activated by "Replay" button
- Steps through ActionEvent[] one at a time
- Shows screenshot at that point, highlights acted-upon element
- Controls: |◀ ▶|▶ (step back, play, step forward), speed (1x, 2x, 4x), timeline scrubber
- ESC exits replay mode

### 9.6 CompletionCard

Shown when BrowserSupervisor transitions to `IDLE`:

```
┌─────────────────────────────────────────────────────────────┐
│ ✓ Task Complete                                             │
│                                                             │
│ Agent clicked "Submit" on the login form and verified the   │
│ success message appeared.                                   │
│                                                             │
│ 23 actions │ 18 screenshots │ 2 console errors            │
│ Duration: 47s                                               │
│                                                             │
│ [View Full Evidence]  [Export for PR]  [Merge]             │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Human Takeover Model

### 10.1 Takeover Triggers

A human takeover occurs when:

1. **User clicks ⏸ Pause** — agent pauses, user takes control
2. **Agent requests approval** — dangerous action requires user confirmation
3. **Safety check blocks** — action is blocked, user must decide
4. **Browser crashes** — agent stops, user must relaunch
5. **Agent emits `yield`** — agent explicitly yields control

### 10.2 Takeover States

```
Agent Running
    │
    ├── User clicks ⏸ ──────────► Agent Paused
    │                                   │
    │                          User drives browser
    │                                   │
    │                          User clicks ▶ ──► Agent Running
    │
    ├── Dangerous action ─────────► User Confirm Dialog
    │  (approve/deny)                  │
    │                                   ├── Approve ──► Agent Running
    │                                   └── Deny ──────► Agent Paused
    │
    └── Safety blocked ────────────► Agent Paused
                                      │
                                      │ User resolves (e.g., enters creds)
                                      │
                                      └──► User clicks ▶ ──► Agent Running
```

### 10.3 User Input Protection

When the agent is in `OBSERVING` or `ACTING` state:
- Agent sees the browser surface via screenshots only
- Agent does NOT see keyboard input as the user types it
- Password/credential fields are flagged in the accessibility tree with `sensitive: true`
- The agent cannot read the contents of `sensitive` fields

When the agent is in `PAUSED` or `USER_DRIVING`:
- Agent receives no browser observations
- User has full control

### 10.4 Takeover and Proof

- Actions taken by the user during takeover are **not** recorded as agent actions
- A `human_takeover` event is recorded: `{ type: "human_takeover", started_at, ended_at, resumed_by: "user" }`
- Screenshots during takeover are still captured but marked as `user_driven: true`
- The proof bundle shows: agent actions → takeover → agent actions → completion

---

## 11. Native Automation Layer (Linux)

### 11.1 AT-SPI2 Accessibility Tree

```typescript
interface AccessibilityNode {
  index: number;
  parent_index: number | null;
  depth: number;
  object_ref: string;         // AT-SPI object path
  role: string;               // "push_button" | "entry" | "link" | etc.
  name: string | null;
  description: string | null;
  child_count: number;
  bounds: { x: number; y: number; width: number; height: number } | null;
  states: string[];            // "focused" | "selected" | "editable" | "sensitive"
  actions: string[];           // "activate" | "edit" | "scroll" | etc.
  value: unknown;
  text: { content: string; cursor_position: number; selection: [number, number] } | null;
  sensitive: boolean;          // true if field is password/credential
}
```

**How to get the tree**: Connect to `org.a11y.atspi` D-Bus bus. Enumerate tree from root. Build parent/child relationships.

**Sensitive field detection**: Check `states` array for `sensitive`. Check `role` for `password_text` or `credential`. Check `role` for any field with `type="password"`.

### 11.2 Wayland Portal Input

**Portal selection** (in priority order):
1. `org.freedesktop.portal.RemoteDesktop` — primary Wayland input
2. `ydotool` — X11 fallback

**Portal pointer session**:
- Create via `org.freedesktop.portal.RemoteDesktop.CreateSession`
- Request pointer via `org.freedesktop.portal.RemoteDesktop.AddDevices`
- `pointer_motion` for mouse movement
- `pointer_button` for clicks
- `pointer_scroll` for scroll wheels

**Portal keyboard session**:
- Create via `org.freedesktop.portal.RemoteDesktop.CreateSession`
- Request keyboard via `org.freedesktop.portal.RemoteDesktop.AddDevices`
- `keyboard_key` for key presses

**Session caching**: Cache Portal sessions in `Arc<Mutex<Option<Session>>>`. On failure, clear and recreate.

### 11.3 Screenshot Capture

**Priority order**:
1. **GNOME Shell** — `org.gnome.Shell.Screenshot` DBus interface
2. **XDG Desktop Portal** — `org.freedesktop.portal.Screenshot`

**Capture + persist**:
```typescript
async function captureScreenshot(
  session_id: string,
  action_id: string
): Promise<ScreenshotRef> {
  // 1. Capture (try GNOME Shell, fallback Portal)
  const screenshot = await tryGnomeShellScreenshot() ?? await tryPortalScreenshot();

  // 2. Save to persistent store
  const path = `~/.doorway/evidence/${session_id}/screenshots/${Date.now()}_${action_id}.png`;
  await fs.writeFile(path, screenshot.data);

  return {
    type: "screenshot",
    ref: path,
    width: screenshot.width,
    height: screenshot.height,
    captured_at: new Date().toISOString(),
    source: screenshot.method, // "gnome-shell" | "xdg-portal"
  };
}
```

### 11.4 Window Manager Registry

Detects the active compositor and uses the appropriate backend:

| Backend | Platform | Capabilities |
|---------|----------|-------------|
| GNOME Shell Extension | GNOME | Exact window focus, window list, extension auto-install |
| GNOME Shell Introspect | GNOME | Window list only |
| COSMIC | Pop!_OS / COSMIC | Exact window focus |
| KWin | KDE Plasma | Exact window focus |
| Hyprland | Hyprland | Exact window focus |
| i3/Sway | i3 / Sway | Exact window focus |

### 11.5 Doctor Diagnostics

```typescript
interface DiagnosticReport {
  overall: "ready" | "degraded" | "unavailable";

  checks: {
    accessibility: {
      status: "ready" | "not_configured" | "error";
      message: string;
      fix?: string;  // gsettings command or URL
    };
    portal: {
      status: "ready" | "unavailable" | "error";
      message: string;
    };
    screenshot: {
      status: "ready" | "unavailable" | "error";
      message: string;
      method?: string;  // "gnome-shell" | "xdg-portal"
    };
    windowing: {
      backend: string | null;
      list_windows: "ready" | "unavailable";
      exact_focus: "ready" | "unavailable";
    };
  };

  instructions: string[];  // step-by-step fix instructions
}
```

---

## 12. User Interactions and Flows

### 12.1 Open Browser and Verify a Change

```
1. User opens Doorway workspace with a pending diff
2. User clicks "Open Browser" in BrowserSurface
3. BrowserSupervisor launches Firefox, observes initial state
4. Agent reviews the diff: "I need to verify the login form"
5. Agent navigates to login page
6. Agent types credentials (each action captured: screenshot + tree)
7. Agent clicks "Login" button
8. BrowserSupervisor observes: success message present
9. Agent calls complete({ summary: "Verified login flow" })
10. CompletionCard appears with proof summary
11. User reviews action trace in ProofPanel
12. User clicks "Export for PR" → EvidenceBundle attached to MergeJudge
```

### 12.2 Human Takes Over Mid-Flow

```
1. Agent is clicking through a form
2. BrowserSupervisor: click({ element: "Continue" })
3. Safety check: requires_approval (navigation to external domain)
4. UI pauses, shows approval dialog: "Allow navigation to docs.stripe.com?"
5. User reads the form — it looks wrong
6. User clicks ⏸ Pause instead of approve
7. Agent pauses
8. User manually fixes the form field
9. User clicks ▶ Resume
10. Agent continues from current state (fresh screenshot captured)
11. ProofPanel shows: agent actions → paused → user takeover → agent actions
```

### 12.3 Plugin Installs and Registers a Tool

```
1. User runs: doorway plugin install github-pr
2. PluginDiscovery: fetches plugin manifest from marketplace or local path
3. Manifest validated: schema version, required fields, permissions
4. Security check: browser=automation + network=allowlist → approved
5. ToolRegistry.register("github_create_pr", handler)
6. PanelRegistry.register({ id: "github-pr-panel", location: "right", ... })
7. UI: "GitHub PR panel" appears in right sidebar
8. User can now ask agent: "Create a PR for these changes"
9. Agent calls github_create_pr tool → audited → receipt created
```

### 12.4 Browser Crash Recovery

```
1. Agent is mid-flow, Browser is running
2. Browser process dies (OOM, crash, user kills it)
3. BrowserSupervisor receives: portal session error
4. BrowserSurface shows: "Browser disconnected. [Relaunch] [Open External]"
5. Agent receives: ActionOutput { ok: false, message: "Browser disconnected" }
6. Agent logs error, pauses
7. User decides: relaunch browser
8. User clicks Relaunch → Browser launches → BrowserSupervisor reconnects
9. BrowserSupervisor observes (fresh screenshot)
10. Agent continues from current URL
```

---

## 13. Edge Cases

### 13.1 Browser Not Installed

- On "Open Browser" if neither Firefox nor Chrome found: show error "No supported browser found. Please install Firefox or Chrome."
- On Linux: check for `firefox` and `google-chrome` in $PATH

### 13.2 AT-SPI Disabled

- Doctor report shows accessibility not enabled
- BrowserSurface shows warning banner with fix instructions
- User runs: `gsettings set org.gnome.desktop.interface accessibility true`
- Or: BrowserSupervisor can call `setup_accessibility` tool automatically
- If still unavailable after setup: degraded mode with screenshot-only (no tree, no element selection by index)

### 13.3 Agent in Infinite Loop

- Max steps per action type: configurable (default 50)
- Max same-element consecutive actions: 5 (triggers safety check)
- Timeout per action: 30s
- If exceeded: BrowserSupervisor pauses, shows warning, user can force-complete or kill agent

### 13.4 Multiple Browser Tabs

- BrowserSurface shows one tab at a time
- Agent can: `open_tab(url)`, `close_tab(tab_id)`, `switch_tab(tab_id)`
- Each tab has its own URL and tree state
- Action trace is per-tab

### 13.5 Network-Blocked Page

- Browser shows blocked page (uBlock, corporate filter, etc.)
- Console summary shows: `net::ERR_BLOCKED_BY_CLIENT`
- BrowserSurface shows error state with the blocked URL
- User can: whitelist the URL, disable blocker, or open external

### 13.6 Concurrent Agent Runs

- Each agent run gets a unique `agent_run_id`
- BrowserSurface is shared — only one agent can drive at a time
- If a second agent requests browser control while first is running: queue or reject
- User can explicitly pause one agent and give control to another

### 13.7 Screenshot Storage Full Disk

- Before capture: check available space (minimum 100MB)
- If low: evict oldest screenshots from this session (keep at least 10)
- If critical: emit warning, disable screenshot auto-capture for this session
- Evidence bundle still complete with tree refs (screenshots optional)

---

## 14. Security Model

### 14.1 Permission Levels

| Level | Filesystem | Network | Subprocesses | Browser |
|-------|-----------|---------|--------------|---------|
| `sandboxed` | none | none | none | none |
| `standard` | readonly | allowlist | allowlist | observation |
| `privileged` | readwrite | all | all | automation |

### 14.2 Dangerous Tool Approval

- `dangerous: true` tools require user approval before execution
- Auto-approve: user can set a policy per plugin ("trust this plugin")
- Approval prompt shows: plugin name, tool name, params (no sensitive values), risk description
- Receipt: `{ approved: true, by: "user", ts: "..." }` stored in evidence

### 14.3 Sensitive Field Protection

- AT-SPI fields with `states: ["sensitive"]` are never exposed to the agent
- The agent receives the tree WITHOUT the content of sensitive fields
- The agent can still interact with the element (click, focus) but cannot read its value
- Credential entry: agent sends `type_text` with the credential, user must approve

### 14.4 Audit Log

Every plugin action is logged:
```typescript
interface AuditEvent {
  ts: string;
  plugin_id: string;
  tool: string;
  params: Record<string, unknown>;  // sensitive values redacted
  result: "success" | "error" | "denied";
  duration_ms: number;
  permission_receipt?: string;  // ref if dangerous tool
}
```

---

## 15. Dependencies and Constraints

### 15.1 Platform Support

| Platform | Primary Automation | Fallback |
|----------|-------------------|----------|
| Linux (GNOME) | AT-SPI2 + GNOME Shell Portal | XDG Portal + ydotool |
| Linux (KDE) | AT-SPI2 + KWin Portal | XDG Portal + ydotool |
| Linux (other) | AT-SPI2 + XDG Portal | ydotool |
| macOS | Accessibility API + Apple Events | (future) |
| Windows | UI Automation (UIA) + Win32 | (future) |

### 15.2 External Dependencies

| Dependency | Purpose | License |
|-----------|---------|---------|
| `atspi` Rust crate | AT-SPI2 D-Bus access | MIT/Apache |
| `zbus` | D-Bus async | MIT |
| `screenshots` or `xcap` | Screen capture | MIT/Apache |
| `enigo` | Cross-platform input | MIT |
| CDP via `ws` | Chrome DevTools Protocol client | MIT |

### 15.3 Non-Goals (Out of Scope for Phase 7)

- Built-in video recording of browser sessions (future)
- ML-based screenshot diffing (future)
- Cross-browser sync (Firefox + Chrome simultaneously) (future)
- Mobile device emulation (future)
- Plugin marketplace with signing (Phase 8)

---

## 16. Metrics and Success Criteria

### 16.1 Functional Criteria

| Criterion | Measure |
|-----------|---------|
| Browser opens and displays real browser | User sees live screenshot, URL bar shows real URL |
| Agent can click elements | Click on element index produces AT-SPI action, browser responds |
| Every action produces screenshot | ActionEvent has screenshot_ref |
| Action trace visible in ProofPanel | ProofPanel shows timeline with thumbnails |
| Human takeover works | Pause → user drives → resume → agent continues |
| CompletionCard appears | Shown when agent calls complete |
| Plugin registers tool | New tool appears in agent's tool list |
| Evidence bundle exports | JSON bundle with all refs exported |

### 16.2 Performance Criteria

| Metric | Target |
|--------|--------|
| Browser open to first screenshot | < 3s |
| Action to screenshot capture | < 500ms |
| ProofPanel load for 100-action session | < 2s |
| Screenshot storage per action | < 500KB (JPEG at 80% quality or PNG at reasonable size) |
| Memory: BrowserSurface idle | < 200MB |

### 16.3 Safety Criteria

| Criterion | Measure |
|-----------|---------|
| Sensitive fields never read by agent | Tree excludes sensitive field content |
| Dangerous tools require approval | Denied dangerous tool = no execution, receipt stored |
| Plugin crash does not crash Doorway | Plugin in separate process |
| Browser crash is recoverable | Relaunch + reconnect in < 30s |

---

## 17. Open Questions

| Question | Status | Resolution Plan |
|----------|--------|-----------------|
| Which browser is default? | Open | User configures default browser in settings |
| Firefox vs Chrome: which to support first? | Open | Firefox first (better AT-SPI support on Linux) |
| CDP for browser observation vs AT-SPI for browser? | Open | AT-SPI is compositor-native; CDP adds DOM-specific visibility. Use both: AT-SPI for window-level, CDP for DOM-level |
| Plugin signing? | Deferred | Phase 8 — for now, local plugins only |
| Screenshot compression format? | Open | JPEG at 80% for storage efficiency; PNG for final export |
| Max session size before eviction? | Open | Configurable; default: 1000 actions or 500MB per session |
| How does MergeJudge consume EvidenceBundle? | Open | EvidenceBundle written to `~/.doorway/exports/{bundle_id}/`; MergeJudge reads from there |

---

## 18. Future Considerations (Phase 8+)

- **Video recording**: Full replay as video, not just screenshots
- **ML screenshot diffing**: Automatic visual regression detection
- **Multi-browser sync**: Firefox + Chrome in same session
- **Plugin marketplace**: Signed plugins, review system
- **Cloud evidence sync**: Optional sync to remote storage for team sharing
- **Mobile emulation**: BrowserSurface shows mobile viewport

---

## 19. Appendix: File Map

### Key Source Intelligence

| Intelligence Report | Path |
|---------------------|------|
| Computer Use Intelligence | `CODEX_INTELLIGENCE/CODEX_APP_COMPUTER_USE_INTELLIGENCE_REPORT.md` |
| Browser Use State Machine | `CODEX_INTELLIGENCE/CODEX_APP_BROWSER_USE_STATE_MACHINE.md` |
| Plugin Architecture | `CODEX_INTELLIGENCE/CODEX_APP_PLUGIN_ARCHITECTURE_REPORT.md` |
| Action Trace and Proof | `CODEX_INTELLIGENCE/CODEX_APP_ACTION_TRACE_AND_PROOF_REPORT.md` |
| Implementation Tickets | `CODEX_INTELLIGENCE/CODEX_APP_DOORWAY_IMPLEMENTATION_TICKETS.md` |

### Key Codex Source Files Referenced

| Purpose | Path |
|---------|------|
| MCP server implementation | `computer-use-linux/src/server.rs` |
| AT-SPI tree | `computer-use-linux/src/atspi_tree.rs` |
| Screenshot capture | `computer-use-linux/src/screenshot.rs` |
| Portal remote desktop | `computer-use-linux/src/remote_desktop.rs` |
| Windowing registry | `computer-use-linux/src/windowing/registry.rs` |
| Windowing backends | `computer-use-linux/src/windowing/backends/` |
| Diagnostics | `computer-use-linux/src/diagnostics.rs` |
| Chrome extension host | `computer-use-linux/src/bin/codex-chrome-extension-host.rs` |
| Update state | `updater/src/state.rs` |
| Plugin manifest | `plugins/openai-bundled/plugins/computer-use/.codex-plugin/plugin.json` |
| MCP server def | `plugins/openai-bundled/plugins/computer-use/.mcp.json` |
| ASAR patch engine | `scripts/patches/engine.js` |
| Computer Use UI patch | `scripts/patches/core/all-linux/webview/computer-use-ui/patch.js` |
| Browser annotation patch | `scripts/patches/core/all-linux/extracted-app/browser-annotation/patch.js` |
