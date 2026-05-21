# How to Create Plugins for Codex Desktop

> **Prerequisites**: Understanding of MCP (Model Context Protocol), plugin manifest structure
> **Target**: Developers wanting to extend Codex Desktop Linux

---

## Overview

Codex Desktop uses **two plugin mechanisms**:

1. **MCP Plugins** (Runtime) - Separate processes communicating via stdio JSON-RPC
2. **ASAR Patches** (Build-time) - Regex-based modifications to Electron bundle

This guide covers both mechanisms.

---

## Part 1: Creating an MCP Plugin

### 1.1 Plugin Structure

```
my-codex-plugin/
├── .codex-plugin/
│   └── plugin.json        # Plugin manifest
├── .mcp.json              # MCP server definition
├── bin/
│   └── my-plugin          # Executable (Rust, Node, etc.)
├── icon.png               # Plugin icon (128x128)
└── README.md
```

### 1.2 Step 1: Create Plugin Manifest

**File**: `.codex-plugin/plugin.json`

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "Description of what my plugin does",
  "author": { "name": "Your Name" },
  "license": "MIT",
  "keywords": ["automation", "linux", "custom"],
  "mcpServers": "./.mcp.json",
  "interface": {
    "displayName": "My Plugin",
    "shortDescription": "Does something useful",
    "category": "Productivity",
    "icons": [{ "path": "icon.png", "width": 128, "height": 128 }]
  }
}
```

### 1.3 Step 2: Create MCP Server Definition

**File**: `.mcp.json`

```json
{
  "mcpServers": {
    "my-plugin": {
      "command": "./bin/my-plugin",
      "args": ["mcp"],
      "cwd": "."
    }
  }
}
```

### 1.4 Step 3: Implement MCP Server

#### Option A: Rust Implementation

**Add dependencies** to `Cargo.toml`:

```toml
[dependencies]
rmcp = "0.8"
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1", features = ["full"] }
```

**Create server** (`src/main.rs`):

```rust
use rmcp::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct MyParams {
    pub arg1: String,
    pub arg2: Option<i32>,
}

#[derive(Serialize, Deserialize)]
struct MyOutput {
    pub ok: bool,
    pub message: String,
    pub result: Option<serde_json::Value>,
}

// Tool router macro
#[tool_router]
impl MyPlugin {
    #[tool(
        name = "do_something",
        description = "Does something useful with the given parameters"
    )]
    async fn do_something(
        &self,
        Parameters(params): Parameters<MyParams>
    ) -> Json<MyOutput> {
        Json(MyOutput {
            ok: true,
            message: "Success".to_string(),
            result: Some(serde_json::json!({
                "processed": params.arg1,
                "count": params.arg2.unwrap_or(0)
            })),
        })
    }

    #[tool(
        name = "list_items",
        description = "List all available items"
    )]
    async fn list_items(&self) -> Json<MyOutput> {
        Json(MyOutput {
            ok: true,
            message: "Found 3 items".to_string(),
            result: Some(serde_json::json!([
                {"id": 1, "name": "Item 1"},
                {"id": 2, "name": "Item 2"},
                {"id": 3, "name": "Item 3"}
            ])),
        })
    }
}

// Server handler with instructions
#[tool_handler(
    name = "my-codex-plugin",
    version = "0.1.0",
    instructions = "Use do_something to process data, list_items to view available items..."
)]
impl ServerHandler for MyPlugin {}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    MyPlugin::default()
        .serve(rmcp::transport::stdio())
        .await?
        .waiting()
        .await?;
    Ok(())
}
```

#### Option B: Node.js Implementation

**Package setup** (`package.json`):

```json
{
  "name": "my-codex-plugin",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0"
  }
}
```

**Create server** (`src/server.mjs`):

```javascript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  {
    name: 'my-codex-plugin',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool handlers
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'do_something',
        description: 'Does something useful',
        inputSchema: {
          type: 'object',
          properties: {
            arg1: { type: 'string', description: 'First argument' },
            arg2: { type: 'number', description: 'Second argument' },
          },
        },
      },
    ],
  };
});

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'do_something') {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: true,
            message: 'Success',
            result: { processed: args.arg1, count: args.arg2 },
          }),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

### 1.5 Step 4: Build and Test

**Build the plugin**:

```bash
# Rust
cargo build --release
cp target/release/my-plugin ./bin/my-plugin

# Node.js
npm install
npm run build
```

**Test locally**:

```bash
# Test MCP protocol directly
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | ./bin/my-plugin mcp
```

### 1.6 Step 5: Integrate with Codex Build

**Stage the plugin** (in `scripts/lib/bundled-plugins.sh`):

```bash
# Add after existing plugin staging
sync_my_plugin_bundled_plugin_cache() {
    local cache_dir="${PLUGIN_CACHE_DIR}/my-plugin"
    mkdir -p "${cache_dir}"

    cp -r "$(pwd)/plugins/openai-bundled/plugins/my-plugin/"* "${cache_dir}/"
    chmod +x "${cache_dir}/bin/my-plugin" 2>/dev/null || true
}
```

