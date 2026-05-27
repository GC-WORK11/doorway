// Rebuild node-pty and better-sqlite3 for Electron
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(__dirname, '..');
const electronRebuild = join(desktopDir, 'node_modules/.bin/electron-rebuild');

const modules = ['node-pty', 'better-sqlite3'];

for (const mod of modules) {
  try {
    execSync(`${electronRebuild} -f -w ${mod}`, { cwd: desktopDir, stdio: 'inherit' });
    console.log(`[rebuild-native] Rebuilt ${mod} for Electron`);
  } catch (err) {
    console.error(`[rebuild-native] Failed to rebuild ${mod}:`, err.message);
    process.exit(1);
  }
}

console.log('[rebuild-native] Native modules rebuilt for Electron');