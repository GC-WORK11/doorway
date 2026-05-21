import type {
  DoorwayEvent,
  HandoffCapsuleProjection,
  MergeAssessmentProjection,
  MessageProjection,
  MeshMessageProjection,
  PermissionReceiptProjection,
  ProofProjection,
  TaskGraphProjection,
} from '@doorway/protocol';

export interface ThreadStateReader {
  getMessages(threadId: string): Promise<MessageProjection[]>;
  getThreadEvents(threadId: string): Promise<DoorwayEvent[]>;
  getThreadProofs(threadId: string): Promise<ProofProjection[]>;
  getThreadPermissionReceipts(threadId: string): Promise<PermissionReceiptProjection[]>;
  getThreadMergeAssessments(threadId: string): Promise<MergeAssessmentProjection[]>;
  getThreadHandoffCapsules(threadId: string): Promise<HandoffCapsuleProjection[]>;
  getThreadPeerMessages(threadId: string): Promise<MeshMessageProjection[]>;
  getThreadTaskGraphs(threadId: string): Promise<TaskGraphProjection[]>;
}

interface ThreadStateSnapshot {
  readonly messages: MessageProjection[];
  readonly events: DoorwayEvent[];
  readonly proofs: ProofProjection[];
  readonly permissionReceipts: PermissionReceiptProjection[];
  readonly mergeAssessments: MergeAssessmentProjection[];
  readonly handoffCapsules: HandoffCapsuleProjection[];
  readonly peerMessages: MeshMessageProjection[];
  readonly taskGraphs: TaskGraphProjection[];
}

export async function readPersistedThreadState(
  reader: ThreadStateReader,
  threadId: string
): Promise<ThreadStateSnapshot> {
  const [
    messages,
    events,
    proofs,
    permissionReceipts,
    mergeAssessments,
    handoffCapsules,
    peerMessages,
    taskGraphs,
  ] = await Promise.all([
    reader.getMessages(threadId),
    reader.getThreadEvents(threadId),
    reader.getThreadProofs(threadId),
    reader.getThreadPermissionReceipts(threadId),
    reader.getThreadMergeAssessments(threadId),
    reader.getThreadHandoffCapsules(threadId),
    reader.getThreadPeerMessages(threadId),
    reader.getThreadTaskGraphs(threadId),
  ]);

  return {
    messages,
    events,
    proofs,
    permissionReceipts,
    mergeAssessments,
    handoffCapsules,
    peerMessages,
    taskGraphs,
  };
}
