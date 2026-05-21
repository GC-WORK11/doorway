import type Database from 'better-sqlite3';
import type { ProviderModelProjection } from '@doorway/protocol';

interface ProviderModelRow {
  readonly id: string;
  readonly provider_profile_id: string;
  readonly provider_id: string;
  readonly provider_name: string;
  readonly model_id: string;
  readonly display_name: string | null;
  readonly context_window: number | null;
  readonly max_output_tokens: number | null;
  readonly supports_streaming: number;
  readonly supports_json_schema: number;
  readonly supports_tool_calling: number;
  readonly supports_vision: number;
}

export function listProviderModels(db: Database.Database): readonly ProviderModelProjection[] {
  const rows = db
    .prepare(
      `
      SELECT
        model_profiles.id,
        model_profiles.provider_profile_id,
        provider_profiles.provider_id,
        provider_profiles.display_name AS provider_name,
        model_profiles.model_id,
        model_profiles.display_name,
        model_profiles.context_window,
        model_profiles.max_output_tokens,
        model_profiles.supports_streaming,
        model_profiles.supports_json_schema,
        model_profiles.supports_tool_calling,
        model_profiles.supports_vision
      FROM model_profiles
      INNER JOIN provider_profiles ON provider_profiles.id = model_profiles.provider_profile_id
      WHERE model_profiles.enabled = 1 AND provider_profiles.enabled = 1
      ORDER BY provider_profiles.display_name COLLATE NOCASE, model_profiles.display_name COLLATE NOCASE, model_profiles.model_id COLLATE NOCASE
    `
    )
    .all() as ProviderModelRow[];

  return rows.map((row) => ({
    id: row.id,
    providerProfileId: row.provider_profile_id,
    providerId: row.provider_id,
    providerName: row.provider_name,
    modelId: row.model_id,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    ...(row.context_window ? { contextWindow: row.context_window } : {}),
    ...(row.max_output_tokens ? { maxOutputTokens: row.max_output_tokens } : {}),
    supportsStreaming: row.supports_streaming === 1,
    supportsJsonSchema: row.supports_json_schema === 1,
    supportsToolCalling: row.supports_tool_calling === 1,
    supportsVision: row.supports_vision === 1,
  }));
}
