export interface ModelInfo {
  readonly id: string;
  readonly displayName: string;
  readonly contextWindow: number;
  readonly maxOutputTokens: number;
  readonly supportsStreaming: boolean;
  readonly supportsJsonSchema: boolean;
  readonly supportsToolCalling: boolean;
  readonly supportsVision: boolean;
}

export interface ProviderConfig {
  readonly id: string;
  readonly baseURL?: string;
  readonly apiKey?: string;
  readonly headers?: Record<string, string>;
}

export interface DoorwayModelRequest {
  readonly modelId: string;
  readonly messages: readonly DoorwayMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly responseFormat?: 'text' | 'json' | 'json_schema';
  readonly jsonSchema?: any;
}

export interface DoorwayMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface DoorwayModelEvent {
  readonly type: 'text' | 'done' | 'error';
  readonly text?: string;
  readonly error?: string;
  readonly usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly error?: string;
}

export interface TestResult {
  readonly success: boolean;
  readonly error?: string;
  readonly latencyMs?: number;
}

/**
 * Interface for secure credential storage.
 */
export interface VaultProvider {
  get(name: string): string | Promise<string>;
}

/**
 * Interface for all Cloud Provider Drivers (OpenAI, Anthropic, Gemini, etc.)
 */
export interface DoorwayProviderDriver {
  readonly id: string;
  readonly displayName: string;
  readonly protocol: string;

  validateConfig(config: ProviderConfig): Promise<ValidationResult>;
  testConnection(config: ProviderConfig): Promise<TestResult>;
  listModels?(config: ProviderConfig): Promise<ModelInfo[]>;

  streamText(
    config: ProviderConfig,
    request: DoorwayModelRequest
  ): AsyncIterable<DoorwayModelEvent>;
  completeText(config: ProviderConfig, request: DoorwayModelRequest): Promise<string>;
}
