/**
 * Doorway MCP Connector
 * Client for connecting to MCP (Model Context Protocol) servers.
 */

import { EventEmitter } from 'node:events';
import { spawn, ChildProcess } from 'node:child_process';
import { type Socket } from 'node:net';

// ============================================================================
// Types
// ============================================================================

export interface McpServerConfig {
  readonly id: string;
  readonly name: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Record<string, string>;
  readonly url?: string;
}

export interface McpConnectionOptions {
  readonly server: McpServerConfig;
  readonly cwd?: string;
  readonly timeout?: number;
}

export interface McpRequest {
  readonly jsonrpc: '2.0';
  readonly id?: number | string;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

export interface McpResponse {
  readonly jsonrpc: '2.0';
  readonly id?: number | string;
  readonly result?: unknown;
  readonly error?: McpError;
}

export interface McpError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export interface McpNotification {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

export type McpMessage = McpRequest | McpResponse | McpNotification;

export interface McpTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface McpResource {
  readonly uri: string;
  readonly name?: string;
  readonly description?: string;
  readonly mimeType?: string;
}

export interface McpPrompt {
  readonly name: string;
  readonly description?: string;
  readonly arguments?: readonly McpPromptArgument[];
}

export interface McpPromptArgument {
  readonly name: string;
  readonly description?: string;
  readonly required?: boolean;
}

export interface McpServerCapabilities {
  readonly tools?: { listChanged?: boolean };
  readonly resources?: { listChanged?: boolean; subscribe?: boolean };
  readonly prompts?: { listChanged?: boolean };
  readonly lifecycle?: { supportsTerminate?: boolean };
}

export interface McpServerInfo {
  readonly name: string;
  readonly version: string;
  readonly capabilities: McpServerCapabilities;
}

// ============================================================================
// Events
// ============================================================================

export interface McpConnectorEvents {
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
  'tool:added': (tool: McpTool) => void;
  'tool:removed': (name: string) => void;
  'resource:added': (resource: McpResource) => void;
  'resource:removed': (uri: string) => void;
  'prompt:added': (prompt: McpPrompt) => void;
  'prompt:removed': (name: string) => void;
  notification: (notification: McpNotification) => void;
}

// ============================================================================
// MCP Protocol Messages
// ============================================================================

interface InitializeRequest {
  method: 'initialize';
  params: {
    protocolVersion: string;
    capabilities: Record<string, unknown>;
    clientInfo: { name: string; version: string };
  };
}

interface InitializedNotification {
  method: 'notifications/initialized';
}

interface ToolsListRequest {
  method: 'tools/list';
  params?: { cursor?: string };
}

interface ToolsListResponse {
  tools: readonly McpTool[];
  nextCursor?: string;
}

interface ResourcesListRequest {
  method: 'resources/list';
  params?: { cursor?: string };
}

interface ResourcesListResponse {
  resources: readonly McpResource[];
  nextCursor?: string;
}

interface PromptsListRequest {
  method: 'prompts/list';
  params?: { cursor?: string };
}

interface PromptsListResponse {
  prompts: readonly McpPrompt[];
  nextCursor?: string;
}

interface ResourcesSubscribeRequest {
  method: 'resources/subscribe';
  params: { uri: string };
}

interface ResourcesUnsubscribeRequest {
  method: 'resources/unsubscribe';
  params: { uri: string };
}

interface CallToolRequest {
  method: 'tools/call';
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

interface CallToolResponse {
  content: readonly McpToolResultContent[];
  isError?: boolean;
}

export interface McpToolResultContent {
  readonly type: 'text' | 'image' | 'resource';
  readonly text?: string;
  readonly data?: string;
  readonly mimeType?: string;
  readonly uri?: string;
}

// ============================================================================
// McpConnector
// ============================================================================

export class McpConnector extends EventEmitter {
  private readonly server: McpServerConfig;
  private readonly cwd: string;
  private process: ChildProcess | null = null;
  private socket: Socket | null = null;
  private connected = false;
  private requestId = 0;
  private pendingRequests = new Map<
    number | string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private readonly tools = new Map<string, McpTool>();
  private readonly resources = new Map<string, McpResource>();
  private readonly prompts = new Map<string, McpPrompt>();
  private serverInfo: McpServerInfo | null = null;

  constructor(options: McpConnectionOptions) {
    super();
    this.server = options.server;
    this.cwd = options.cwd ?? process.cwd();
  }

  get id(): string {
    return this.server.id;
  }

