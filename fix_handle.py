import re

with open('apps/desktop/src/renderer/ComposerDock.tsx', 'r') as f:
    code = f.read()

replacement = """const handleKeyDown = (e: React.KeyboardEvent) => {
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
  };"""

code = re.sub(r'const handleKeyDown =.*?};\n', replacement + '\n', code, flags=re.DOTALL)

with open('apps/desktop/src/renderer/ComposerDock.tsx', 'w') as f:
    f.write(code)
