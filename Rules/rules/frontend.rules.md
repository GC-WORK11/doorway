# Doorway Frontend Rules (Premium Edition)

## 0. The Silicon Valley "Unicorn" Aesthetic

Doorway's frontend must not just be functional—it must be the most high-end, premium cockpit in the market, standing shoulder-to-shoulder with products like **Cursor, Linear, Raycast, and Vercel**. It must deliver a jaw-dropping "WOW" factor immediately.

The design philosophy is built on three pillars:
- **Fast:** The interface prioritizes speed and keyboard-first navigation.
- **Simple:** Strip away unnecessary UI elements to prioritize content. Use "Compact Modes" to blend secondary elements and reduce visual noise.
- **Delightful:** Beauty is maintained through simplicity, with meticulous attention to typography, subtle animations, and refined materials.

## 1. Typography Mastery

Typography is the foundation of the Doorway aesthetic. It must project an "engineering-first" vibe—communicating precision, professionalism, and craft.

- **Mandatory Fonts:** Use **Geist** or **Inter** as the primary sans-serif for UI elements, headings, and body text. Use **Geist Mono** for code editors, terminals, and technical data.
- **Airy Readability (Tracking):** In dark mode, employ positive letter-spacing (e.g., `+0.2px` to `+0.4px`) to compensate for dark backgrounds, preventing text from appearing too dense.
- **Weight & Scale:** Use medium weights (500) as the baseline for body text to provide "heft." Headings should be structural but avoid over-the-top spectacle.
- **OpenType Features:** Utilize features like `calt`, `kern`, and `liga` to maintain a consistent, professional typographic voice.

## 2. Color & Contrast Discipline (Dark Mode First)

The UI must mimic high-end coding environments to reduce eye strain and feel professional.

- **Monochrome Foundation:** The palette is predominantly deep blacks, charcoals, and grays (e.g., `--bg-primary: #0a0a0b`, `--bg-elevated: #1a1a1d`).
- **High Contrast Text:** Ensure text colors are carefully calibrated for maximum readability (pure whites or high-opacity grays for primary text, e.g., `rgba(255, 255, 255, 0.7)` for secondary).
- **Sparing Accent Colors:** Use rare, vibrant accent colors (e.g., an indigo or vibrant blue) only when necessary to draw focus or indicate state.
- **No Generic Colors:** Absolutely forbid basic HTML flat colors (plain red, blue, green). Use tailored HSL/Tailwind colors.

## 3. Layout, Space, & Alignment

- **Generous Whitespace:** Emphasize "air" over density. Double the spacing that feels "enough" to let content breathe and reduce cognitive load.
- **Systematic Alignment:** Everything must be measured and intentional, relying on precise grid tokens to convey architectural structure and reliability.
- **Centralized Action:** Interfaces should be action-oriented. Prioritize centralized search bars or floating command palettes (like Raycast) that grab immediate attention and group interaction options consistently.

## 4. Materials & Micro-interactions

Interactions must feel alive, responsive, and tactile.

- **Glassmorphism:** Use backdrop filters (`backdrop-blur`) heavily for floating elements, dialogs, command palettes, and docks to create depth without clutter.
- **Subtle Borders:** Use ultra-thin, low-opacity borders (e.g., `border-white/10`) to delineate sections seamlessly.
- **Purposeful Motion:** Animations should clarify cause-and-effect, not just "delight." Use smooth, fast micro-interactions (e.g., `transition-all duration-200` to `250ms ease-out`) for hover states, floating menus, and list items.

## 5. No Fake Production State (The Doorway Core)

A premium UI is an honest UI. Every user-visible claim needs evidence or an honest unknown state.

Production UI may show ONLY:
- Backend projections (e.g., `ThreadProjection`, `TerminalSession`)
- Real persisted events
- Real terminal sessions and transcripts
- Honest loading, empty, error, or unconfigured states

**Forbidden:** Do not ship fake projects, chats, proofs, diffs, test results, terminal output, agent status, model lists, dummy data, or hardcoded "success" states.

Examples of Honesty:
- "Claude running" requires an active `ToolLane` or `TerminalSession` projection.
- "Tests passed" requires a cryptographically sound `TestProof`.
- "3 files changed" requires `FileDelta` evidence.

## 6. Visual Taste Gate

Frontend changes **FAIL** if they:
- Look cheap, cluttered, or use basic browser default stylings.
- Lack proper hover states or smooth transitions.
- Use generic, uncurated colors.
- Break the Tailwind/Shadcn design system or the monochromatic dark theme.
- Inject fake data, mock states, or "slop."

Frontend changes **PASS** if they improve:
- The "WOW" factor and premium Silicon Valley feel.
- Calm density with readable, airy capsules.
- Fast surface switching with beautiful micro-interactions.
- The alignment with the core 9 Features of Doorway (Terminal Harness, Subagent Orchestration, Unified Threads, etc.).
