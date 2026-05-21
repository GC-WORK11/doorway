import { describe, expect, it } from 'vitest';
import { filterProcessTree, parsePsOutput } from './process-tracker.js';

describe('process tracker', () => {
  it('parses ps snapshots into process nodes', () => {
    expect(
      parsePsOutput(`
        100 1 0.0 0.1 bash bash
        101 100 1.5 2.0 node node /repo/node_modules/.bin/vitest
      `)
    ).toEqual([
      {
        pid: 100,
        ppid: 1,
        cpuPercent: 0,
        memoryPercent: 0.1,
        command: 'bash',
        args: 'bash',
      },
      {
        pid: 101,
        ppid: 100,
        cpuPercent: 1.5,
        memoryPercent: 2,
        command: 'node',
        args: 'node /repo/node_modules/.bin/vitest',
      },
    ]);
  });

  it('filters a process list to the requested root and descendants', () => {
    const nodes = parsePsOutput(`
      10 1 0.0 0.1 bash bash
      11 10 0.0 0.2 pnpm pnpm test
      12 11 4.0 5.0 node node vitest
      20 1 0.0 0.1 zsh zsh
    `);

    expect(filterProcessTree(nodes, 10).map((node) => node.pid)).toEqual([10, 11, 12]);
    expect(filterProcessTree(nodes, 999)).toEqual([]);
  });
});
