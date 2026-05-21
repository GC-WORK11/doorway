import { describe, it, expect } from 'vitest';
import {
  parsePluginManifest,
  parsePluginManifestSync,
  getPluginManifestPath,
  pluginCapabilities,
  pluginSkillIds,
  pluginMcpServerIds,
  type DoorwayPluginManifest,
} from './plugin-manifest.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

describe('parsePluginManifestSync', () => {
  it('parses a minimal valid manifest', () => {
    const manifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      capabilities: ['tool'],
      permissions: {},
    };
    const result = parsePluginManifestSync(JSON.stringify(manifest));
    expect(result.errors).toHaveLength(0);
    expect(result.manifest).not.toBeNull();
    expect(result.manifest!.id).toBe('test-plugin');
    expect(result.manifest!.name).toBe('Test Plugin');
    expect(result.manifest!.version).toBe('1.0.0');
    expect(result.manifest!.capabilities).toEqual(['tool']);
  });

  it('parses a full valid manifest with all fields', () => {
    const manifest = {
      id: 'full-plugin',
      name: 'Full Plugin',
      version: '2.0.0',
      description: 'A plugin with everything',
      author: 'Test Author',
      homepage: 'https://example.com',
      license: 'MIT',
      capabilities: ['tool', 'connector', 'panel'],
      skills: [
        { id: 'skill-1', path: './skills/test', name: 'Test Skill' },
      ],
      connectors: [
        { id: 'conn-1', type: 'oauth', name: 'OAuth Connector' },
      ],
      mcpServers: [
        { id: 'mcp-1', name: 'MCP Server', command: 'npx', args: ['mcp-server'] },
      ],
      hooks: [
        { id: 'hook-1', name: 'Test Hook', event: 'thread.created', action: { type: 'shell', command: 'echo test' } },
      ],
      panels: [
        { id: 'panel-1', name: 'Test Panel', surface: 'thread', path: './panel.tsx' },
      ],
      permissions: {
        filesystem: { read: ['/tmp'], write: ['/tmp'] },
        network: { allowed_hosts: ['api.example.com'] },
        process: { allowed_commands: ['curl'] },
      },
      entry: { command: 'node', args: ['index.js'] },
    };
    const result = parsePluginManifestSync(JSON.stringify(manifest));
    expect(result.errors).toHaveLength(0);
    expect(result.manifest).not.toBeNull();
    expect(result.manifest!.description).toBe('A plugin with everything');
    expect(result.manifest!.author).toBe('Test Author');
    expect(result.manifest!.skills).toHaveLength(1);
    expect(result.manifest!.connectors).toHaveLength(1);
    expect(result.manifest!.mcpServers).toHaveLength(1);
    expect(result.manifest!.hooks).toHaveLength(1);
    expect(result.manifest!.panels).toHaveLength(1);
    expect(result.manifest!.permissions.filesystem?.read).toEqual(['/tmp']);
    expect(result.manifest!.permissions.network?.allowed_hosts).toEqual(['api.example.com']);
    expect(result.manifest!.permissions.process?.allowed_commands).toEqual(['curl']);
    expect(result.manifest!.entry?.command).toBe('node');
  });

  it('returns errors for missing required fields', () => {
    const manifest = { capabilities: ['tool'] };
    const result = parsePluginManifestSync(JSON.stringify(manifest));
    expect(result.errors).toContain('Manifest id is required.');
    expect(result.errors).toContain('Manifest name is required.');
    expect(result.errors).toContain('Manifest version is required.');
    expect(result.manifest).toBeNull();
  });

  it('returns errors for invalid JSON', () => {
    const result = parsePluginManifestSync('not valid json');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.manifest).toBeNull();
  });

  it('returns errors for empty string fields', () => {
    const manifest = { id: '  ', name: '', version: '', capabilities: [] };
    const result = parsePluginManifestSync(JSON.stringify(manifest));
    expect(result.errors).toContain('Manifest id cannot be empty.');
    expect(result.errors).toContain('Manifest name cannot be empty.');
    expect(result.errors).toContain('Manifest version cannot be empty.');
    expect(result.manifest).toBeNull();
  });

  it('returns warnings for invalid array item types', () => {
    const manifest = {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      capabilities: ['tool', 123, 'skill'],
    };
    const result = parsePluginManifestSync(JSON.stringify(manifest));
    expect(result.errors).toContain('Manifest capabilities must contain only strings.');
    expect(result.manifest).toBeNull();
  });

  it('returns warnings for invalid skills items', () => {
    const manifest = {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      capabilities: ['skill'],
      skills: [
        { name: 'Missing ID' },
        null,
        'not an object',
      ],
    };
    const result = parsePluginManifestSync(JSON.stringify(manifest));
    expect(result.warnings).toContain('skills[0] must have id or path, ignoring.');
    expect(result.warnings).toContain('skills[1] must be an object, ignoring.');
    expect(result.warnings).toContain('skills[2] must be an object, ignoring.');
    expect(result.manifest!.skills).toHaveLength(0);
  });

  it('validates connector types', () => {
    const manifest = {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      capabilities: ['connector'],
      connectors: [
        { id: 'c1', type: 'invalid', name: 'Bad' },
        { id: 'c2', type: 'oauth', name: 'Good' },
      ],
    };
    const result = parsePluginManifestSync(JSON.stringify(manifest));
    expect(result.warnings).toContain('connectors[0] must have valid type, ignoring.');
    expect(result.manifest!.connectors).toHaveLength(1);
    expect(result.manifest!.connectors[0].id).toBe('c2');
  });

  it('validates mcp server has command or url', () => {
    const manifest = {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      capabilities: ['mcp'],
      mcpServers: [
        { id: 'mcp-1' },
        { id: 'mcp-2', command: 'npx' },
        { id: 'mcp-3', url: 'http://localhost:3000' },
      ],
    };
    const result = parsePluginManifestSync(JSON.stringify(manifest));
    expect(result.warnings).toContain('mcpServers[0] must have command or url, ignoring.');
    expect(result.manifest!.mcpServers).toHaveLength(2);
  });

  it('validates hook events', () => {
    const manifest = {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      capabilities: ['hook'],
      hooks: [
        { id: 'h1', event: 'invalid.event', action: { type: 'shell', command: 'echo' } },
        { id: 'h2', event: 'thread.created', action: { type: 'shell', command: 'echo' } },
      ],
    };
    const result = parsePluginManifestSync(JSON.stringify(manifest));
    expect(result.warnings).toContain('hooks[0] must have valid event, ignoring.');
    expect(result.manifest!.hooks).toHaveLength(1);
    expect(result.manifest!.hooks[0].id).toBe('h2');
  });

  it('validates hook action types', () => {
    const manifest = {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      capabilities: ['hook'],
      hooks: [
        { id: 'h1', event: 'thread.created', action: { type: 'invalid' } },
        { id: 'h2', event: 'thread.created', action: { type: 'shell', command: 'echo' } },
        { id: 'h3', event: 'thread.created', action: { type: 'http', url: 'http://example.com' } },
        { id: 'h4', event: 'thread.created', action: { type: 'prompt', prompt: 'Hello' } },
      ],
    };
    const result = parsePluginManifestSync(JSON.stringify(manifest));
    expect(result.warnings.some(w => w.includes('hooks[0]'))).toBe(true);
    expect(result.manifest!.hooks).toHaveLength(3);
  });

  it('validates panel surfaces', () => {
    const manifest = {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      capabilities: ['panel'],
      panels: [
        { id: 'p1', name: 'Bad', surface: 'invalid', path: './p.tsx' },
        { id: 'p2', name: 'Good', surface: 'thread', path: './p.tsx' },
      ],
    };
    const result = parsePluginManifestSync(JSON.stringify(manifest));
    expect(result.warnings).toContain('panels[0] must have valid surface, ignoring.');
    expect(result.manifest!.panels).toHaveLength(1);
    expect(result.manifest!.panels[0].surface).toBe('thread');
  });

  it('normalizes permissions with missing fields', () => {
    const manifest = {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      capabilities: [],
      permissions: null,
    };
    const result = parsePluginManifestSync(JSON.stringify(manifest));
    expect(result.manifest!.permissions).toEqual({ filesystem: {}, network: {}, process: {} });
  });

  it('ignores invalid permissions types', () => {
    const manifest = {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      capabilities: [],
      permissions: {
        filesystem: 'not an object',
        network: null,
      },
    };
    const result = parsePluginManifestSync(JSON.stringify(manifest));
    expect(result.warnings.some(w => w.includes('permissions.filesystem'))).toBe(true);
    expect(result.manifest!.permissions.filesystem).toEqual({});
  });

  it('validates entry configuration', () => {
    const manifest = {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      capabilities: [],
      entry: { command: 'node', args: ['server.js'], env: { NODE_ENV: 'production' } },
    };
    const result = parsePluginManifestSync(JSON.stringify(manifest));
    expect(result.errors).toHaveLength(0);
    expect(result.manifest!.entry?.command).toBe('node');
    expect(result.manifest!.entry?.args).toEqual(['server.js']);
    expect(result.manifest!.entry?.env).toEqual({ NODE_ENV: 'production' });
  });

  it('handles extension config', () => {
    const manifest = {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      capabilities: [],
      extension: {
        schema_version: '1.0',
        min_doorway_version: '2.0.0',
        experimental: { feature: true },
      },
    };
    const result = parsePluginManifestSync(JSON.stringify(manifest));
    expect(result.manifest!.extension?.schema_version).toBe('1.0');
    expect(result.manifest!.extension?.min_doorway_version).toBe('2.0.0');
  });
});

