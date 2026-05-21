# Codex Desktop - Plugin & Automation System Deep Analysis

> **Source**: Analysis of `/home/govinda/analysis/codex-app/codex-desktop-linux`
> **Date**: 2026-05-18

---

## Executive Summary

The Codex Desktop Linux is a **packaging/build system** that adapts the upstream macOS Codex Desktop DMG to Linux. This repo provides:

1. **Plugin Infrastructure** via MCP (Model Context Protocol)
2. **Desktop Automation** via Computer Use (AT-SPI2/Wayland Portal)
3. **Build-time Patching** via ASAR patch system

**Critical insight**: There is NO runtime plugin API. Plugins are either MCP servers (separate processes communicating via stdio JSON-RPC) or ASAR patches (build-time regex replacements on minified JavaScript).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Codex Desktop Linux Build                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Layer 1: Upstream DMG (downloaded at build time)           │   │
│  │  - Electron app bundle (app.asar)                           │   │
│  │  - React UI components                                      │   │
│  │  - Automation/agent logic                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼ (asar-patch.sh)                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Layer 2: ASAR Patch System (build-time)                    │   │
│  │  - scripts/patches/engine.js (regex string replacement)     │   │
│  │  - scripts/patches/registry.js (patch discovery/order)     │   │
│  │  - scripts/patches/core/**/patch.js (specific patches)      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Layer 3: Bundled Plugins (MCP servers)                      │   │
│  │  - computer-use (Rust, native Linux automation)             │   │
│  │  - browser-use (Node.js, Chrome DevTools Protocol)          │   │
│  │  - chrome (Native messaging host)                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Plugin System Architecture

### 1.1 Two Plugin Layers

#### Layer 1: MCP-Based Plugins (Runtime)

| Plugin | Technology | Purpose |
|--------|------------|---------|
| `computer-use` | Rust + AT-SPI2 + Wayland Portal | Native Linux desktop automation |
| `browser-use` | Node.js + Chrome DevTools Protocol | Browser automation |
| `chrome` | Native messaging host | Chrome integration |

**Location**: `plugins/openai-bundled/plugins/`

#### Layer 2: ASAR Patches (Build-time)

**Location**: `scripts/patches/`

These modify the upstream Electron bundle via regex-based string replacement at build time.

### 1.2 Plugin Manifest Structure

Each plugin contains `.codex-plugin/plugin.json`:

```json
{
  "name": "computer-use",
  "version": "0.1.2-linux-alpha2",
  "description": "Control desktop apps on Linux from Codex through Computer Use.",
  "author": { "name": "avifenesh" },
  "license": "MIT",
  "keywords": ["computer-use", "desktop-control", "linux", "wayland", "gnome"],
  "mcpServers": "./.mcp.json",
  "interface": {
    "displayName": "Computer Use",
    "shortDescription": "Control Linux desktop apps from Codex",
    "category": "Productivity",
    "icons": [{ "path": "icon.png", "width": 128, "height": 128 }]
  }
}
```

**Key fields**:
- `mcpServers`: Path to MCP server definitions
- `interface`: UI display information (not used by Linux build)

### 1.3 MCP Server Definition

Each plugin has `.mcp.json`:

```json
{
  "mcpServers": {
    "computer-use": {
      "command": "./bin/codex-computer-use-linux",
      "args": ["mcp"],
      "cwd": "."
    }
  }
}
```

### 1.4 Plugin Discovery Flow

```
install.sh
    │
    ▼
asar-patch.sh
    │
    ├──► scripts/patch-linux-window-ui.js
    │         │
    │         ▼
    │    scripts/patches/registry.js
    │         │
    │         ▼ (discovers)
    │    scripts/patches/core/**/patch.js
    │
    └──► scripts/lib/bundled-plugins.sh
              │
              ├──► write_bundled_plugins_marketplace()
              │         │
              │         ▼
              │    stages bundled plugins from upstream DMG
              │    generates marketplace.json
              │
              └──► sync_*_bundled_plugin_cache()
                        │
                        ▼
                   ~/.codex/plugins/cache/
```

