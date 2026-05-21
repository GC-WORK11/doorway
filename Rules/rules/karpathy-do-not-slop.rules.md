# DOORWAY QUALITY RULES — NO SLOP

## The Foundation

Every line of code is a commitment. Ships to users. Affects reliability.
AI slop is code that works by accident, hides failure, or impresses nobody.

**This is not a style guide. This is a ship-or-die contract.**

---

## PART I: THE KARPATHY PRINCIPLES

These four principles govern every decision.

### 1. THINK BEFORE CODING

Before touching keyboard:

- [ ] **State your assumptions.** If you assume the DB is open, the user is authenticated, the file exists — say it.
- [ ] **If uncertain, ask.** "I'm not sure if X or Y — here are both options" beats silent wrong choice.
- [ ] **Present alternatives.** If two valid approaches exist, show both. Let the reader decide.
- [ ] **Push back.** If the request is wrong, say why. Don't just implement.
- [ ] **Name the confusion.** If something is unclear, stop. Write: "I'm confused about X because Y."

```
WRONG:  Implement user auth. (assumes auth system exists)
RIGHT: Implement user auth. Assuming:
  - DB has users table with id, email, password_hash
  - No existing auth middleware
  - Questions: Should we use JWT or session cookies?
```

### 2. SIMPLICITY FIRST

The shortest code that solves the problem is correct.

- [ ] **No features beyond the request.** If asked for "validate email", don't add password strength meter.
- [ ] **No abstraction for single use.** If a function is called once, inline it.
- [ ] **No premature flexibility.** No config flags for features nobody asked for.
- [ ] **If 200 lines could be 50, rewrite.** Don't leave a mess because "it works."
- [ ] **Ask:** "Would a senior engineer approve this?" If no, simplify.

```
WRONG:  function handleUserAction(config: Config, options: Options, 
  middleware: Middleware[], plugins: Plugin[], callbacks: Callbacks) { ... }
RIGHT:  function handleUserAction(userId: string): void { ... }
```

### 3. SURGICAL CHANGES

Touch only what you must. Leave the rest alone.

- [ ] **Your mess, your cleanup.** Don't fix adjacent bugs you didn't introduce.
- [ ] **Match existing style.** Don't reformat code you're not modifying.
- [ ] **Trace every change.** Each line changed must connect to the request.
- [ ] **No "while I'm here" fixes.** Don't "clean up" unrelated code.
- [ ] **Test only what you broke.** If you changed auth, test auth. Not the whole app.

### 4. GOAL-DRIVEN EXECUTION

Define success. Verify it. Repeat until done.

- [ ] **State success criteria.** "Done" is not a criterion. "Users can log in" is.
- [ ] **Break into verifiable steps.** "Add validation" → "Write test for invalid email, then make it pass."
- [ ] **Verify after every step.** Run tests. Check output. Confirm behavior.
- [ ] **Loop until green.** Don't assume it works. Make it work, then prove it.
- [ ] **Refuse to ship broken.** A feature that "mostly works" is a feature that fails in production.

---

## PART II: THE FAKE CODE KILL LIST

These patterns are immediately rejected. No exceptions.

### 🚫 KILL ON SIGHT

```typescript
// ❌ MOCK DATA IN PRODUCTION
const mockProjects = [{ id: 1, name: "Fake Project" }];

// ❌ FAKE TERMINAL OUTPUT  
const fakeOutput = `> Running tests...
✓ All tests passed`;

// ❌ HIDDEN FAILURES
try { ... } catch {}

// ❌ OR TRUE
pnpm test || true

// ❌ UNCHECKED CAST
data as any

// ❌ DUMMY RESPONSES
return { success: true, data: null };

// ❌ LATE NIGHT HACKS
// TODO: fix later
// HACK: works for now

// ❌ CONSOLE LOG DEBUGGING
console.log("here");
console.log(data);
```

### ✅ ACCEPTABLE PATTERNS

