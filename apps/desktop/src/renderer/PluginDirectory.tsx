/**
 * Plugin Directory UI
 * Lists installed plugins, shows connector status, and enables/disables plugins.
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ProjectPluginProjection } from '@doorway/protocol';

export interface PluginDirectoryProps {
  /** List of installed plugins */
  readonly plugins: readonly ProjectPluginProjection[];
  /** Called when a plugin is enabled or disabled */
  readonly onPluginToggle?: (pluginId: string, enabled: boolean) => void;
  /** Called when a plugin's details are requested */
  readonly onPluginSelect?: (plugin: ProjectPluginProjection) => void;
  /** Whether the directory is in a loading state */
  readonly loading?: boolean;
}

type PluginFilter = 'all' | 'ready' | 'invalid' | 'enabled' | 'disabled';

const capabilityLabels: Record<string, string> = {
  tool: 'Tool',
  connector: 'Connector',
  panel: 'Panel',
  skill: 'Skill',
  mcp: 'MCP Server',
  hook: 'Hook',
  automation: 'Automation',
};

function PluginCard({
  plugin,
  enabled,
  onToggle,
  onSelect,
}: {
  plugin: ProjectPluginProjection;
  enabled: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onSelect: (plugin: ProjectPluginProjection) => void;
}) {
  const isInvalid = plugin.status === 'invalid';

  return (
    <motion.article
      className={`plugin-card ${isInvalid ? 'plugin-card--invalid' : ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      layout
    >
      <header className="plugin-card__header">
        <div className="plugin-card__info">
          <h3 className="plugin-card__name">{plugin.name}</h3>
          <span className="plugin-card__version">v{plugin.version}</span>
          {isInvalid && (
            <span className="plugin-card__status plugin-card__status--invalid">Invalid</span>
          )}
          {!isInvalid && (
            <span className="plugin-card__status plugin-card__status--ready">Ready</span>
          )}
        </div>
        <label className="plugin-card__toggle" title={enabled ? 'Disable plugin' : 'Enable plugin'}>
          <input
            type="checkbox"
            checked={enabled && !isInvalid}
            disabled={isInvalid}
            onChange={(e) => onToggle(plugin.id, e.target.checked)}
            aria-label={`${enabled ? 'Disable' : 'Enable'} ${plugin.name}`}
          />
          <span className="plugin-card__toggle-track">
            <span className="plugin-card__toggle-thumb" />
          </span>
        </label>
      </header>

      {plugin.problem && (
        <div className="plugin-card__problem" role="alert">
          <span className="plugin-card__problem-icon">!</span>
          <span>{plugin.problem}</span>
        </div>
      )}

      <div className="plugin-card__capabilities">
        {plugin.capabilities.map((cap) => (
          <span key={cap} className="plugin-card__capability">
            {capabilityLabels[cap] ?? cap}
          </span>
        ))}
      </div>

      {plugin.capabilities.includes('connector') && (
        <div className="plugin-card__connectors">
          <span className="plugin-card__connector-label">Connectors:</span>
          {plugin.capabilities.includes('connector') ? (
            <span className="plugin-card__connector-status plugin-card__connector-status--ready">
              Configured
            </span>
          ) : (
            <span className="plugin-card__connector-status plugin-card__connector-status--none">
              None
            </span>
          )}
        </div>
      )}

      {plugin.capabilities.includes('mcp') && (
        <div className="plugin-card__mcp">
          <span className="plugin-card__mcp-label">MCP Server:</span>
          <span className="plugin-card__mcp-status plugin-card__mcp-status--ready">
            Available
          </span>
        </div>
      )}

      <footer className="plugin-card__footer">
        <button
          type="button"
          className="plugin-card__details-btn"
          onClick={() => onSelect(plugin)}
          disabled={isInvalid}
        >
          Details
        </button>
        {plugin.entryCommand && (
          <span className="plugin-card__entry">{plugin.entryCommand}</span>
        )}
      </footer>
    </motion.article>
  );
}

export function PluginDirectory({
  plugins,
  onPluginToggle,
  onPluginSelect,
  loading = false,
}: PluginDirectoryProps) {
  const [filter, setFilter] = useState<PluginFilter>('all');
  const [enabledPlugins, setEnabledPlugins] = useState<Set<string>>(() => {
    // Initialize with all valid plugins enabled by default
    return new Set(plugins.filter((p) => p.status === 'ready').map((p) => p.id));
  });

  const handleToggle = useCallback(
    (pluginId: string, enabled: boolean) => {
      setEnabledPlugins((prev) => {
        const next = new Set(prev);
        if (enabled) {
          next.add(pluginId);
        } else {
          next.delete(pluginId);
        }
        return next;
      });
      onPluginToggle?.(pluginId, enabled);
    },
    [onPluginToggle]
  );

  const filteredPlugins = React.useMemo(() => {
    return plugins.filter((plugin) => {
      switch (filter) {
        case 'all':
          return true;
        case 'ready':
          return plugin.status === 'ready';
        case 'invalid':
          return plugin.status === 'invalid';
        case 'enabled':
          return plugin.status === 'ready' && enabledPlugins.has(plugin.id);
        case 'disabled':
          return plugin.status === 'ready' && !enabledPlugins.has(plugin.id);
        default:
          return true;
      }
    });
  }, [plugins, filter, enabledPlugins]);

  const counts = React.useMemo(() => {
    return {
      all: plugins.length,
      ready: plugins.filter((p) => p.status === 'ready').length,
      invalid: plugins.filter((p) => p.status === 'invalid').length,
      enabled: plugins.filter((p) => p.status === 'ready' && enabledPlugins.has(p.id)).length,
      disabled: plugins.filter((p) => p.status === 'ready' && !enabledPlugins.has(p.id)).length,
    };
  }, [plugins, enabledPlugins]);

  const filterOptions: { value: PluginFilter; label: string }[] = [
    { value: 'all', label: `All (${counts.all})` },
    { value: 'ready', label: `Ready (${counts.ready})` },
    { value: 'invalid', label: `Invalid (${counts.invalid})` },
    { value: 'enabled', label: `Enabled (${counts.enabled})` },
    { value: 'disabled', label: `Disabled (${counts.disabled})` },
  ];

  return (
    <div className="plugin-directory" aria-label="Plugin directory">
      <header className="plugin-directory__header">
        <h2 className="plugin-directory__title">Plugins</h2>
        <div className="plugin-directory__filters" role="tablist" aria-label="Filter plugins">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={filter === option.value}
              className={`plugin-directory__filter ${
                filter === option.value ? 'plugin-directory__filter--active' : ''
              }`}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {loading && (
        <div className="plugin-directory__loading" aria-live="polite">
          <span>Loading plugins...</span>
        </div>
      )}

      {!loading && filteredPlugins.length === 0 && (
        <div className="plugin-directory__empty">
          <span>No plugins match the current filter.</span>
          {filter !== 'all' && (
            <button
              type="button"
              className="plugin-directory__clear-filter"
              onClick={() => setFilter('all')}
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      <div className="plugin-directory__list" role="list">
        <AnimatePresence mode="popLayout">
          {filteredPlugins.map((plugin) => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              enabled={enabledPlugins.has(plugin.id)}
              onToggle={handleToggle}
              onSelect={onPluginSelect ?? (() => {})}
            />
          ))}
        </AnimatePresence>
      </div>

      <footer className="plugin-directory__footer">
        <span className="plugin-directory__count">
          {filteredPlugins.length} of {plugins.length} plugins
        </span>
        <span className="plugin-directory__hint">
          Plugins are loaded from .doorway/plugins/ in your project
        </span>
      </footer>
    </div>
  );
}