---

## 2. MCP Protocol Implementation

### 2.1 Transport Layer

**Protocol**: stdio JSON-RPC 2.0

```
Electron Main Process
       │
       │ (spawns plugin process)
       │
       ▼
┌─────────────────────────────┐
│  MCP Server Process         │
│  - computer-use (Rust)      │
│  - browser-use (Node.js)    │
│  - chrome (Native Host)     │
└─────────────────────────────┘
       │
       │◄══ JSON-RPC requests (stdin)
       │
       │══► JSON-RPC responses (stdout)
       │
       ▼
   Electron Main Process
```

### 2.2 Computer Use MCP Server

**Source**: `computer-use-linux/src/server.rs`

```rust
use rmcp::prelude::*;

// Tool declaration pattern
#[tool_router]
impl ComputerUseLinux {
    #[tool(
        name = "get_app_state",
        description = "Get screenshot and accessibility state..."
    )]
    async fn get_app_state(
        &self,
        Parameters(params): Parameters<GetAppStateParams>
    ) -> Json<GetAppStateOutput> {
        // Implementation
    }
}

// Server handler with instructions
#[tool_handler(
    name = "codex-computer-use-linux",
    version = "0.1.0",
    instructions = "Begin every turn that uses Computer Use by calling get_app_state..."
)]
impl ServerHandler for ComputerUseLinux {}
```

### 2.3 Available MCP Tools

| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `doctor` | Diagnostic report | none | `DoctorReport` |
| `setup_accessibility` | Enable GNOME accessibility | none | `SetupReport` |
| `setup_window_targeting` | Install GNOME Shell extension | none | `SetupReport` |
| `list_apps` | List running desktop apps | none | `AppList` |
| `list_windows` | List compositor windows | none | `WindowList` |
| `focused_window` | Get current keyboard focus | none | `Window` |
| `activate_window` | Focus window by selector | `ActivateWindowParams` | `ActionOutput` |
| `get_app_state` | Screenshot + accessibility tree | `GetAppStateParams` | `GetAppStateOutput` |
| `click` | Click by element/coords | `ClickParams` | `ActionOutput` |
| `perform_action` | Invoke accessibility action | `PerformActionParams` | `ActionOutput` |
| `set_value` | Set element value | `SetValueParams` | `ActionOutput` |
| `scroll` | Scroll in direction | `ScrollParams` | `ActionOutput` |
| `drag` | Drag from point to point | `DragParams` | `ActionOutput` |
| `press_key` | Press key combination | `PressKeyParams` | `ActionOutput` |
| `type_text` | Type literal text | `TypeTextParams` | `ActionOutput` |

### 2.4 ActionOutput Structure

All tool methods return structured responses (no exceptions propagate):

```rust
struct ActionOutput {
    ok: bool,           // true = action succeeded
    implemented: bool,  // true = action was implemented for this platform/backend
    action: String,    // "click" | "type_text" | etc.
    message: String,   // human-readable result or error
    received: Option<serde_json::Value>, // original params preserved
}
```

---

## 3. Computer Use Plugin - Deep Dive

### 3.1 Architecture

```
computer-use-linux/src/
├── server.rs           # MCP server implementation
├── atspi_tree.rs      # AT-SPI2 accessibility tree
├── screenshot.rs       # Screenshot capture
├── remote_desktop.rs   # Wayland Portal integration
├── windowing/
│   ├── mod.rs
│   └── registry.rs    # Window manager backend registry
└── bin/
    └── codex-chrome-extension-host.rs  # Chrome extension communication
```

### 3.2 Backend Priority Systems

#### Screenshot Capture (screenshot.rs)

