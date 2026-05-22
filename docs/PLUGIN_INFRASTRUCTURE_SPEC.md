# Doorway Plugin & OAuth Infrastructure Specification

## 1. Executive Summary

Doorway requires a highly scalable, extensible, and secure Plugin and OAuth infrastructure capable of supporting 300+ plugins—comparable to the Codex desktop application—while maintaining a modular, provider-swappable architecture. This specification details the Extension Plane, which governs how skills, connectors (like Gmail and GitHub PRs), MCP servers, and identity flows are managed within the Doorway IDE ecosystem.

## 2. Core Concepts

To maintain clarity and align with market standards (e.g., Anthropic Agent Skills standard, Codex plugin ecosystem), Doorway differentiates between the following primitives:

- **Skills**: The authoring format for reusable workflows. Represented by a `SKILL.md` file and optional local scripts/templates.
- **Connectors**: Integrations that interact with external services and APIs (e.g., GitHub, Gmail, Linear) requiring authentication and network access.
- **Plugins**: The installable, distributable bundle that packages skills, connectors, app integrations, MCP configurations, and UI hooks.
- **MCP Servers**: Standardized external context providers exposing **Tools**, **Resources**, and **Prompts** to the agent via the Model Context Protocol.

## 3. High-Level Architecture

The Plugin system resides in the **Extension Plane**, interacting closely with the **Orchestrator** and **Execution Kernel**.

```text
┌─────────────────────────────────────────────────────────────┐
│                       Doorway UI                            │
│  (Plugin Directory, OAuth Settings, Automation Builder)     │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
┌──────────────▼───────────────────────────────▼──────────────┐
│                  Extension Plane                            │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Plugin       │  │ OAuth / Auth │  │ MCP Server        │  │
│  │ Manager      │  │ Controller   │  │ Client            │  │
│  └──────────────┘  └──────────────┘  └───────────────────┘  │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
┌──────────────▼───────────────────────────────▼──────────────┐
│                  Doorway Orchestrator                       │
│  (Policy Engine, Subagent Dispatcher, Context Assembler)    │
└─────────────────────────────────────────────────────────────┘
```

## 4. Plugin System Design

To support 300+ plugins efficiently without degrading application performance:

### 4.1 Plugin Manifest (`plugin.json`)
Every plugin must include a strict `plugin.json` defining metadata, required permissions, bundled skills, MCP servers, and OAuth dependencies.

```json
{
  "id": "doorway.github.pr",
  "version": "1.0.0",
  "name": "GitHub Pull Requests",
  "capabilities": {
    "mcpServers": ["./mcp-server/index.js"],
    "skills": ["./skills/review-pr/SKILL.md"],
    "oauth": ["github"]
  },
  "permissions": {
    "network": ["api.github.com"],
    "filesystem": ["read"]
  }
}
```

### 4.2 Local and Remote Registry
- **Remote Marketplace**: A centralized or federated registry mapping plugin IDs to distributable bundles (similar to VS Code extensions).
- **Local Registry**: Cached installations stored in `~/.doorway/plugins/`.
- **Lazy Loading**: Plugins and their associated MCP servers are loaded on-demand or when activated by a specific prompt context, preventing startup bloat.

## 5. OAuth & Identity Infrastructure

Supporting external connectors (Gmail, GitHub) requires a secure, robust OAuth infrastructure.

### 5.1 Authentication Flow
Doorway will act as a local application orchestrating OAuth 2.0 Authorization Code Flow with PKCE.
1. **Initiation**: User triggers a connector requiring auth (e.g., `@github-pr`).
2. **Local Callback Server**: Doorway temporarily spins up a local HTTP server (e.g., `http://127.0.0.1:54321/oauth/callback`) to receive the authorization code.
3. **Browser Redirection**: The user's default browser opens the authorization URL.
4. **Token Exchange**: Doorway securely exchanges the code for Access and Refresh Tokens.

### 5.2 Token Storage & Management
- **Secure Enclave**: Tokens are stored using the OS-level secure keychain (e.g., macOS Keychain, Windows Credential Manager, Linux Secret Service).
- **Token Refresh Daemon**: A background service automatically monitors and refreshes expiring tokens before they interrupt agent execution.
- **Sandboxed Token Access**: Plugins do *not* receive raw OAuth tokens. Instead, the Doorway Orchestrator injects authenticated HTTP clients or proxies requests to ensure plugins cannot leak credentials.

## 6. MCP & Extensibility Primitives

Plugins surface their capabilities to the agent via the Model Context Protocol (MCP).

- **Resources**: Expose external data as readable context (e.g., `gmail://inbox`, `github://pr/123`). This allows agents to ingest external state transparently.
- **Tools**: Actionable functions executed by the agent (e.g., `create_pr`, `send_email`). Tools are mediated by the Doorway orchestrator, triggering the Approval System if the action mutates external state.
- **Prompts**: Parameterized starting points for workflows injected directly into the user's composer.

## 7. Security, Sandboxing, and Approvals

With 300+ plugins executing arbitrary workflows:
- **Least Privilege**: Plugins explicitly declare network and filesystem permissions in their manifest.
- **No Hidden Mocks**: Following Doorway's core rules, all CLI or API interactions invoked by plugins execute via real PTY sessions or explicit HTTP clients owned by Doorway.
- **State-Mutation Gates**: Any external mutation (e.g., drafting an email, merging a PR) triggers Doorway's visible Approval Receipt UI, forcing the user to authorize the action.
- **Subagent Isolation**: Complex plugin tasks are dispatched to worktrees using dedicated subagents to prevent context contamination.

## 8. Implementation Roadmap

- **Phase 1: Plugin Definition & Manifest**: Finalize the `plugin.json` schema and implement the local plugin loader.
- **Phase 2: Local OAuth Infrastructure**: Implement the local callback server, PKCE flow, and secure keychain storage for core connectors (GitHub, Google).
- **Phase 3: MCP Bridge**: Connect the loaded plugins to the Doorway Orchestrator via internal MCP clients.
- **Phase 4: Marketplace & Discovery**: Build the UI/UX for searching, installing, and managing permissions for 300+ plugins.
