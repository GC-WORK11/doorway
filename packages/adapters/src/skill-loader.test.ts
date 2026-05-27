/**
 * Skill Loader Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import {
  loadSkillFromFile,
  loadSkillsFromPlugin,
  findSkillById,
  searchSkills,
} from './skill-loader.js';

describe('skill-loader', () => {
  const tempDirs: string[] = [];

  function createTempDir(name: string): string {
    const path = `/tmp/doorway-test-${name}-${Date.now()}`;
    mkdirSync(path, { recursive: true });
    tempDirs.push(path);
    return path;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    tempDirs.length = 0;
  });

  describe('loadSkillFromFile', () => {
    it('loads a valid SKILL.md file', () => {
      const dir = createTempDir('skill-basic');
      const skillPath = `${dir}/SKILL.md`;
      writeFileSync(
        skillPath,
        `# My Test Skill

A test skill for unit testing.

## Tags
- testing
- unit

## Triggers
- /test
- test command

## Actions
- run tests
- verify output
`
      );

      const result = loadSkillFromFile(skillPath);

      expect(result.success).toBe(true);
      expect(result.skill).toBeDefined();
      expect(result.skill!.id).toBe('SKILL');
      expect(result.skill!.name).toBe('My Test Skill');
      expect(result.skill!.description).toBe('A test skill for unit testing.');
      expect(result.skill!.tags).toEqual(['testing', 'unit']);
      expect(result.skill!.triggers).toEqual(['/test', 'test command']);
      expect(result.skill!.actions).toEqual(['run tests', 'verify output']);
      expect(result.skill!.path).toBe(skillPath);
    });

    it('returns error when file not found', () => {
      const result = loadSkillFromFile('/nonexistent/path/SKILL.md');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.skill).toBeUndefined();
    });

    it('parses YAML frontmatter correctly', () => {
      const dir = createTempDir('skill-frontmatter');
      const skillPath = `${dir}/custom-skill.md`;
      writeFileSync(
        skillPath,
        `---
id: my-custom-skill
name: Custom Skill Name
description: Skill with frontmatter
tags: [frontmatter, yaml]
triggers: [trigger1, trigger2]
actions: [action1]
---

# Custom Skill

Content here.
`
      );

      const result = loadSkillFromFile(skillPath);

      expect(result.success).toBe(true);
      expect(result.skill!.id).toBe('my-custom-skill');
      expect(result.skill!.name).toBe('Custom Skill Name');
      expect(result.skill!.description).toBe('Skill with frontmatter');
      expect(result.skill!.tags).toEqual(['frontmatter', 'yaml']);
      expect(result.skill!.triggers).toEqual(['trigger1', 'trigger2']);
      expect(result.skill!.actions).toEqual(['action1']);
    });

    it('uses file basename as id when not in frontmatter', () => {
      const dir = createTempDir('skill-noid');
      const skillPath = `${dir}/my-skill-name.md`;
      writeFileSync(skillPath, '# My Skill Name\n\nA skill without explicit id.');

      const result = loadSkillFromFile(skillPath);

      expect(result.success).toBe(true);
      expect(result.skill!.id).toBe('my-skill-name');
    });

    it('sets pluginId when provided', () => {
      const dir = createTempDir('skill-plugin');
      const skillPath = `${dir}/SKILL.md`;
      writeFileSync(skillPath, '# Plugin Skill\n\nA skill from a plugin.');

      const result = loadSkillFromFile(skillPath, 'test-plugin-id');

      expect(result.success).toBe(true);
      expect(result.skill!.pluginId).toBe('test-plugin-id');
    });
  });

  describe('loadSkillsFromPlugin', () => {
    it('loads all skills from plugin skills directory', () => {
      const dir = createTempDir('plugin-skills');
      const skillsDir = `${dir}/skills`;
      mkdirSync(skillsDir);

      writeFileSync(`${skillsDir}/skill-one.md`, '# Skill One\n\nFirst skill.');
      writeFileSync(`${skillsDir}/skill-two.md`, '# Skill Two\n\nSecond skill.');

      const result = loadSkillsFromPlugin(dir, 'test-plugin');

      expect(result.pluginId).toBe('test-plugin');
      expect(result.skills).toHaveLength(2);
      expect(result.errors).toHaveLength(0);

      const skillIds = result.skills.map((s) => s.id).sort();
      expect(skillIds).toEqual(['skill-one', 'skill-two']);
    });

    it('returns empty skills when no skills directory exists', () => {
      const dir = createTempDir('plugin-no-skills');

      const result = loadSkillsFromPlugin(dir, 'test-plugin');

      expect(result.skills).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('findSkillById', () => {
    it('finds a skill by id across multiple plugins', () => {
      const pluginSkills = [
        {
          pluginId: 'plugin-1',
          pluginPath: '/plugin-1',
          skills: [
            {
              id: 'skill-a',
              name: 'Skill A',
              description: '',
              path: '',
              content: '',
              tags: [],
              triggers: [],
              actions: [],
            },
          ],
          errors: [],
        },
        {
          pluginId: 'plugin-2',
          pluginPath: '/plugin-2',
          skills: [
            {
              id: 'skill-b',
              name: 'Skill B',
              description: '',
              path: '',
              content: '',
              tags: [],
              triggers: [],
              actions: [],
            },
            {
              id: 'skill-c',
              name: 'Skill C',
              description: '',
              path: '',
              content: '',
              tags: [],
              triggers: [],
              actions: [],
            },
          ],
          errors: [],
        },
      ];

      const found = findSkillById('skill-b', pluginSkills);
      expect(found).toBeDefined();
      expect(found!.id).toBe('skill-b');
      expect(found!.name).toBe('Skill B');
    });

    it('returns undefined when skill not found', () => {
      const pluginSkills = [
        {
          pluginId: 'plugin-1',
          pluginPath: '/plugin-1',
          skills: [
            {
              id: 'skill-a',
              name: 'Skill A',
              description: '',
              path: '',
              content: '',
              tags: [],
              triggers: [],
              actions: [],
            },
          ],
          errors: [],
        },
      ];

      const found = findSkillById('nonexistent', pluginSkills);
      expect(found).toBeUndefined();
    });
  });

  describe('searchSkills', () => {
    it('searches by name', () => {
      const pluginSkills = [
        {
          pluginId: 'plugin-1',
          pluginPath: '/plugin-1',
          skills: [
            {
              id: 'git-commit',
              name: 'Git Commit',
              description: 'Commit changes',
              path: '',
              content: '',
              tags: [],
              triggers: [],
              actions: [],
            },
            {
              id: 'git-push',
              name: 'Git Push',
              description: 'Push to remote',
              path: '',
              content: '',
              tags: [],
              triggers: [],
              actions: [],
            },
          ],
          errors: [],
        },
      ];

      const results = searchSkills('commit', pluginSkills);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('git-commit');
    });

    it('searches by description', () => {
      const pluginSkills = [
        {
          pluginId: 'plugin-1',
          pluginPath: '/plugin-1',
          skills: [
            {
              id: 'deploy',
              name: 'Deploy',
              description: 'Deploy application to production',
              path: '',
              content: '',
              tags: [],
              triggers: [],
              actions: [],
            },
          ],
          errors: [],
        },
      ];

      const results = searchSkills('production', pluginSkills);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('deploy');
    });

    it('searches by tags', () => {
      const pluginSkills = [
        {
          pluginId: 'plugin-1',
          pluginPath: '/plugin-1',
          skills: [
            {
              id: 'test-skill',
              name: 'Test Skill',
              description: '',
              path: '',
              content: '',
              tags: ['testing', 'unit'],
              triggers: [],
              actions: [],
            },
          ],
          errors: [],
        },
      ];

      const results = searchSkills('testing', pluginSkills);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('test-skill');
    });

    it('returns empty array for empty query', () => {
      const pluginSkills = [
        {
          pluginId: 'plugin-1',
          pluginPath: '/plugin-1',
          skills: [
            {
              id: 'skill',
              name: 'Skill',
              description: '',
              path: '',
              content: '',
              tags: [],
              triggers: [],
              actions: [],
            },
          ],
          errors: [],
        },
      ];

      const results = searchSkills('', pluginSkills);
      expect(results).toHaveLength(0);
    });

    it('deduplicates results', () => {
      const pluginSkills = [
        {
          pluginId: 'plugin-1',
          pluginPath: '/plugin-1',
          skills: [
            {
              id: 'dup-skill',
              name: 'Duplicate',
              description: 'Match',
              path: '',
              content: '',
              tags: [],
              triggers: [],
              actions: [],
            },
          ],
          errors: [],
        },
        {
          pluginId: 'plugin-2',
          pluginPath: '/plugin-2',
          skills: [
            {
              id: 'dup-skill',
              name: 'Duplicate',
              description: 'Match',
              path: '',
              content: '',
              tags: [],
              triggers: [],
              actions: [],
            },
          ],
          errors: [],
        },
      ];

      const results = searchSkills('Match', pluginSkills);
      expect(results).toHaveLength(1);
    });
  });
});
