export interface PluginManifest {
  id: string;
  version: string;
  name: string;
  capabilities?: {
    mcpServers?: string[];
    skills?: string[];
    oauth?: string[];
  };
  permissions?: {
    network?: string[];
    filesystem?: string[];
  };
}