1. **GNOME Shell** via `org.gnome.Shell.Screenshot` DBus
2. **XDG Desktop Portal** via `org.freedesktop.portal.Screenshot`

#### Input Injection (remote_desktop.rs)

1. **Wayland Portal** (`org.freedesktop.portal.RemoteDesktop`)
2. **ydotool** (X11 fallback)
3. **KDE Klipper** (Plasma Wayland clipboard special handling)

#### Window Management (windowing/registry.rs)

Backend priority order:
```
1. GNOME Shell Extension (exact focus, requires extension)
2. GNOME Shell Introspect (window list only, no extension)
3. COSMIC Wayland (exact focus)
4. KWin (exact focus)
5. Hyprland (exact focus)
6. i3/Sway (exact focus)
```

### 3.3 AT-SPI2 Accessibility Tree

The `atspi_tree.rs` module reads the Linux accessibility tree:

```
┌─────────────────────────────────────────┐
│  Application: gnome-terminal-server     │
│  ├─ Window: terminal@desktop             │
│  │   ├─ MenuBar                          │
│  │   │   └─ MenuItem: File               │
│  │   ├─ TerminalPane                     │
│  │   │   ├─ ScrollBar                    │
│  │   │   └─ PTY                           │
│  │   │       └─ Text: "command prompt"   │
│  │   └─ Button: Close                    │
│  └─ ...                                  │
└─────────────────────────────────────────┘
```

### 3.4 Chrome Extension Host Communication

**Binary**: `codex-chrome-extension-host`

**Communication**: Unix socket monitoring of session files

```rust
// Monitors ~/.codex/sessions/rollout*.jsonl
// Emits turnEnded after task_complete
```

---

## 4. ASAR Patch System

### 4.1 Purpose

The ASAR patch system modifies the upstream Electron bundle at **build time** using regex-based string replacement on minified JavaScript.

**Problem it solves**: Linux adaptation without access to upstream source code.

### 4.2 Patch Descriptor Schema

```javascript
{
  id: "patch-id",                      // unique identifier
  phase: "main-bundle" |               // Electron main process bundle
            "webview-asset" |           // Webview asset files
            "extracted-app",            // Arbitrary file in extracted app
  ciPolicy: "required-upstream" |      // Required for all builds
            "optional" |                // Optional, skip on failure
            "opt-in",                   // Must be explicitly enabled
  order: 30000,                        // Apply order (lower first)
  appliesTo: (context) => boolean,     // Filter by distro/desktop/etc
  apply: (source, context) => transformed_source
}
```

### 4.3 Patch Registry

**File**: `scripts/patches/registry.js`

```javascript
const patchDescriptors = [
  // Core patches
  require('./main-process'),
  require('./launch-actions'),
  require('./computer-use'),
  // ...
];
```

### 4.4 Patch Namespace Structure

```
scripts/patches/core/
├── all-linux/              # All Linux builds
│   ├── main-process/
│   │   └── computer-use/  # Computer Use main process hooks
│   └── webview/
│       └── computer-use-ui/ # Computer Use UI patches
├── distro/<id>/            # Distro-specific patches
├── package/<format>/       # Package format-specific (.deb, .rpm, .pacman)
└── desktop/<name>/         # Desktop environment-specific
```

### 4.5 Example: Computer Use Plugin Gate Patch

**File**: `scripts/patches/computer-use.js`

```javascript
{
  id: 'computer-use-plugin-gate',
  phase: 'main-bundle',
  ciPolicy: 'required-upstream',
  order: 40000,
  apply: (source) => {
    // Adds installWhenMissing:!0 flag
    // Makes plugin auto-register on first use
    return source.replace(
      /installWhenMissing:!1/,
      'installWhenMissing:!0'
    );
  }
}
```

---

## 5. Linux Features Framework

### 5.1 Overview

Opt-in feature modules that can be enabled/disabled per installation.

### 5.2 Feature Structure