---

## Part 2: Creating an ASAR Patch

ASAR patches modify the upstream Electron bundle at build time via regex-based string replacement.

### 2.1 When to Use ASAR Patches

- Adding Linux-specific functionality
- Fixing compatibility issues
- Enabling/disabling features
- Adding development tooling

### 2.2 Create Patch File

**Location**: `scripts/patches/core/<category>/<my-patch>.js`

**File**: `scripts/patches/core/main-process/my-feature.js`

```javascript
/**
 * my-feature - Adds my feature to main process
 */
module.exports = {
  id: 'my-feature',
  phase: 'main-bundle',  // 'main-bundle' | 'webview-asset' | 'extracted-app'
  ciPolicy: 'optional',  // 'required-upstream' | 'optional' | 'opt-in'
  order: 50000,         // Lower = applied first

  // Optional: filter by context
  appliesTo(context) {
    return context.distro === 'ubuntu' || context.distro === 'fedora';
  },

  apply(source, context) {
    // Example: Add a new IPC handler
    source = source.replace(
      /'ipc-handlers':\s*\[/,
      `'ipc-handlers': [
        {
          channel: 'my-feature:do-something',
          handler: (event, data) => { /* ... */ }
        },`
    );

    // Example: Modify existing behavior
    source = source.replace(
      /existing_function\('original-arg'\)/,
      `existing_function('modified-arg')`
    );

    return source;
  }
};
```

### 2.3 Register Patch

**File**: `scripts/patches/registry.js`

```javascript
const patchDescriptors = [
  // ... existing patches
  require('./core/main-process/my-feature'),
  // ...
];
```

### 2.4 Phase Types

| Phase | Description | Use Case |
|-------|-------------|----------|
| `main-bundle` | Electron main process bundle | IPC handlers, app lifecycle |
| `webview-asset` | Webview asset files | UI modifications |
| `extracted-app` | Arbitrary file in extracted app | Config files, resources |

### 2.5 CI Policy Types

| Policy | Description |
|--------|-------------|
| `required-upstream` | Required for all builds; fail on error |
| `optional` | Optional; skip on error |
| `opt-in` | Must be explicitly enabled in features.json |

### 2.6 Debugging Patches

**Enable verbose logging** in `scripts/patches/engine.js`:

```javascript
const VERBOSE = true;

function applyPatch(source, patch, context) {
  if (VERBOSE) {
    console.log(`[PATCH] Applying: ${patch.id}`);
    console.log(`[PATCH] Phase: ${patch.phase}`);
    console.log(`[PATCH] Order: ${patch.order}`);
  }
  // ...
}
```

**Test patch manually**:

```javascript
// In scripts/patches/engine.js, add temporary test
const testPatch = require('./core/main-process/my-feature');
const result = testPatch.apply('ORIGINAL_SOURCE', { distro: 'ubuntu' });
console.log('Result:', result);
```

---

## Part 3: Creating a Linux Feature

Linux Features are opt-in modules with structured manifests.

### 3.1 Feature Structure

```
linux-features/my-feature/
├── feature.json           # Required: metadata
├── README.md              # Required: documentation
├── patch.js               # Optional: ASAR patch
├── stage.sh               # Optional: build/install hook
└── test.js                # Optional: self-contained tests
```

### 3.2 Create Feature Manifest

**File**: `linux-features/my-feature/feature.json`

```json
{
  "id": "my-feature",
  "title": "My Awesome Feature",
  "description": "Does something awesome on Linux",
  "defaultEnabled": false,
  "entrypoints": {
    "mainBundlePatch": "./patch.js",
    "stageHook": "./stage.sh"
  }
}
```

### 3.3 Create ASAR Patch (Optional)

**File**: `linux-features/my-feature/patch.js`

```javascript
module.exports = {
  id: 'feature:my-feature',
  phase: 'main-bundle',
  order: 60000,

  apply(source) {
    // Feature-specific modifications
    return source;
  }
};
```

### 3.4 Create Stage Hook (Optional)

**File**: `linux-features/my-feature/stage.sh`

```bash
#!/bin/bash
# Called during build to perform additional setup

echo "Setting up my-feature..."

# Build native dependencies
if [ -d "native-code" ]; then
    cd native-code
    cargo build --release
    cd ..
fi

# Copy binaries
mkdir -p "${STAGING_DIR}/bin"
cp -r native-code/target/release/* "${STAGING_DIR}/bin/" 2>/dev/null || true

echo "my-feature staged successfully"
```

### 3.5 Enable Feature

**File**: `linux-features/features.json`

```json
{
  "enabled": ["my-feature", "other-feature"]
}
```

---

## Part 4: MCP Tool Design Best Practices

### 4.1 Tool Naming Convention

```
verb_object
├── do_something
├── get_item_state
├── set_value
├── list_items
├── perform_action
└── check_status
```

### 4.2 Input/Output Patterns

**Pattern 1: Simple Action**

```rust
#[derive(Serialize, Deserialize)]
struct ClickParams {
    pub x: f64,
    pub y: f64,
}

#[derive(Serialize, Deserialize)]
struct ActionOutput {
    pub ok: bool,
    pub action: String,
    pub message: String,
    pub received: Option<serde_json::Value>,
}
```

**Pattern 2: Observation with Data**

```rust
#[derive(Serialize, Deserialize)]
struct GetAppStateOutput {
    pub ok: bool,
    pub screenshot: Option<String>,  // Base64
    pub accessibility_tree: Option<AccessibilityNode>,
    pub focused_window: Option<WindowInfo>,
}
```

**Pattern 3: List Response**

```rust
#[derive(Serialize, Deserialize)]
struct ListWindowsOutput {
    pub ok: bool,
    pub windows: Vec<WindowInfo>,
}
```

### 4.3 Error Handling

```rust
async fn risky_operation(&self, params: Params) -> Json<Output> {
    match self.inner.try_operation(&params).await {
        Ok(result) => Json(Output { ok: true, result }),
        Err(e) => Json(Output {
            ok: false,
            error: e.to_string(),
            ..Default::default()
        }),
    }
}
```

### 4.4 Idempotency

Tools should be safe to retry:

```rust
// Good: GET operations are naturally idempotent
async fn get_app_state(&self) -> Json<AppStateOutput>

// Caution: POST operations should track state
async fn click(&self, params: ClickParams) -> Json<ActionOutput> {
    // Track click_id to detect duplicates
    if params.click_id == self.last_click_id {
        return Json(ActionOutput {
            ok: true,
            message: "Duplicate ignored".to_string(),
            duplicate: true,
            ..Default::default()
        });
    }
    self.last_click_id = params.click_id;
    // ...
}
```

---

## Part 5: Testing Plugins

### 5.1 Unit Testing MCP Tools

**Rust** (`src/server.test.rs`):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_do_something() {
        let plugin = MyPlugin::default();
        let result = plugin.do_something(Parameters(MyParams {
            arg1: "test".to_string(),
            arg2: Some(42),
        })).await;

        assert!(result.0.ok);
        assert_eq!(result.0.message, "Success");
    }
}
```

### 5.2 Integration Testing

```bash
# Create test script
cat > test-plugin.sh << 'EOF'
#!/bin/bash
set -e