```typescript
// Real data from DB
const projects = db.prepare("SELECT * FROM projects").all();

// Real terminal capture
const output = await pty.read();

// Explicit error handling
try { ... } catch (err) {
  console.error("Failed to connect:", err);
  throw err;
}

// Test with || allowed only for cleanup
rm -rf dist || true;

// Checked cast with reason
const userId = input as UserId; // OK: validated above

// Verified response
return result.ok ? result.data : null;
```

---

## PART III: DESIGN TASTE GATE

Production UI is judged by real users. Reject these:

### 🚫 NO EMOJI ICONS
```tsx
// ❌ WRONG
<span>🚀 Deploy</span>
<button>❌ Cancel</button>

// ✅ RIGHT
<span>Deploy</span>
<button>Cancel</button>
```

### 🚫 NO CLUTTERED DASHBOARDS
```tsx
// ❌ WRONG: Everything showing
<DashBoard 
  showUsers={true}
  showMetrics={true}
  showCharts={true}
  showNotifications={true}
  showAds={true}
/>

// ✅ RIGHT: Show only what's needed
<DashBoard variant="minimal" />
```

### 🚫 NO FAKE AVATARS
```tsx
// ❌ WRONG
const Avatar = ({ name }) => <div>{name[0]}{name[1]}</div>;

// ✅ RIGHT: Real image or initials only
const Avatar = ({ imageUrl, name }) => 
  imageUrl ? <img src={imageUrl} /> : <span>{name[0]}</span>;
```

### 🚫 NO DECORATIVE ELEMENTS
```
❌ Background gradients on text
❌ Animated backgrounds
❌ Fake "live" indicators
❌ Decorative borders
❌ "Powered by AI" badges
```

---

## PART IV: TERMINAL HARNESS RULES

Terminal control is the core. These are non-negotiable.

### REAL PTY REQUIRED

```typescript
// ❌ WRONG: Fake terminal
const fakeTerminal = { output: "tests passed" };

// ✅ RIGHT: Real node-pty
import { Terminal } from 'node-pty';
const pty = Terminal.spawn('bash', [], { cwd: process.cwd() });
pty.onData((data) => handleOutput(data));
```

### STORE EVERYTHING

```typescript
// ❌ WRONG: Lost output
const output = pty.read();

// ✅ RIGHT: Persisted output
const chunk = appendTerminalChunk(db, threadId, { sessionId, text: data, sequence });
// Persisted to terminal_chunks table
```

### CAPTURE INPUT + OUTPUT

```typescript
// Both sides of conversation
recordTerminalInput(db, threadId, { sessionId, text: input, source: 'user' });
recordTerminalOutput(db, threadId, { sessionId, text: output, sequence });
```

### EXIT TAXONOMY REQUIRED

```typescript
// ❌ WRONG: Just exit code
if (exitCode !== 0) failed();

// ✅ RIGHT: Classified exit
const classification = classifyExit(exitCode, signal);
recordExitTaxonomy(db, sessionId, classification);
// Shows: "Command not found" not just "exit 127"
```

### PROCESS SNAPSHOTS

```typescript
// Track what's running
const snapshot = await captureProcessSnapshot(pty.pid);
recordProcessSnapshot(db, sessionId, snapshot);
// Shows: bash (pid 4242) → node (pid 4243) → tsc (pid 4244)
```

---

## PART V: EVIDENCE LAYER RULES

Every UI claim requires evidence.

### PRINCIPLE: BACK IT OR DON'T SHOW IT

```
❌ "Tests passing" (no test evidence)
❌ "Code reviewed" (no review evidence)  
❌ "Memory learned" (no pattern evidence)
❌ "Approved by user" (no approval evidence)

✅ "3/308 tests passed" (with evidence)
✅ "Review approved 2024-01-15 by user" (with evidence)
✅ "Pattern: pnpm test (5 runs, 100% success)" (with evidence)
✅ "Approved: rm -rf node_modules" (with evidence)
```

### EVIDENCE CHAIN

```typescript
// Every claim traces back to storage
interface Evidence {
  id: string;
  type: 'test' | 'review' | 'approval' | 'pattern';
  recordedAt: Date;
  payload: any; // Type-specific data
  projection: any; // Computed view for UI
}

// Example: Test evidence
testEvidence → test_events table → TestResultsProjection → UI "3/308 passed"

// Example: Pattern evidence  
patternEvidence → repeated_commands table → PatternProjection → UI "pnpm test (5 runs)"
```

