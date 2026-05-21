#!/usr/bin/env node

import { spawn } from 'node:child_process';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: { ...process.env, ...(options.env ?? {}) },
      cwd: options.cwd ?? process.cwd(),
      shell: false,
    });

    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (signal) {
        resolve({ code: 1, signal });
        return;
      }
      resolve({ code: code ?? 1, signal: null });
    });
  });
}

async function rebuild(mode) {
  const result = await run('pnpm', ['sqlite:rebuild:' + mode]);
  if (result.code !== 0) {
    throw new Error(`sqlite:rebuild:${mode} failed with exit code ${result.code}`);
  }
}

let restoreQueued = false;

async function restoreNodeAbi() {
  if (restoreQueued) {
    return;
  }
  restoreQueued = true;
  try {
    await rebuild('node');
  } catch (error) {
    console.error('[desktop:view] Failed to restore Node ABI:', error);
  }
}

async function main() {
  await rebuild('electron');

  const buildResult = await run('pnpm', ['--filter', '@doorway/desktop', 'build']);
  if (buildResult.code !== 0) {
    await restoreNodeAbi();
    process.exit(buildResult.code);
  }

  const startEnv = { ELECTRON_DISABLE_SANDBOX: '1' };
  const startChild = spawn('pnpm', ['--filter', '@doorway/desktop', 'start'], {
    stdio: 'inherit',
    env: { ...process.env, ...startEnv },
    cwd: process.cwd(),
    shell: false,
  });

  const forwardSignal = (signal) => {
    if (!startChild.killed) {
      startChild.kill(signal);
    }
  };

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  startChild.on('close', async (code, signal) => {
    await restoreNodeAbi();
    process.exit(signal ? 1 : (code ?? 1));
  });
}

main().catch(async (error) => {
  console.error('[desktop:view] Failed:', error);
  await restoreNodeAbi();
  process.exit(1);
});
