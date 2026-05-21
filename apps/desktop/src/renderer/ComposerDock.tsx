import React from 'react';
import type {
  AgentLaunchMode,
  AgentPermissionProfile,
  AgentPtyMode,
  AgentWorktreeStrategy,
  ProjectMemorySource,
  ProjectProjection,
  ProviderModelProjection,
} from '@doorway/protocol';
import {
  ProjectInstructionStatus,
  type ComposerLaunchPreflight,
  type ComposerMentionTarget,
  type ComposerPolicySummaryItem,
  type SlashCommand,
} from './shared-ui';
import { CommandPalette } from './CommandPalette';
import { ContextUsageIndicator } from './ContextUsageIndicator';
import { motion, AnimatePresence } from 'framer-motion';

import { useHarnessState } from './HarnessContext';

export function ComposerDock() {
  const {
    loading,
    prompt,
    setPrompt,
    provider,
    setProvider,
    modelId,
    setModelId,
    composerMode,
    setComposerMode,
    permissionProfile,
    setPermissionProfile,
    worktreeStrategy,
    setWorktreeStrategy,
    ptyMode,
    setPtyMode,
    showCommands,
    setShowCommands,
    providerModels,
    selectedProviderModel,
    activeMentionTargets,
    policySummary,
    launchPreflight,
    isComposerBlocked,
    activeThreadExists: activeThread,
    activeProjectMode,
    runSlashCommand: onRunSlashCommand,
    applyComposerMention: onApplyComposerMention,
    submitPrompt,
    projectMemorySources,
    operationalMemory,
  } = useHarnessState();
  return (
    <motion.section
      className="composer-dock"
      aria-label="Composer"
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="composer-primary-row">
        <button
          className="composer-command-button"
          type="button"
          onClick={() => setShowCommands((value: boolean) => !value)}
          aria-label="Open command menu"
          aria-expanded={showCommands}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask Doorway to coordinate a coding task"
          aria-label="Prompt"
        />
        <button
          className="send-button"
          type="button"
          disabled={loading || !prompt.trim() || isComposerBlocked}
          onClick={() => void submitPrompt()}
          aria-label="Send prompt"
          title={isComposerBlocked ? launchPreflight.reason : undefined}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 19V5" />
            <path d="m6 11 6-6 6 6" />
          </svg>
        </button>
      </div>
      <div className="composer-bottom-row">
        <div className="composer-toolbar">
          <select
            value={composerMode}
            onChange={(event) => setComposerMode(event.target.value as AgentLaunchMode)}
            aria-label="Composer mode"
          >
            <option value="/build">/build</option>
            <option value="/debug">/debug</option>
            <option value="/review">/review</option>
            <option value="/plan">/plan</option>
            <option value="/handoff">/handoff</option>
            <option value="/test">/test</option>
          </select>
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            aria-label="Primary worker"
          >
            <option value="claude">Claude Code</option>
            <option value="codex">Codex</option>
            <option value="generic">Generic CLI</option>
          </select>
          <select
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            aria-label="Model"
            disabled={providerModels.length === 0}
          >
            <option value="">
              {providerModels.length === 0 ? 'No registered models' : 'Registry default'}
            </option>
            {providerModels.map((model) => (
              <option value={model.modelId} key={model.id}>
                {model.displayName}
              </option>
            ))}
          </select>
        </div>
        <div className="composer-controls" aria-label="Launch controls">
          <select
            value={permissionProfile}
            onChange={(event) => setPermissionProfile(event.target.value as AgentPermissionProfile)}
            aria-label="Permission posture"
          >
            <option value="ask-writes">Ask on writes</option>
            <option value="worktree-only">Worktree only</option>
            <option value="review-first">Review first</option>
          </select>
          <select
            value={worktreeStrategy}
            onChange={(event) => setWorktreeStrategy(event.target.value as AgentWorktreeStrategy)}
            aria-label="Worktree strategy"
            disabled={activeProjectMode === 'non_git'}
          >
            <option value="auto-worktree">Auto worktree</option>
            <option value="fork-current">Fork current</option>
            <option value="selected-worktree">Use selected</option>
          </select>
          <select
            value={ptyMode}
            onChange={(event) => setPtyMode(event.target.value as AgentPtyMode)}
            aria-label="PTY mode"
          >
            <option value="doorway-pty">Doorway PTY</option>
            <option value="external-pty">External PTY</option>
            <option value="protocol">Protocol</option>
          </select>
        </div>
      </div>
      <div className="composer-runtime-row">
        <span className="composer-hint">Use @CloudCode or @Codex for routing context.</span>
        {selectedProviderModel && (
          <div className="composer-model-status" aria-label="Selected model">
            <span>{selectedProviderModel.providerId}</span>
            <span>{selectedProviderModel.displayName ?? selectedProviderModel.modelId}</span>
            {selectedProviderModel.contextWindow && (
              <span>{selectedProviderModel.contextWindow.toLocaleString()} context</span>
            )}
          </div>
        )}
      </div>
      {activeThread && (
        <div className="composer-policy-status" aria-label="Active policy summary">
          {policySummary.map((item: any) => (
            <span data-tone={item.tone} key={item.label}>
              {item.label}
            </span>
          ))}
          {!launchPreflight.canSubmit && launchPreflight.reason && (
            <span data-tone="blocked">{launchPreflight.reason}</span>
          )}
        </div>
      )}
      <ProjectInstructionStatus sources={projectMemorySources} />
      <ContextUsageIndicator threshold={0.8} />
      <CommandPalette
        open={showCommands}
        onClose={() => setShowCommands(false)}
        onRunCommand={onRunSlashCommand}
      />
      <AnimatePresence>
        {activeMentionTargets.length > 0 && (
          <motion.div
            className="mention-menu"
            aria-label="Mention suggestions"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {activeMentionTargets.map((target: any) => (
              <button type="button" key={target.id} onClick={() => onApplyComposerMention(target)}>
                <span>{target.label}</span>
                <small>{target.detail}</small>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