---

## PART VI: ORCHESTRATION RULES

Multi-agent coordination requires discipline.

### TASK DELEGATION

```typescript
// ❌ WRONG: Sequential blocking
await runClaude(prompt);
await runCodex(prompt);

// ✅ RIGHT: Parallel with coordination
const [claudeResult, codexResult] = await Promise.all([
  runClaude(delegatePrompt(claude, prompt)),
  runCodex(delegatePrompt(codex, prompt))
]);

// ✅ RIGHT: Best-of-N with handoff
const winner = await bestOfN(prompt, ['claude', 'codex']);
const context = await createHandoff(winner, prompt);
```

### AGENT LANES

Every running agent gets a lane:

```typescript
interface AgentLane {
  id: string;
  agentId: string;
  status: 'running' | 'waiting' | 'completed' | 'failed';
  terminalSessionId: string;
  worktreePath: string;
  progress: string; // "Writing tests..."
  canReceiveMessages: boolean;
}
```

### FAILOVER

```typescript
// If primary agent fails, try secondary
async function runWithFailover(prompt: string): Promise<Result> {
  const providers = ['claude', 'codex'];
  
  for (const provider of providers) {
    try {
      return await runAgent(provider, prompt);
    } catch (err) {
      console.log(`Provider ${provider} failed:`, err.message);
      continue;
    }
  }
  
  throw new Error("All providers failed");
}
```

---

## PART VII: DATABASE RULES

Data integrity is sacred.

### WAL MODE ALWAYS

```typescript
const db = new Database('.doorway/main.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
```

### MIGRATIONS VERSIONED

```typescript
// migrations/001_initial_schema.sql
-- Doorway v1.0: Core tables
CREATE TABLE threads (...);
CREATE TABLE messages (...);
```

### NO DESTRUCTIVE MIGRATIONS

```
❌ ALTER TABLE users DROP COLUMN secret_key
❌ DELETE FROM events WHERE created_at < '2023-01-01'
✅ ALTER TABLE users ADD COLUMN new_field TEXT
✅ INSERT INTO events_migration SELECT * FROM events
```

### BACKUP BEFORE MIGRATION

```bash
cp .doorway/main.db .doorway/backup/$(date +%Y%m%d_%H%M%S).db
```

---

## PART VIII: TESTING RULES

Tests are not optional. Tests are the contract.

### NO || TRUE

```bash
# ❌ WRONG
pnpm test || true

# ✅ RIGHT
pnpm test
# Gate fails if tests fail
```

### COVER THE CRITICAL PATH

```typescript
describe('ThreadService', () => {
  it('creates thread with ID', () => { ... });
  it('creates thread in DB', () => { ... }); 
  it('records thread.created event', () => { ... });
  it('throws if project not found', () => { ... }); // Edge case
});
```

### INTEGRATION TESTS FOR FLOWS

```typescript
it('full thread lifecycle: create → message → run → handoff', async () => {
  const thread = createThread(db, projectId, 'Test');
  appendMessage(db, thread.id, 'user', 'Hello');
  const runId = startAgentRun(db, thread.id, 'claude');
  await waitForCompletion(runId);
  const packet = createHandoff(db, runId);
  expect(packet.summary).toBeTruthy();
});
```

---

## PART IX: API DESIGN RULES

APIs are contracts. Break them and users hate you.

### RETURN CONSISTENT SHAPE

```typescript
// ❌ WRONG: Inconsistent responses
{ success: true, data: [...] }
{ error: "Not found" }
{ items: [...] }

// ✅ RIGHT: Consistent response
{ ok: true, data: [...] }
{ ok: false, error: { code: "NOT_FOUND", message: "Thread not found" } }
```

### ERROR CODES, NOT MESSAGES

```typescript
// ❌ WRONG
throw new Error("User not found");

// ✅ RIGHT  
throw new NotFoundError('Thread', threadId);

// Defined error types
class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.code = 'NOT_FOUND';
    this.entity = entity;
    this.id = id;
  }
}
```

