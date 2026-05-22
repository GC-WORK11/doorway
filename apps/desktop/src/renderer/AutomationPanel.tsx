/**
 * Automation Panel UI
 * Lists automations, shows run history, and enables creating/editing/deleting automations.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  Automation,
  AutomationRun,
  CreateAutomationInput,
  UpdateAutomationInput,
} from '@doorway/core';
import { isValidCronExpression, describeCronExpression } from '@doorway/orchestrator/cron';

export interface AutomationPanelProps {
  /** List of automations */
  readonly automations: readonly Automation[];
  /** Called when a new automation should be created */
  readonly onCreate?: (input: CreateAutomationInput) => void | Promise<unknown>;
  /** Called when an automation should be updated */
  readonly onUpdate?: (input: UpdateAutomationInput) => void | Promise<unknown>;
  /** Called when an automation should be deleted */
  readonly onDelete?: (id: string) => void | Promise<unknown>;
  /** Called when an automation should be run immediately */
  readonly onRunNow?: (id: string) => void | Promise<unknown>;
  /** Called when run history for an automation is requested */
  readonly onRunHistory?: (automationId: string) => Promise<readonly AutomationRun[]>;
  readonly runHistory?: Readonly<Record<string, readonly AutomationRun[]>>;
  /** Whether the panel is in a loading state */
  readonly loading?: boolean;
}

type AutomationFilter = 'all' | 'enabled' | 'disabled';
type ViewMode = 'list' | 'create' | 'edit';

interface AutomationFormState {
  name: string;
  description: string;
  cronExpression: string;
  command: string;
  enabled: boolean;
}

