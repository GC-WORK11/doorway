# Codex Desktop Plugin & Automation Documentation

Comprehensive analysis and guides for understanding and extending Codex Desktop Linux.

---

## Documents

### [1. Deep Analysis](./CODEX_PLUGINS_AUTOMATION_DEEP_ANALYSIS.md)

Complete technical analysis of:
- Two-layer plugin architecture (MCP + ASAR patches)
- MCP protocol implementation details
- Computer Use plugin architecture
- AT-SPI2 accessibility tree
- Wayland Portal integration
- Window manager backend registry
- ASAR patch system overview
- Linux Features framework

**Start here** if you want to understand how everything works.

### [2. How to Create Plugins](./CODEX_HOW_TO_CREATE_PLUGINS.md)

Step-by-step guides for:

#### MCP Plugin Creation
- Plugin manifest structure (`.codex-plugin/plugin.json`)
- MCP server definition (`.mcp.json`)
- Rust implementation with `rmcp` crate
- Node.js implementation with MCP SDK
- Tool design patterns and best practices
- Testing strategies
- Distribution methods

#### ASAR Patch Creation
- When to use ASAR patches
- Patch file structure
- Phase types (main-bundle, webview-asset, extracted-app)
- CI policy types
- Debugging techniques

#### Linux Feature Creation
- Feature manifest structure
- Optional patch.js and stage.sh hooks
- Enabling/disabling features

### [3. ASAR Patch System Deep Dive](./CODEX_ASAR_PATCH_SYSTEM.md)

In-depth reference for the build-time patch system:

- Architecture diagram
- Patch engine internals
- Patch descriptor schema (full TypeScript interface)
- Phase details with examples
- CI policy behavior
- Ordering strategy
- Advanced regex patterns
- Debugging and testing patches
- Integration with Linux Features

---

## Quick Reference

### Plugin Types

| Type | Mechanism | Runtime/Build | Example |
|------|-----------|---------------|---------|
| MCP Plugin | Separate process, stdio JSON-RPC | Runtime | computer-use, browser-use |
| ASAR Patch | Regex on minified JS | Build-time | Main process modifications |
| Linux Feature | Opt-in module | Build-time | Optional capabilities |

### Key Directories

| Component | Location |
|-----------|----------|
| Bundled plugins | `plugins/openai-bundled/plugins/` |
| MCP server (Rust) | `computer-use-linux/src/` |
| ASAR patches | `scripts/patches/` |
| Linux features | `linux-features/` |
| Build scripts | `scripts/lib/` |

### MCP Tools Available

The `computer-use` plugin provides 15 tools:
- `doctor` - Diagnostic report
- `setup_accessibility` - Enable GNOME accessibility
- `setup_window_targeting` - Install GNOME Shell extension
- `list_apps` - List running apps
- `list_windows` - List compositor windows
- `focused_window` - Get current focus
- `activate_window` - Focus window by selector
- `get_app_state` - Screenshot + accessibility tree
- `click` - Click by element/coords
- `perform_action` - Invoke accessibility action
- `set_value` - Set element value
- `scroll` - Scroll in direction
- `drag` - Drag from point to point
- `press_key` - Press key combination
- `type_text` - Type literal text

### Backend Priority

**Screenshot**: GNOME Shell DBus → XDG Portal
**Input**: Wayland Portal → ydotool → KDE Klipper
**Window Focus**: GNOME Shell Extension → GNOME Introspect → COSMIC → KWin → Hyprland → i3/Sway

---

## Architecture Summary

```
Codex Desktop Linux
├── Upstream DMG (downloaded at build)
│   └── app.asar (Electron bundle)
│
├── ASAR Patch System (build-time)
│   └── scripts/patches/
│       ├── engine.js (core patch logic)
│       ├── registry.js (patch discovery)
│       └── core/**/*.js (individual patches)
│
├── Bundled Plugins (MCP servers)
│   └── plugins/openai-bundled/plugins/
│       ├── computer-use/ (Rust, AT-SPI2)
│       ├── browser-use/ (Node, CDP)
│       └── chrome/ (Native messaging)
│
└── Linux Features (opt-in modules)
    └── linux-features/
        └── <feature>/ (feature.json + optional patch.js/stage.sh)
```

---

## Key Insights

1. **No Runtime Plugin API** - Plugins are baked in at build time or run as separate MCP processes

2. **MCP is the Plugin Protocol** - Uses stdio JSON-RPC 2.0 with proc-macro tool declarations (Rust) or SDK handlers (Node)

3. **ASAR Patches are Surgical** - Regex replacements on minified JS, not source modification

4. **Process Isolation** - Each MCP plugin is a separate OS process with its own lifecycle

5. **Backend Abstraction** - Multiple implementation backends with priority order (e.g., Wayland Portal vs ydotool)

6. **Structured Error Handling** - All MCP tools return ActionOutput, no exceptions propagate to Electron

---

## Common Tasks

### Add a new MCP tool to computer-use
1. Add `#[tool]` macro to `computer-use-linux/src/server.rs`
2. Implement the method
3. Build: `cargo build --release`
4. Test with JSON-RPC over stdio

### Create a new MCP plugin
1. Create directory structure with `.codex-plugin/plugin.json` and `.mcp.json`
2. Implement MCP server (Rust or Node)
3. Add staging logic to `scripts/lib/bundled-plugins.sh`
4. Build and test

### Create an ASAR patch
1. Create `scripts/patches/core/<category>/<name>.js`
2. Export patch descriptor with `id`, `phase`, `order`, `apply()`
3. Add to `scripts/patches/registry.js`
4. Test with extracted bundle

### Create a Linux feature
1. Create `linux-features/<name>/feature.json`
2. Add optional `patch.js` for ASAR modifications
3. Add optional `stage.sh` for build hooks
4. Enable in `linux-features/features.json`

---

## Further Reading

- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [Rust rmcp crate](https://crates.io/crates/rmcp)
- [Node MCP SDK](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [AT-SPI2 Documentation](https://developer.gnome.org/libatspi/stable/)
- [XDG Desktop Portal](https://flatpak.github.io/xdg-desktop-portal/)
