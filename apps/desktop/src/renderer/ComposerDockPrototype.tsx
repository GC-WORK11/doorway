import React, { useRef, useEffect } from 'react';
import type { AgentLaunchMode } from '@doorway/protocol';
import { ProjectInstructionStatus, type ComposerLaunchPreflight, type ComposerMentionTarget } from './shared-ui';
import { CommandPalette } from './CommandPalette';
import { ContextUsageIndicator } from './ContextUsageIndicator';
import { motion, AnimatePresence } from 'framer-motion';

import { useHarnessState } from './HarnessContext';

export function ComposerDock() {
  const {
    loading,
    prompt,
    setPrompt,
    showCommands,
    setShowCommands,
    activeMentionTargets,
    policySummary,
    launchPreflight,
    isComposerBlocked,
    activeThreadExists: activeThread,
    runSlashCommand: onRunSlashCommand,
    applyComposerMention: onApplyComposerMention,
    submitPrompt,
    projectMemorySources,
  } = useHarnessState();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [prompt]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!loading && prompt.trim() && !isComposerBlocked) {
        void submitPrompt();
      }
    }
    // If empty and they type '/', maybe we could open commands, but there's a button for it.
    if (e.key === '/' && prompt === '') {
      // Optional: automatically show command palette when typing / at the start
      setShowCommands(true);
    }
  };

  return (
    <motion.section
      className="fixed bottom-8 left-1/2 z-50 w-full max-w-[720px] -translate-x-1/2 flex flex-col gap-2"
      aria-label="Composer"
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
    >
      {/* Policy & Context Status - Float above */}
      <div className="flex justify-between items-end px-2">
        <div className="flex flex-col gap-1 items-start">
          <ProjectInstructionStatus sources={projectMemorySources} />
          {activeThread && (
            <div className="flex gap-2 text-xs font-medium tracking-wide">
              {policySummary.map((item: any) => (
                <span
                  key={item.label}
                  className={`px-2 py-0.5 rounded-full border border-white/10 ${
                    item.tone === 'blocked'
                      ? 'bg-red-500/10 text-red-400'
                      : item.tone === 'warning'
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-white/5 text-white/50'
                  }`}
                >
                  {item.label}
                </span>
              ))}
              {!launchPreflight.canSubmit && launchPreflight.reason && (
                <span className="px-2 py-0.5 rounded-full border border-red-500/20 bg-red-500/10 text-red-400">
                  {launchPreflight.reason}
                </span>
              )}
            </div>
          )}
        </div>
        <ContextUsageIndicator threshold={0.8} />
      </div>

      {/* Main Composer Box */}
      <div className="relative flex flex-col bg-[#0a0a0b]/80 backdrop-blur-2xl rounded-2xl border border-white/[0.08] shadow-[0_16px_32px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.05)] focus-within:border-white/[0.15] focus-within:shadow-[0_16px_32px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.1),0_0_0_1px_rgba(255,255,255,0.05)] transition-all duration-300">
        
        {/* Mentions Dropdown */}
        <AnimatePresence>
          {activeMentionTargets.length > 0 && (
            <motion.div
              className="absolute bottom-full mb-2 left-0 w-64 bg-[#1a1a1d] border border-white/10 rounded-xl shadow-xl overflow-hidden flex flex-col"
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            >
              {activeMentionTargets.map((target: any, idx: number) => (
                <button
                  type="button"
                  key={target.id}
                  onClick={() => onApplyComposerMention(target)}
                  className={`flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-white/10 transition-colors ${idx !== 0 ? 'border-t border-white/5' : ''}`}
                >
                  <span className="text-white/90 font-medium">{target.label}</span>
                  <span className="text-white/40 text-xs truncate ml-2">{target.detail}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Row */}
        <div className="flex items-center min-h-[56px] px-3 py-2">
          {/* Command Menu Button */}
          <button
            type="button"
            onClick={() => setShowCommands((v: boolean) => !v)}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/90 hover:bg-white/5 transition-colors"
            aria-label="Open command menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="4" y1="9" x2="20" y2="9" />
              <line x1="4" y1="15" x2="20" y2="15" />
            </svg>
          </button>

          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Doorway to coordinate a coding task..."
            className="flex-1 bg-transparent border-none outline-none text-white/90 placeholder:text-white/30 resize-none py-1.5 px-3 max-h-[200px] overflow-y-auto text-[15px] font-sans leading-relaxed"
            rows={1}
            aria-label="Prompt"
          />

          {/* Send Button */}
          <button
            type="button"
            disabled={loading || !prompt.trim() || isComposerBlocked}
            onClick={() => void submitPrompt()}
            title={isComposerBlocked ? launchPreflight.reason : 'Send message'}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/90 hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/40 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      <CommandPalette
        open={showCommands}
        onClose={() => setShowCommands(false)}
        onRunCommand={onRunSlashCommand}
      />
    </motion.section>
  );
}
