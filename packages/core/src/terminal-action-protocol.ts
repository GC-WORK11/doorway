import type Database from 'better-sqlite3';
import type { MeshMessageKind, TerminalSessionId, ThreadId } from '@doorway/protocol';
import { generateId, toISOString } from './id-gen.js';
import { markPeerMessageHandled, pullPeerMessages, sendPeerMessage } from './agent-mesh.js';
import { redactTerminalText } from './terminal-evidence.js';

const doorwayActionBlockPattern = /```doorway-action\s*\n([\s\S]*?)```/g;
const sendMessageKinds = new Set<MeshMessageKind>([
  'question',
  'answer',
  'verification_request',
  'verification_result',
  'handoff',
  'context_request',
  'context_response',
  'blocked_notice',
  'proposal',
  'critique',
  'status_update',
]);

export interface ParsedDoorwayActionBlock {
  readonly rawText: string;
  readonly fields: Readonly<Record<string, string>>;
}

export interface TerminalActionRoutingResult {
  readonly blockId: string;
  readonly status: 'routed' | 'responded' | 'rejected';
  readonly routedMessageId?: string;
  readonly handledMessageIds?: readonly string[];
  readonly terminalResponseText?: string;
  readonly error?: string;
}

interface MeshAgentLookupRow {
  readonly id: string;
  readonly display_name: string;
  readonly tool_name: string;
  readonly role: string;
  readonly mailbox_id: string;
}

export function parseDoorwayActionBlocks(buffer: string): readonly ParsedDoorwayActionBlock[] {
  return [...buffer.matchAll(doorwayActionBlockPattern)].map((match) => {
    const body = match[1] ?? '';
    return {
      rawText: match[0],
      fields: parseActionFields(body),
    };
  });
}

export function routeTerminalActionBlocks(
  db: Database.Database,
  options: {
    readonly threadId: ThreadId;
    readonly terminalSessionId: TerminalSessionId;
    readonly chunkSequence: number;
    readonly text: string;
  }
): readonly TerminalActionRoutingResult[] {
  return parseDoorwayActionBlocks(options.text).map((block) =>
    routeTerminalActionBlock(db, options, block)
  );
}

function routeTerminalActionBlock(
  db: Database.Database,
  options: {
    readonly threadId: ThreadId;
    readonly terminalSessionId: TerminalSessionId;
    readonly chunkSequence: number;
  },
  block: ParsedDoorwayActionBlock
): TerminalActionRoutingResult {
  const sourceAgent = findAgentByTerminalSession(db, options.threadId, options.terminalSessionId);
  if (!sourceAgent) {
    return recordTerminalActionBlock(db, {
      threadId: options.threadId,
      terminalSessionId: options.terminalSessionId,
      block,
      status: 'rejected',
      error: 'No Agent Mesh sender is registered for this terminal.',
    });
  }

  switch (block.fields.type) {
    case 'send_message':
      return routeSendMessageBlock(db, options, block, sourceAgent);
    case 'pull_messages':
    case 'wait_for_response':
      return routePullMessagesBlock(db, options, block, sourceAgent);
    default:
      return recordTerminalActionBlock(db, {
        threadId: options.threadId,
        terminalSessionId: options.terminalSessionId,
        sourceAgentId: sourceAgent.id,
        block,
        status: 'rejected',
        error: 'Unsupported doorway-action type.',
      });
  }
}