const emptyForm: AutomationFormState = {
  name: '',
  description: '',
  cronExpression: '0 9 * * *',
  command: '',
  enabled: true,
};

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function AutomationCard({
  automation,
  onEdit,
  onDelete,
  onRunNow,
  onViewHistory,
}: {
  automation: Automation;
  onEdit: (automation: Automation) => void;
  onDelete: (id: string) => void;
  onRunNow: (id: string) => void;
  onViewHistory: (id: string) => void;
}) {
  const cronDescription = describeCronExpression(automation.cronExpression);
  const isValidCron = isValidCronExpression(automation.cronExpression);

  return (
    <motion.article
      className={`automation-card ${!automation.enabled ? 'automation-card--disabled' : ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      layout
    >
      <header className="automation-card__header">
        <div className="automation-card__info">
          <h3 className="automation-card__name">{automation.name}</h3>
          {automation.description && (
            <p className="automation-card__description">{automation.description}</p>
          )}
        </div>
        <div className="automation-card__status">
          {!automation.enabled && (
            <span className="automation-card__status-badge automation-card__status-badge--disabled">
              Disabled
            </span>
          )}
          {automation.enabled && (
            <span className="automation-card__status-badge automation-card__status-badge--enabled">
              Enabled
            </span>
          )}
        </div>
      </header>

      <div className="automation-card__schedule">
        <div className="automation-card__cron">
          <span className="automation-card__cron-label">Schedule:</span>
          <code className="automation-card__cron-expression">{automation.cronExpression}</code>
          {isValidCron && cronDescription && (
            <span className="automation-card__cron-description">{cronDescription}</span>
          )}
          {!isValidCron && (
            <span className="automation-card__cron-error">Invalid cron expression</span>
          )}
        </div>
        <div className="automation-card__command">
          <span className="automation-card__command-label">Command:</span>
          <code className="automation-card__command-text">{automation.command}</code>
        </div>
      </div>

      <div className="automation-card__timing">
        <div className="automation-card__timing-item">
          <span className="automation-card__timing-label">Last run:</span>
          <span className="automation-card__timing-value">{formatDate(automation.lastRunAt)}</span>
        </div>
        <div className="automation-card__timing-item">
          <span className="automation-card__timing-label">Next run:</span>
          <span className="automation-card__timing-value">{formatDate(automation.nextRunAt)}</span>
        </div>
      </div>

      <footer className="automation-card__footer">
        <button
          type="button"
          className="automation-card__btn automation-card__btn--secondary"
          onClick={() => onViewHistory(automation.id)}
        >
          History
        </button>
        <button
          type="button"
          className="automation-card__btn automation-card__btn--primary"
          onClick={() => onRunNow(automation.id)}
          disabled={!automation.enabled}
        >
          Run Now
        </button>
        <button
          type="button"
          className="automation-card__btn automation-card__btn--secondary"
          onClick={() => onEdit(automation)}
        >
          Edit
        </button>
        <button
          type="button"
          className="automation-card__btn automation-card__btn--danger"
          onClick={() => onDelete(automation.id)}
        >
          Delete
        </button>
      </footer>
    </motion.article>
  );
}

function RunHistoryPanel({
  runs,
  onClose,
}: {
  runs: readonly AutomationRun[];
  onClose: () => void;
}) {
  return (
    <motion.div
      className="run-history-panel"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
    >
      <header className="run-history-panel__header">
        <h3 className="run-history-panel__title">Run History</h3>
        <button
          type="button"
          className="run-history-panel__close"
          onClick={onClose}
          aria-label="Close history"
        >
          x
        </button>
      </header>

      {runs.length === 0 ? (
        <div className="run-history-panel__empty">
          <span>No runs yet.</span>
        </div>
      ) : (
        <ul className="run-history-panel__list">
          <AnimatePresence mode="popLayout">
            {runs.map((run) => (
              <motion.li
                key={run.id}
                className={`run-history-item run-history-item--${run.status}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                layout
              >
                <div className="run-history-item__status">
                  <span
                    className={`run-history-item__badge run-history-item__badge--${run.status}`}
                  >
                    {run.status}
                  </span>
                </div>
                <div className="run-history-item__info">
                  <span className="run-history-item__time">{formatDate(run.startedAt)}</span>
                  {run.completedAt && (
                    <span className="run-history-item__duration">
                      {Math.round(
                        (new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) /
                          1000
                      )}
                      s
                    </span>
                  )}
                </div>
                <div className="run-history-item__details">
                  {run.exitCode !== null && (
                    <span className="run-history-item__exitcode">Exit: {run.exitCode}</span>
                  )}
                  {run.error && (
                    <span className="run-history-item__error" title={run.error}>
                      {run.error.length > 50 ? `${run.error.slice(0, 50)}...` : run.error}
                    </span>
                  )}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </motion.div>
  );
}

function AutomationForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
}: {
  initialValues?: Partial<AutomationFormState>;
  onSubmit: (values: AutomationFormState) => void;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const [form, setForm] = useState<AutomationFormState>({
    ...emptyForm,
    ...initialValues,
  });
  const [cronError, setCronError] = useState<string | null>(null);

  const handleCronChange = useCallback((value: string) => {
    setForm((prev) => ({ ...prev, cronExpression: value }));
    if (value.trim() && !isValidCronExpression(value)) {
      setCronError('Invalid cron expression');
    } else {
      setCronError(null);
    }
  }, []);

  const cronDescription = useMemo(() => {
    if (!form.cronExpression) return null;
    return describeCronExpression(form.cronExpression);
  }, [form.cronExpression]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.name.trim()) return;
      if (!isValidCronExpression(form.cronExpression)) {
        setCronError('Please enter a valid cron expression');
        return;
      }
      onSubmit(form);
    },
    [form, onSubmit]
  );

  return (
    <motion.div
      className="automation-form-panel"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
    >
      <header className="automation-form-panel__header">
        <h3 className="automation-form-panel__title">
          {initialValues ? 'Edit Automation' : 'Create Automation'}
        </h3>
        <button
          type="button"
          className="automation-form-panel__close"
          onClick={onCancel}
          aria-label="Cancel"
        >
          x
        </button>
      </header>

      <form className="automation-form" onSubmit={handleSubmit}>
        <div className="automation-form__field">
          <label className="automation-form__label" htmlFor="automation-name">
            Name *
          </label>
          <input
            id="automation-name"
            type="text"
            className="automation-form__input"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Daily backup"
            required
          />
        </div>

        <div className="automation-form__field">
          <label className="automation-form__label" htmlFor="automation-description">
            Description
          </label>
          <input
            id="automation-description"
            type="text"
            className="automation-form__input"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Optional description"
          />
        </div>

        <div className="automation-form__field">
          <label className="automation-form__label" htmlFor="automation-cron">
            Cron Expression *
          </label>
          <input
            id="automation-cron"
            type="text"
            className={`automation-form__input ${cronError ? 'automation-form__input--error' : ''}`}
            value={form.cronExpression}
            onChange={(e) => handleCronChange(e.target.value)}
            placeholder="0 9 * * *"
            required
          />
          {cronError && <span className="automation-form__error">{cronError}</span>}
          {cronDescription && !cronError && (
            <span className="automation-form__hint">{cronDescription}</span>
          )}
        </div>

        <div className="automation-form__field">
          <label className="automation-form__label" htmlFor="automation-command">
            Command *
          </label>
          <input
            id="automation-command"
            type="text"
            className="automation-form__input"
            value={form.command}
            onChange={(e) => setForm((prev) => ({ ...prev, command: e.target.value }))}
            placeholder="npm run backup"
            required
          />
        </div>

        <div className="automation-form__field automation-form__field--checkbox">
          <label className="automation-form__checkbox-label">
            <input
              type="checkbox"
              className="automation-form__checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
            <span>Enabled</span>
          </label>
        </div>

        <div className="automation-form__actions">
          <button
            type="button"
            className="automation-form__btn automation-form__btn--secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="automation-form__btn automation-form__btn--primary"
            disabled={
              !form.name.trim() ||
              !isValidCronExpression(form.cronExpression) ||
              !form.command.trim()
            }
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </motion.div>
  );
}

