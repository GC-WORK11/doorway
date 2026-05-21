import type Database from 'better-sqlite3';
import { basename, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { PackageManager, ProjectId } from '@doorway/protocol';
import { NotFoundError, ValidationError } from './errors.js';
import { generateId, toISOString } from './id-gen.js';

export type ProjectMode = 'git' | 'non_git';

export interface DoorwayProject {
  readonly id: ProjectId;
  readonly path: string;
  readonly name: string;
  readonly packageManager: PackageManager;
  readonly framework?: string;
  readonly mode: ProjectMode;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OpenProjectOptions {
  readonly path: string;
  readonly name?: string;
  readonly packageManager?: PackageManager;
  readonly framework?: string;
  readonly mode?: ProjectMode;
}

export function openProject(db: Database.Database, options: OpenProjectOptions): DoorwayProject {
  const projectPath = resolve(options.path);
  if (!existsSync(projectPath)) {
    throw new ValidationError('Project path does not exist.', { path: projectPath });
  }

  const now = toISOString(new Date());
  const existing = getProjectByPath(db, projectPath);
  const mode = options.mode ?? detectProjectMode(projectPath);
  const packageManager = options.packageManager ?? detectPackageManager(projectPath);
  const name = options.name ?? basename(projectPath);

  if (existing) {
    db.prepare(
      `
      UPDATE projects
      SET name = ?, package_manager = ?, framework = ?, project_mode = ?, updated_at = ?
      WHERE id = ?
    `
    ).run(name, packageManager, options.framework ?? null, mode, now, existing.id);

    return getProject(db, existing.id);
  }

  const projectId = generateId('proj') as ProjectId;
  db.prepare(
    `
    INSERT INTO projects (id, path, name, package_manager, framework, project_mode, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(projectId, projectPath, name, packageManager, options.framework ?? null, mode, now, now);

  return getProject(db, projectId);
}

export function getProject(db: Database.Database, projectId: ProjectId): DoorwayProject {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as
    | ProjectRow
    | undefined;

  if (!row) {
    throw new NotFoundError('Project', projectId);
  }

  return rowToProject(row);
}

export function getProjectByPath(
  db: Database.Database,
  projectPath: string
): DoorwayProject | undefined {
  const resolvedPath = resolve(projectPath);
  const row = db.prepare('SELECT * FROM projects WHERE path = ?').get(resolvedPath) as
    | ProjectRow
    | undefined;

  return row ? rowToProject(row) : undefined;
}

export function listProjects(db: Database.Database): readonly DoorwayProject[] {
  const rows = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as ProjectRow[];
  return rows.map(rowToProject);
}

export function assertProjectExists(db: Database.Database, projectId: ProjectId): void {
  getProject(db, projectId);
}

function detectProjectMode(projectPath: string): ProjectMode {
  return existsSync(resolve(projectPath, '.git')) ? 'git' : 'non_git';
}

function detectPackageManager(projectPath: string): PackageManager {
  if (existsSync(resolve(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(resolve(projectPath, 'package-lock.json'))) return 'npm';
  if (existsSync(resolve(projectPath, 'yarn.lock'))) return 'yarn';
  if (existsSync(resolve(projectPath, 'bun.lockb'))) return 'bun';
  if (existsSync(resolve(projectPath, 'Cargo.toml'))) return 'cargo';
  if (existsSync(resolve(projectPath, 'poetry.lock'))) return 'poetry';
  if (existsSync(resolve(projectPath, 'requirements.txt'))) return 'pip';
  return 'unknown';
}

function rowToProject(row: ProjectRow): DoorwayProject {
  return {
    id: row.id as ProjectId,
    path: row.path,
    name: row.name,
    packageManager: row.package_manager as PackageManager,
    framework: row.framework ?? undefined,
    mode: row.project_mode as ProjectMode,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

interface ProjectRow {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly package_manager: string;
  readonly framework: string | null;
  readonly project_mode: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export class ProjectService {
  constructor(private readonly db: Database.Database) {}

  openProject(options: OpenProjectOptions): DoorwayProject {
    return openProject(this.db, options);
  }

  getProject(projectId: string): DoorwayProject {
    return getProject(this.db, projectId as ProjectId);
  }

  listProjects(): readonly DoorwayProject[] {
    return listProjects(this.db);
  }
}
