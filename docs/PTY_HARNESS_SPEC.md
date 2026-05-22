# Doorway PTY Harness Specification

## 1. Overview
The Doorway PTY Harness provides a 100% pure CLI abstraction layer for driving external tools (like Claude Code and Codex) without relying on any vendor-specific SDKs. By interacting exclusively through standard Pseudo-Terminal (PTY) interfaces, the harness can cleanly capture, watch, run, and diagnose terminal CLIs. 

It explicitly enforces Doorway's core UI principles by encapsulating raw ANSI logs entirely within the backend, projecting only clean semantic state (e.g., "running", "waiting_for_input", "failed") to the user-facing renderer.

## 2. Core Architecture

### 2.1 The Terminal Runtime (`pty-backend.ts`)
The foundational layer is built on `node-pty`, providing a cross-platform (Linux, macOS, Windows/ConPTY) implementation of the `TerminalBackend` interface.
* **Process Execution:** Uses raw process spawning (`bash`, `powershell`) to guarantee an authentic terminal environment.
* **Raw I/O Routing:** Implements standard `resize`, `write`, `onData`, and `kill` interfaces that interact with the child process without needing to understand the underlying tool payload.

### 2.2 Session Management & Log Encapsulation (`session.ts`)
The `SessionManager` orchestrates the lifecycle of all running agents.
* **Transcript Chunking:** All terminal output is intercepted and stored as sequential `TranscriptChunk` objects. 
* **UI Isolation:** This continuous buffer is maintained solely in the backend. Raw output logs are **never** streamed raw to the frontend UI. The frontend instead consumes deterministic evidence projections derived from these transcripts.
* **Auto-Re-Run & Multiplexing:** Provides reliable `launchCommand()` and `closeAll()` controls to cleanly boot, restart, or multiplex sessions for autonomous loops without process leaks.

### 2.3 Fault Finding and Telemetry
The harness uses two specialized layers to autonomously identify failures and stuck states:
1. **Exit Taxonomy (`exit-taxonomy.ts`)**: Semantically classifies process exits. Rather than relying on rigid error SDKs, it maps POSIX signals (e.g., SIGSEGV, SIGKILL) and numeric exit codes to actionable states (`TerminalExitClassification`).
2. **Process Tracking (`process-tracker.ts`)**: Uses deep `ps` process tree introspection to monitor parent-child process branches. This allows the harness to catch zombie processes, silent hangs, or high-CPU runaways without requiring cooperative integration from the child CLI.

## 3. Workflow Mechanics

### 3.1 Run & Watch
1. **Launch:** `SessionManager.launchCommand('claude', [...args])` provisions an isolated PTY.
2. **Watch:** The output watcher stream processes `onData` chunks asynchronously. Pattern-matching policies (defined in the orchestrator) monitor this stream for permission prompts, test completions, or failure phrases without blocking the UI.
3. **Completion Confidence:** "Done" states are inferred heuristically based on the terminal prompt returning, specific phrases, or clean exit codes, avoiding artificial "timeout" hacks.

### 3.2 Error & Recovery (Clean Abstraction)
When a CLI tool fails:
1. The backend triggers an `onExit` event.
2. `exit-taxonomy.ts` decodes the failure (e.g., `exit 127` -> `command_not_found`).
3. The orchestrator lane updates its status to `failed` or `stuck` and associates evidence.
4. If an automated recovery strategy exists, the harness cleanly respawns the PTY session.

## 4. Alignment with Doorway Rules
This design satisfies Doorway's rigid rules (`rules/harness-orchestrator.rules.md`):
* **No fake terminal state:** If the PTY isn't running, the UI honest states it.
* **TerminalRuntime owns execution:** Adapters only produce launch specs.
* **No hidden failures:** Exit taxonomies capture and expose exact crash types. 
* **Real PTYs:** All visible worker lanes run in a guaranteed, authentic PTY.
