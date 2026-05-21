import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Database } from 'better-sqlite3';
import { generateId } from '@doorway/core';

const PROJECT_MEMORY_FILES = [
  'AGENTS.md',
  'DOORWAY.md',
  '.cursorrules',
  '.clauderules',
  'README.md',
] as const;

type ProjectMemoryFile = (typeof PROJECT_MEMORY_FILES)[number];

export interface MemoryItem {
  id: string;
  projectId: string;
  sourceFile: string;
  content: string;
  category: 'rule' | 'knowledge' | 'instruction';
  isActive: boolean;
}

/**
 * ProjectMemoryLoader
 *
 * Ingests project-level instruction files (AGENTS.md, DOORWAY.md, etc.) into the context.
 */
export class ProjectMemoryLoader {
  constructor(private db: Database) {}

  /**
   * Load project memory from the filesystem and store in database.
   */
  async loadProjectMemory(projectId: string, projectPath: string): Promise<void> {
    const now = new Date().toISOString();

    for (const item of await this.previewProjectMemory(projectPath)) {
      // Update or insert into project_memory_items
      this.db
        .prepare(
          `
            INSERT INTO project_memory_items (id, project_id, source_file, content, category, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(project_id, source_file) DO UPDATE SET
              content = excluded.content,
              category = excluded.category,
              is_active = 1,
              updated_at = excluded.updated_at
          `
        )
        .run(generateId('mem'), projectId, item.sourceFile, item.content, item.category, now, now);
    }
  }

  async previewProjectMemory(
    projectPath: string
  ): Promise<readonly Pick<MemoryItem, 'sourceFile' | 'content' | 'category'>[]> {
    const items: Pick<MemoryItem, 'sourceFile' | 'content' | 'category'>[] = [];

    for (const fileName of PROJECT_MEMORY_FILES) {
      const filePath = path.join(projectPath, fileName);
      try {
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          items.push({
            sourceFile: fileName,
            content: await fs.readFile(filePath, 'utf-8'),
            category: projectMemoryCategory(fileName),
          });
        }
      } catch {
        // File doesn't exist, skip
      }
    }

    return items;
  }

  async getActiveMemory(projectId: string): Promise<MemoryItem[]> {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM project_memory_items 
      WHERE project_id = ? AND is_active = 1
      ORDER BY CASE source_file
        WHEN 'AGENTS.md' THEN 1
        WHEN 'DOORWAY.md' THEN 2
        WHEN '.cursorrules' THEN 3
        WHEN '.clauderules' THEN 4
        WHEN 'README.md' THEN 5
        ELSE 6
      END, source_file
    `
      )
      .all(projectId) as any[];

    const items = rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      sourceFile: r.source_file,
      content: r.content,
      category: r.category as any,
      isActive: Boolean(r.is_active),
    }));

    // Fetch operational pattern memory
    const patterns = this.db
      .prepare(
        `
      SELECT * FROM pattern_memory_items
      WHERE project_id = ? AND occurrences >= 3
      ORDER BY occurrences DESC, last_seen_at DESC
      LIMIT 10
      `
      )
      .all(projectId) as any[];

    for (const p of patterns) {
      items.push({
        id: p.id,
        projectId: p.project_id,
        sourceFile: `Pattern Memory: ${p.pattern_key}`,
        content: `OBSERVED REPEATED PATTERN: ${p.pattern_key}\nSummary: ${p.summary}\nConfidence: ${p.confidence}\nThis command has been successfully executed ${p.occurrences} times in this repository. Prioritize using this command pattern when addressing related tasks.`,
        category: 'knowledge',
        isActive: true,
      });
    }

    return items;
  }

  /**
   * Format memory items for a prompt.
   */
  formatForPrompt(items: MemoryItem[]): string {
    if (items.length === 0) return '';

    let output = '=== PROJECT RULES & MEMORY ===\n';
    for (const item of items) {
      output += `[Source: ${item.sourceFile}]\n${item.content}\n\n`;
    }
    return output.trim();
  }
}

function projectMemoryCategory(fileName: ProjectMemoryFile): MemoryItem['category'] {
  if (fileName === 'AGENTS.md' || fileName === 'DOORWAY.md') {
    return 'instruction';
  }

  if (fileName === '.cursorrules' || fileName === '.clauderules') {
    return 'rule';
  }

  return 'knowledge';
}
