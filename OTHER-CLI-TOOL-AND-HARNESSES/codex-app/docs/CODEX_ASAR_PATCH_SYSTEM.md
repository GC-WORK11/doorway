# Codex ASAR Patch System - Deep Dive

> **Purpose**: Understanding build-time modification of the Electron bundle
> **Target**: Developers working on Linux adaptation layer

---

## Overview

The ASAR patch system modifies the upstream Codex Desktop Electron bundle at **build time** without requiring source code access. It uses regex-based string replacement on minified JavaScript.

**Problem**: How do you adapt a macOS Electron app to Linux when you don't have the source code?

**Solution**: Treat the compiled bundle as a text file and use regex patterns to modify behavior.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Build Process                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Download upstream DMG                                   │
│           │                                                 │
│           ▼                                                 │
│  2. Extract app.asar from DMG                                │
│           │                                                 │
│           ▼                                                 │
│  3. asar-patch.sh runs                                      │
│           │                                                 │
│           ├──► scripts/patch-linux-window-ui.js             │
│           │         │                                        │
│           │         ▼                                        │
│           │    scripts/patches/registry.js                  │
│           │         │                                        │
│           │         ▼ (discovers all patches)               │
│           │    scripts/patches/core/**/*.js                 │
│           │                                                  │
│           └──► scripts/lib/bundled-plugins.sh               │
│                     │                                        │
│                     ▼                                        │
│               stage bundled plugins                          │
│                     │                                        │
│                     ▼                                        │
│  4. Modified app.asar packaged into .deb/.rpm               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Patch Engine

**File**: `scripts/patches/engine.js`

```javascript
/**
 * Core patch engine - applies regex transformations to source files
 */
class PatchEngine {
  constructor() {
    this.applied = [];
    this.failed = [];
  }

  /**
   * Apply a single patch descriptor
   * @param {string} source - The source code to patch
   * @param {object} patch - Patch descriptor
   * @param {object} context - Build context (distro, desktop, etc.)
   * @returns {string} Patched source
   */
  applyPatch(source, patch, context) {
    try {
      // Check if patch applies to this context
      if (patch.appliesTo && !patch.appliesTo(context)) {
        return source;
      }

      // Apply the transformation
      const result = patch.apply(source, context);

      this.applied.push({
        id: patch.id,
        phase: patch.phase,
        time: Date.now()
      });

      return result;
    } catch (error) {
      this.failed.push({
        id: patch.id,
        error: error.message
      });

      if (patch.ciPolicy === 'required-upstream') {
        throw new Error(`Required patch ${patch.id} failed: ${error.message}`);
      }

      console.warn(`Optional patch ${patch.id} failed: ${error.message}`);
      return source;
    }
  }

  /**
   * Apply all patches in order
   */
  applyAll(source, patches, context) {
    return patches.reduce((acc, patch) => {
      return this.applyPatch(acc, patch, context);
    }, source);
  }
}
```

### 2. Patch Registry

**File**: `scripts/patches/registry.js`

```javascript
/**
 * Patch registry - defines all available patches and their order
 */
const patchDescriptors = [
  // ============================================
  // Phase 1: Core infrastructure patches
  // ============================================

  // Main process patches
  require('./main-process'),
  require('./launch-actions'),

  // ============================================
  // Phase 2: Feature patches
  // ============================================

  require('./computer-use'),
  require('./chrome-plugin'),

  // ============================================
  // Phase 3: Desktop-specific patches
  // ============================================

  // Distro-specific
  ...require('./distro/ubuntu'),
  ...require('./distro/fedora'),

  // Desktop environment-specific
  ...require('./desktop/gnome'),
  ...require('./desktop/kde'),

  // ============================================
  // Phase 4: Package format patches
  // ============================================

  ...require('./package/deb'),
  ...require('./package/rpm'),
];

module.exports = { patchDescriptors };
```

### 3. Registry Structure

**File**: `scripts/patches/core/main-process.js`

```javascript
/**
 * Main process patches - electron main process bundle modifications
 */
const fs = require('fs');
const path = require('path');

// Load all main-process patches
const patchesDir = __dirname;
const mainProcessDir = path.join(patchesDir, 'main-process');

let patches = [];

// Auto-discover patches in subdirectories
if (fs.existsSync(mainProcessDir)) {
  const entries = fs.readdirSync(mainProcessDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const patchFile = path.join(mainProcessDir, entry.name, 'patch.js');
      if (fs.existsSync(patchFile)) {
        patches.push(require(patchFile));
      }
    }
  }
}

// Sort by order
patches.sort((a, b) => (a.order || 30000) - (b.order || 30000));

module.exports = patches;
```

