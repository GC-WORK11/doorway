# DOORWAY: PI-AGENT-STYLE SELF-ADAPTING CONFIGURATION SPEC

**Document Status:** Draft
**Target Component:** `SelfAdaptationService` (Core / Orchestrator)
**Version:** 1.0

---

## 1. Executive Summary

Doorway must not be a static IDE. It must adapt to the user's workflows, project context, and explicit natural language requests. Modeled after the Pi-agent style of adaptability, Doorway will dynamically adjust its UI, orchestration parameters, context compaction, and underlying configurations. This capability ensures the IDE evolves alongside the user without requiring manual traversal of configuration menus.

**Key Scenario:** A user says, *"I'm going out, put yourself in auto-compact mode."* Doorway detects this intent, automatically adjusts context retention thresholds, alters the UI to show fewer intermediate steps, and confirms the change.

---

## 2. Core Principles & Rules

1. **Explicit Consent for Risky Actions:** UI/Config adaptations (like themes or compaction) can happen automatically, but destructive or workflow-altering adaptations (like creating an automated scheduled job that writes files) still require user approval as per `adaptive-automation.rules.md`.
2. **Real Configuration State:** Adaptations must be written to actual configuration stores (e.g., `OperationalMemory` or project config files) so they persist across sessions. No fake "adapted" states.
3. **Evidence-Backed Confirmation:** When the IDE adapts, it must inform the user in the unified thread, detailing exactly what parameters were changed.
4. **Layer Discipline:** The UI rendering of the adaptation must be driven entirely by the backend projection of the new configuration.

---

## 3. Architecture & Data Flow

The `SelfAdaptationService` sits within the `core` package and acts as middleware between user input/thread messages and the configuration/UI state.

### 3.1. Flow of Adaptation

1. **Detection:** User input is scanned by the `SelfAdaptationService` against a set of regular expression triggers or NLP embeddings.
2. **Evaluation:** The service evaluates the `AdaptationContext` (current thread, project, memory) and determines the exact state changes required (e.g., `autoCompactThreshold: 0.8`).
3. **Execution:** The service updates the backend state via `OperationalMemory` or by emitting system events.
4. **Event Emission:** An `adaptation_applied` event is emitted on the EventBus.
5. **UI Update (Projection):** The frontend listens for the state change and updates the IDE UI (e.g., collapsing the context window visually).

---

## 4. Adaptation Triggers & Scenarios

### 4.1. The Auto-Compact Mode
* **Trigger:** `"Put yourself in auto-compact mode"` or `"Enable auto-compaction"`
* **Action:** `adjust_compaction`
* **Changes:** 
  - `autoCompactThreshold` is lowered to aggressively prune context.
  - `compactModeEnabled` flag is set to true.
* **UI Reflection:** The chat thread collapses intermediate thought processes, diffs become summarized, and the IDE chrome shrinks.

### 4.2. Dynamic Model Routing
* **Trigger:** `"From now on, use Codex for boilerplate"`
* **Action:** `change_model`
* **Changes:** Modifies user preferences in `OperationalMemory` to route boilerplate requests to the Codex agent lane by default.
* **UI Reflection:** Subsequent boilerplate tasks automatically show the Codex terminal lane instead of the Claude lane.

### 4.3. UI Theme / Layout Adjustments
* **Trigger:** `"Switch to dark mode"` or `"Show me the process tree"`
* **Action:** `adapt_ui`
* **Changes:** Updates IDE layout preferences (e.g., `theme: "dark"`, `panels: ["process-tree"]`).
* **UI Reflection:** React frontend instantly repaints based on the backend projection.

---

## 5. Implementation Scaffold

The interface for the `SelfAdaptationService` is scaffolded in `packages/core/src/self-adaptation-service.ts`.

### Key Interfaces

```typescript
export interface AdaptationTrigger {
  pattern: RegExp;
  action: 'adjust_compaction' | 'change_model' | 'add_context' | 'adapt_ui' | 'update_config';
  confidence: number;
}

export interface AdaptationResult {
  applied: boolean;
  action: string;
  message: string;
  changes?: Record<string, any>;
}
```

### Integration Points
- **`EventBus`:** Used to broadcast changes to the frontend renderer.
- **`OperationalMemory`:** Stores the learned user preferences permanently.
- **`ThreadService`:** The service evaluating user prompts must route them through `SelfAdaptationService.evaluateAdaptation(context)` before sending them to the LLM agent, allowing the IDE to intercept configuration commands.

---

## 6. Definition of Done

To consider the self-adaptation feature complete:
- [x] Technical spec drafted (`docs/SELF_ADAPTING_SPEC.md`).
- [x] Logic scaffolded (`packages/core/src/self-adaptation-service.ts`).
- [ ] Service wired into the orchestrator message loop.
- [ ] Auto-compact mode end-to-end tests pass.
- [ ] UI correctly reflects state changes dynamically.
- [ ] No fake UI states; all adaptations persist to the operational memory database.