function routeSendMessageBlock(
  db: Database.Database,
  options: {
    readonly threadId: ThreadId;
    readonly terminalSessionId: TerminalSessionId;
    readonly chunkSequence: number;
  },
  block: ParsedDoorwayActionBlock,
  sourceAgent: MeshAgentLookupRow
): TerminalActionRoutingResult {
  const validation = validateSendMessageBlock(block);
  if (validation.valid === false) {
    return recordTerminalActionBlock(db, {
      threadId: options.threadId,
      terminalSessionId: options.terminalSessionId,
      sourceAgentId: sourceAgent.id,
      block,
      status: 'rejected',
      error: validation.error,
    });
  }
  const targetAgent = findTargetAgent(db, options.threadId, validation.to);
  if (!targetAgent) {
    return recordTerminalActionBlock(db, {
      threadId: options.threadId,
      terminalSessionId: options.terminalSessionId,
      sourceAgentId: sourceAgent?.id,
      block,
      status: 'rejected',
      error: `No Agent Mesh target matched "${validation.to}".`,
    });
  }

  const message = sendPeerMessage(db, {
    threadId: options.threadId,
    fromAgentId: sourceAgent.id,
    toAgentId: targetAgent.id,
    kind: validation.kind,
    content: validation.message,
    evidenceRefs: [`terminal:${options.terminalSessionId}:${options.chunkSequence}`],
  });

  return recordTerminalActionBlock(db, {
    threadId: options.threadId,
    terminalSessionId: options.terminalSessionId,
    sourceAgentId: sourceAgent.id,
    block,
    status: 'routed',
    routedMessageId: message.id,
  });
}

function routePullMessagesBlock(
  db: Database.Database,
  options: {
    readonly threadId: ThreadId;
    readonly terminalSessionId: TerminalSessionId;
  },
  block: ParsedDoorwayActionBlock,
  sourceAgent: MeshAgentLookupRow
): TerminalActionRoutingResult {
  const from = block.fields.from?.trim();
  const fromAgent = from ? findTargetAgent(db, options.threadId, from) : undefined;
  if (from && !fromAgent) {
    return recordTerminalActionBlock(db, {
      threadId: options.threadId,
      terminalSessionId: options.terminalSessionId,
      sourceAgentId: sourceAgent.id,
      block,
      status: 'rejected',
      error: `No Agent Mesh source matched "${from}".`,
    });
  }

  const messages = pullPeerMessages(db, sourceAgent.id).filter((message) =>
    fromAgent ? message.fromAgentId === fromAgent.id : true
  );
  const handledMessageIds = messages.map((message) => message.id);
  for (const messageId of handledMessageIds) {
    markPeerMessageHandled(db, messageId);
  }

  const terminalResponseText = formatPulledPeerMessages(
    sourceAgent,
    messages.map((message) => ({
      from: findAgentById(db, message.fromAgentId),
      kind: message.kind,
      content: message.content,
      evidenceRefs: message.evidenceRefs,
    }))
  );

  return recordTerminalActionBlock(db, {
    threadId: options.threadId,
    terminalSessionId: options.terminalSessionId,
    sourceAgentId: sourceAgent.id,
    block,
    status: 'responded',
    handledMessageIds,
    terminalResponseText,
  });
}

function parseActionFields(body: string): Readonly<Record<string, string>> {
  const fields: Record<string, string> = {};
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const separator = trimmed.indexOf(':');
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)) {
      fields[key] = unquoteActionValue(value);
    }
  }
  return fields;
}