PLUGIN="./bin/my-plugin"

# Test tools/list
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | $PLUGIN mcp

# Test tools/call
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"do_something","arguments":{"arg1":"test"}}}' | $PLUGIN mcp
EOF

chmod +x test-plugin.sh
./test-plugin.sh
```

### 5.3 Test with Codex

1. Build the plugin: `cargo build --release`
2. Copy to staging: `cp -r ./bin/release/my-plugin ~/.codex/plugins/cache/my-plugin/bin/`
3. Restart Codex
4. Check `~/.codex/logs/` for errors

---

## Part 6: Plugin Distribution

### 6.1 Marketplace Entry

Create `marketplace.json` entry:

```json
{
  "plugins": [
    {
      "name": "my-plugin",
      "version": "0.1.0",
      "description": "My awesome plugin",
      "author": "Your Name",
      "categories": ["productivity"],
      "downloadUrl": "https://example.com/plugins/my-plugin.tar.gz",
      "sha256": "abc123...",
      "mcpServers": "./.mcp.json"
    }
  ]
}
```

### 6.2 Distribution Methods

1. **Bundled**: Included in Codex Desktop build (like computer-use)
2. **Marketplace**: Downloaded on first use
3. **Manual**: User copies to `~/.codex/plugins/`

### 6.3 Auto-Install Gate

Add to `plugin.json` to auto-install:

```json
{
  "installWhenMissing": true
}
```

---

## Quick Reference: File Templates

### Minimal plugin.json

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "My plugin",
  "author": { "name": "Me" },
  "mcpServers": "./.mcp.json",
  "interface": {
    "displayName": "My Plugin",
    "shortDescription": "Does stuff",
    "category": "Productivity"
  }
}
```

### Minimal .mcp.json

```json
{
  "mcpServers": {
    "my-plugin": {
      "command": "./bin/my-plugin",
      "args": ["mcp"]
    }
  }
}
```

### Minimal ASAR patch

```javascript
module.exports = {
  id: 'my-patch',
  phase: 'main-bundle',
  order: 50000,
  apply(source) {
    return source.replace(/PATTERN/, 'REPLACEMENT');
  }
};
```

### Minimal Linux feature

**feature.json**:
```json
{
  "id": "my-feature",
  "title": "My Feature",
  "description": "Does things",
  "defaultEnabled": false
}
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Plugin not loading | Check `~/.codex/logs/` for errors |
| MCP timeout | Increase timeout in `.mcp.json` |
| Patch not applying | Verify phase and order in registry |
| Icon not showing | Check icon path and size (128x128) |
| Build fails | Run with `VERBOSE=true` for debug output |