describe('getPluginManifestPath', () => {
  it('returns path to doorway.plugin.json in plugin directory', () => {
    const path = getPluginManifestPath('/my/project/.doorway/plugins/my-plugin');
    expect(path).toContain('doorway.plugin.json');
    expect(path).toContain('my-plugin');
  });
});

describe('pluginCapabilities', () => {
  it('returns capabilities array from manifest', () => {
    const manifest: DoorwayPluginManifest = {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      capabilities: ['tool', 'connector', 'panel'],
      permissions: {},
    };
    expect(pluginCapabilities(manifest)).toEqual(['tool', 'connector', 'panel']);
  });
});

describe('pluginSkillIds', () => {
  it('returns skill IDs from manifest', () => {
    const manifest: DoorwayPluginManifest = {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      capabilities: ['skill'],
      permissions: {},
      skills: [
        { id: 'skill-1', path: './skills/1' },
        { id: 'skill-2', path: './skills/2' },
      ],
    };
    expect(pluginSkillIds(manifest)).toEqual(['skill-1', 'skill-2']);
  });

  it('returns empty array when no skills', () => {
    const manifest: DoorwayPluginManifest = {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      capabilities: [],
      permissions: {},
    };
    expect(pluginSkillIds(manifest)).toEqual([]);
  });
});

describe('pluginMcpServerIds', () => {
  it('returns MCP server IDs from manifest', () => {
    const manifest: DoorwayPluginManifest = {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      capabilities: ['mcp'],
      permissions: {},
      mcpServers: [
        { id: 'mcp-1', name: 'Server 1', command: 'npx' },
        { id: 'mcp-2', name: 'Server 2', command: 'npx' },
      ],
    };
    expect(pluginMcpServerIds(manifest)).toEqual(['mcp-1', 'mcp-2']);
  });

  it('returns empty array when no mcpServers', () => {
    const manifest: DoorwayPluginManifest = {
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      capabilities: [],
      permissions: {},
    };
    expect(pluginMcpServerIds(manifest)).toEqual([]);
  });
});