function unquoteActionValue(value: string): string {
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function validateSendMessageBlock(block: ParsedDoorwayActionBlock):
  | {
      readonly valid: true;
      readonly to: string;
      readonly kind: MeshMessageKind;
      readonly message: string;
    }
  | { readonly valid: false; readonly error: string } {
  const to = block.fields.to?.trim();
  if (!to) {
    return { valid: false, error: 'send_message requires a target agent.' };
  }
  const kind = block.fields.kind?.trim() as MeshMessageKind | undefined;
  if (!kind || !sendMessageKinds.has(kind)) {
    return { valid: false, error: 'send_message has an invalid message kind.' };
  }
  const message = block.fields.message?.trim();
  if (!message) {
    return { valid: false, error: 'send_message requires a message.' };
  }
  return { valid: true, to, kind, message };
}

function formatPulledPeerMessages(
  sourceAgent: MeshAgentLookupRow,
  messages: readonly {
    readonly from: MeshAgentLookupRow | undefined;
    readonly kind: MeshMessageKind;
    readonly content: string;
    readonly evidenceRefs: readonly string[];
  }[]
): string {
  if (messages.length === 0) {
    return `Doorway peer messages for ${sourceAgent.display_name}:\n\nNo unread peer messages.`;
  }

  return [
    `Doorway peer messages for ${sourceAgent.display_name}:`,
    '',
    ...messages.flatMap((message, index) => [
      `${index + 1}. From ${message.from?.display_name ?? 'Unknown agent'} [${message.kind}]`,
      message.content,
      message.evidenceRefs.length > 0 ? `Evidence: ${message.evidenceRefs.join(', ')}` : '',
      '',
    ]),
  ]
    .join('\n')
    .trimEnd();
}

function findAgentByTerminalSession(
  db: Database.Database,
  threadId: ThreadId,
  terminalSessionId: TerminalSessionId
): MeshAgentLookupRow | undefined {
  return db
    .prepare(
      `
      SELECT id, display_name, tool_name, role, mailbox_id
      FROM agent_mesh_agents
      WHERE thread_id = ? AND terminal_session_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `
    )
    .get(threadId, terminalSessionId) as MeshAgentLookupRow | undefined;
}

function findTargetAgent(
  db: Database.Database,
  threadId: ThreadId,
  target: string
): MeshAgentLookupRow | undefined {
  const normalizedTarget = normalizeRouteToken(target);
  const agents = db
    .prepare(
      `
      SELECT id, display_name, tool_name, role, mailbox_id
      FROM agent_mesh_agents
      WHERE thread_id = ?
      ORDER BY created_at ASC
    `
    )
    .all(threadId) as MeshAgentLookupRow[];
  return agents.find((agent) =>
    [agent.id, agent.mailbox_id, agent.tool_name, agent.display_name, agent.role].some(
      (candidate) => normalizeRouteToken(candidate) === normalizedTarget
    )
  );
}

function findAgentById(db: Database.Database, agentId: string): MeshAgentLookupRow | undefined {
  return db
    .prepare(
      `
      SELECT id, display_name, tool_name, role, mailbox_id
      FROM agent_mesh_agents
      WHERE id = ?
    `
    )
    .get(agentId) as MeshAgentLookupRow | undefined;
}

function normalizeRouteToken(value: string): string {
  return value
    .trim()
    .replace(/^@/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function recordTerminalActionBlock(
  db: Database.Database,
  input: {
    readonly threadId: ThreadId;
    readonly terminalSessionId: TerminalSessionId;
    readonly sourceAgentId?: string;
    readonly block: ParsedDoorwayActionBlock;
    readonly status: 'routed' | 'responded' | 'rejected';
    readonly routedMessageId?: string;
    readonly handledMessageIds?: readonly string[];
    readonly terminalResponseText?: string;
    readonly error?: string;
  }
): TerminalActionRoutingResult {
  const blockId = generateId('action_block');
  db.prepare(
    `
    INSERT INTO terminal_action_blocks (
      id, thread_id, terminal_session_id, agent_id, raw_text, parsed_json,
      validation_status, validation_error, routed_message_id, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    blockId,
    input.threadId,
    input.terminalSessionId,
    input.sourceAgentId ?? null,
    redactTerminalText(input.block.rawText),
    JSON.stringify(input.block.fields),
    input.status,
    input.error ?? null,
    input.routedMessageId ?? null,
    toISOString(new Date())
  );

  return {
    blockId,
    status: input.status,
    ...(input.routedMessageId ? { routedMessageId: input.routedMessageId } : {}),
    ...(input.handledMessageIds ? { handledMessageIds: input.handledMessageIds } : {}),
    ...(input.terminalResponseText ? { terminalResponseText: input.terminalResponseText } : {}),
    ...(input.error ? { error: input.error } : {}),
  };
}
