import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';

export interface TestCommands {
  test?: string;
  typecheck?: string;
  lint?: string;
  build?: string;
}

/**
 * TestCommandDiscoveryService
 *
 * Automatically detects the correct scripts to run per project/worktree.
 */
export class TestCommandDiscoveryService {
  /**
   * Scan a directory to find relevant test/verification commands.
   */
  async discover(cwd: string): Promise<TestCommands> {
    const commands: TestCommands = {};

    // 1. Scan package.json (Priority)
    const pkgPath = path.join(cwd, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
        const scripts = pkg.scripts || {};

        if (scripts.test) commands.test = 'npm test';
        if (scripts.typecheck) commands.typecheck = 'npm run typecheck';
        if (scripts.lint) commands.lint = 'npm run lint';
        if (scripts.build) commands.build = 'npm run build';

        // Check for pnpm/yarn preference
        if (existsSync(path.join(cwd, 'pnpm-lock.yaml'))) {
          if (commands.test) commands.test = 'pnpm test';
          if (commands.typecheck) commands.typecheck = 'pnpm run typecheck';
        }
      } catch (err) {
        console.warn('[Discovery] Failed to parse package.json:', err);
      }
    }

    // 2. Scan for other frameworks (Rust, Go, Python)
    if (existsSync(path.join(cwd, 'Cargo.toml'))) {
      commands.test = commands.test || 'cargo test';
      commands.build = commands.build || 'cargo build';
    }

    if (existsSync(path.join(cwd, 'go.mod'))) {
      commands.test = commands.test || 'go test ./...';
    }

    if (existsSync(path.join(cwd, 'pytest.ini')) || existsSync(path.join(cwd, 'conftest.py'))) {
      commands.test = commands.test || 'pytest';
    }

    if (existsSync(path.join(cwd, 'Makefile'))) {
      // Very speculative
    }

    return commands;
  }
}
