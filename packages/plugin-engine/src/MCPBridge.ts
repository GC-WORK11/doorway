/**
 * MCP Bridge
 * Manages MCP (Model Context Protocol) connections to plugin servers.
 */

import { EventEmitter } from 'node:events';
import type { McpServerConfig } from '@doorway/core';
import { McpConnectionManager } from '@doorway/core';

export interface MCPServerHandle {
  readonly serverId: string;
  readonly serverName: string;
  readonly isConnected: boolean;
}

export interface MCPToolHandle {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface MCPResourceHandle {
  readonly uri: string;
  readonly name?: string;
  readonly description?: string;
  readonly mimeType?: string;
}

export interface MCPromptHandle {
  readonly name: string;
  readonly description?: string;
  readonly arguments?: readonly { name: string; description?: string; required?: boolean }[];
}

/**
 * MCPBridge manages connections to MCP servers defined in plugin manifests.
 * It provides a unified interface for accessing tools, resources, and prompts
 * from connected MCP servers.
 */
export class MCPBridge extends EventEmitter {
  private readonly connectionManager: McpConnectionManager;
  private readonly serverConfigs = new Map<string, McpServerConfig>();

  constructor() {
    super();
    this.connectionManager = new McpConnectionManager();

    this.connectionManager.on('server:connected', (serverId: string) => {
      this.emit('server:connected', serverId);
    });

    this.connectionManager.on('server:disconnected', (serverId: string) => {
      this.emit('server:disconnected', serverId);
    });

    this.connectionManager.on('server:error', (serverId: string, error: Error) => {
      this.emit('server:error', serverId, error);
    });
  }

  /**
   * Register MCP server configurations from a plugin manifest.
   */
  registerServers(servers: readonly McpServerConfig[]): void {
    for (const server of servers) {
      this.serverConfigs.set(server.id, server);
    }
    this.connectionManager.registerServers(Array.from(this.serverConfigs.values()));
  }

  /**
   * Connect to a specific MCP server by ID.
   */
  async connectServer(serverId: string, timeoutMs?: number): Promise<boolean> {
    const config = this.serverConfigs.get(serverId);
    if (!config) {
      throw new Error(`MCP server not found: ${serverId}`);
    }

    try {
      await this.connectionManager.connectServer(config, timeoutMs);
      return true;
    } catch (error) {
      console.error(`Failed to connect to MCP server ${serverId}:`, error);
      return false;
    }
  }

  /**
   * Connect to all registered MCP servers.
   */
  async connectAll(timeoutMs?: number): Promise<void> {
    await this.connectionManager.connectAll(timeoutMs);
  }

  /**
   * Disconnect from a specific MCP server.
   */
  async disconnectServer(serverId: string): Promise<void> {
    await this.connectionManager.disconnectServer(serverId);
  }

  /**
   * Disconnect from all MCP servers.
   */
  async disconnectAll(): Promise<void> {
    await this.connectionManager.disconnectAll();
  }

  /**
   * Get the connection status of a server.
   */
  isServerConnected(serverId: string): boolean {
    const connector = this.connectionManager.getConnector(serverId);
    return connector?.isConnected ?? false;
  }

  /**
   * Get all connected server IDs.
   */
  getConnectedServers(): readonly string[] {
    return this.connectionManager.getConnectedServers();
  }

  /**
   * List tools available from a connected server.
   */
  async listTools(serverId: string): Promise<readonly MCPToolHandle[]> {
    const connector = this.connectionManager.getConnector(serverId);
    if (!connector?.isConnected) {
      return [];
    }
    return connector.listTools();
  }

  /**
   * List all tools from all connected servers.
   */
  async listAllTools(): Promise<readonly { serverId: string; tools: readonly MCPToolHandle[] }[]> {
    const results: { serverId: string; tools: readonly MCPToolHandle[] }[] = [];
    for (const serverId of this.getConnectedServers()) {
      const tools = await this.listTools(serverId);
      results.push({ serverId, tools });
    }
    return results;
  }

  /**
   * Call a tool on a connected server.
   */
  async callTool(
    serverId: string,
    toolName: string,
    args?: Record<string, unknown>
  ): Promise<{ content: readonly { type: string; text?: string }[]; isError?: boolean } | null> {
    const connector = this.connectionManager.getConnector(serverId);
    if (!connector?.isConnected) {
      return null;
    }

    try {
      return await connector.callTool(toolName, args);
    } catch (error) {
      console.error(`Failed to call tool ${toolName} on ${serverId}:`, error);
      return null;
    }
  }

  /**
   * List resources available from a connected server.
   */
  async listResources(serverId: string): Promise<readonly MCPResourceHandle[]> {
    const connector = this.connectionManager.getConnector(serverId);
    if (!connector?.isConnected) {
      return [];
    }
    return connector.listResources();
  }

  /**
   * Subscribe to a resource for updates.
   */
  async subscribeResource(serverId: string, uri: string): Promise<boolean> {
    const connector = this.connectionManager.getConnector(serverId);
    if (!connector?.isConnected) {
      return false;
    }

    try {
      await connector.subscribeResource(uri);
      return true;
    } catch (error) {
      console.error(`Failed to subscribe to resource ${uri} on ${serverId}:`, error);
      return false;
    }
  }

  /**
   * Unsubscribe from a resource.
   */
  async unsubscribeResource(serverId: string, uri: string): Promise<boolean> {
    const connector = this.connectionManager.getConnector(serverId);
    if (!connector?.isConnected) {
      return false;
    }

    try {
      await connector.unsubscribeResource(uri);
      return true;
    } catch (error) {
      console.error(`Failed to unsubscribe from resource ${uri} on ${serverId}:`, error);
      return false;
    }
  }

  /**
   * List prompts available from a connected server.
   */
  async listPrompts(serverId: string): Promise<readonly MCPromptHandle[]> {
    const connector = this.connectionManager.getConnector(serverId);
    if (!connector?.isConnected) {
      return [];
    }
    return connector.listPrompts();
  }

  /**
   * Get a handle to the underlying connector for advanced operations.
   */
  getConnector(serverId: string) {
    return this.connectionManager.getConnector(serverId);
  }
}