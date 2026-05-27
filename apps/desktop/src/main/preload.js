/**
 * Doorway Desktop - Preload Script
 *
 * Exposes safe IPC APIs to the renderer process.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Define the API
const doorwayAPI = {
  // Project operations
  selectProjectFolder: () => ipcRenderer.invoke('project:selectFolder'),
  openProject: (req) => ipcRenderer.invoke('project:open', req),
  listProjects: () => ipcRenderer.invoke('project:list'),
  listProjectMemorySources: (req) => ipcRenderer.invoke('project:memory-sources', req),
  listProjectPlugins: (req) => ipcRenderer.invoke('project:list-plugins', req),
  listProjectFiles: (path) => ipcRenderer.invoke('project:list-files', { path }),

  // Thread operations
  createThread: (req) => ipcRenderer.invoke('thread:create', req),
  getThread: (id) => ipcRenderer.invoke('thread:get', { id }),
  listThreads: (req) => ipcRenderer.invoke('thread:list', req),
  addMessage: (threadId, req) => ipcRenderer.invoke('thread:add-message', { threadId, ...req }),
  getMessages: (threadId) => ipcRenderer.invoke('thread:get-messages', { threadId }),
  getThreadEvents: (threadId) => ipcRenderer.invoke('thread:get-events', { threadId }),
  getThreadOperationalMemory: (threadId) =>
    ipcRenderer.invoke('thread:get-operational-memory', { threadId }),
  exportThreadReplay: (req) => ipcRenderer.invoke('thread:export-replay', req),
  verifyThreadReplay: (req) => ipcRenderer.invoke('thread:verify-replay', req),
  getThreadProofs: (threadId) => ipcRenderer.invoke('thread:get-proofs', { threadId }),
  getThreadPermissionReceipts: (threadId) =>
    ipcRenderer.invoke('thread:get-permission-receipts', { threadId }),
  decidePermission: (req) => ipcRenderer.invoke('permission:decide', req),
  getThreadMergeAssessments: (threadId) =>
    ipcRenderer.invoke('thread:get-merge-assessments', { threadId }),
  getThreadHandoffCapsules: (threadId) =>
    ipcRenderer.invoke('thread:get-handoff-capsules', { threadId }),
  getThreadPeerMessages: (threadId) => ipcRenderer.invoke('thread:get-peer-messages', { threadId }),
  getThreadTaskGraphs: (threadId) => ipcRenderer.invoke('thread:get-task-graphs', { threadId }),
  getThreadCompactCheckpoints: (threadId) =>
    ipcRenderer.invoke('thread:get-compact-checkpoints', { threadId }),
  createCompactCheckpoint: (req) => ipcRenderer.invoke('thread:create-compact-checkpoint', req),
  updateTaskNodeStatus: (req) => ipcRenderer.invoke('task-graph:update-node-status', req),
  listProviderModels: () => ipcRenderer.invoke('provider:list-models'),
  listToolCapabilities: (req) => ipcRenderer.invoke('tools:list-capabilities', req || {}),
  listToolLanes: (threadId) => ipcRenderer.invoke('tools:list-lanes', { threadId }),
  setToolEnabled: (req) => ipcRenderer.invoke('tools:set-enabled', req),
  listAutomations: (req) => ipcRenderer.invoke('automation:list', req),
  createAutomation: (req) => ipcRenderer.invoke('automation:create', req),
  updateAutomation: (req) => ipcRenderer.invoke('automation:update', req),
  deleteAutomation: (id) => ipcRenderer.invoke('automation:delete', { id }),
  getAutomationRuns: (automationId) => ipcRenderer.invoke('automation:runs', { automationId }),
  runAutomationNow: (id) => ipcRenderer.invoke('automation:run-now', { id }),
  createHandoff: (req) => ipcRenderer.invoke('handoff:create', req),
  copyText: (req) => ipcRenderer.invoke('clipboard:write-text', req),
  openPath: (req) => ipcRenderer.invoke('file:open-path', req),

  // Agent operations
  launchAgent: (req) => ipcRenderer.invoke('agent:launch', req),
  launchBestOfN: (req) => ipcRenderer.invoke('agent:launch-best-of-n', req),
  interruptAgent: (runId) => ipcRenderer.invoke('agent:interrupt', { runId }),
  terminateAgent: (runId) => ipcRenderer.invoke('agent:terminate', { runId }),

  // Terminal operations
  createTerminal: (req) => ipcRenderer.invoke('terminal:create', req || {}),
  writeTerminal: (sessionId, data, metadata) =>
    ipcRenderer.invoke('terminal:write', { sessionId, data, ...metadata }),
  resizeTerminal: (sessionId, cols, rows) =>
    ipcRenderer.invoke('terminal:resize', { sessionId, cols, rows }),
  stopTerminal: (sessionId) => ipcRenderer.invoke('terminal:stop', { sessionId }),
  getTerminalTranscript: (sessionId) =>
    ipcRenderer.invoke('terminal:get-transcript', { sessionId }),
  getTerminalBlocks: (sessionId) =>
    ipcRenderer.invoke('terminal:get-blocks', { sessionId }),
  getTerminalInputs: (sessionId) => ipcRenderer.invoke('terminal:get-inputs', { sessionId }),
  listTerminals: (threadId) => ipcRenderer.invoke('terminal:list', { threadId }),

  // Worktree operations
  listWorktrees: () => ipcRenderer.invoke('worktree:list'),
  getWorktreeDiff: (path, threadId) => ipcRenderer.invoke('worktree:diff', { path, threadId }),
  forkWorktree: (req) => ipcRenderer.invoke('worktree:fork', req),
  archiveWorktree: (req) => ipcRenderer.invoke('worktree:archive', req),
  archiveMergedWorktreeBranch: (req) =>
    ipcRenderer.invoke('worktree:archive', { ...req, deleteBranch: true }),
  exportRollbackPatch: (req) => ipcRenderer.invoke('worktree:export-rollback-patch', req),
  evaluateMergeReadiness: (req) => ipcRenderer.invoke('merge:evaluate-readiness', req),
  approveWorktreeMerge: (req) => ipcRenderer.invoke('merge:approve-worktree', req),
  createIntegrationMerge: (req) => ipcRenderer.invoke('merge:create-integration', req),

  // Subscriptions
  onAgentEvent: (callback) => {
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on('agent:event', handler);
    return () => ipcRenderer.removeListener('agent:event', handler);
  },

  onTerminalData: (callback) => {
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.removeListener('terminal:data', handler);
  },

  onDbChange: (callback) => {
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on('db:change', handler);
    return () => ipcRenderer.removeListener('db:change', handler);
  },

  // Browser operations (Phase 7A)
  launchBrowser: (options) => ipcRenderer.invoke('browser:launch', options),
  toggleBrowserControl: (isAgent) => ipcRenderer.invoke('browser:toggle-control', { isAgent }),
  exportBrowserEvidence: (req) => ipcRenderer.invoke('browser:export-evidence', req),
  onBrowserStateChange: (callback) => {
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on('browser:state-change', handler);
    return () => ipcRenderer.removeListener('browser:state-change', handler);
  },
  onBrowserAction: (callback) => {
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on('browser:action', handler);
    return () => ipcRenderer.removeListener('browser:action', handler);
  },

  // Streaming IPC for real-time terminal
  terminal: {
    startStream: (sessionId) => ipcRenderer.invoke('terminal:stream-start', { sessionId }),
    stopStream: (sessionId) => ipcRenderer.invoke('terminal:stream-stop', { sessionId }),
    getActiveStreams: () => ipcRenderer.invoke('terminal:stream-active-sessions'),
    onStream: (callback) => {
      const handler = (event, payload) => callback(payload);
      ipcRenderer.on('terminal:stream', handler);
      return () => ipcRenderer.removeListener('terminal:stream', handler);
    },
  },

  // Fault Recovery - auto-retry and crash detection
  faultRecovery: {
    onAction: (callback) => {
      const handler = (event, payload) => callback(payload);
      ipcRenderer.on('fault-recovery:action', handler);
      return () => ipcRenderer.removeListener('fault-recovery:action', handler);
    },
    onClarification: (callback) => {
      const handler = (event, payload) => callback(payload);
      ipcRenderer.on('fault-recovery:clarification', handler);
      return () => ipcRenderer.removeListener('fault-recovery:clarification', handler);
    },
  },

  // Clarification
  clarification: {
    answer: (req) => ipcRenderer.invoke('clarification:answer', req),
    get: (clarificationId) => ipcRenderer.invoke('clarification:get', { clarificationId }),
    pending: (sessionId) => ipcRenderer.invoke('clarification:pending', { sessionId }),
  },

  // YC Pitch Demo specific operations
  writeDemoGame: (projectPath) => ipcRenderer.invoke('project:write-demo-game', { projectPath }),
  openSystemBrowser: (url) => ipcRenderer.invoke('project:open-system-browser', { url }),
};

// Expose to renderer
contextBridge.exposeInMainWorld('doorway', doorwayAPI);

console.log('[Preload] Doorway API exposed');
