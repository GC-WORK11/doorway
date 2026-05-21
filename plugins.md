# Doorway Plugin, Skills, and Automation PRD

Download the markdown file: [doorway-plugin-skills-automation-prd.md](sandbox:/mnt/data/doorway-plugin-skills-automation-prd.md)

## Product thesis

Doorway’s defensible product should **not** be a thin wrapper around any one model vendor. The real moat is a local-first execution kernel that combines a visible harness, worktree isolation, a provider-agnostic model bus, and a first-class extension plane for plugins, skills, automations, connectors, browser use, and computer use. That conclusion is strongly supported by the way OpenAI and Anthropic are evolving their coding products: Codex now treats plugins as installable bundles that can package skills, app integrations, and MCP server configuration, while Claude Code treats skills, hooks, MCP, memory, and subagents as the durable customization layer across terminal, IDE, desktop, and web surfaces. citeturn11view2turn8view1turn22view0turn4view10turn4view8turn4view9

The timing also matters. OpenAI’s April 16, 2026 update expanded Codex with background computer use, an in-app browser, more than 90 additional plugins, memory, and stronger automation support, which shows how fast the upstream surface is moving. Anthropic, meanwhile, has formally separated interactive Claude Code usage from Agent SDK and `claude -p` usage beginning June 15, 2026, with a separate monthly programmatic credit for eligible paid plans. Taken together, those changes argue for a Doorway architecture that keeps **providers swappable** while making the **extension/runtime substrate** the main product. citeturn27view0turn27view2

For Doorway, that means the main feature hierarchy should be simple: the **visible harness plus worktrees** remains the execution kernel; the **orchestrator** remains the control plane; and the **plugin-skill-connector marketplace** becomes the growth plane that makes the IDE valuable even when users switch between OpenAI, Anthropic, local OSS models, or future providers. Codex’s own worktree and automation docs, plus Claude Code’s use of worktrees for subagent isolation, support treating isolation and orchestration as foundational rather than optional extras. citeturn4view2turn4view1turn20view0turn0file14

## What the market actually teaches Doorway

Codex currently draws a very clean line between **skills** and **plugins**. Skills are the authoring format for reusable workflows, while plugins are the installable distribution unit that can bundle skills, app integrations, MCP servers, and hooks. In practice, that is a very strong product pattern: author small, composable workflow folders; distribute them as richer installable packages when they need discovery, branding, authentication, or bundled integrations. Doorway should copy that separation almost exactly. citeturn6search13turn9view0turn8view1

The Codex package shape is especially important. Official docs say every plugin has a required `.codex-plugin/plugin.json` manifest and can optionally include `skills/`, `hooks/`, `.app.json`, `.mcp.json`, and `assets/`. Codex also supports repo-scoped and personal marketplaces, local and remote marketplace entries, install/authentication policy metadata, enable/disable toggles, and prompt-time invocation with `@` for a plugin or bundled skill. That is not just a nice UI pattern; it is a workable open-source distribution model for teams. citeturn9view0turn10view3turn10view4turn10view5turn11view1

Claude Code teaches a complementary lesson: the ecosystem is strongest when the extension primitives are **simple and legible**. Claude exposes skills, hooks, MCP, CLAUDE.md memory, and subagents directly in product docs rather than hiding them behind a heavy plugin runtime. Skills are folders with `SKILL.md` and optional templates, examples, scripts, and references; custom commands have been folded into skills; hooks can run shell commands, HTTP endpoints, or LLM prompts at lifecycle events; and subagents get their own context windows and permissions. Doorway should preserve that composability instead of overcentralizing everything into one opaque bundle type. citeturn12view0turn12view3turn5view17turn12view8

The open standard underneath both ecosystems is increasingly clear. OpenAI says Codex skills build on the open Agent Skills standard, and the Agent Skills project says the format was originally developed by Anthropic and is now used across multiple agent products. The standard specifies a `SKILL.md`-based directory format, progressive disclosure, optional scripts/references/assets, and even an experimental `allowed-tools` field. That makes `SKILL.md` the best candidate for Doorway’s **authoring standard**, even if Doorway defines its own richer plugin manifest for installation and marketplace concerns. citeturn4view3turn21view2turn21view1

