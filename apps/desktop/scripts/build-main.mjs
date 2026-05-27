#!/usr/bin/env node
import { execSync } from 'child_process';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const desktopDir = resolve(__dirname, '..');
const srcDir = resolve(desktopDir, 'src/main');
const outDir = resolve(desktopDir, 'dist/main');

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

const files = ['index.ts'];

for (const file of files) {
  const src = resolve(srcDir, file);
  const dest = resolve(outDir, file.replace('.ts', '.cjs'));

  if (!existsSync(src)) {
    console.log(`[build-main] Skipping ${file}`);
    continue;
  }

  try {
    const cmd = [
      'npx',
      'esbuild',
      src,
      '--outfile=' + dest,
      '--platform=node',
      '--bundle',
      '--format=cjs',
      '--external:electron',
      '--external:better-sqlite3',
      '--external:node-pty',
      '--external:playwright-core',
    ];
    execSync(cmd.join(' '), { cwd: desktopDir, stdio: 'inherit' });
    console.log('[build-main] Built ' + file);
  } catch (err) {
    console.error('[build-main] Failed:', err.message);
  }
}

const preloadSrc = resolve(srcDir, 'preload.js');
const preloadDest = resolve(outDir, 'preload.cjs');
if (existsSync(preloadSrc)) {
  copyFileSync(preloadSrc, preloadDest);
  console.log('[build-main] Copied preload.js');
}

console.log('[build-main] Done');