### NEVER SWALLOW ERRORS

```typescript
// ❌ WRONG
try { await operation(); } catch {}

// ✅ RIGHT
try { 
  await operation(); 
} catch (err) {
  console.error("Operation failed:", err);
  throw err; // or handle explicitly
}
```

---

## PART X: PERFORMANCE RULES

Production matters. Optimize the right things.

### NO N+1 QUERIES

```typescript
// ❌ WRONG
const threads = db.all("SELECT * FROM threads");
for (const thread of threads) {
  thread.messages = db.all("SELECT * FROM messages WHERE thread_id = ?", thread.id);
}

// ✅ RIGHT
const threads = db.all(`
  SELECT t.*, json_group_array(m.id) as message_ids
  FROM threads t
  LEFT JOIN messages m ON m.thread_id = t.id
  GROUP BY t.id
`);
```

### INDEX CRITICAL QUERIES

```sql
CREATE INDEX idx_messages_thread_id ON messages(thread_id);
CREATE INDEX idx_events_thread_sequence ON events(thread_id, sequence);
CREATE INDEX idx_terminal_chunks_session ON terminal_chunks(session_id, sequence);
```

### LAZY LOAD HEAVY DATA

```typescript
// ❌ WRONG: Load everything
const thread = getThread(db, threadId); // Includes 10k messages

// ✅ RIGHT: Paginate or lazy load
const thread = getThreadMeta(db, threadId); // Light metadata
const messages = getMessages(db, threadId, { limit: 50, offset: 0 });
```

---

## PART XI: SECURITY RULES

Trust is earned. Violate these and lose it forever.

### NEVER LOG SECRETS

```typescript
// ❌ WRONG
console.log(`API Key: ${apiKey}`);

// ✅ RIGHT
console.log(`API Key: ${apiKey.slice(0, 4)}...`);
```

### SANITIZE USER INPUT FOR QUERIES

```typescript
// ❌ WRONG: SQL injection
const user = db.get(`SELECT * FROM users WHERE id = ${userId}`);

// ✅ RIGHT: Parameterized
const user = db.get("SELECT * FROM users WHERE id = ?", userId);
```

### VALIDATE AT BOUNDARIES

```typescript
// ❌ WRONG: Trust external input
function createThread(projectId: string) { ... }

// ✅ RIGHT: Validate at entry
function createThread(projectId: string) {
  if (!isValidProjectId(projectId)) {
    throw new ValidationError('Invalid project ID');
  }
  ...
}
```

---

## PART XII: SHIP CRITERIA

Ready to merge? Check this list.

### PREREQUISITE CHECK

```bash
pnpm gate
# typecheck ✅
# lint ✅  
# test ✅ (all 328)
# build ✅
# dead ✅ (zero exports)
# deps ✅
# format ✅
```

### MANUAL VERIFICATION

- [ ] Tested feature manually in dev
- [ ] No console errors in browser
- [ ] No console errors in terminal
- [ ] Data persists after restart
- [ ] Error states handled gracefully
- [ ] Loading states are honest
- [ ] Empty states are honest

### DOCUMENTATION

- [ ] Updated handoff prompt if architecture changed
- [ ] Commented non-obvious code
- [ ] TypeDoc for public APIs

---

## THE ONE-LINER

**"Write code you'd be proud to explain to a senior engineer at 2 AM during an incident."**

---

## QUICK REFERENCE

| Situation | Rule |
|-----------|------|
| Not sure what to do | Think Before Coding |
| Code is getting complex | Simplicity First |
| Changing more than needed | Surgical Changes |
| Done but untested | Goal-Driven Execution |
| Test uses `\|\| true` | Kill it |
| Mock data in production | Kill it |
| Console.log debugging | Remove it |
| Unchecked `as any` | Kill it |
| No error handling | Fix it |
| API returns inconsistent shape | Fix it |
| Secret in log | Remove it |

---

**Ship code that would pass a senior engineer review. Ship code you'd trust in production. Ship code that compounds.**

**END OF RULES**
