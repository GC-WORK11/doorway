/**
 * Doorway Plugin Manifest Parser
 * Parses and validates doorway.plugin.json manifest files.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ============================================================================
// Manifest Shape
// ============================================================================

export interface DoorwayPluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly author?: string;
  readonly homepage?: string;
  readonly license?: string;
  readonly capabilities: readonly string[];
  readonly skills?: readonly SkillReference[];
  readonly connectors?: readonly ConnectorReference[];
  readonly mcpServers?: readonly McpServerConfig[];
  readonly hooks?: readonly HookConfig[];
  readonly panels?: readonly PanelConfig[];
  readonly permissions: PermissionsConfig;
  readonly entry?: EntryConfig;
  readonly extension?: ExtensionConfig;
}

export interface SkillReference {
  readonly id: string;
  readonly path: string;
  readonly name?: string;
  readonly description?: string;
}

export interface ConnectorReference {
  readonly id: string;
  readonly type: 'oauth' | 'api' | 'native' | 'custom';
  readonly name: string;
  readonly description?: string;
  readonly config?: Record<string, unknown>;
}

export interface McpServerConfig {
  readonly id: string;
  readonly name: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Record<string, string>;
  readonly url?: string;
  readonly description?: string;
}

export interface HookConfig {
  readonly id: string;
  readonly name: string;
  readonly event: HookEvent;
  readonly action: HookAction;
  readonly config?: Record<string, unknown>;
}

export type HookEvent =
  | 'thread.created'
  | 'thread.status_changed'
  | 'agent_run.created'
  | 'agent_run.completed'
  | 'terminal.started'
  | 'terminal.stopped'
  | 'worktree.created'
  | 'worktree.archived'
  | 'handoff.created'
  | 'merge.started';

export interface HookAction {
  readonly type: 'shell' | 'http' | 'prompt';
  readonly command?: string;
  readonly url?: string;
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly prompt?: string;
}

export interface PanelConfig {
  readonly id: string;
  readonly name: string;
  readonly surface: 'thread' | 'evidence' | 'worktree' | 'browser' | 'settings';
  readonly path: string;
  readonly description?: string;
}

export interface PermissionsConfig {
  readonly filesystem?: {
    readonly read?: readonly string[];
    readonly write?: readonly string[];
  };
  readonly network?: {
    readonly allowed_hosts?: readonly string[];
  };
  readonly process?: {
    readonly allowed_commands?: readonly string[];
  };
}

export interface EntryConfig {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Record<string, string>;
}

export interface ExtensionConfig {
  readonly schema_version?: string;
  readonly min_doorway_version?: string;
  readonly experimental?: Record<string, unknown>;
}

// ============================================================================
// Raw Manifest (before validation)
// ============================================================================

type RawManifest = {
  readonly [key: string]: unknown;
};

// ============================================================================
// Parser
// ============================================================================

export interface ParseResult {
  readonly manifest: DoorwayPluginManifest | null;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export function parsePluginManifest(manifestPath: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(manifestPath)) {
    return {
      manifest: null,
      errors: [`Plugin manifest not found: ${manifestPath}`],
      warnings: [],
    };
  }

  let raw: RawManifest;
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as RawManifest;
  } catch (error) {
    return {
      manifest: null,
      errors: [`Invalid JSON in manifest: ${errorMessage(error)}`],
      warnings: [],
    };
  }

  // Validate required fields
  const id = validateStringField(raw.id, 'id', errors);
  const name = validateStringField(raw.name, 'name', errors);
  const version = validateStringField(raw.version, 'version', errors);
  const capabilities = validateStringArray(raw.capabilities, 'capabilities', errors);
  const permissions = validatePermissions(raw.permissions, errors, warnings);

  if (errors.length > 0) {
    return { manifest: null, errors, warnings };
  }

  const manifest: DoorwayPluginManifest = {
    id: id!,
    name: name!,
    version: version!,
    description: validateOptionalString(raw.description),
    author: validateOptionalString(raw.author),
    homepage: validateOptionalString(raw.homepage),
    license: validateOptionalString(raw.license),
    capabilities: capabilities!,
    skills: validateSkillReferences(raw.skills, warnings),
    connectors: validateConnectorReferences(raw.connectors, warnings),
    mcpServers: validateMcpServers(raw.mcpServers, warnings),
    hooks: validateHooks(raw.hooks, warnings),
    panels: validatePanels(raw.panels, warnings),
    permissions: permissions!,
    entry: validateEntry(raw.entry, errors),
    extension: validateExtension(raw.extension),
  };

  return { manifest, errors, warnings };
}

export function parsePluginManifestSync(manifestContent: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let raw: RawManifest;
  try {
    raw = JSON.parse(manifestContent) as RawManifest;
  } catch (error) {
    return {
      manifest: null,
      errors: [`Invalid JSON: ${errorMessage(error)}`],
      warnings: [],
    };
  }

  const id = validateStringField(raw.id, 'id', errors);
  const name = validateStringField(raw.name, 'name', errors);
  const version = validateStringField(raw.version, 'version', errors);
  const capabilities = validateStringArray(raw.capabilities, 'capabilities', errors);
  const permissions = validatePermissions(raw.permissions, errors, warnings);

  if (errors.length > 0) {
    return { manifest: null, errors, warnings };
  }

  const manifest: DoorwayPluginManifest = {
    id: id!,
    name: name!,
    version: version!,
    description: validateOptionalString(raw.description),
    author: validateOptionalString(raw.author),
    homepage: validateOptionalString(raw.homepage),
    license: validateOptionalString(raw.license),
    capabilities: capabilities!,
    skills: validateSkillReferences(raw.skills, warnings),
    connectors: validateConnectorReferences(raw.connectors, warnings),
    mcpServers: validateMcpServers(raw.mcpServers, warnings),
    hooks: validateHooks(raw.hooks, warnings),
    panels: validatePanels(raw.panels, warnings),
    permissions: permissions!,
    entry: validateEntry(raw.entry, errors),
    extension: validateExtension(raw.extension),
  };

  return { manifest, errors, warnings };
}

// ============================================================================
// Validation Helpers
// ============================================================================

function validateStringField(
  value: unknown,
  fieldName: string,
  errors: string[]
): string | undefined {
  if (value === undefined || value === null) {
    errors.push(`Manifest ${fieldName} is required.`);
    return undefined;
  }
  if (typeof value !== 'string') {
    errors.push(`Manifest ${fieldName} must be a string.`);
    return undefined;
  }
  if (value.trim().length === 0) {
    errors.push(`Manifest ${fieldName} cannot be empty.`);
    return undefined;
  }
  return value;
}

function validateOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return undefined;
  return value.trim().length > 0 ? value : undefined;
}

function validateStringArray(
  value: unknown,
  fieldName: string,
  errors: string[]
): readonly string[] | undefined {
  if (value === undefined || value === null) {
    errors.push(`Manifest ${fieldName} is required.`);
    return undefined;
  }
  if (!Array.isArray(value)) {
    errors.push(`Manifest ${fieldName} must be an array.`);
    return undefined;
  }
  const invalid = value.some((item) => typeof item !== 'string');
  if (invalid) {
    errors.push(`Manifest ${fieldName} must contain only strings.`);
    return undefined;
  }
  return value as readonly string[];
}

function validatePermissions(
  value: unknown,
  errors: string[],
  warnings: string[]
): PermissionsConfig | undefined {
  if (value === undefined || value === null) {
    return { filesystem: {}, network: {}, process: {} };
  }
  if (typeof value !== 'object') {
    errors.push('Manifest permissions must be an object.');
    return undefined;
  }
  const obj = value as Record<string, unknown>;

  const filesystem = validatePermissionsFilesystem(obj.filesystem, warnings);
  const network = validatePermissionsNetwork(obj.network, warnings);
  const process = validatePermissionsProcess(obj.process, warnings);

  return { filesystem, network, process };
}

function validatePermissionsFilesystem(
  value: unknown,
  warnings: string[]
): PermissionsConfig['filesystem'] {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object') {
    warnings.push('permissions.filesystem must be an object, ignoring.');
    return {};
  }
  const obj = value as Record<string, unknown>;
  return {
    read: validateOptionalStringArray(obj.read, warnings, 'permissions.filesystem.read'),
    write: validateOptionalStringArray(obj.write, warnings, 'permissions.filesystem.write'),
  };
}

function validatePermissionsNetwork(
  value: unknown,
  warnings: string[]
): PermissionsConfig['network'] {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object') {
    warnings.push('permissions.network must be an object, ignoring.');
    return {};
  }
  const obj = value as Record<string, unknown>;
  return {
    allowed_hosts: validateOptionalStringArray(
      obj.allowed_hosts,
      warnings,
      'permissions.network.allowed_hosts'
    ),
  };
}

function validatePermissionsProcess(
  value: unknown,
  warnings: string[]
): PermissionsConfig['process'] {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object') {
    warnings.push('permissions.process must be an object, ignoring.');
    return {};
  }
  const obj = value as Record<string, unknown>;
  return {
    allowed_commands: validateOptionalStringArray(
      obj.allowed_commands,
      warnings,
      'permissions.process.allowed_commands'
    ),
  };
}

function validateOptionalStringArray(
  value: unknown,
  warnings: string[],
  fieldPath: string
): readonly string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    warnings.push(`${fieldPath} must be an array, ignoring.`);
    return [];
  }
  const invalid = value.some((item) => typeof item !== 'string');
  if (invalid) {
    warnings.push(`${fieldPath} must contain only strings, ignoring invalid items.`);
    return value.filter((item): item is string => typeof item === 'string');
  }
  return value as readonly string[];
}

function validateEntry(value: unknown, errors: string[]): EntryConfig | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') {
    errors.push('Manifest entry must be an object.');
    return undefined;
  }
  const obj = value as Record<string, unknown>;
  const command = validateStringField(obj.command, 'entry.command', errors);
  if (!command) return undefined;
  return {
    command,
    args: validateOptionalStringArray(obj.args, [], 'entry.args'),
    env: validateOptionalRecord(obj.env, 'entry.env'),
  };
}

function validateOptionalRecord(
  value: unknown,
  _fieldPath: string
): Record<string, string> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      result[k] = v;
    }
  }
  return result;
}

function validateExtension(value: unknown): ExtensionConfig | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  return {
    schema_version: validateOptionalString(obj.schema_version),
    min_doorway_version: validateOptionalString(obj.min_doorway_version),
    experimental: validateOptionalRecord(obj.experimental, 'extension.experimental') as Record<
      string,
      unknown
    >,
  };
}

function validateSkillReferences(value: unknown, warnings: string[]): readonly SkillReference[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    warnings.push('skills must be an array, ignoring.');
    return [];
  }
  return value
    .map((item, index) => {
      if (typeof item !== 'object' || item === null) {
        warnings.push(`skills[${index}] must be an object, ignoring.`);
        return null;
      }
      const obj = item as Record<string, unknown>;
      const id = validateOptionalString(obj.id);
      const path = validateOptionalString(obj.path);
      if (!id && !path) {
        warnings.push(`skills[${index}] must have id or path, ignoring.`);
        return null;
      }
      return {
        id: id ?? path!,
        path: path ?? `./skills/${id}`,
        name: validateOptionalString(obj.name),
        description: validateOptionalString(obj.description),
      };
    })
    .filter((item): boolean => item !== null) as unknown as readonly SkillReference[];
}

function validateConnectorReferences(
  value: unknown,
  warnings: string[]
): readonly ConnectorReference[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    warnings.push('connectors must be an array, ignoring.');
    return [];
  }
  return value
    .map((item, index) => {
      if (typeof item !== 'object' || item === null) {
        warnings.push(`connectors[${index}] must be an object, ignoring.`);
        return null;
      }
      const obj = item as Record<string, unknown>;
      const id = validateOptionalString(obj.id);
      const type = validateConnectorType(obj.type);
      const name = validateOptionalString(obj.name);
      if (!id) {
        warnings.push(`connectors[${index}] must have id, ignoring.`);
        return null;
      }
      if (!type) {
        warnings.push(`connectors[${index}] must have valid type, ignoring.`);
        return null;
      }
      if (!name) {
        warnings.push(`connectors[${index}] must have name, ignoring.`);
        return null;
      }
      return {
        id,
        type,
        name,
        description: validateOptionalString(obj.description),
        config: validateOptionalRecord(obj.config, `connectors[${index}].config`) as Record<
          string,
          unknown
        >,
      };
    })
    .filter((item): boolean => item !== null) as unknown as readonly ConnectorReference[];
}

function validateConnectorType(value: unknown): ConnectorReference['type'] | null {
  if (value === 'oauth') return 'oauth';
  if (value === 'api') return 'api';
  if (value === 'native') return 'native';
  if (value === 'custom') return 'custom';
  return null;
}

function validateMcpServers(value: unknown, warnings: string[]): readonly McpServerConfig[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    warnings.push('mcpServers must be an array, ignoring.');
    return [];
  }
  return value
    .map((item, index) => {
      if (typeof item !== 'object' || item === null) {
        warnings.push(`mcpServers[${index}] must be an object, ignoring.`);
        return null;
      }
      const obj = item as Record<string, unknown>;
      const id = validateOptionalString(obj.id);
      const name = validateOptionalString(obj.name);
      const command = validateOptionalString(obj.command);
      const url = validateOptionalString(obj.url);
      if (!id) {
        warnings.push(`mcpServers[${index}] must have id, ignoring.`);
        return null;
      }
      if (!command && !url) {
        warnings.push(`mcpServers[${index}] must have command or url, ignoring.`);
        return null;
      }
      return {
        id,
        name: name ?? id,
        command: command ?? '',
        args: validateOptionalStringArray(obj.args, warnings, `mcpServers[${index}].args`),
        env: validateOptionalRecord(obj.env, `mcpServers[${index}].env`),
        url: url ?? undefined,
        description: validateOptionalString(obj.description),
      };
    })
    .filter((item): boolean => item !== null) as unknown as readonly McpServerConfig[];
}

function validateHooks(value: unknown, warnings: string[]): readonly HookConfig[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    warnings.push('hooks must be an array, ignoring.');
    return [];
  }
  return value
    .map((item, index) => {
      if (typeof item !== 'object' || item === null) {
        warnings.push(`hooks[${index}] must be an object, ignoring.`);
        return null;
      }
      const obj = item as Record<string, unknown>;
      const id = validateOptionalString(obj.id);
      const name = validateOptionalString(obj.name);
      const event = validateHookEvent(obj.event);
      const action = validateHookAction(obj.action, index, warnings);
      if (!id) {
        warnings.push(`hooks[${index}] must have id, ignoring.`);
        return null;
      }
      if (!event) {
        warnings.push(`hooks[${index}] must have valid event, ignoring.`);
        return null;
      }
      if (!action) {
        warnings.push(`hooks[${index}] must have valid action, ignoring.`);
        return null;
      }
      return {
        id,
        name: name ?? id,
        event,
        action,
        config: validateOptionalRecord(obj.config, `hooks[${index}].config`) as Record<
          string,
          unknown
        >,
      };
    })
    .filter((item): boolean => item !== null) as unknown as readonly HookConfig[];
}

const VALID_HOOK_EVENTS: readonly string[] = [
  'thread.created',
  'thread.status_changed',
  'agent_run.created',
  'agent_run.completed',
  'terminal.started',
  'terminal.stopped',
  'worktree.created',
  'worktree.archived',
  'handoff.created',
  'merge.started',
];

function validateHookEvent(value: unknown): HookEvent | null {
  if (typeof value !== 'string') return null;
  if (VALID_HOOK_EVENTS.includes(value)) {
    return value as HookEvent;
  }
  return null;
}

function validateHookAction(value: unknown, index: number, warnings: string[]): HookAction | null {
  if (typeof value !== 'object' || value === null) {
    warnings.push(`hooks[${index}].action must be an object, ignoring.`);
    return null;
  }
  const obj = value as Record<string, unknown>;
  const type = obj.type;
  if (type === 'shell') {
    const command = validateOptionalString(obj.command);
    if (!command) {
      warnings.push(`hooks[${index}].action.shell requires command, ignoring.`);
      return null;
    }
    return { type: 'shell', command };
  }
  if (type === 'http') {
    const url = validateOptionalString(obj.url);
    if (!url) {
      warnings.push(`hooks[${index}].action.http requires url, ignoring.`);
      return null;
    }
    return {
      type: 'http',
      url,
      method: validateOptionalString(obj.method) ?? 'GET',
      headers: validateOptionalRecord(obj.headers, `hooks[${index}].action.http.headers`) as Record<
        string,
        string
      >,
      body: obj.body,
    };
  }
  if (type === 'prompt') {
    const prompt = validateOptionalString(obj.prompt);
    if (!prompt) {
      warnings.push(`hooks[${index}].action.prompt requires prompt, ignoring.`);
      return null;
    }
    return { type: 'prompt', prompt };
  }
  warnings.push(`hooks[${index}].action.type must be shell|http|prompt, ignoring.`);
  return null;
}

function validatePanels(value: unknown, warnings: string[]): readonly PanelConfig[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    warnings.push('panels must be an array, ignoring.');
    return [];
  }
  return value
    .map((item, index) => {
      if (typeof item !== 'object' || item === null) {
        warnings.push(`panels[${index}] must be an object, ignoring.`);
        return null;
      }
      const obj = item as Record<string, unknown>;
      const id = validateOptionalString(obj.id);
      const name = validateOptionalString(obj.name);
      const surface = validatePanelSurface(obj.surface);
      const path = validateOptionalString(obj.path);
      if (!id) {
        warnings.push(`panels[${index}] must have id, ignoring.`);
        return null;
      }
      if (!name) {
        warnings.push(`panels[${index}] must have name, ignoring.`);
        return null;
      }
      if (!surface) {
        warnings.push(`panels[${index}] must have valid surface, ignoring.`);
        return null;
      }
      if (!path) {
        warnings.push(`panels[${index}] must have path, ignoring.`);
        return null;
      }
      return {
        id,
        name,
        surface,
        path,
        description: validateOptionalString(obj.description),
      };
    })
    .filter((item): boolean => item !== null) as unknown as readonly PanelConfig[];
}

function validatePanelSurface(value: unknown): PanelConfig['surface'] | null {
  if (value === 'thread') return 'thread';
  if (value === 'evidence') return 'evidence';
  if (value === 'worktree') return 'worktree';
  if (value === 'browser') return 'browser';
  if (value === 'settings') return 'settings';
  return null;
}

// ============================================================================
// Utilities
// ============================================================================

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getPluginManifestPath(pluginPath: string): string {
  return resolve(pluginPath, 'doorway.plugin.json');
}

export function pluginCapabilities(manifest: DoorwayPluginManifest): readonly string[] {
  return manifest.capabilities;
}

export function pluginSkillIds(manifest: DoorwayPluginManifest): readonly string[] {
  return manifest.skills?.map((s) => s.id) ?? [];
}

export function pluginMcpServerIds(manifest: DoorwayPluginManifest): readonly string[] {
  return manifest.mcpServers?.map((m) => m.id) ?? [];
}
