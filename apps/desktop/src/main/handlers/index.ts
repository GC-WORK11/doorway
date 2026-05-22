/**
 * IPC Handlers Module
 *
 * Re-exports all handlers utilities and setup function.
 */

// Re-export utilities
export {
  shouldCreateThreadForAgentLaunch,
  handoffGoalFromThreadRow,
  latestAgentRunId,
  forkWorktreeBranchName,
  assertCleanForkSource,
  assertCleanArchiveSource,
  buildWorktreeMergeApproval,
  latestMergeAssessmentForTask,
  assertReadyForIntegrationMerge,
  selectPostMergeTestCommand,
  normalizeHandoffProvider,
  assertReviewMergeToolEnabled,
  livePermissionDecisionOptions,
  memorySourcesForEvent,
  terminalChunkRowsToAgentEvents,
  browserEvidenceBundleJson,
  writeBrowserEvidenceBundle,
  writeThreadReplayJsonl,
  writeWorktreeRollbackPatch,
  verifyThreadReplayJsonlFile,
  threadReplayVerificationFailedPayload,
  threadReplayVerificationSucceededPayload,
  clipboardTextFromRequest,
  pathTextFromRequest,
  handoffUsageEventPayload,
} from './utils.js';

// Re-export setup functions
export { assertAutomationMutationRequest, setupMainHandlers, setMainWindow } from './handlers.js';
