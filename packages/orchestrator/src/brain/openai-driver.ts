import type {
  DoorwayProviderDriver,
  ProviderConfig,
  DoorwayModelRequest,
  DoorwayModelEvent,
  ValidationResult,
  TestResult,
  ModelInfo,
} from './types.js';

export class OpenAIDriver implements DoorwayProviderDriver {
  readonly id = 'openai';
  readonly displayName = 'OpenAI';
  readonly protocol = 'openai-compatible-chat-completions';

  async validateConfig(config: ProviderConfig): Promise<ValidationResult> {
    if (!config.apiKey && !config.id.includes('none')) {
      return { valid: false, error: 'API key is required for OpenAI' };
    }
    return { valid: true };
  }

  async testConnection(config: ProviderConfig): Promise<TestResult> {
    const startTime = Date.now();
    try {
      const response = await fetch(`${config.baseURL || 'https://api.openai.com/v1'}/models`, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          ...config.headers,
        },
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

  async listModels(config: ProviderConfig): Promise<ModelInfo[]> {
    const response = await fetch(`${config.baseURL || 'https://api.openai.com/v1'}/models`, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        ...config.headers,
      },
    });

    if (!response.ok) throw new Error(`Failed to list models: ${response.statusText}`);

    const data = await response.json();
    return data.data.map((m: any) => ({
      id: m.id,
      displayName: m.id,
      contextWindow: 128000, // Default estimate
      maxOutputTokens: 4096,
      supportsStreaming: true,
      supportsJsonSchema: m.id.includes('gpt-4'),
      supportsToolCalling: true,
      supportsVision: m.id.includes('vision') || m.id.includes('gpt-4o'),
    }));
  }

  async completeText(config: ProviderConfig, request: DoorwayModelRequest): Promise<string> {
    const response = await fetch(
      `${config.baseURL || 'https://api.openai.com/v1'}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          ...config.headers,
        },
        body: JSON.stringify({
          model: request.modelId,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          response_format:
            request.responseFormat === 'json_schema'
              ? { type: 'json_schema', json_schema: request.jsonSchema }
              : request.responseFormat === 'json'
                ? { type: 'json_object' }
                : undefined,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async *streamText(
    config: ProviderConfig,
    request: DoorwayModelRequest
  ): AsyncIterable<DoorwayModelEvent> {
    const response = await fetch(
      `${config.baseURL || 'https://api.openai.com/v1'}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          ...config.headers,
        },
        body: JSON.stringify({
          model: request.modelId,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      yield { type: 'error', error: `OpenAI API error (${response.status}): ${error}` };
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
          if (dataStr === '[DONE]') {
            yield { type: 'done' };
            return;
          }

          try {
            const json = JSON.parse(dataStr);
            const content = json.choices[0]?.delta?.content;
            if (content) {
              yield { type: 'text', text: content };
            }
            if (json.usage) {
              yield {
                type: 'done',
                usage: {
                  inputTokens: json.usage.prompt_tokens,
                  outputTokens: json.usage.completion_tokens,
                },
              };
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