MCP provides the other half of the picture. The MCP spec cleanly separates **resources**, **prompts**, and **tools**. Resources are application-driven context objects that fit sidebars, trees, search, and explicit selection flows; prompts are user-controlled templates that naturally map to slash commands; and tools are model-controlled functions that the agent can discover and call automatically. That separation is more useful for Doorway than treating “connector” as one undifferentiated blob. Doorway should map connector UX directly onto those MCP roles. citeturn24view0turn24view1turn24view2turn15search8

There is also a crucial engineering warning in your uploaded reverse-engineering material. The Codex Desktop Linux adaptation appears not to expose a clean runtime plugin API; instead, it leans on MCP-side processes and build-time ASAR patching, which is powerful but brittle. Your uploaded analyses of Codex CLI and Codex Desktop also point to a plugin/tool system that is moving quickly, including marketplace changes in the 2026 changelog. Doorway should absorb the lessons from those systems, but it should **not** bind its long-term architecture to their internal patching patterns or unstable plugin internals. fileciteturn0file2 fileciteturn0file3 citeturn16view0turn16view1turn16view4

## Doorway architecture

Doorway should have three explicit internal planes.

The first plane is the **execution kernel**: visible terminals, PTY sessions, worktree manager, browser runtime, computer-use runtime, artifact store, and approval system. This is the part users trust because they can see it. Codex’s worktree model, local environments, and app-server event model all reinforce the value of separating execution from presentation. Claude Code’s terminal-first design and worktree-based subagent isolation reinforce the same point. citeturn8view5turn8view4turn4view2turn20view0turn22view0

The second plane is the **orchestrator**: thread/session manager, subagent dispatcher, memory loader, policy engine, and attachment/context assembler. This layer decides which skill to activate, which connector to use, whether to prefer a structured integration over browser use, where to spawn work, and how to summarize evidence back into the main thread. Codex’s own subagent docs explicitly recommend bounded, parallel agents for exploration, tests, and summary work, while Claude’s subagent docs show why side tasks need isolated context windows. Doorway should treat this as a first-class scheduling problem, not a prompt trick. citeturn20view0turn20view1turn12view8

The third plane is the **extension plane**: skills, connectors, prompts, hooks, panels, and automations. This is where Doorway’s open-source community and commercial ecosystem will differentiate. The extension plane should be mostly provider-independent and mostly runtime-independent. If OpenAI changes plugin packaging, or Anthropic changes SDK economics, Doorway should still run the same skills, the same connector registry, the same automations, and the same worktree/harness UX. citeturn27view2turn16view4turn22view0

A practical high-level architecture looks like this:

```text
Doorway UI
  ├─ Composer, threads, panels, attachment tray, review panes
  ├─ Plugin directory, connector status, automation builder, agent monitor
  ▼
Doorway Conversation Runtime
  ├─ Message/attachment model
  ├─ Skill activation engine
  ├─ Slash-command and @mention router
  ├─ Approval receipts and evidence timeline
  ▼
Doorway Orchestrator
  ├─ Task planner
  ├─ Subagent scheduler
  ├─ Worktree allocator
  ├─ Connector policy resolver
  ├─ Browser/computer-use selector
  ▼
Execution Kernel
  ├─ PTY harness
  ├─ Worktrees + local environments
  ├─ Browser runtime
  ├─ Computer-use runtime
  ├─ MCP client
  ├─ Native connector adapters
  ├─ Provider bus
  ▼
Stores
  ├─ Thread store
  ├─ Evidence store
  ├─ Memory store
  ├─ Skills cache
  ├─ Plugin cache
  └─ Marketplace index
```

