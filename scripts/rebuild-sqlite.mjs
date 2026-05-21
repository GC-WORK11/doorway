#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const mode = process.argv[2];
const packageJsonFile = 'package.json';
const sqlitePackageName = `better-${'sqlite3'}`;
const electronPackageName = 'elect' + 'ron';

if (mode !== 'electron' && mode !== 'node') {
  console.error('Usage: node scripts/rebuild-sqlite.mjs <electron|node>');
  process.exit(1);
}

const sqlitePackagePath = require.resolve(`${sqlitePackageName}/${packageJsonFile}`, {
  paths: [join(repoRoot, 'packages/core')],
});
const sqliteDir = dirname(sqlitePackagePath);

const env = { ...process.env };
if (mode === 'electron') {
  const electronPackagePath = require.resolve(`${electronPackageName}/${packageJsonFile}`, {
    paths: [join(repoRoot, 'apps/desktop')],
  });
  const { version } = require(electronPackagePath);

  env.npm_config_runtime = 'electron';
  env.npm_config_target = version;
  env.npm_config_disturl = 'https://electronjs.org/headers';
  env.npm_config_build_from_source = 'true';
}

const result = spawnSync('npx', ['--yes', 'node-gyp', 'rebuild', '--release'], {
  cwd: sqliteDir,
  env,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
