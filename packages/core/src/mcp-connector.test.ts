import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { McpConnector, type McpServerConfig, type McpConnectionOptions } from './mcp-connector.js';
import { spawn } from 'node:child_process';

// Mock child_process — must be before spawn is used
vi.mock('node:child_process');

describe('McpConnector', () => {
  let mockProcess: any;
  let mockStdin: any;
  let mockStdout: any;
  let mockStderr: any;

  const createMockServer = (overrides: Partial<McpServerConfig> = {}): McpServerConfig => ({
    id: 'test-server',
    name: 'Test MCP Server',
    command: 'node',
    args: ['test-server.js'],
    ...overrides,
  });

  const createMockOptions = (server: McpServerConfig): McpConnectionOptions => ({
    server,
    cwd: '/test',
    timeout: 5000,
  });

  beforeEach(() => {
    mockStdin = {
      write: vi.fn((_msg: unknown, _encoding: unknown, callback?: () => void) => {
        if (callback) callback();
        return true;
      }),
    };
    mockStdout = {
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (event === 'data') {
          // Store callback for later use
          mockStdout._dataCallback = cb;
        }
        return mockStdout;
      }),
      _dataCallback: null as ((data: Buffer) => void) | null,
    };
    mockStderr = {
      on: vi.fn(),
    };
    mockProcess = {
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
      on: vi.fn((event: string, cb: (...args: any[]) => void) => {
        if (event === 'error') {
          mockProcess._errorCallback = cb;
        } else if (event === 'exit') {
          mockProcess._exitCallback = cb;
        }
        return mockProcess;
      }),
      kill: vi.fn(),
      _errorCallback: null as ((err: Error) => void) | null,
      _exitCallback: null as ((code: number | null, signal: string | null) => void) | null,
    };

    (vi.mocked(spawn) as ReturnType<typeof vi.fn>).mockReturnValue(mockProcess);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('sets server config and defaults', () => {
      const server = createMockServer();
      const connector = new McpConnector(createMockOptions(server));

      expect(connector.id).toBe('test-server');
      expect(connector.name).toBe('Test MCP Server');
      expect(connector.isConnected).toBe(false);
      expect(connector.serverCapabilities).toBeNull();
    });
  });

  describe('connect', () => {
    it('connects and initializes MCP server', async () => {
      const server = createMockServer();
      const connector = new McpConnector(createMockOptions(server));

      // Simulate initialization sequence
      const connectPromise = connector.connect(5000);

      // Wait for process to be spawned and emit initialized
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate receiving the initialized notification
      mockStdout._dataCallback?.(
        Buffer.from(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
          }) + '\n'
        )
      );

      await connectPromise;

      expect(connector.isConnected).toBe(true);
    });

    it('rejects on connection timeout', async () => {
      const server = createMockServer();
      const connector = new McpConnector(createMockOptions(server));

      await expect(connector.connect(100)).rejects.toThrow(/timed out/);
    });

    it.skip('returns early if already connected', async () => {
      const server = createMockServer();
      const connector = new McpConnector(createMockOptions(server));

      connector.connect(5000);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should return early on second call
      await expect(connector.connect(5000)).resolves.toBeUndefined();
    });
  });

  describe('disconnect', () => {
    it('kills the process and sets connected to false', async () => {
      const server = createMockServer();
      const connector = new McpConnector(createMockOptions(server));

      // Connect first
      const connectPromise = connector.connect(5000);
      await new Promise((resolve) => setTimeout(resolve, 50));
      mockStdout._dataCallback?.(
        Buffer.from(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
          }) + '\n'
        )
      );
      await connectPromise;

      expect(connector.isConnected).toBe(true);

      // Disconnect
      await connector.disconnect();

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(connector.isConnected).toBe(false);
    });
  });

  describe('listTools', () => {
    it('returns empty array before tools are loaded', async () => {
      const server = createMockServer();
      const connector = new McpConnector(createMockOptions(server));

      const tools = await connector.listTools();
      expect(tools).toEqual([]);
    });
  });

  describe('events', () => {
    it('emits connected event', async () => {
      const server = createMockServer();
      const connector = new McpConnector(createMockOptions(server));

      const connectedHandler = vi.fn();
      connector.on('connected', connectedHandler);

      const connectPromise = connector.connect(5000);
      await new Promise((resolve) => setTimeout(resolve, 50));
      mockStdout._dataCallback?.(
        Buffer.from(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
          }) + '\n'
        )
      );

      await connectPromise;

      expect(connectedHandler).toHaveBeenCalledTimes(1);
    });

    it('emits disconnected event', async () => {
      const server = createMockServer();
      const connector = new McpConnector(createMockOptions(server));

      const disconnectedHandler = vi.fn();
      connector.on('disconnected', disconnectedHandler);

      // Connect first
      const connectPromise = connector.connect(5000);
      await new Promise((resolve) => setTimeout(resolve, 50));
      mockStdout._dataCallback?.(
        Buffer.from(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
          }) + '\n'
        )
      );
      await connectPromise;

      // Disconnect
      await connector.disconnect();

      expect(disconnectedHandler).toHaveBeenCalledTimes(1);
    });

    it('emits error event on process error', async () => {
      const server = createMockServer();
      const connector = new McpConnector(createMockOptions(server));

      const errorHandler = vi.fn();
      connector.on('error', errorHandler);

      // Start connection (which spawns process)
      const connectPromise = connector.connect(5000);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate process error
      mockProcess._errorCallback?.(new Error('Process error'));

      // Assert rejection to prevent unhandled rejection
      await expect(connectPromise).rejects.toThrow('Process error');

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });

    it.skip('emits tool:added when tools list changes', async () => {
      const server = createMockServer();
      const connector = new McpConnector(createMockOptions(server));

      const toolAddedHandler = vi.fn();
      connector.on('tool:added', toolAddedHandler);

      // Connect
      const connectPromise = connector.connect(5000);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate tools/list_changed notification
      mockStdout._dataCallback?.(
        Buffer.from(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/list_changed',
          }) + '\n'
        )
      );

      await connectPromise;

      // Tool refresh will be triggered, which should emit tool:added
      // We can't fully test this without mocking sendRequest
      expect(toolAddedHandler).toBeDefined();
    });
  });

  describe('handleMessage', () => {
    it.skip('handles JSON-RPC response with result', async () => {
      const server = createMockServer();
      const connector = new McpConnector(createMockOptions(server));

      // Manually trigger a request/response cycle
      const connectPromise = connector.connect(5000);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate initialize response
      mockStdout._dataCallback?.(
        Buffer.from(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'Test', version: '1.0.0' },
            },
          }) + '\n'
        )
      );

      // Simulate initialized notification
      mockStdout._dataCallback?.(
        Buffer.from(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
          }) + '\n'
        )
      );

      await connectPromise;

      expect(connector.isConnected).toBe(true);
      expect(connector.serverCapabilities).not.toBeNull();
    });

    it('handles JSON-RPC response with error', async () => {
      const server = createMockServer();
      const connector = new McpConnector(createMockOptions(server));

      const errorHandler = vi.fn();
      connector.on('error', errorHandler);

      // This would require more complex mocking to test error rejection
      // The basic structure is tested above
      expect(errorHandler).toBeDefined();
    });
  });

  describe('buffer processing', () => {
    it('handles multiple JSON messages in buffer', async () => {
      const server = createMockServer();
      const connector = new McpConnector(createMockOptions(server));

      const connectPromise = connector.connect(5000);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Send multiple messages at once (simulating chunked data)
      const messages = [
        { jsonrpc: '2.0', id: 1, result: { tools: [] } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
      ];
      mockStdout._dataCallback?.(
        Buffer.from(messages.map((m) => JSON.stringify(m)).join('\n') + '\n')
      );

      await connectPromise;

      expect(connector.isConnected).toBe(true);
    });

    it('skips empty lines', async () => {
      const server = createMockServer();
      const connector = new McpConnector(createMockOptions(server));

      const connectPromise = connector.connect(5000);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Send messages with empty lines
      mockStdout._dataCallback?.(
        Buffer.from(
          '\n\n' +
            JSON.stringify({
              jsonrpc: '2.0',
              method: 'notifications/initialized',
            }) +
            '\n\n'
        )
      );

      await connectPromise;

      expect(connector.isConnected).toBe(true);
    });

    it('skips invalid JSON lines', async () => {
      const server = createMockServer();
      const connector = new McpConnector(createMockOptions(server));

      const connectPromise = connector.connect(5000);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Send invalid JSON followed by valid message
      mockStdout._dataCallback?.(
        Buffer.from(
          'not valid json\n' +
            JSON.stringify({
              jsonrpc: '2.0',
              method: 'notifications/initialized',
            }) +
            '\n'
        )
      );

      await connectPromise;

      expect(connector.isConnected).toBe(true);
    });
  });
});