---

## Patch Descriptor Schema

### Full Schema

```typescript
interface PatchDescriptor {
  /** Unique identifier for the patch */
  id: string;

  /**
   * Which phase to apply this patch in
   * - main-bundle: Electron main process JavaScript
   * - webview-asset: Webview HTML/CSS/JS assets
   * - extracted-app: Arbitrary files in extracted app
   */
  phase: 'main-bundle' | 'webview-asset' | 'extracted-app';

  /**
   * CI/CD policy for this patch
   * - required-upstream: Required for all builds, fail if broken
   * - optional: Apply if possible, skip on failure
   * - opt-in: Only apply if explicitly enabled
   */
  ciPolicy: 'required-upstream' | 'optional' | 'opt-in';

  /**
   * Apply order (lower numbers first)
   * Typical ranges:
   * - 10000-19999: Critical infrastructure
   * - 20000-29999: Core feature patches
   * - 30000-39999: Standard patches
   * - 40000-49999: Plugin patches
   * - 50000+: Desktop/package-specific
   */
  order: number;

  /**
   * Optional filter function to limit which builds this patch applies to
   */
  appliesTo?: (context: BuildContext) => boolean;

  /**
   * The actual transformation function
   * @param source - The source content to transform
   * @param context - Build context information
   * @returns Transformed source
   */
  apply: (source: string, context: BuildContext) => string;
}

interface BuildContext {
  distro: string;           // 'ubuntu' | 'fedora' | 'arch' | etc.
  desktop: string;          // 'gnome' | 'kde' | 'xfce' | etc.
  packageFormat: string;    // 'deb' | 'rpm' | 'pacman'
  arch: string;             // 'x64' | 'arm64'
  isCI: boolean;            // Running in CI environment
}
```

### Example: Complete Patch

```javascript
/**
 * computer-use-plugin-gate - Enables computer use plugin on Linux
 */
module.exports = {
  id: 'computer-use-plugin-gate',

  phase: 'main-bundle',

  ciPolicy: 'required-upstream',

  order: 40000,

  appliesTo(context) {
    return context.distro === 'ubuntu' ||
           context.distro === 'fedora' ||
           context.distro === 'arch';
  },

  apply(source) {
    // Pattern: Find where plugin gates are defined
    // and change installWhenMissing from !1 to !0

    const pattern = /installWhenMissing:!1(?=[,\s]*\})/g;

    const result = source.replace(pattern, (match, offset) => {
      // Verify this is the computer-use plugin gate
      const beforeMatch = source.substring(Math.max(0, offset - 200), offset);
      if (beforeMatch.includes('computer-use')) {
        console.log(`[PATCH] computer-use-plugin-gate: Found gate at ${offset}`);
        return 'installWhenMissing:!0';
      }
      return match;
    });

    return result;
  }
};
```

---

## Phase Details

### Phase: `main-bundle`

The main Electron process JavaScript bundle.

**Typical modifications**:
- IPC handler registration
- Plugin loading logic
- Window management
- Native module integration

**Example**:

