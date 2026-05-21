import { EventEmitter } from 'node:events';
import type { Database } from 'better-sqlite3';
import { generateId } from '@doorway/core';
import type {
  DoorwayProviderDriver,
  ProviderConfig,
  DoorwayModelRequest,
  DoorwayModelEvent,
  VaultProvider,
} from './types.js';
import { OpenAIDriver } from './openai-driver.js';
import { AnthropicDriver } from './anthropic-driver.js';

export class BrainService extends EventEmitter {
  private drivers: Map<string, DoorwayProviderDriver> = new Map();

  constructor(
    private db: Database,
    private vault: VaultProvider
  ) {
    super();
    this.registerDriver(new OpenAIDriver());
    this.registerDriver(new AnthropicDriver());
  }

  registerDriver(driver: DoorwayProviderDriver) {
    this.drivers.set(driver.id, driver);
  }

  /**
   * Execute a model call for a specific brain role (e.g. planner, summarizer).
   */
  async executeRole(
    role: string,
    request: Omit<DoorwayModelRequest, 'modelId'>,
    taskId?: string
  ): Promise<string> {
    const binding = this.db
      .prepare(
        `
      SELECT
        b.*,
        p.provider_id,
        p.base_url,
        p.key_ref,
        p.default_headers_json,
        m.model_id
      FROM brain_role_bindings b
      JOIN provider_profiles p ON b.provider_profile_id = p.id
      JOIN model_profiles m ON b.model_profile_id = m.id
      WHERE b.role = ? AND b.enabled = 1
    `
      )
      .get(role) as any;

    if (!binding) {
      throw new Error(`No enabled brain role binding found for: ${role}. Configure in settings.`);
    }

    this.emit('trace', {
      step: `Executing role: ${role}`,
      detail: `Using model: ${binding.model_id}`,
    });

    const driver = this.drivers.get(binding.provider_id);
    if (!driver) {
      throw new Error(`No driver found for provider: ${binding.provider_id}`);
    }

    // Resolve API key from vault or env
    let apiKey = '';
    if (binding.key_ref) {
      if (binding.key_ref.startsWith('keychain:')) {
        apiKey = await this.vault.get(binding.key_ref.slice(9));
      } else if (binding.key_ref.startsWith('env:')) {
        apiKey = process.env[binding.key_ref.slice(4)] || '';
      }
    }

    const config: ProviderConfig = {
      id: binding.provider_profile_id,
      baseURL: binding.base_url,
      apiKey,
      headers: binding.default_headers_json ? JSON.parse(binding.default_headers_json) : {},
    };

    const fullRequest: DoorwayModelRequest = {
      ...request,
      modelId: binding.model_id,
    };

    const startTime = Date.now();
    try {
      const result = await driver.completeText(config, fullRequest);

      this.recordInvocation({
        taskId,
        role,
        providerId: binding.provider_id,
        modelId: binding.model_id,
        status: 'success',
        latencyMs: Date.now() - startTime,
      });

      return result;
    } catch (err) {
      this.recordInvocation({
        taskId,
        role,
        providerId: binding.provider_id,
        modelId: binding.model_id,
        status: 'error',
        latencyMs: Date.now() - startTime,
      });
      throw err;
    }
  }

  private recordInvocation(data: {
    readonly taskId?: string;
    readonly role: string;
    readonly providerId: string;
    readonly modelId: string;
    readonly status: string;
    readonly latencyMs: number;
  }) {
    if (!data.taskId) {
      return;
    }
    const id = generateId('brn');
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO brain_invocations (id, task_id, role, provider_id, model_id, status, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(id, data.taskId, data.role, data.providerId, data.modelId, data.status, now);
  }

  /**
   * List available providers from DB.
   */
  async listProviders() {
    return this.db.prepare('SELECT * FROM provider_profiles').all();
  }

  /**
   * Add a new provider profile.
   */
  async addProvider(profile: any) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      INSERT INTO provider_profiles (id, kind, provider_id, display_name, base_url, auth_type, key_ref, default_headers_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        profile.id,
        profile.kind,
        profile.providerId,
        profile.displayName,
        profile.baseURL,
        profile.authType,
        profile.keyRef,
        profile.headersJson,
        now,
        now
      );
  }
}
