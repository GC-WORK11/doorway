/**
 * Skill Loader
 * Loads SKILL.md files from plugin directories.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';

const SKILL_FILE_NAME = 'SKILL.md';
const SKILLS_DIR = 'skills';

export interface SkillDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly path: string;
  readonly content: string;
  readonly pluginId?: string;
  readonly tags: readonly string[];
  readonly triggers: readonly string[];
  readonly actions: readonly string[];
}

export interface SkillLoadResult {
  readonly success: boolean;
  readonly skill?: SkillDefinition;
  readonly error?: string;
}

export interface PluginSkillsResult {
  readonly pluginId: string;
  readonly pluginPath: string;
  readonly skills: readonly SkillDefinition[];
  readonly errors: readonly string[];
}

/**
 * Load a single SKILL.md file from a directory.
 */
export function loadSkillFromFile(skillPath: string, pluginId?: string): SkillLoadResult {
  if (!existsSync(skillPath)) {
    return {
      success: false,
      error: `Skill file not found: ${skillPath}`,
    };
  }

  let content: string;
  try {
    content = readFileSync(skillPath, 'utf8');
  } catch (err) {
    return {
      success: false,
      error: `Failed to read skill file: ${errorMessage(err)}`,
    };
  }

  const parsed = parseSkillMarkdown(content, skillPath);
  return {
    success: true,
    skill: {
      id: parsed.id ?? basename(skillPath, '.md'),
      name: parsed.name ?? basename(skillPath, '.md'),
      description: parsed.description ?? '',
      path: skillPath,
      content,
      pluginId,
      tags: parsed.tags,
      triggers: parsed.triggers,
      actions: parsed.actions,
    },
  };
}

/**
 * Load all skills from a plugin directory.
 */
export function loadSkillsFromPlugin(pluginPath: string, pluginId: string): PluginSkillsResult {
  const errors: string[] = [];
  const skills: SkillDefinition[] = [];

  // Check for skills directory
  const skillsDir = resolve(pluginPath, SKILLS_DIR);
  if (!existsSync(skillsDir)) {
    return { pluginId, pluginPath, skills: [], errors: [] };
  }

  let entries: string[];
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name);
  } catch (err) {
    return {
      pluginId,
      pluginPath,
      skills: [],
      errors: [`Failed to read skills directory: ${errorMessage(err)}`],
    };
  }

  for (const entry of entries) {
    const skillPath = resolve(skillsDir, entry);
    const result = loadSkillFromFile(skillPath, pluginId);
    if (result.success && result.skill) {
      skills.push(result.skill);
    } else if (result.error) {
      errors.push(result.error);
    }
  }

  return { pluginId, pluginPath, skills, errors };
}

/**
 * Load all skills from multiple plugin directories.
 */
export function loadAllPluginSkills(
  pluginPaths: readonly { path: string; id: string }[]
): readonly PluginSkillsResult[] {
  return pluginPaths.map((plugin) => loadSkillsFromPlugin(plugin.path, plugin.id));
}

/**
 * Find a skill by ID across all loaded plugin skills.
 */
export function findSkillById(
  skillId: string,
  pluginSkills: readonly PluginSkillsResult[]
): SkillDefinition | undefined {
  for (const pluginResult of pluginSkills) {
    const skill = pluginResult.skills.find((s) => s.id === skillId);
    if (skill) {
      return skill;
    }
  }
  return undefined;
}

/**
 * Search skills by query (matches name, description, tags, triggers, or actions).
 */
export function searchSkills(
  query: string,
  pluginSkills: readonly PluginSkillsResult[]
): readonly SkillDefinition[] {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) {
    return [];
  }

  const results: SkillDefinition[] = [];
  const seen = new Set<string>();

  for (const pluginResult of pluginSkills) {
    for (const skill of pluginResult.skills) {
      if (seen.has(skill.id)) {
        continue;
      }
      seen.add(skill.id);

      const matches =
        skill.name.toLowerCase().includes(lowerQuery) ||
        skill.description.toLowerCase().includes(lowerQuery) ||
        skill.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)) ||
        skill.triggers.some((t) => t.toLowerCase().includes(lowerQuery)) ||
        skill.actions.some((a) => a.toLowerCase().includes(lowerQuery));

      if (matches) {
        results.push(skill);
      }
    }
  }

  return results;
}

// ============================================================================
// Markdown Parsing
// ============================================================================

interface ParsedSkill {
  id?: string;
  name?: string;
  description?: string;
  tags: string[];
  triggers: string[];
  actions: string[];
}

/**
 * Parse a SKILL.md file and extract metadata.
 */
function parseSkillMarkdown(content: string, _path: string): ParsedSkill {
  const result: ParsedSkill = {
    tags: [],
    triggers: [],
    actions: [],
  };

  const lines = content.split('\n');
  let currentSection: string | null = null;
  let inFrontmatter = false;
  let frontmatterContent = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Handle YAML frontmatter
    if (trimmed === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
        continue;
      } else {
        // Parse frontmatter content
        parseFrontmatter(frontmatterContent, result);
        inFrontmatter = false;
        frontmatterContent = '';
        continue;
      }
    }

    if (inFrontmatter) {
      frontmatterContent += line + '\n';
      continue;
    }

    // Parse section headers
    if (trimmed.startsWith('# ')) {
      // Main title - use as name if not set
      if (!result.name) {
        result.name = trimmed.slice(2).trim();
      }
      continue;
    }

    if (trimmed.startsWith('## ')) {
      const sectionName = trimmed.slice(3).trim().toLowerCase();
      currentSection = sectionName;
      continue;
    }

    // Parse list items under sections
    if (trimmed.startsWith('- ') && currentSection) {
      const item = trimmed.slice(2).trim();
      if (currentSection === 'tags') {
        result.tags.push(item);
      } else if (currentSection === 'triggers') {
        result.triggers.push(item);
      } else if (currentSection === 'actions') {
        result.actions.push(item);
      }
      continue;
    }

    // Parse description from first paragraph after title
    if (!result.description && !trimmed.startsWith('#') && trimmed.length > 0 && !inFrontmatter) {
      result.description = trimmed;
    }
  }

  return result;
}

/**
 * Parse YAML frontmatter content.
 */
function parseFrontmatter(content: string, result: ParsedSkill): void {
  const lines = content.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    switch (key) {
      case 'id':
        result.id = value;
        break;
      case 'name':
        result.name = value;
        break;
      case 'description':
        result.description = value;
        break;
      case 'tags':
        result.tags = parseListValue(value);
        break;
      case 'triggers':
        result.triggers = parseListValue(value);
        break;
      case 'actions':
        result.actions = parseListValue(value);
        break;
    }
  }
}

/**
 * Parse a YAML list value (e.g., "[tag1, tag2]" or "tag1, tag2").
 */
function parseListValue(value: string): string[] {
  // Remove brackets and quotes
  const cleaned = value.replace(/[[\]"']/g, '').trim();
  if (!cleaned) return [];
  return cleaned
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