The provider bus should stay intentionally boring. Codex already exposes custom provider definitions, built-in `openai`, `ollama`, and `lmstudio` providers, additional Bedrock configuration, custom auth commands, custom headers, and the ability to point at any provider supporting Chat Completions or Responses APIs. Claude Code’s overview also explicitly notes third-party provider support on its terminal CLI and VS Code surface. Doorway should therefore use vendor adapters for **OpenAI Responses**, **Anthropic**, **OpenAI-compatible endpoints**, **local Ollama/LM Studio**, and **cloud adapters such as Bedrock/Azure**, while keeping all skill/connector/automation logic above that layer. citeturn18view0turn18view2turn18view3turn18view4turn18view5turn18view6turn18view7turn7view2turn22view0

## Plugin and skill substrate

Doorway should adopt **Agent Skills** as the native authoring format and build a richer Doorway plugin manifest around it. The reason is straightforward: the Agent Skills format is already cross-product, already documented for client implementors, and already designed around progressive disclosure. The implementation guide explicitly recommends loading only name and description into the base catalog, then loading full `SKILL.md` on activation, and only then loading scripts/references/assets on demand. That exact three-tier loading strategy is what Doorway needs to keep a large installed skill library cheap in context tokens. citeturn21view0turn21view2

Doorway should therefore define two artefacts.

`SKILL.md` remains the **workflow unit**. It describes what the skill does, when to use it, and which supporting assets or scripts matter. This keeps authorship portable and open. citeturn21view1turn12view0turn5view4

`doorway.plugin.json` becomes the **distribution unit**. It should point at bundled skills, connectors, MCP servers, UI panels, hooks, browser capabilities, automation templates, and legal/discovery metadata. This follows the logic of Codex plugin manifests, but without inheriting Codex-specific naming or internal assumptions. citeturn9view0turn10view0

A good Doorway plugin should be able to declare these first-class components:

- **skills** for reusable workflows
- **connectors** for OAuth, native, or API integrations
- **mcpServers** for standard tool, resource, and prompt exposure
- **hooks** for lifecycle automations
- **panels** for custom UI
- **automationTemplates** for scheduled or trigger-based jobs
- **agents** for specialized subagent profiles
- **browserProfiles** and **computerProfiles** for verified browser or app workflows

That is broader than Codex, but it is consistent with what Codex and Claude already expose separately. citeturn9view0turn22view0turn5view17turn20view0

Doorway should also deliberately unify invocation patterns. Codex lets users invoke installed plugins or bundled skills with `@`; Claude has merged custom commands into skills; and MCP prompts are explicitly designed for user-triggered interfaces such as slash commands. So Doorway should avoid inventing three unrelated systems. Instead, it should support one invocation grammar with three faces: natural-language routing, `@` explicit routing, and `/` command routing. Internally, `/` commands should usually resolve to either an MCP prompt or a skill alias, not to a custom one-off command DSL. citeturn11view1turn12view3turn24view1

Subagents need the same consistency. Claude subagents can auto-match on description and run in separate context windows with specific tool access and independent permissions. Codex is stricter: it only spawns subagents when explicitly asked, and it keeps the operator in charge of the orchestration model. Doorway should combine those models: by default, subagent spawning should be **user-explicit** for cost and safety, but plugins and skills should be allowed to declare safe delegation patterns that the orchestrator can recommend or auto-apply when the user enables them. citeturn12view8turn12view9turn20view0turn20view1

The final piece is the attachment model. Claude Code desktop already supports `@filename`, images, PDFs, and drag-and-drop file attachments. Codex supports image inputs in the interactive composer and CLI. Doorway should go further and treat attachments as typed context objects rather than dumb files. It should support file objects, image objects, PDF objects, log snippets, URL captures, browser snapshots, connector resources, audio and video blobs, and structured MCP resource URIs. That choice lines up with how MCP resources are intended to be surfaced and selected by the host application. citeturn13search8turn13search24turn19search4turn13search3turn24view0

## Security and governance

Doorway should assume that plugins and connectors are the highest-risk part of the product. Codex’s docs explicitly keep plugin installation under existing approval settings and remind users that external services still have their own authentication, privacy, and data-sharing policies. MCP’s own spec now standardizes OAuth-driven authorization discovery and recommends secure transport posture, while Codex app settings already distinguish between website approvals, app approvals, and thread-level sandbox approvals. Doorway should mirror that layered trust model instead of flattening everything into one “allow tool” switch. citeturn11view2turn24view4turn8view2turn8view3