```javascript
{
  phase: 'main-bundle',
  apply(source) {
    // Add new IPC channel
    source = source.replace(
      /ipcChannels\.set\('existing-channel'/,
      `ipcChannels.set('my-new-channel'
        , (event, data) => { return handleMyChannel(data); })
      ipcChannels.set('existing-channel'`
    );

    // Modify plugin loader behavior
    source = source.replace(
      /plugin\s*\.\s*load\s*\(\s*pluginConfig\s*\)/,
      `plugin.load(pluginConfig);
       // Linux: Setup additional plugin paths
       if (process.platform === 'linux') {
         setupLinuxPluginPaths(plugin);
       }`
    );

    return source;
  }
}
```

### Phase: `webview-asset`

Webview resources (HTML, CSS, JavaScript served in renderer).

**Typical modifications**:
- UI tweaks
- Feature flags
- Localization changes

**Example**:

```javascript
{
  phase: 'webview-asset',
  appliesTo(context) {
    return context.assetPath.includes('settings.html');
  },
  apply(source) {
    // Add Linux-specific UI element
    source = source.replace(
      /<div id="plugin-settings">/,
      `<div id="plugin-settings">
         <div class="linux-only-notice">
           Some features may require additional setup on Linux
         </div>`
    );
    return source;
  }
}
```

### Phase: `extracted-app`

Arbitrary files within the extracted app directory.

**Typical modifications**:
- Config files
- Info.plist equivalent
- Default resources

**Example**:

```javascript
{
  phase: 'extracted-app',
  appliesTo(context) {
    return context.filePath === 'Contents/Resources/default.cfg';
  },
  apply(source) {
    // Modify default configuration
    return source.replace(
      /linux_feature_enabled=0/,
      'linux_feature_enabled=1'
    );
  }
}
```

---

## CI Policy Behavior

### `required-upstream`

```javascript
{
  ciPolicy: 'required-upstream',
  apply(source) {
    try {
      return doPatch(source);
    } catch (e) {
      throw new Error(`FATAL: Patch ${id} is required: ${e.message}`);
    }
  }
}
```

**Behavior**:
- Must succeed or build fails
- Used for critical functionality

### `optional`

```javascript
{
  ciPolicy: 'optional',
  apply(source) {
    try {
      return doPatch(source);
    } catch (e) {
      console.warn(`[WARN] Optional patch ${id} failed: ${e.message}`);
      return source; // Return unmodified
    }
  }
}
```

**Behavior**:
- Failure is logged but build continues
- Used for non-critical enhancements

### `opt-in`

```javascript
{
  ciPolicy: 'opt-in',
  appliesTo(context) {
    // Check if feature is enabled
    const features = loadFeaturesConfig();
    return features.enabled.includes('my-feature');
  }
}
```

**Behavior**:
- Only applied when explicitly enabled
- Must succeed if applied

---

## Patch Ordering Strategy

### Order Ranges

| Range | Purpose | Example |
|-------|---------|---------|
| 10000-19999 | Critical infrastructure | Logging, error handling |
| 20000-29999 | Core features | Plugin system, IPC |
| 30000-39999 | Standard patches | Main feature adaptations |
| 40000-49999 | Plugin gates | Auto-install, enablement |
| 50000-59999 | Desktop-specific | GNOME, KDE tweaks |
| 60000+ | Package-specific | .deb, .rpm differences |

### Example: Full Ordering

```javascript
// 10000: Critical logging setup
module.exports = {
  id: 'linux-logging-init',
  order: 10000,
  // ...
};

// 20000: Core IPC handler
module.exports = {
  id: 'linux-ipc-handler',
  order: 20000,
  // ...
};

// 40000: Plugin gates
module.exports = {
  id: 'computer-use-plugin-gate',
  order: 40000,
  // ...
};

// 55000: Desktop-specific
module.exports = {
  id: 'gnome-shell-integration',
  order: 55000,
  appliesTo: (ctx) => ctx.desktop === 'gnome',
  // ...
};
```

---

## Advanced Patterns

### Pattern 1: Multi-Line Matching

```javascript
{
  apply(source) {
    // Match multi-line patterns using [\s\S] or [\d\D]
    const pattern = /const\s+pluginConfig\s*=\s*\{[\s\S]*?installWhenMissing[\s\S]*?\};/;

    return source.replace(pattern, (match) => {
      return match.replace('installWhenMissing:!1', 'installWhenMissing:!0');
    });
  }
}
```

### Pattern 2: Context-Aware Replacement

```javascript
{
  apply(source) {
    // Replace only within specific function
    const functionPattern = /function\s+loadPlugins\([\s\S]*?\)\s*\{([\s\S]*?)\n\s*\}/;

    return source.replace(functionPattern, (fullMatch, body) => {
      // Only modify inside loadPlugins
      if (body.includes('computer-use')) {
        return fullMatch.replace(
          'pluginCacheSize: 50',
          'pluginCacheSize: 100'
        );
      }
      return fullMatch;
    });
  }
}
```

### Pattern 3: Position-Based Safety

```javascript
{
  apply(source) {
    // Find specific location and inject nearby
    const marker = 'PLUGIN_REGISTRATION_MARKER';
    const markerIndex = source.indexOf(marker);

    if (markerIndex === -1) {
      throw new Error('Could not find marker');
    }

    const injectionPoint = source.indexOf('}', markerIndex);

    const newCode = `
      // Linux: Register additional plugins
      if (process.platform === 'linux') {
        registerLinuxPlugins();
      }
    `;

    return source.slice(0, injectionPoint + 1) +
           newCode +
           source.slice(injectionPoint + 1);
  }
}
```

### Pattern 4: Conditional Based on Content

```javascript
{
  apply(source) {
    let modified = false;

    const result = source.replace(
      /async\s+function\s+setupPlugin\(plugin\)\s*\{([\s\S]*?)\n\s*\}/g,
      (match, body) => {
        // Only add Linux path if not already present
        if (!body.includes('linuxPluginPath')) {
          modified = true;
          return match.replace(body, body + `
            // Linux: Add plugin search paths
            if (process.platform === 'linux') {
              plugin.searchPaths.push(linuxPluginPath);
            }
          `);
        }
        return match;
      }
    );

    if (!modified) {
      console.log('[PATCH] No modification needed for setupPlugin');
    }

    return result;
  }
}
```

---

## Debugging Patches

### Enable Verbose Logging

**File**: `scripts/patches/engine.js`

```javascript
const VERBOSE = process.env.VERBOSE_PATCH === '1';

function applyPatch(source, patch, context) {
  if (VERBOSE) {
    console.log(`[PATCH:${patch.id}] Starting`);
    console.log(`[PATCH:${patch.id}] Phase: ${patch.phase}`);
    console.log(`[PATCH:${patch.id}] Order: ${patch.order}`);
    console.log(`[PATCH:${patch.id}] CI Policy: ${patch.ciPolicy}`);
  }

  // ... apply patch

  if (VERBOSE) {
    if (success) {
      console.log(`[PATCH:${patch.id}] ✓ Applied successfully`);
    } else {
      console.log(`[PATCH:${patch.id}] ✗ Failed: ${error.message}`);
    }
  }
}
```

**Run with**:
```bash
VERBOSE_PATCH=1 ./scripts/patch-linux-window-ui.js
```

### Test Individual Patches

```javascript
// scripts/test-patch.js
const patch = require('./patches/computer-use');
const fs = require('fs');

// Load sample source
const source = fs.readFileSync('test/fixtures/app.bundle.js', 'utf8');

// Apply patch
const context = {
  distro: 'ubuntu',
  desktop: 'gnome',
  packageFormat: 'deb',
  arch: 'x64'
};

const result = patch.apply(source, context);

// Show diff
const diff = [];
for (let i = 0; i < Math.max(source.length, result.length); i++) {
  if (source[i] !== result[i]) {
    diff.push({
      position: i,
      original: source.substring(Math.max(0, i - 20), i + 20),
      modified: result.substring(Math.max(0, i - 20), i + 20)
    });
  }
}

console.log('Changes:', diff);
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Pattern doesn't match | Minified code changed | Update pattern to match current bundle |
| Replacement breaks code | Incorrect regex | Test on extracted bundle first |
| Patch not found | Not registered in registry.js | Add require() to registry |
| Phase wrong | Wrong phase specified | Verify file being modified belongs to correct phase |

---

## Integration with Linux Features

Linux features wrap ASAR patches with additional metadata:

```javascript
// linux-features/computer-use/feature.json
{
  "id": "computer-use",
  "title": "Computer Use",
  "description": "Native Linux desktop automation",
  "defaultEnabled": true,
  "entrypoints": {
    "mainBundlePatch": "./patch.js"
  }
}

// linux-features/computer-use/patch.js
module.exports = {
  id: 'feature:computer-use',
  phase: 'main-bundle',
  order: 40000,

  apply(source) {
    // Same patterns as regular patches
    return source.replace(
      /installWhenMissing:!1/,
      'installWhenMissing:!0'
    );
  }
};
```

The wrapper adds `feature:<id>:` prefix to prevent conflicts.

---

## File Locations

| Purpose | Path |
|---------|------|
| Patch engine | `scripts/patches/engine.js` |
| Patch registry | `scripts/patches/registry.js` |
| Main process patches | `scripts/patches/main-process.js` |
| Main process sub-patches | `scripts/patches/core/main-process/**/patch.js` |
| Webview patches | `scripts/patches/webview/**/*.js` |
| Distro patches | `scripts/patches/distro/<distro>/**/*.js` |
| Desktop patches | `scripts/patches/desktop/<desktop>/**/*.js` |
| Linux features | `linux-features/<feature>/patch.js` |
| Features loader | `scripts/lib/linux-features.js` |

---

## Summary

The ASAR patch system is a build-time adaptation layer that:

1. **Operates on minified JavaScript** using regex patterns
2. **Has three phases**: main-bundle, webview-asset, extracted-app
3. **Uses CI policies** to control failure behavior
4. **Supports ordering** to manage patch dependencies
5. **Integrates with Linux Features** for opt-in modules

Key insight: This is not a runtime plugin API - it's a surgical build-time modification system for adapting pre-compiled code.
