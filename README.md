# Doorway

> Local-first desktop cockpit for visible terminal agents, git worktrees, and review/merge workflows.

## Status

| Package                     | Tests | Build | Status |
| --------------------------- | ----- | ----- | ------ |
| `@doorway/protocol`         | 18    | ✅    | Ready  |
| `@doorway/core`             | 33    | ✅    | Ready  |
| `@doorway/adapters`         | 9     | ✅    | Ready  |
| `@doorway/terminal-runtime` | 14    | ✅    | Ready  |
| `@doorway/git-engine`       | 12    | ✅    | Ready  |
| `@doorway/review-merge`     | 18    | ✅    | Ready  |
| `@doorway/handoff-capsule`  | 20    | ✅    | Ready  |
| `@doorway/orchestrator`     | 13    | ✅    | Ready  |
| `@doorway/desktop`          | 2     | ✅    | Ready  |

**Total: 139 tests passing**

## Quick Start

```bash
# Install dependencies
pnpm install

# Run all tests
pnpm test

# Build everything
pnpm build

# Run desktop app in dev mode
pnpm --filter "@doorway/desktop" dev

# Build and run Electron
cd apps/desktop
pnpm build && node scripts/build-main.mjs
npx electron dist/main/
```

## Real Architecture (Fixed)

The main process now uses **actual APIs**:

```
apps/desktop/src/main/
├── handlers.ts      # Real IPC handlers using @doorway packages
│
├── adapters.ts      # FixtureAgentAdapter (IAgentAdapter interface)
│
├── index.ts         # Electron main process entry
└── preload.js       # Context bridge

Key imports (ACTUAL, not wishful):
- @doorway/core → createDatabase(), createThread(), etc. (functions)
- @doorway/git-engine → createGitWorktree(), listDoorwayWorktrees() (functions)
- @doorway/terminal-runtime → SessionManager (CLASS)
- @doorway/protocol → generateId(), types
```

### Handler Registration (Real APIs)

```typescript
// Database - function-based API
import { createDatabase, createThread, getThread, appendMessage } from '@doorway/core';
const db = createDatabase({ dataPath: '~/.doorway/db' });
const thread = createThread(db, projectId, title, goal);

// Terminal - class-based API
import { SessionManager } from '@doorway/terminal-runtime';
const sessionManager = new SessionManager();
const session = await sessionManager.launch({ cwd });

// Git - function-based API
import { createGitWorktree, listDoorwayWorktrees } from '@doorway/git-engine';
const worktree = await createGitWorktree({ projectPath, taskId, branchName });
```

### Orchestrator (Inline)

Simplified orchestrator with `IAgentAdapter` interface:

```typescript
interface IAgentAdapter {
  provider: string;
  name: string;
  launch(context: {
    prompt: string;
    cwd?: string;
  }): Promise<{ success: boolean; sessionId: string }>;
  write(message: string): void;
  interrupt(): void;
  terminate(): void;
  onEvent(callback: (event: AgentEvent) => void): () => void;
}
```

### IPC Channels

| Channel              | Direction       | Purpose                |
| -------------------- | --------------- | ---------------------- |
| `thread:create`      | Renderer → Main | Create thread          |
| `thread:add-message` | Renderer → Main | Add message            |
| `agent:launch`       | Renderer → Main | Launch agent           |
| `agent:event`        | Main → Renderer | Stream agent events    |
| `terminal:create`    | Renderer → Main | Create terminal        |
| `terminal:data`      | Main → Renderer | Stream terminal output |

## Build Output

```
dist/
├── main/
│   ├── index.js      (14kb) - Electron main
│   ├── handlers.js    (12kb) - IPC handlers + orchestrator
│   └── preload.js    (2.5kb) - Context bridge
└── renderer/
    ├── index.html
    └── assets/
```

## Environment

- Node.js 20+
- pnpm 9+
- Electron 31+
- TypeScript 5.4+

## CI/CD

GitHub Actions in `.github/workflows/ci.yml`

## License

MIT