For remote connectors, Doorway should treat MCP as the default interoperability protocol. The MCP spec requires JSON-RPC over either stdio or Streamable HTTP; it requires OAuth 2.1-class authorization flows for HTTP transports; and it warns implementers to validate `Origin`, bind local services to localhost when possible, and require authentication. Doorway should default to stdio for local connector runtimes and only use remote HTTP transports when the connector truly needs them. citeturn24view3turn24view4

For browser use and computer use, the scheduler should enforce a strict escalation path: **structured connector first**, then **browser plugin or browser use**, then **computer use**. Codex’s docs explicitly say that if a dedicated plugin or MCP server exists, the structured integration is preferred; use computer use when Codex needs to inspect or operate the app visually. They also warn against two computer-use tasks in the same app at the same time because stable state tracking becomes much harder. Doorway should convert those into hard orchestration rules. citeturn8view3turn8view7

Doorway should also define four marketplace scopes from day one: **local repo**, **local user**, **organization**, and **remote curated**. Codex already supports repo and personal marketplaces, local and remote sources, install and authentication policies, and cached installed copies. Doorway should preserve the same creator ergonomics while adding a verifiable trust chain: signed manifests, content hashes, lockfiles, publisher keys, and explicit capability review in the install flow. citeturn10view3turn10view4turn9view6

A useful open-source choice would be to keep author-facing artefacts mostly under `.agents/` rather than inventing a fully proprietary folder layout. Codex already uses `.agents/plugins/marketplace.json` for repo-scoped plugin catalogues, and the Agent Skills guidance explicitly recommends scanning both client-specific paths and the `.agents/skills/` convention. Doorway can still keep runtime data under `~/.doorway/`, but using `.agents/` for shared artefacts will make cross-tool adoption much easier. citeturn10view3turn21view0

## Frontend and UX requirements

Doorway’s frontend should make the extension plane feel native rather than bolted on. The UI should expose a **Plugin Directory**, a **Connector Status** panel, a **Skills palette**, an **Automation builder**, and an **Agent monitor** on equal footing with threads and diffs. Codex’s app already treats plugins, automations, worktrees, review panes, browser use, and settings as first-class surfaces. Claude Code similarly exposes MCP, memory, hooks, subagents, scheduled tasks, and multiple surfaces tied to the same engine. Doorway should aim for that level of visibility instead of hiding everything behind configuration files. citeturn14search13turn8view2turn22view0

The composer should support five kinds of intent in one place: freeform prompting, `@` routing, `/` command selection, attachment insertion, and model or provider selection. Codex’s plugin docs, app commands, and image-input support show the value of mixing direct prompting with explicit tool invocation. Claude desktop adds a strong attachment and `@filename` model. Doorway should combine those patterns so users can say things like: “@browser verify the localhost checkout flow, attach this screenshot, then @jira create a bug,” without leaving the composer. citeturn11view1turn19search10turn19search4turn13search8

Automation UX should stay tied to threads and worktrees, not to a separate automation silo. Codex already lets users create automations from regular threads, choose schedules, pick model and reasoning settings, run them in a worktree or local checkout, and invoke skills inside automation prompts. Claude likewise treats recurring work as a first-class scheduling affordance across CLI, desktop, and managed routines. Doorway should therefore let any successful thread become an automation template in one click, with an explicit choice between local harness execution and background worktree execution. citeturn5view3turn12view7turn8view8turn22view0

Subagent UX should be visibly inspectable. Codex has `/agent` and exposes agent threads; Claude frames subagents as specialists with separate context and permissions. Doorway should give every child agent a visible card with model, skill or role, worktree, tool permissions, connector usage, and current task. It should also expose a “promote to reusable agent” action that converts a successful worker pattern into a sharable plugin-scoped agent profile. citeturn20view0turn12view8

The review and proof surface should be tightly integrated with extension activity. Your earlier Doorway browser and computer-use PRD was already pointing in the right direction: browser and desktop work should emit evidence objects that connect screenshots, accessibility state, console and network summaries, tool calls, and diffs. This can become a major differentiator over plain chat wrappers, particularly when plugins, browser tasks, and local harness actions are all recorded in one timeline. fileciteturn0file13