  get name(): string {
    return this.server.name;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get serverCapabilities(): McpServerCapabilities | null {
    return this.serverInfo?.capabilities ?? null;
  }

  async connect(timeoutMs = 30000): Promise<void> {
    if (this.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Connection to MCP server ${this.server.name} timed out`));
      }, timeoutMs);

      const cleanup = () => clearTimeout(timer);

      this.once('connected', () => {
        cleanup();
        resolve();
      });

      this.once('error', (err) => {
        cleanup();
        reject(err);
      });

      this.startProcess();
    });
  }

  private startProcess(): void {
    const env = { ...process.env, ...this.server.env };

    if (this.server.url) {
      // URL-based connection (stdio transport)
      this.connectStdio(env);
    } else {
      // Command-based connection
      this.connectProcess(env);
    }
  }

  private connectProcess(env: Record<string, string>): void {
    const args = [...(this.server.args ?? [])];

    this.process = spawn(this.server.command, args, {
      cwd: this.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.on('error', (err) => {
      this.emit('error', err);
    });

    this.process.on('exit', (code, signal) => {
      this.handleDisconnect(code, signal);
    });

    // Read stdout for JSON-RPC messages
    let buffer = '';
    this.process.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      this.processBuffer(buffer, (remaining) => {
        buffer = remaining;
      });
    });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      console.error(`[MCP ${this.server.name}] stderr:`, chunk.toString());
    });

    // Send initialize after startup delay
    setTimeout(() => {
      this.initialize().catch((err) => {
        this.emit('error', err);
      });
    }, 100);
  }

  private connectStdio(env: Record<string, string>): void {
    // For URL-based MCP servers, use stdio communication
    this.connectProcess(env);
  }

  private processBuffer(buffer: string, onRemaining: (remaining: string) => void): void {
    const lines = buffer.split('\n');
    const remaining = lines.pop() ?? '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line) as McpMessage;
          this.handleMessage(message);
        } catch {
          // Skip invalid JSON lines
        }
      }
    }

    onRemaining(remaining);
  }

  private handleMessage(message: McpMessage): void {
    // Handle responses to our requests
    if ('id' in message && message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if ('error' in message && message.error) {
          pending.reject(new Error(message.error.message));
        } else if ('result' in message) {
          pending.resolve(message.result);
        }
        return;
      }
    }

    // Handle notifications
    if (!('id' in message) || message.id === undefined) {
      this.handleNotification(message as McpNotification);
    }
  }

  private handleNotification(notification: McpNotification): void {
    switch (notification.method) {
      case 'notifications/initialized':
        this.connected = true;
        this.emit('connected');
        break;

      case 'tools/list_changed':
        this.refreshTools();
        break;

      case 'resources/list_changed':
        this.refreshResources();
        break;

      case 'prompts/list_changed':
        this.refreshPrompts();
        break;

      default:
        this.emit('notification', notification);
    }
  }

  private handleDisconnect(code: number | null, signal: string | null): void {
    this.connected = false;
    this.emit('disconnected');

    // Reject any pending requests
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(
        new Error(`MCP server ${this.server.name} disconnected (code=${code}, signal=${signal})`)
      );
    }
    this.pendingRequests.clear();
  }

  private sendRaw(message: unknown): void {
    if (!this.process?.stdin) {
      throw new Error('MCP process stdin not available');
    }
    this.process.stdin.write(JSON.stringify(message) + '\n');
  }

  private async sendRequest<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.connected && method !== 'initialize') {
      throw new Error('Not connected to MCP server');
    }

    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject });

      this.sendRaw({
        jsonrpc: '2.0',
        id,
        method,
        params,
      });

      // Timeout for pending request
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 60000);
    });
  }

  private async initialize(): Promise<void> {
    const result = await this.sendRequest<{
      protocolVersion: string;
      capabilities: McpServerCapabilities;
      serverInfo: { name: string; version: string };
    }>('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'doorway', version: '1.0.0' },
    });

    this.serverInfo = {
      name: result.serverInfo.name,
      version: result.serverInfo.version,
      capabilities: result.capabilities,
    };

    // Send initialized notification
    this.sendRaw({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    // Load initial lists
    await Promise.all([this.refreshTools(), this.refreshResources(), this.refreshPrompts()]);
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.connected = false;
    this.emit('disconnected');
  }

  // ============================================================================
  // Tools
  // ============================================================================

  async listTools(): Promise<readonly McpTool[]> {
    return Array.from(this.tools.values());
  }

  async callTool(name: string, args?: Record<string, unknown>): Promise<CallToolResponse> {
    const result = await this.sendRequest<CallToolResponse>('tools/call', {
      name,
      arguments: args,
    });
    return result;
  }

  private async refreshTools(): Promise<void> {
    try {
      const result = await this.sendRequest<ToolsListResponse>('tools/list');
      const newTools = new Map<string, McpTool>();

      for (const tool of result.tools) {
        newTools.set(tool.name, tool);

        if (!this.tools.has(tool.name)) {
          this.emit('tool:added', tool);
        }
      }

      // Detect removed tools
      for (const [name] of this.tools) {
        if (!newTools.has(name)) {
          this.emit('tool:removed', name);
        }
      }

      this.tools.clear();
      for (const [name, tool] of newTools) {
        this.tools.set(name, tool);
      }
    } catch (error) {
      console.error(`Failed to refresh tools from ${this.server.name}:`, error);
    }
  }

  // ============================================================================
  // Resources
  // ============================================================================

  async listResources(): Promise<readonly McpResource[]> {
    return Array.from(this.resources.values());
  }

  async subscribeResource(uri: string): Promise<void> {
    await this.sendRequest('resources/subscribe', { uri });
  }

  async unsubscribeResource(uri: string): Promise<void> {
    await this.sendRequest('resources/unsubscribe', { uri });
  }

  private async refreshResources(): Promise<void> {
    try {
      const result = await this.sendRequest<ResourcesListResponse>('resources/list');
      const newResources = new Map<string, McpResource>();

      for (const resource of result.resources) {
        newResources.set(resource.uri, resource);

        if (!this.resources.has(resource.uri)) {
          this.emit('resource:added', resource);
        }
      }

      // Detect removed resources
      for (const [uri] of this.resources) {
        if (!newResources.has(uri)) {
          this.emit('resource:removed', uri);
        }
      }

      this.resources.clear();
      for (const [uri, resource] of newResources) {
        this.resources.set(uri, resource);
      }
    } catch (error) {
      console.error(`Failed to refresh resources from ${this.server.name}:`, error);
    }
  }

  // ============================================================================
  // Prompts
  // ============================================================================

  async listPrompts(): Promise<readonly McpPrompt[]> {
    return Array.from(this.prompts.values());
  }

  private async refreshPrompts(): Promise<void> {
    try {
      const result = await this.sendRequest<PromptsListResponse>('prompts/list');
      const newPrompts = new Map<string, McpPrompt>();

      for (const prompt of result.prompts) {
        newPrompts.set(prompt.name, prompt);

        if (!this.prompts.has(prompt.name)) {
          this.emit('prompt:added', prompt);
        }
      }

      // Detect removed prompts
      for (const [name] of this.prompts) {
        if (!newPrompts.has(name)) {
          this.emit('prompt:removed', name);
        }
      }

      this.prompts.clear();
      for (const [name, prompt] of newPrompts) {
        this.prompts.set(name, prompt);
      }
    } catch (error) {
      console.error(`Failed to refresh prompts from ${this.server.name}:`, error);
    }
  }
}

// ============================================================================
// MCP Connection Manager
// ============================================================================

export class McpConnectionManager extends EventEmitter {
  private connections = new Map<string, McpConnector>();
  private serverConfigs: readonly McpServerConfig[] = [];

  constructor() {
    super();
  }

  registerServers(servers: readonly McpServerConfig[]): void {
    this.serverConfigs = servers;
  }

  async connectAll(timeoutMs?: number): Promise<void> {
    await Promise.all(this.serverConfigs.map((server) => this.connectServer(server, timeoutMs)));
  }

  async connectServer(server: McpServerConfig, timeoutMs?: number): Promise<McpConnector> {
    if (this.connections.has(server.id)) {
      const existing = this.connections.get(server.id)!;
      if (existing.isConnected) {
        return existing;
      }
    }

    const connector = new McpConnector({ server, timeout: timeoutMs });

    connector.on('connected', () => {
      this.emit('server:connected', server.id);
    });

    connector.on('disconnected', () => {
      this.emit('server:disconnected', server.id);
    });

    connector.on('error', (error) => {
      this.emit('server:error', server.id, error);
    });

    this.connections.set(server.id, connector);
    await connector.connect(timeoutMs);

    return connector;
  }

  async disconnectServer(serverId: string): Promise<void> {
    const connector = this.connections.get(serverId);
    if (connector) {
      await connector.disconnect();
      this.connections.delete(serverId);
    }
  }

  async disconnectAll(): Promise<void> {
    await Promise.all(Array.from(this.connections.keys()).map((id) => this.disconnectServer(id)));
  }

  getConnector(serverId: string): McpConnector | undefined {
    return this.connections.get(serverId);
  }

  getConnectedServers(): readonly string[] {
    return Array.from(this.connections.entries())
      .filter(([, conn]) => conn.isConnected)
      .map(([id]) => id);
  }

  getAllConnectors(): readonly McpConnector[] {
    return Array.from(this.connections.values());
  }
}