```
linux-features/<feature-id>/
├── feature.json           # Metadata
├── README.md              # Documentation
├── patch.js               # (optional) main-bundle patch
├── stage.sh               # (optional) install/build hook
└── test.js                # (optional) self-contained tests
```

### 5.3 Feature Manifest Schema

```json
{
  "id": "example-feature",
  "title": "Example Linux Feature",
  "description": "Does something useful on Linux",
  "defaultEnabled": false,
  "entrypoints": {
    "mainBundlePatch": "./patch.js",
    "stageHook": "./stage.sh"
  }
}
```

### 5.4 Feature Loading

**File**: `scripts/lib/linux-features.js`

```javascript
function loadLinuxFeaturePatchDescriptors() {
  // 1. Read features.json to get enabled feature IDs
  // 2. For each feature, load feature.json manifest
  // 3. Resolve entrypoints (patchDescriptors, mainBundlePatch)
  // 4. Wrap patches with feature:<id>: namespace prefix
}
```

---

## 6. Automation System Analysis

### 6.1 What EXISTS

| Component | Location | Description |
|-----------|----------|-------------|
| MCP Tools | `computer-use-linux/src/server.rs` | 15 desktop automation tools |
| AT-SPI2 Tree | `computer-use-linux/src/atspi_tree.rs` | Accessibility tree reading |
| Screenshot | `computer-use-linux/src/screenshot.rs` | Screen capture |
| Input Injection | `computer-use-linux/src/remote_desktop.rs` | Click/type/scroll |
| Window Management | `computer-use-linux/src/windowing/` | Multi-backend window control |
| Doctor Diagnostics | `computer-use-linux/src/diagnostics.rs` | System readiness reporting |
| Update Scheduler | `updater/src/app.rs` | Update check scheduling |

### 6.2 What DOES NOT EXIST

| Component | Reason |
|-----------|--------|
| User-facing automation UI | In upstream DMG (minified) |
| Workflow trigger definitions | In upstream DMG |
| Scheduled automation execution | Not implemented |
| Browser Use plugin implementation | In upstream DMG |
| Action replay system | Not implemented |

### 6.3 Event/Trigger System

The Chrome extension host monitors:
- Session files: `~/.codex/sessions/rollout*.jsonl`
- Events: `turnEnded` emitted after `task_complete`
- Thread operations: `newThread`, `quickChat`, `thread1`-`thread9`

**These are HOST actions, not user-defined triggers.**

---

## 7. Data Flow Diagrams

### 7.1 Plugin Tool Call Flow

```
User/AI: "Click the submit button"
    │
    ▼
Electron Renderer (React UI)
    │
    ▼ (IPC)
Electron Main Process
    │
    ▼ (spawn stdio JSON-RPC process)
codex-computer-use-linux --cli mcp
    │
    ├──► screenshot.rs (capture screen)
    │         │
    │         ▼
    │    GNOME Shell DBus / XDG Portal
    │
    ├──► atspi_tree.rs (read accessibility)
    │         │
    │         ▼
    │    AT-SPI2 bus
    │
    └──► remote_desktop.rs (perform action)
              │
              ▼
         Wayland Portal / ydotool
    │
    ▼
JSON-RPC response with ActionOutput
    │
    ▼
React UI updates
```

### 7.2 Update Check Flow

```
Update Manager Daemon
    │
    ├──► config.check_interval_hours * 3600 (timer)
    │
    ▼
CheckUpstream (network call)
    │
    ▼
UpdateDetected? ──► DownloadingDmg
    │                    │
    │ No                  ▼
    │                 PreparingWorkspace
    │                    │
    ▼                    ▼
  Idle              PatchingApp (ASAR)
                         │
                         ▼
                   BuildingPackage (.deb/.rpm)
                         │
                         ▼
                   ReadyToInstall
                         │
                         ▼ (user confirms)
                   Installing
                         │
                         ▼
                   Installed
```

---

## 8. Key Files Reference

