const fs = require('fs');
let content = fs.readFileSync('App.test.tsx', 'utf-8');

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
    `const \\{([^}]*)\\b${capsule}\\b([^}]*)\\} = await import\\('\\.\\/App'\\);`,
    'g'
  );
  content = content.replace(regex, (match, p1, p2) => {
    const others = [p1, p2]
      .map((s) => s.trim().replace(/^,|,$/g, '').trim())
      .filter(Boolean)
      .join(', ');
    if (others) {
      return `const { ${others} } = await import('./App');\n    const { ${capsule} } = await import('./chat-widgets');`;
    }
    return `const { ${capsule} } = await import('./chat-widgets');`;
  });

  // also fix multiline destructing if any
  // e.g. ActiveWorktreeCapsule in `const { ... } = await import('./App');` block
}

// Special cases if the regex missed multiline imports:
content = content.replace(/ActiveWorktreeCapsule,\s*React/g, 'React');
content = content.replace(/PeerMessagesCapsule,\s*React/g, 'React');

fs.writeFileSync('App.test.tsx', content);