export function AutomationPanel({
  automations,
  onCreate,
  onUpdate,
  onDelete,
  onRunNow,
  onRunHistory,
  runHistory = {},
  loading = false,
}: AutomationPanelProps) {
  const [filter, setFilter] = useState<AutomationFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [historyAutomationId, setHistoryAutomationId] = useState<string | null>(null);

  const filteredAutomations = useMemo(() => {
    return automations.filter((automation) => {
      switch (filter) {
        case 'all':
          return true;
        case 'enabled':
          return automation.enabled;
        case 'disabled':
          return !automation.enabled;
        default:
          return true;
      }
    });
  }, [automations, filter]);

  const counts = useMemo(() => {
    return {
      all: automations.length,
      enabled: automations.filter((a) => a.enabled).length,
      disabled: automations.filter((a) => !a.enabled).length,
    };
  }, [automations]);

  const handleEdit = useCallback((automation: Automation) => {
    setEditingAutomation(automation);
    setViewMode('edit');
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      if (onDelete) {
        void onDelete(id);
      }
    },
    [onDelete]
  );

  const handleRunNow = useCallback(
    (id: string) => {
      if (onRunNow) {
        void onRunNow(id);
      }
    },
    [onRunNow]
  );

  const handleViewHistory = useCallback(
    async (id: string) => {
      setHistoryAutomationId(id);
      await onRunHistory?.(id);
    },
    [onRunHistory]
  );

  const handleCreateSubmit = useCallback(
    (values: AutomationFormState) => {
      if (onCreate) {
        void onCreate({
          name: values.name,
          description: values.description || undefined,
          cronExpression: values.cronExpression,
          command: values.command,
          enabled: values.enabled,
        });
      }
      setViewMode('list');
      setEditingAutomation(null);
    },
    [onCreate]
  );

  const handleUpdateSubmit = useCallback(
    (values: AutomationFormState) => {
      if (onUpdate && editingAutomation) {
        void onUpdate({
          id: editingAutomation.id,
          name: values.name,
          description: values.description || undefined,
          cronExpression: values.cronExpression,
          command: values.command,
          enabled: values.enabled,
        });
      }
      setViewMode('list');
      setEditingAutomation(null);
    },
    [onUpdate, editingAutomation]
  );

  const handleCancelForm = useCallback(() => {
    setViewMode('list');
    setEditingAutomation(null);
  }, []);

  const filterOptions: { value: AutomationFilter; label: string }[] = [
    { value: 'all', label: `All (${counts.all})` },
    { value: 'enabled', label: `Enabled (${counts.enabled})` },
    { value: 'disabled', label: `Disabled (${counts.disabled})` },
  ];

  const historyRuns = historyAutomationId ? (runHistory[historyAutomationId] ?? []) : [];

  return (
    <div className="automation-panel" aria-label="Automation panel">
      <header className="automation-panel__header">
        <h2 className="automation-panel__title">Automations</h2>
        <div className="automation-panel__toolbar">
          <div className="automation-panel__filters" role="tablist" aria-label="Filter automations">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={filter === option.value}
                className={`automation-panel__filter ${
                  filter === option.value ? 'automation-panel__filter--active' : ''
                }`}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {viewMode === 'list' && (
            <button
              type="button"
              className="automation-panel__create-btn"
              onClick={() => setViewMode('create')}
            >
              + New Automation
            </button>
          )}
        </div>
      </header>

      {loading && (
        <div className="automation-panel__loading" aria-live="polite">
          <span>Loading automations...</span>
        </div>
      )}

      <AnimatePresence mode="wait">
        {viewMode === 'create' && (
          <AutomationForm
            key="create-form"
            onSubmit={handleCreateSubmit}
            onCancel={handleCancelForm}
            submitLabel="Create"
          />
        )}

        {viewMode === 'edit' && editingAutomation && (
          <AutomationForm
            key={`edit-form-${editingAutomation.id}`}
            initialValues={{
              name: editingAutomation.name,
              description: editingAutomation.description ?? '',
              cronExpression: editingAutomation.cronExpression,
              command: editingAutomation.command,
              enabled: editingAutomation.enabled,
            }}
            onSubmit={handleUpdateSubmit}
            onCancel={handleCancelForm}
            submitLabel="Update"
          />
        )}

        {viewMode === 'list' && historyAutomationId && (
          <RunHistoryPanel
            key={`history-${historyAutomationId}`}
            runs={historyRuns}
            onClose={() => setHistoryAutomationId(null)}
          />
        )}
      </AnimatePresence>

      {viewMode === 'list' && !loading && filteredAutomations.length === 0 && (
        <div className="automation-panel__empty">
          <span>No automations match the current filter.</span>
          {filter !== 'all' && (
            <button
              type="button"
              className="automation-panel__clear-filter"
              onClick={() => setFilter('all')}
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      {viewMode === 'list' && (
        <div className="automation-panel__list" role="list">
          <AnimatePresence mode="popLayout">
            {filteredAutomations.map((automation) => (
              <AutomationCard
                key={automation.id}
                automation={automation}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onRunNow={handleRunNow}
                onViewHistory={handleViewHistory}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <footer className="automation-panel__footer">
        <span className="automation-panel__count">
          {filteredAutomations.length} of {automations.length} automations
        </span>
        <span className="automation-panel__hint">
          Automations run commands on a schedule using cron expressions
        </span>
      </footer>
    </div>
  );
}
