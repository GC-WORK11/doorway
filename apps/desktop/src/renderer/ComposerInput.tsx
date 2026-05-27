/**
 * ComposerInput — The Floating Input Card
 *
 * PRD Spec (Pillar Three §3.3):
 * - Project selector (top row)
 * - Auto-expanding textarea (middle)
 * - Model selector + context indicator (bottom row)
 * - Background: #FFFFFF, border-radius: 12px, shadow: 0 2px 8px rgba(0,0,0,0.08)
 */

import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHarnessState } from './HarnessContext';
import type { ComposerMentionTarget } from './shared-ui';

export function ComposerInput() {
  const {
    loading,
    prompt,
    setPrompt,
    provider,
    setProvider,
    isComposerBlocked,
    submitPrompt,
    activeMentionTargets,
    applyComposerMention,
  } = useHarnessState();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showModelDropdown, setShowModelDropdown] = React.useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [prompt]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!loading && prompt.trim() && !isComposerBlocked) {
        void submitPrompt();
      }
    }
  };

  const readableProvider = provider
    ? provider.charAt(0).toUpperCase() + provider.slice(1)
    : 'Adaptive';

  return (
    <motion.div
      className="composer-input-wrapper"
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
    >
      <button className="composer-btn" type="button" aria-label="Attach file">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
        </svg>
      </button>

      <button className="composer-btn" type="button" aria-label="Add action">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>

      <div
        className="composer-model-pill"
        style={{ position: 'relative', cursor: 'pointer' }}
        onClick={() => setShowModelDropdown(!showModelDropdown)}
      >
        <span>{provider === 'agy' ? 'Agy CLI' : readableProvider}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
        {showModelDropdown && (
          <div
            className="model-dropdown-menu"
            style={{
              position: 'absolute',
              bottom: '40px',
              left: '0',
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              padding: '4px',
              minWidth: '120px'
            }}
          >
            {['adaptive', 'agy'].map((prov) => (
              <button
                key={prov}
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '8px 12px',
                  textAlign: 'left',
                  fontSize: '13px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  color: '#111',
                  fontWeight: provider === prov || (prov === 'adaptive' && !provider) ? 'bold' : 'normal'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setProvider(prov === 'adaptive' ? '' : prov);
                  setShowModelDropdown(false);
                }}
              >
                {prov === 'agy' ? 'Agy CLI' : (prov.charAt(0).toUpperCase() + prov.slice(1))}
              </button>
            ))}
          </div>
        )}
      </div>

      <textarea
        ref={textareaRef}
        className="composer-textarea"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask Doorway to build, refactor, debug, or orchestrate..."
        aria-label="Prompt"
        rows={1}
      />

      <button
        className="composer-btn submit"
        type="button"
        disabled={loading || !prompt.trim() || isComposerBlocked}
        onClick={() => void submitPrompt()}
        aria-label="Send prompt"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
        </svg>
      </button>

      <AnimatePresence>
        {activeMentionTargets.length > 0 && (
          <motion.div
            className="mention-menu"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            {activeMentionTargets.map((target: ComposerMentionTarget) => (
              <button type="button" key={target.id} onClick={() => applyComposerMention(target)}>
                <span>{target.label}</span>
                <small>{target.detail}</small>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
