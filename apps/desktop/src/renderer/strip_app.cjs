const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

// 1. Remove TerminalMuxPanel import
code = code.replace(/import \{ TerminalMuxPanel \} from '\.\/TerminalMuxPanel';\n/, '');

// 2. Import LivePermissionModal and Request
code = code.replace(
  /import \{ ThreadCanvas \} from '\.\/ThreadCanvas';/,
  'import { LivePermissionModal, type LivePermissionRequest } from "./modals";\nimport { ThreadCanvas } from "./ThreadCanvas";'
);

// 3. Remove LivePermissionRequest interface
code = code.replace(
  /interface LivePermissionRequest \{\s*readonly sourceEventId: string;\s*readonly runId\?: string;\s*readonly sessionId\?: string;\s*readonly command: string;\s*readonly riskCategory: string;\s*readonly reason: string;\s*readonly evidence: string;\s*readonly requestedAt: Date;\s*\}/,
  ''
);

// 4. Remove LivePermissionModal function
code = code.replace(
  /export function LivePermissionModal\([\s\S]*?<\/section>\s*<\/div>\s*\);\s*\}/,
  ''
);

// 5. Remove all the capsules
const capsules = [
  'SessionActivityCapsule',
  'EvidenceFeedCapsule',
  'PeerMessagesCapsule',
  'TerminalTranscriptCapsule',
  'DiffPreviewCapsule',
  'InlineHandoffCapsule',
  'ActiveWorktreeCapsule',
  'TaskGraphCapsule',
  'MergeReviewCapsule',
  'ApprovalHistoryCapsule',
];

for (const capsule of capsules) {
  const regex = new RegExp(
    `export function ${capsule}\\([\\s\\S]*?<\\/article>\\s*(\\)\\s*)?;?\\s*\\}`
  );
  code = code.replace(regex, '');
}
// TaskGraphCapsule and InlineHandoffCapsule return Fragments `</>` so the regex needs to handle that.
code = code.replace(/export function TaskGraphCapsule\([\s\S]*?<\/>\s*\);\s*\}/, '');
code = code.replace(/export function InlineHandoffCapsule\([\s\S]*?<\/>\s*\);\s*\}/, '');

// 6. Remove latestTerminalTranscriptChunks
code = code.replace(/export function latestTerminalTranscriptChunks\([\s\S]*?\}\s*\n/, '');

fs.writeFileSync('App.tsx', code);
