import type {
  DoorwayProviderDriver,
  ProviderConfig,
  DoorwayModelRequest,
  DoorwayModelEvent,
  ValidationResult,
  TestResult,
  ModelInfo,
} from './types.js';

export class AnthropicDriver implements DoorwayProviderDriver {
  readonly id = 'anthropic';
  readonly displayName = 'Anthropic';
  readonly protocol = 'anthropic-messages';

  async validateConfig(config: ProviderConfig): Promise<ValidationResult> {
    if (!config.apiKey) return { valid: false, error: 'API key is required for Anthropic' };
    return { valid: true };
  }

  async testConnection(config: ProviderConfig): Promise<TestResult> {
    const startTime = Date.now();
    try {
      // Anthropic doesn't have a simple /models list, so we do a tiny completion
      const response = await fetch(`${config.baseURL || 'https://api.anthropic.com/v1'}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey || '',
          'anthropic-version': '2023-06-01',
          ...config.headers,
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Status ${response.status}: ${error}` };
      }

      return { success: true, latencyMs: Date.now() - startTime };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async listModels(_config: ProviderConfig): Promise<ModelInfo[]> {
    // Anthropic does not expose a model-list endpoint comparable to OpenAI's list API.
    return [
      {
        id: 'claude-3-5-sonnet-20240620',
        displayName: 'Claude 3.5 Sonnet',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsStreaming: true,
        supportsJsonSchema: true,
        supportsToolCalling: true,
        supportsVision: true,
      },
      {
        id: 'claude-3-opus-20240229',
        displayName: 'Claude 3 Opus',
        contextWindow: 200000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        supportsJsonSchema: true,
        supportsToolCalling: true,
        supportsVision: true,
      },
      {
        id: 'claude-3-haiku-20240307',
        displayName: 'Claude 3 Haiku',
        contextWindow: 200000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        supportsJsonSchema: true,
        supportsToolCalling: true,
        supportsVision: true,
      },
    ];
  }

  async completeText(config: ProviderConfig, request: DoorwayModelRequest): Promise<string> {
    const system = request.messages.find((m) => m.role === 'system')?.content;
    const messages = request.messages.filter((m) => m.role !== 'system');

    const response = await fetch(`${config.baseURL || 'https://api.anthropic.com/v1'}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01',
        ...config.headers,
      },
      body: JSON.stringify({
        model: request.modelId,
        system,
        messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens || 4096,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  async *streamText(
    config: ProviderConfig,
    request: DoorwayModelRequest
  ): AsyncIterable<DoorwayModelEvent> {
    const system = request.messages.find((m) => m.role === 'system')?.content;
    const messages = request.messages.filter((m) => m.role !== 'system');

    const response = await fetch(`${config.baseURL || 'https://api.anthropic.com/v1'}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01',
        ...config.headers,
      },
      body: JSON.stringify({
        model: request.modelId,
        system,
        messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens || 4096,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      yield { type: 'error', error: `Anthropic API error (${response.status}): ${error}` };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', error: 'Response body is not readable' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const dataStr = trimmed.slice(6);
          try {
            const json = JSON.parse(dataStr);
            if (json.type === 'content_block_delta') {
              yield { type: 'text', text: json.delta.text };
            } else if (json.type === 'message_stop') {
              yield { type: 'done' };
            } else if (json.type === 'message_start' && json.message.usage) {
              // Initial usage
            }
          } catch (e) {
            // Ignore partial JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
