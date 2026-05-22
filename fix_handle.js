const fs = require('fs');
const path = 'apps/desktop/src/renderer/ComposerDock.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(/const handleKeyDown =[\s\S]*?};/, `const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!loading && prompt.trim() && !isComposerBlocked) {
        void submitPrompt();
      }
    }
    // Automatically show command palette when typing / at the start
    if (e.key === '/' && prompt === '') {
      e.preventDefault();
      setShowCommands(true);
    }
  };`);

fs.writeFileSync(path, code);
