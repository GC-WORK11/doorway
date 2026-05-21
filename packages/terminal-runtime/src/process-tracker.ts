import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProcessSnapshotNode } from '@doorway/protocol';

const execFileAsync = promisify(execFile);

export interface ProcessTreeCapture {
  readonly rootPid: number;
  readonly nodes: readonly ProcessSnapshotNode[];
}

export function parsePsOutput(output: string): readonly ProcessSnapshotNode[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s*(.*)$/.exec(line);
      if (!match) {
        return undefined;
      }
      const [, pid, ppid, cpu, memory, command, args] = match;
      if (!pid || !ppid || !cpu || !memory || !command) {
        return undefined;
      }
      const node: ProcessSnapshotNode = {
        pid: Number(pid),
        ppid: Number(ppid),
        command,
        args: args?.trim() ?? '',
        cpuPercent: Number(cpu),
        memoryPercent: Number(memory),
      };
      return node;
    })
    .filter((node): node is ProcessSnapshotNode => node !== undefined);
}

export function filterProcessTree(
  processes: readonly ProcessSnapshotNode[],
  rootPid: number
): readonly ProcessSnapshotNode[] {
  const byParent = new Map<number, ProcessSnapshotNode[]>();
  for (const process of processes) {
    const children = byParent.get(process.ppid) ?? [];
    children.push(process);
    byParent.set(process.ppid, children);
  }

  const root = processes.find((process) => process.pid === rootPid);
  if (!root) {
    return [];
  }

  const result: ProcessSnapshotNode[] = [];
  const queue = [root];
  const seen = new Set<number>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current.pid)) {
      continue;
    }
    seen.add(current.pid);
    result.push(current);
    queue.push(...(byParent.get(current.pid) ?? []));
  }

  return result;
}

export async function captureProcessTree(rootPid: number): Promise<ProcessTreeCapture> {
  if (!Number.isInteger(rootPid) || rootPid <= 0) {
    throw new Error(`Process tree capture requires a positive pid, received ${rootPid}.`);
  }
  if (process.platform === 'win32') {
    throw new Error('Process tree capture is not implemented for Windows yet.');
  }

  const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,ppid=,pcpu=,pmem=,comm=,args=']);
  return {
    rootPid,
    nodes: filterProcessTree(parsePsOutput(stdout), rootPid),
  };
}
