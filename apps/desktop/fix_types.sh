# Fix ComposerDock.tsx implicit any
sed -i 's/(value) => !value/(value: boolean) => !value/' src/renderer/ComposerDock.tsx
sed -i 's/policySummary.map((item)/policySummary.map((item: any)/' src/renderer/ComposerDock.tsx
sed -i 's/activeMentionTargets.map((target)/activeMentionTargets.map((target: any)/' src/renderer/ComposerDock.tsx

# Fix SurfaceDrawer.tsx implicit any
sed -i 's/worktrees.map((worktree)/worktrees.map((worktree: any)/' src/renderer/SurfaceDrawer.tsx
sed -i 's/activeDiff.files.map((file)/activeDiff.files.map((file: any)/' src/renderer/SurfaceDrawer.tsx
sed -i 's/onSelectTerminalSession(/selectTerminalSession(/g' src/renderer/SurfaceDrawer.tsx

# Fix TerminalMuxPanel.tsx
sed -i 's/onClick={onCreateSession}/onClick={() => void onCreateSession()}/' src/renderer/TerminalMuxPanel.tsx

# Fix ThreadCanvas.tsx imports
sed -i 's/AgentActivityCapsule,/SessionActivityCapsule,/' src/renderer/ThreadCanvas.tsx
sed -i '/CompactCheckpointCapsule,/d' src/renderer/ThreadCanvas.tsx