## Build sequence and final decisions

The first firm decision should be this: **Doorway should standardize on Agent Skills for workflow authorship and on a Doorway manifest for installation and distribution.** That gives you openness for creators and stability for the product. It also means you can import from both Codex-style skill folders and Claude-style skill folders with minimal friction. citeturn21view1turn12view0turn5view4

The second decision should be this: **MCP is the connector protocol, not the whole product model.** Use MCP wherever possible for tools, resources, and prompts. But keep Doorway-native concepts for panels, agent profiles, automations, browser and computer-use evidence, and approval receipts, because those are host-product concerns rather than protocol concerns. citeturn24view0turn24view1turn24view2turn8view4

The third decision should be this: **the worktree plus visible harness stays at the centre.** Plugins, skills, automations, and subagents should all resolve back to visible execution in a worktree or local runtime whenever possible. That is how Doorway stays trustworthy, debuggable, and useful even with OSS models or third-party APIs. Codex’s worktree and local-environment docs, plus Claude’s visible terminal-first design, make that the right default. citeturn4view2turn8view5turn22view0turn0file18

The staged implementation path should look like this.

Start with a **kernel release**: PTY harness, worktree allocator, thread store, evidence log, provider bus, and a minimal MCP client. This gives Doorway a solid execution foundation. citeturn8view4turn24view3

Then ship a **skills release**: Agent Skills discovery, progressive disclosure loader, `@` and `/` invocation, repo and user skill scopes, and a basic skill evaluator. That is the shortest path to community value. citeturn21view0turn21view2turn12view3

Then ship a **connector release**: MCP server registry, OAuth flows, resource browser, prompt browser, connector health UI, and typed attachment objects. That makes Doorway useful beyond code generation. citeturn24view0turn24view1turn24view4

Then ship a **plugin marketplace release**: `doorway.plugin.json`, local repo and user marketplaces, signed packages, capability review, published panel extensions, bundled skills, and automation templates. This is the ecosystem unlock. citeturn10view3turn9view0turn11view2

Then ship a **verification release**: in-app browser, browser-use plugin, computer-use runtime, proof timeline, and structured fallback from connector to browser to computer use. That is where Doorway becomes a serious “agentic cockpit” rather than a better chat shell. citeturn4view5turn8view3turn8view7turn27view0

The overall conclusion is blunt: the killer feature is **not** the model picker. The killer feature is a trustworthy, open, provider-agnostic **execution and extension system** that lets people install workflows, connect tools, run scheduled jobs, spawn bounded agents, see evidence, and keep all of it anchored in visible local execution. The current Codex and Claude ecosystems already point in that direction; Doorway’s opportunity is to unify those ideas into one cleaner, more open, and more stable product surface. citeturn11view2turn22view0turn21view2turn24view0turn24view1turn24view2

## Open questions and limitations

Two uncertainties remain. First, some of the most detailed observations about Codex Desktop internals come from your uploaded reverse-engineering notes rather than OpenAI’s official public docs. Those notes are still useful for design direction, but they should be treated as implementation intelligence, not as a stable upstream contract. fileciteturn0file2 fileciteturn0file3

Second, Claude Code’s public extension model is very strong on skills, hooks, MCP, memory, and subagents, but it does not currently present a Codex-style installable plugin marketplace in the same way. That means Doorway should borrow Claude’s workflow primitives, not wait for a one-to-one plugin packaging analogue from Anthropic. citeturn22view0turn4view7turn4view9turn4view10turn4view8

The unresolved product decision is therefore not whether Doorway needs a marketplace. It does. The unresolved decision is how much import compatibility to preserve for Codex-style plugin manifests versus how aggressively to define a cleaner Doorway-native schema from the start. My recommendation is to keep `SKILL.md` portable, keep `.agents/` conventions where possible, and define a Doorway-native install manifest for everything else. citeturn21view0turn10view3turn9view0

navlistRecent platform updatesturn26news25,turn25news35