| Component | Path |
|-----------|------|
| Plugin manifest | `plugins/openai-bundled/plugins/computer-use/.codex-plugin/plugin.json` |
| MCP definition | `plugins/openai-bundled/plugins/computer-use/.mcp.json` |
| MCP server impl | `computer-use-linux/src/server.rs` |
| AT-SPI tree | `computer-use-linux/src/atspi_tree.rs` |
| Screenshot | `computer-use-linux/src/screenshot.rs` |
| Remote desktop | `computer-use-linux/src/remote_desktop.rs` |
| Window registry | `computer-use-linux/src/windowing/registry.rs` |
| Window backends | `computer-use-linux/src/windowing/backends/` |
| Chrome ext host | `computer-use-linux/src/bin/codex-chrome-extension-host.rs` |
| Diagnostics | `computer-use-linux/src/diagnostics.rs` |
| ASAR patch engine | `scripts/patches/engine.js` |
| Patch registry | `scripts/patches/registry.js` |
| Bundled plugins | `scripts/lib/bundled-plugins.sh` |
| Linux features | `scripts/lib/linux-features.js` |
| Updater app | `updater/src/app.rs` |
| Updater state | `updater/src/state.rs` |

---

## 9. Error Handling & Isolation

### 9.1 Process-Level Isolation

Each MCP server runs as a **separate OS process**:

```
Electron main process
    ├── codex-computer-use-linux (spawned, stdio JSON-RPC)
    │       └── Crash: MCP tool call returns error; next call re-spawns
    ├── codex-chrome-extension-host (spawned, Unix socket)
    │       └── Crash: Chrome integration breaks; manual restart needed
    └── browser-use plugin (spawned via Node, stdio JSON-RPC)
            └── Crash: Browser automation fails; next session re-spawns
```

### 9.2 Doctor Diagnostic System

The `doctor` tool provides user-friendly system readiness reporting:

```rust
pub struct DoctorReport {
    pub platform: PlatformReport,
    pub portals: PortalReport,
    pub accessibility: AccessibilityReport,
    pub windowing: WindowingReport,
    pub input: InputReport,
    pub readiness: ReadinessReport,
}
```

---

## 10. Architecture Insights

### 10.1 Design Principles

1. **Fault Isolation**: Each plugin is a separate process - crash of one doesn't crash others
2. **Platform Abstraction**: Multiple backends with priority order (e.g., screenshot: GNOME Shell → Portal)
3. **Build-Time Adaptation**: ASAR patches modify upstream without source access
4. **No Runtime Plugin API**: Plugins are baked in at build time
5. **Structured Errors**: All operations return ActionOutput, no exceptions propagate

### 10.2 Process Model

```
┌──────────────────────────────────────────────────────────────┐
│  Electron Main Process (single)                              │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ Webview Server  │  │ Plugin Manager  │  │ IPC Handlers│ │
│  │ (Python)        │  │ (spawns MCP)    │  │              │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
│         │                   │                    │         │
│         │                   ▼                    │         │
│         │          ┌─────────────────┐            │         │
│         │          │ MCP Server      │            │         │
│         │          │ (separate proc) │            │         │
│         │          └─────────────────┘            │         │
│         │                                          │         │
│         └──────────────────────────────────────────┘         │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │  Renderer Process (UI)     │
              │  Webview 127.0.0.1:PORT     │
              └────────────────────────────┘
```

---

## Conclusion

The Codex Desktop Linux provides:

1. **MCP-based Plugin System**: Plugins are separate processes communicating via stdio JSON-RPC
2. **Computer Use**: Native Linux desktop automation via AT-SPI2 + Wayland Portal
3. **ASAR Patch System**: Build-time adaptation of upstream Electron bundle
4. **Linux Features Framework**: Opt-in feature modules

The actual user-facing automation features (workflow creation, triggers, schedules) are in the upstream DMG and not present in this repository.
