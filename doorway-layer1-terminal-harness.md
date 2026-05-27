# DOORWAY — LAYER 1
## Terminal Harness: Complete Technical Specification
### The PTY Engine, Read Pipeline, Process Control & Multi-Session Orchestration

---

> *This document covers everything from the OS kernel interface down to the byte — and everything from that byte up to a clean structured event. No other layer touches this. No other layer needs to.*

---

## Table of Contents

1. What a PTY Actually Is (OS Level)
2. PTY vs Pipe vs Raw Terminal — Why PTY Wins
3. The Spawn Sequence — Launching a CLI Process
4. The Read Loop — Getting Bytes Out
5. The Garbage Problem — VT100/ANSI Escape Taxonomy
6. The VT100 Parser — Turning Garbage Into Events
7. Process Lifecycle — Birth, Running, Death
8. Crash Detection — When Things Go Wrong
9. Recovery Architecture — Restart Without Losing State
10. Input Injection — Writing Back Into the Terminal
11. Terminal Dimensions & SIGWINCH
12. Signal Handling — The Full Map
13. Multi-Session Management — Running Many PTYs Simultaneously
14. The Read Buffer Design — Ring Buffer & Backpressure
15. What Claude CLI Actually Looks Like on PTY
16. What Codex CLI Actually Looks Like on PTY
17. State Detection From Raw Output
18. Cross-Platform: Unix vs Windows ConPTY
19. The Rust Sidecar Architecture
20. Implementation Checklist

---

---

# 1. What a PTY Actually Is (OS Level)

## 1.1 The Mental Model

A PTY (Pseudo Terminal) is a bidirectional pipe with a lie. The lie is this: one end of the pipe (the slave side) looks exactly like a real hardware terminal to whatever process is connected to it. The process thinks it's talking to a physical screen and keyboard. It sends cursor movement codes, color codes, asks for terminal dimensions. The slave answers like a real terminal would.

The other end (the master side) is where you sit. You read everything the process writes to its "screen." You write everything you want to appear as "keyboard input." You control the dimensions the slave reports. You are the terminal.

```
┌─────────────────────────────────────────────────────────────┐
│                     KERNEL                                  │
│                                                             │
│   ┌─────────────┐         ┌─────────────┐                  │
│   │  PTY MASTER │◄───────►│  PTY SLAVE  │                  │
│   │  (your app) │         │  (the CLI)  │                  │
│   └──────┬──────┘         └──────┬──────┘                  │
│          │                       │                         │
│       fd[0]                  /dev/pts/N                    │
│    (file descriptor)      (appears as real terminal)       │
└──────────┼────────────────────────┼────────────────────────┘
           │                        │
    You read/write here      Claude CLI reads/writes here
    (master side)            thinking it's a real terminal
```

## 1.2 The Kernel Data Path

When Claude CLI writes `"Hello\x1b[32m world\x1b[0m\n"` to its stdout:

1. Claude's write() syscall puts bytes into the slave side
2. Kernel's line discipline (`ldisc`) processes it — handles things like echoing input, buffering lines, processing control characters (^C → SIGINT)
3. Bytes pass through to the master side
4. Your `read()` call on the master file descriptor returns the bytes
5. You now have `"Hello\x1b[32m world\x1b[0m\n"` in your buffer

When you write `"yes\n"` to the master:

1. Your write() puts bytes into the master
2. Line discipline processes it — echoes it back to master (you'll read your own input back unless you disable echo)
3. Bytes available on the slave's stdin
4. Claude CLI's `read()` on stdin returns `"yes\n"`

**Critical detail: echo.** By default, the PTY line discipline echoes everything you write to master back out the master read side. This means if you inject `"yes\n"` as input, you will also read back `"yes\n"` as output. You must handle this in your parser or disable echo via termios settings.

## 1.3 The termios Structure

The PTY's behavior is controlled by the `termios` structure — a set of flags that configure the line discipline.

Key settings Doorway needs to manage:

```c
struct termios {
    tcflag_t c_iflag;   // input modes
    tcflag_t c_oflag;   // output modes  
    tcflag_t c_cflag;   // control modes
    tcflag_t c_lflag;   // local modes
    cc_t c_cc[NCCS];    // control characters
};
```

**Settings Doorway sets on spawn:**

```c
// Raw mode — disable all line discipline processing
// We want raw bytes, not processed input
c_lflag &= ~(ECHO | ECHOE | ECHOK | ECHONL);  // disable echo
c_lflag &= ~ICANON;    // disable canonical (line buffered) mode
c_lflag &= ~ISIG;      // disable signal generation (^C won't send SIGINT)
c_iflag &= ~ICRNL;     // don't convert \r to \n on input
c_oflag &= ~OPOST;     // disable output processing
```

**Why disable ISIG?** Because we want to handle Ctrl+C ourselves — forwarding it to the child process deliberately, not having the kernel send SIGINT automatically. This gives Doorway control over interrupt behavior.

**Why disable ICANON?** Because canonical mode buffers input until a newline. We need to inject partial inputs and control sequences without waiting for newline.

---

# 2. PTY vs Pipe vs Raw Terminal — Why PTY Wins

## 2.1 Option A — Plain Pipe (subprocess stdin/stdout redirect)

```rust
Command::new("claude")
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
```

**What works:** Simple. Read stdout, write to stdin. No escape codes because the process detects it's not connected to a terminal (via `isatty()` check) and disables color/interactive output.

**What breaks:** Claude CLI detects `isatty() == false` and switches to non-interactive mode. Completely different output format. No prompts. No streaming display. No interactive features. You get headless mode, not interactive mode.

Claude CLI, Codex CLI, and essentially every modern CLI tool checks `isatty()`. If it returns false, they behave differently — or refuse to run interactively at all.

**Verdict: Does not work for interactive CLI orchestration.**

## 2.2 Option B — Raw Terminal (stdin/stdout = actual terminal)

Connect the CLI directly to the user's real terminal. No interception.

**What works:** Perfect fidelity. CLI thinks it's talking to a real human.

**What breaks:** You cannot read the output programmatically. The bytes go directly to the screen. You cannot capture, parse, or respond to them. You are a spectator.

**Verdict: No programmatic control possible.**

## 2.3 Option C — PTY (Doorway's approach)

**What works:**
- `isatty()` returns true on the slave side → CLI runs in full interactive mode
- You read everything from the master → full programmatic capture
- You write to the master → full programmatic input injection
- Process thinks it has a real terminal → all features work
- You control dimensions → terminal resize works
- You intercept everything → can detect prompts, questions, errors

**What you deal with:**
- Raw VT100/ANSI escape sequences in the output → need parser (Layer 2)
- Echo of injected input → need echo handling
- Line discipline processing → need termios configuration
- OS differences → need cross-platform abstraction

**Verdict: Only viable approach for full interactive CLI orchestration.**

---

# 3. The Spawn Sequence — Launching a CLI Process

## 3.1 Full Spawn Steps

Spawning a CLI process in a PTY requires this exact sequence. Skip a step and something subtle breaks.

```
Step 1: Create PTY pair
  openpty(&master_fd, &slave_fd, nullptr, &termios_settings, &winsize)
  
Step 2: Fork
  pid = fork()
  
Step 3: Child process setup (runs in child)
  3a. Close master_fd (child doesn't need it)
  3b. Create new session: setsid()
  3c. Set slave as controlling terminal: ioctl(slave_fd, TIOCSCTTY, 0)
  3d. Dup slave to stdin/stdout/stderr:
      dup2(slave_fd, STDIN_FILENO)
      dup2(slave_fd, STDOUT_FILENO)  
      dup2(slave_fd, STDERR_FILENO)
  3e. Close original slave_fd
  3f. Set environment variables (TERM, COLORTERM, etc.)
  3g. exec() the CLI binary
  
Step 4: Parent process setup (runs in parent/your app)
  4a. Close slave_fd (parent doesn't need it)
  4b. Configure termios on master_fd
  4c. Set non-blocking mode: fcntl(master_fd, F_SETFL, O_NONBLOCK)
  4d. Start read loop on master_fd
  4e. Store pid for process management
```

## 3.2 The TERM Environment Variable

**This is critical and commonly missed.**

Claude CLI and Codex CLI look at `$TERM` to decide what escape sequences to use. Set this wrong and you get either no escape sequences (no color, no cursor movement) or broken sequences your parser doesn't handle.

```
TERM=xterm-256color     ← correct for most cases
COLORTERM=truecolor     ← enables 24-bit color if CLI supports it
TERM_PROGRAM=doorway    ← identify ourselves to the CLI
COLUMNS=220             ← set initial terminal width
LINES=50                ← set initial terminal height
```

**Why does width matter?** Claude CLI wraps long lines based on `COLUMNS`. If COLUMNS is too narrow, responses get wrapped mid-word and your parser has to handle soft-wrap reconstruction. Set COLUMNS wide (220+) to minimize wrapping artifacts.

## 3.3 The Working Directory

Always set the working directory to the project root before exec(). Claude CLI and Codex CLI use the working directory to understand project context. Wrong working directory = wrong context.

```rust
pub struct SpawnConfig {
    pub binary: PathBuf,           // path to "claude" or "codex" binary
    pub args: Vec<String>,         // CLI arguments
    pub working_dir: PathBuf,      // project root
    pub env: HashMap<String, String>,
    pub initial_dimensions: TerminalSize,
    pub provider: ProviderType,
}
```

## 3.4 Finding the Binary

Don't hardcode the binary path. Users install CLI tools in various locations.

```rust
fn find_binary(name: &str) -> Option<PathBuf> {
    // 1. Check user config override
    if let Some(path) = config.binary_overrides.get(name) {
        if path.exists() { return Some(path.clone()); }
    }
    
    // 2. Check common locations
    let candidates = [
        format!("/usr/local/bin/{}", name),
        format!("/usr/bin/{}", name),
        format!("{}/.local/bin/{}", home_dir, name),
        format!("{}/.npm-global/bin/{}", home_dir, name),  // npm global install
        format!("{}/bin/{}", cargo_home, name),            // cargo install
    ];
    
    // 3. Search PATH
    which::which(name).ok()
}
```

---

# 4. The Read Loop — Getting Bytes Out

## 4.1 The Non-Blocking Read Loop

The master file descriptor is set to non-blocking. The read loop uses the OS async I/O mechanism — `epoll` on Linux, `kqueue` on macOS — to be notified when bytes are available.

**DO NOT use blocking reads in a thread.** This works but wastes a thread per session. With 4 sessions open you've blocked 4 threads. Use async I/O.

```rust
// Linux: epoll-based read loop
let epoll_fd = epoll::create()?;
epoll::ctl(epoll_fd, EPOLL_CTL_ADD, master_fd, EPOLLIN | EPOLLHUP | EPOLLERR)?;

loop {
    let mut events = [EpollEvent::empty(); 32];
    let n = epoll::wait(epoll_fd, -1, &mut events)?;  // blocks until event
    
    for event in &events[..n] {
        if event.events().contains(EPOLLIN) {
            // bytes available — read them
            let mut buf = [0u8; 4096];
            match read(master_fd, &mut buf) {
                Ok(0) => { /* EOF — process exited */ },
                Ok(n) => process_bytes(&buf[..n]),
                Err(EAGAIN) => { /* no bytes yet, spurious wakeup */ },
                Err(EIO) => { /* process exited, slave side closed */ },
                Err(e) => handle_error(e),
            }
        }
        if event.events().contains(EPOLLHUP) {
            // file descriptor closed — process is gone
            handle_process_exit();
        }
    }
}
```

**The EIO case is critical.** When the child process exits, the slave PTY file descriptor is closed. The master side gets an `EIO` error on the next read. This is how you detect process exit from the read loop — not from a signal handler, not from waitpid alone, but from `EIO` on the master.

## 4.2 Read Buffer Sizing

```
4096 bytes   → too small, excessive syscall overhead
65536 bytes  → good default
1048576 bytes → good for high-throughput sessions (large code generation)
```

Claude CLI generating a large code block can produce 50KB+ in a single "response." Buffer must be large enough to handle bursts without fragmented reads.

## 4.3 The Partial Escape Sequence Problem

This is a real bug that hits in production. Consider this scenario:

- Read returns 4096 bytes
- The last 3 bytes are `\x1b[3` — the beginning of `\x1b[32m` (green color code)
- The next read will return `2m` and subsequent content

Your parser receives a partial escape sequence split across two reads. This **must** be handled. The VT100 parser maintains a state machine that can be interrupted mid-sequence and resume on the next bytes. It does not assume sequences arrive atomically.

The read loop feeds bytes to the parser one chunk at a time. The parser maintains its own internal state between calls.

---

# 5. The Garbage Problem — VT100/ANSI Escape Taxonomy

## 5.1 What "Garbage" Actually Is

When Claude CLI outputs colored text, it's not garbage — it's a structured protocol. VT100/ANSI escape sequences are a standardized (if sprawling) protocol for controlling terminal display. Your parser needs to understand all of it to extract clean text.

Here is the complete taxonomy of what arrives in your read buffer:

## 5.2 Category 1 — Control Characters (single byte)

These are bytes 0x00–0x1F and 0x7F. Not escape sequences — single byte control codes.

| Byte | Name | Meaning in output |
|---|---|---|
| `\x07` | BEL | Bell — terminal beeps or flashes |
| `\x08` | BS | Backspace — move cursor left one |
| `\x09` | HT | Horizontal tab |
| `\x0A` | LF | Line feed (newline) |
| `\x0D` | CR | Carriage return (move to start of line) |
| `\x1B` | ESC | Escape — starts an escape sequence |
| `\x7F` | DEL | Delete |

**The CR+LF pair:** Terminals often output `\r\n` (CR+LF) instead of just `\n`. Your parser must handle both `\n` and `\r\n` as line terminators. Also handle lone `\r` (overwrite current line).

**The `\r` overwrite pattern:** Loading bars and progress indicators work by writing `\r` to go back to the start of the line, then overwriting with new content. Example: Claude's "thinking..." spinner does this. Your parser must track cursor position to handle overwrites correctly or you'll get duplicate content.

## 5.3 Category 2 — CSI Sequences (most common)

CSI = Control Sequence Introducer. Format: `ESC [ <params> <final_byte>`

`\x1b[` followed by optional numeric parameters separated by `;`, followed by a command letter.

**SGR — Select Graphic Rendition (colors and formatting):**

```
\x1b[0m       Reset all attributes
\x1b[1m       Bold
\x1b[2m       Dim
\x1b[3m       Italic
\x1b[4m       Underline
\x1b[7m       Reverse (swap fg/bg)
\x1b[22m      Normal intensity
\x1b[30-37m   Standard foreground colors (black through white)
\x1b[38;5;Nm  256-color foreground (N = 0-255)
\x1b[38;2;R;G;Bm  True color foreground
\x1b[40-47m   Standard background colors
\x1b[90-97m   Bright foreground colors
```

**Cursor movement:**

```
\x1b[A        Cursor up 1
\x1b[NA       Cursor up N
\x1b[B        Cursor down 1
\x1b[C        Cursor right 1
\x1b[D        Cursor left 1
\x1b[H        Cursor to home (1,1)
\x1b[N;MH     Cursor to row N, col M
\x1b[s        Save cursor position
\x1b[u        Restore cursor position
```

**Erase operations (critical for overwrite detection):**

```
\x1b[K        Erase from cursor to end of line
\x1b[1K       Erase from start of line to cursor
\x1b[2K       Erase entire current line ← very common in spinners/progress
\x1b[J        Erase from cursor to end of screen
\x1b[2J       Erase entire screen
```

`\x1b[2K` is how Claude CLI clears the "thinking..." line before printing the final response. If you're not tracking this, you'll include "thinking..." text in your captured output.

**Scrolling:**

```
\x1b[NS       Scroll up N lines
\x1b[NT       Scroll down N lines
```

## 5.4 Category 3 — OSC Sequences (titles and links)

OSC = Operating System Command. Format: `ESC ] <command> ST` where ST = `\x1b\x5c` or `\x07`

```
\x1b]0;Window Title\x07         Set window/tab title
\x1b]2;Window Title\x07         Set window title
\x1b]8;;URL\x07Text\x1b]8;;\x07 Hyperlink (clickable URL in terminal)
\x1b]52;...base64...\x07         Clipboard operations
```

Claude CLI uses OSC 8 hyperlinks in some output. Codex CLI sets window titles via OSC 0/2. Your parser must handle these gracefully — usually by extracting the title/URL content and discarding the sequence.

## 5.5 Category 4 — DCS Sequences

DCS = Device Control String. Format: `ESC P <data> ST`

Less common. Used for terminal identification, Sixel graphics, and tmux control sequences. Doorway needs to parse and discard these cleanly — a DCS sequence can be arbitrarily long and must be consumed completely or the parser breaks.

## 5.6 Category 5 — Mode Setting Sequences

These change how the terminal behaves. Claude CLI and Codex CLI set these during startup.

```
\x1b[?2004h    Enable bracketed paste mode
\x1b[?2004l    Disable bracketed paste mode
\x1b[?1049h    Switch to alternate screen buffer
\x1b[?1049l    Switch back to main screen buffer
\x1b[?25l      Hide cursor
\x1b[?25h      Show cursor
\x1b[?1h       Application cursor keys (arrows send different codes)
\x1b[?1l       Normal cursor keys
```

**Alternate screen buffer** is important. When a CLI enters a full-screen mode (like a TUI prompt), it switches to the alternate buffer with `\x1b[?1049h`. When it exits, it restores with `\x1b[?1049l`. Your parser must track which buffer is active. Content in the alternate buffer is transient — it doesn't persist to the scrollback. This is why `cat /etc/passwd` after running `vim` doesn't show vim's content — vim was on the alternate screen.

## 5.7 Category 6 — Real Printable Text

After stripping every escape sequence, what remains is printable text. UTF-8 encoded. Doorway needs full UTF-8 handling — Claude outputs Unicode characters in code comments, variable names, and explanatory text regularly.

**Multi-byte UTF-8:** Just like escape sequences, UTF-8 multi-byte sequences can be split across read() calls. The parser must handle partial UTF-8 sequences the same way it handles partial escape sequences — buffer the fragment and complete it on the next read.

---

# 6. The VT100 Parser — Turning Garbage Into Events

## 6.1 The Parser State Machine

The VT100 parser is a finite state machine. It has states corresponding to "where am I in this byte stream?"

```
States:
  GROUND          ← normal text, printable characters
  ESCAPE          ← saw \x1b, waiting for next byte
  CSI_ENTRY       ← saw \x1b[, collecting CSI sequence
  CSI_PARAM       ← collecting parameter bytes (digits, semicolons)
  CSI_FINAL       ← CSI sequence complete, dispatching
  OSC_STRING      ← inside OSC \x1b]...
  DCS_STRING      ← inside DCS \x1bP...
  UTF8_SEQUENCE   ← mid-way through multi-byte UTF-8
```

Transitions:

```
GROUND:
  0x1B → ESCAPE
  0x00-0x1F → emit ControlCharEvent, stay in GROUND
  0x20-0x7E → buffer printable ASCII, stay in GROUND
  0x80-0xBF → UTF-8 continuation byte (error in GROUND), discard
  0xC0-0xDF → 2-byte UTF-8 start → UTF8_SEQUENCE
  0xE0-0xEF → 3-byte UTF-8 start → UTF8_SEQUENCE
  0xF0-0xF7 → 4-byte UTF-8 start → UTF8_SEQUENCE

ESCAPE:
  0x5B ([) → CSI_ENTRY
  0x5D (]) → OSC_STRING  
  0x50 (P) → DCS_STRING
  0x63 (c) → emit FullResetEvent → GROUND
  0x37 (7) → emit SaveCursorEvent → GROUND
  0x38 (8) → emit RestoreCursorEvent → GROUND
  other    → emit Esc+byte event → GROUND

CSI_ENTRY:
  0x30-0x39 (0-9) → start collecting params → CSI_PARAM
  0x3B (;)        → separator, next param → CSI_PARAM
  0x3F (?)        → DEC private mode prefix → CSI_PARAM
  0x40-0x7E       → final byte, emit CSI event → GROUND

CSI_PARAM:
  0x30-0x39 (0-9) → accumulate digit
  0x3B (;)        → next param
  0x40-0x7E       → final byte, emit CSI event → GROUND
  0x1B            → abort current CSI, → ESCAPE

OSC_STRING:
  0x07 (BEL)      → OSC terminator, emit OscEvent → GROUND
  0x1B 0x5C (ST)  → OSC terminator, emit OscEvent → GROUND
  other           → accumulate OSC data
```

## 6.2 The Screen Model

The parser maintains an in-memory model of the terminal screen. This is necessary because interpreting what the process "currently shows" requires understanding the full history of cursor movements and writes.

```rust
pub struct ScreenModel {
    pub cells: Vec<Vec<Cell>>,         // [row][col] grid
    pub cursor: CursorPos,
    pub saved_cursor: Option<CursorPos>,
    pub active_buffer: BufferType,     // Main | Alternate
    pub main_buffer: Vec<Vec<Cell>>,
    pub alt_buffer: Vec<Vec<Cell>>,
    pub scroll_region: (u16, u16),     // top and bottom row of scroll region
    pub dimensions: TerminalSize,
    pub text_attributes: TextAttributes,  // current SGR state
}

pub struct Cell {
    pub character: char,
    pub attributes: TextAttributes,
    pub dirty: bool,  // has changed since last render
}

pub struct TextAttributes {
    pub bold: bool,
    pub dim: bool,
    pub italic: bool,
    pub underline: bool,
    pub reverse: bool,
    pub fg_color: Option<Color>,
    pub bg_color: Option<Color>,
}
```

When a `\x1b[2K` (erase entire line) arrives, the parser sets all cells in the current row to empty. When `\r` arrives, cursor.col resets to 0. When `\x1b[A` arrives, cursor.row decrements.

The screen model is the source of truth for "what is currently displayed."

## 6.3 Scrollback Buffer

The screen model tracks the visible screen. The scrollback buffer records history — all lines that have scrolled off the top.

```rust
pub struct ScrollbackBuffer {
    lines: VecDeque<Vec<Cell>>,    // circular buffer
    max_lines: usize,              // default 10000
}
```

When content scrolls off the top (new line added at bottom, existing lines push up), the top line is pushed into the scrollback. The scrollback is searchable — the `/archaeology` command searches here among other places.

## 6.4 The Clean Text Extractor

Above the screen model sits the clean text extractor. Given the current screen state, it produces clean UTF-8 text with no escape codes.

```rust
pub fn extract_clean_text(model: &ScreenModel) -> String {
    let mut lines = Vec::new();
    
    for row in &model.cells {
        let line: String = row.iter()
            .map(|cell| cell.character)
            .collect::<String>()
            .trim_end()  // strip trailing spaces
            .to_string();
        lines.push(line);
    }
    
    // Remove trailing empty lines
    while lines.last().map(|l: &String| l.is_empty()).unwrap_or(false) {
        lines.pop();
    }
    
    lines.join("\n")
}
```

**But this is not enough for streaming detection.** The screen model shows you what's visible right now. For detecting "Claude just finished outputting a paragraph," you need the delta — what changed since the last snapshot.

## 6.5 The Delta Engine

```rust
pub struct ScreenDelta {
    pub added_lines: Vec<(usize, String)>,    // (row_index, content)
    pub modified_lines: Vec<(usize, String)>,
    pub erased_lines: Vec<usize>,
    pub cursor_moved_to: CursorPos,
    pub new_scrollback_lines: Vec<String>,    // lines that just scrolled off
}

pub fn compute_delta(before: &ScreenModel, after: &ScreenModel) -> ScreenDelta {
    // compare cell-by-cell, identify changes
    // identify lines that scrolled from visible to scrollback
}
```

The delta engine runs after every batch of bytes is processed. Its output feeds the semantic state machine (Pillar 1, Layer 2) and the UI renderer.

---

# 7. Process Lifecycle — Birth, Running, Death

## 7.1 The Process Record

Every spawned process has a record:

```rust
pub struct ProcessRecord {
    pub session_id: SessionId,
    pub pid: Pid,
    pub master_fd: RawFd,
    pub provider: ProviderType,
    pub spawn_time: Instant,
    pub state: ProcessState,
    pub exit_info: Option<ExitInfo>,
    pub recovery_count: u8,
}

pub enum ProcessState {
    Launching,
    Running,
    AwaitingInput,
    Exiting,
    Exited(ExitInfo),
}

pub struct ExitInfo {
    pub exit_code: i32,
    pub signal: Option<i32>,
    pub last_output: String,       // last N bytes of output before exit
    pub exit_time: Instant,
    pub uptime_ms: u64,
}
```

## 7.2 Detecting Process Exit — All Three Methods

Process exit must be detected reliably. There are three signals that a process has exited. Use all three — they arrive at different times and you need to handle all cases.

**Method 1: EIO on master read**

When the slave PTY closes (process exits), the next `read()` on master returns `EIO`. This is often the first signal you get.

```rust
match read(master_fd, &mut buf) {
    Err(Errno::EIO) => {
        // Process exited — slave PTY is closed
        // Note: may still have bytes to process from previous reads
        handle_process_exited(session_id);
    }
    // ...
}
```

**Method 2: SIGHUP on master close**

When you close the master file descriptor (or it's closed by another event), the child process receives SIGHUP. Most CLIs exit on SIGHUP. This is a write direction — you sending a signal via the PTY.

**Method 3: waitpid()**

Call `waitpid(pid, WNOHANG)` periodically (every 100ms in health check) to collect the exit status. This is the only way to get the exit code.

```rust
fn collect_exit_status(pid: Pid) -> Option<ExitInfo> {
    match waitpid(pid, Some(WaitPidFlag::WNOHANG)) {
        Ok(WaitStatus::Exited(_, code)) => Some(ExitInfo { exit_code: code, signal: None }),
        Ok(WaitStatus::Signaled(_, signal, _)) => Some(ExitInfo { exit_code: -1, signal: Some(signal as i32) }),
        Ok(WaitStatus::StillAlive) => None,  // still running
        Err(_) => Some(ExitInfo { exit_code: -1, signal: None }),  // zombie or permission error
    }
}
```

**The zombie process problem.** If you don't call `waitpid()` after a child exits, it becomes a zombie — the process table entry remains, consuming a PID slot. Always collect exit status. The process supervisor runs `waitpid(WNOHANG)` in its health check loop.

---

# 8. Crash Detection — When Things Go Wrong

## 8.1 Crash Classification

Not all unexpected exits are the same. Doorway classifies crashes to decide recovery strategy:

```rust
pub enum CrashType {
    // Process exited cleanly with non-zero code
    NormalExit { code: i32, reason: DetectedReason },
    
    // Process killed by signal
    SignalKill { signal: i32 },
    
    // Process hung — alive but not making progress
    Hang { duration_no_output: Duration },
    
    // PTY master closed unexpectedly (kernel issue)
    PtyError,
    
    // Rate limit response from the CLI
    RateLimit { retry_after: Option<Duration> },
    
    // Context window exceeded
    ContextOverflow,
    
    // Authentication error
    AuthError,
    
    // Unknown — generic crash
    Unknown { last_output: String },
}
```

## 8.2 The Output-Based Crash Detector

Before the process actually dies, many failures announce themselves in the output. The crash detector scans the last N lines of clean text for known patterns:

```rust
pub struct CrashPatterns {
    rate_limit: Vec<Regex>,         // "rate limit", "429", "too many requests"
    context_overflow: Vec<Regex>,   // "context window", "token limit", "too long"
    auth_error: Vec<Regex>,         // "unauthorized", "invalid api key", "401"
    network_error: Vec<Regex>,      // "connection refused", "network error", "timeout"
    internal_error: Vec<Regex>,     // "internal server error", "500"
}

fn detect_crash_from_output(last_lines: &[String]) -> Option<CrashType> {
    let text = last_lines.join(" ").to_lowercase();
    
    if PATTERNS.rate_limit.iter().any(|p| p.is_match(&text)) {
        return Some(CrashType::RateLimit { retry_after: extract_retry_after(&text) });
    }
    // ... etc
}
```

## 8.3 The Hang Detector

A hung process is alive but doing nothing. Detecting this requires comparing expected state against observed behavior:

```rust
pub struct HangDetector {
    last_output_time: Instant,
    current_state: ProcessState,
    
    // State-specific timeouts
    thinking_timeout: Duration,       // 60s — if THINKING, no output for 60s = hang
    awaiting_timeout: Duration,       // 300s — waiting for response, 5 min = stuck
    launching_timeout: Duration,      // 15s — should show prompt within 15s of launch
}

fn check_for_hang(&self) -> bool {
    let silence_duration = self.last_output_time.elapsed();
    
    match self.current_state {
        ProcessState::Launching => silence_duration > self.launching_timeout,
        ProcessState::Running => silence_duration > self.thinking_timeout,
        ProcessState::AwaitingInput => false,  // waiting for us, not hung
        _ => false,
    }
}
```

---

# 9. Recovery Architecture — Restart Without Losing State

## 9.1 The Recovery Context

Before restarting a crashed or hung session, capture everything needed to resume:

```rust
pub struct RecoveryContext {
    pub original_prompt: String,           // what the user originally asked
    pub session_history: Vec<Message>,     // all messages in this session so far
    pub completed_subtasks: Vec<String>,   // tasks that were completed before crash
    pub last_coherent_output: String,      // last complete, parseable output block
    pub crash_type: CrashType,
    pub recovery_count: u8,
    pub files_modified: Vec<PathBuf>,      // files the agent had written to
    pub working_dir: PathBuf,
}
```

## 9.2 Recovery Strategies by Crash Type

| Crash Type | Strategy | Delay |
|---|---|---|
| RateLimit | Wait retry_after, then restart with same prompt | retry_after or 60s |
| ContextOverflow | Compact context, restart with summary | immediate |
| Hang | Hard kill, restart with resume prompt | 5s |
| NormalExit (code 0) | Session completed normally, no recovery needed | — |
| NormalExit (code 1) | Check output for error, may need user | immediate |
| AuthError | Surface to user, do not auto-retry | — |
| NetworkError | Retry with backoff (1s, 2s, 4s, 8s) | exponential |
| Unknown | Retry once, then surface to user | 3s |

## 9.3 The Resume Prompt

For hang and unknown crashes, construct a resume prompt that tells the agent what was already done:

```
[RECOVERY - attempt 2]

You were working on the following task:
{original_prompt}

You had already completed:
{completed_subtasks joined as bullet list}

Your last output before the interruption was:
{last_coherent_output}

Please continue from where you left off. Do not repeat work already completed.
```

## 9.4 Context Compaction for ContextOverflow

When a session hits the context window limit:

1. Take the full session history
2. Ask a separate lightweight agent (or a short local call) to summarize: "Summarize this development session history, preserving: all files modified, all decisions made, all code written, current state of the task."
3. Start a new session with the summary as the system context
4. The user sees a `[Context compacted — session continues]` indicator in the thread

The compaction itself is a terminal action — Doorway injects `/compact` (Claude CLI's built-in compact command) before the session fails, if token usage is being tracked and the threshold is approaching.

---

# 10. Input Injection — Writing Back Into the Terminal

## 10.1 Writing to the Master

Input injection is a `write()` syscall on the master file descriptor:

```rust
fn inject_input(master_fd: RawFd, text: &str) -> Result<()> {
    let bytes = text.as_bytes();
    let mut written = 0;
    
    while written < bytes.len() {
        match write(master_fd, &bytes[written..]) {
            Ok(n) => written += n,
            Err(Errno::EINTR) => continue,    // interrupted by signal, retry
            Err(Errno::EAGAIN) => {
                // master buffer full — wait and retry
                thread::sleep(Duration::from_millis(10));
                continue;
            }
            Err(e) => return Err(e.into()),
        }
    }
    Ok(())
}
```

## 10.2 Injection Timing

Injecting at the wrong time causes problems:

- **Too early (process still starting):** Input is buffered but may be misinterpreted once the process enters its input handling loop
- **During active output:** The process may be mid-write; injection can interleave with output in unexpected ways
- **During THINKING state:** Injecting "yes\n" while Claude is thinking will be queued; once Claude reaches an input prompt, it will consume it. This is usually fine.

Best practice: inject when `SessionState == AWAITING_INPUT`. For programmatic inputs (like sending context), inject immediately after confirming the process is in `AWAITING_INPUT` state.

## 10.3 Special Key Sequences

Some inputs are not printable text — they're control sequences:

```rust
pub enum SpecialKey {
    Enter,         // "\r" or "\n" — prefer "\r" for terminals
    CtrlC,         // "\x03" — SIGINT equivalent in interactive mode
    CtrlD,         // "\x04" — EOF / end of input
    CtrlZ,         // "\x1A" — SIGTSTP equivalent
    Escape,        // "\x1B"
    ArrowUp,       // "\x1B[A"
    ArrowDown,     // "\x1B[B"
    Tab,           // "\x09"
    Backspace,     // "\x7F" or "\x08" — terminal dependent
}
```

**Use `\r` (carriage return) not `\n` (line feed) for Enter.** In raw terminal mode, `\n` is a line feed only (cursor moves down, stays in column). `\r` returns to column 0 first, which is what interactive terminals expect as "submit input."

## 10.4 Echo Suppression

When you inject input into the master, the line discipline echoes it back to the master. Your parser will read your own injected input as if the process output it.

Two strategies:

**Strategy A — Echo Marking:** When you inject text, mark the injection in a buffer. When the parser reads it back as echo, recognize it and suppress it from the event stream.

```rust
struct EchoSuppressor {
    pending_echoes: VecDeque<String>,
}

fn inject_and_suppress_echo(&mut self, master_fd: RawFd, text: &str) {
    self.echo_suppressor.pending_echoes.push_back(text.to_string());
    inject_input(master_fd, text);
}

fn on_output_received(&mut self, output: &str) {
    if let Some(pending) = self.echo_suppressor.pending_echoes.front() {
        if output.starts_with(pending.as_str()) {
            self.echo_suppressor.pending_echoes.pop_front();
            return;  // suppress this echo
        }
    }
    // not an echo, process normally
    self.process_output(output);
}
```

**Strategy B — Disable Echo via termios:**

```c
struct termios t;
tcgetattr(master_fd, &t);
t.c_lflag &= ~ECHO;
tcsetattr(master_fd, TCSANOW, &t);
```

Strategy B is cleaner but may cause issues if the CLI expects to control its own echo state.

---

# 11. Terminal Dimensions & SIGWINCH

## 11.1 Why Dimensions Matter

Every CLI tool wraps text based on terminal width. If Claude CLI thinks it has 80 columns, it wraps every line at 80 characters. This means your output contains artificial line breaks that don't correspond to semantic boundaries. This breaks paragraph detection and code block detection in the semantic layer.

**Solution: Set a large fixed width on spawn.** Doorway sets `COLUMNS=220` in the environment and sets the initial PTY window size to 220 columns. This eliminates most line-wrap artifacts.

## 11.2 Setting Dimensions on Spawn

```c
struct winsize ws = {
    .ws_row = 50,     // height in rows
    .ws_col = 220,    // width in columns — wide to prevent wrapping
    .ws_xpixel = 0,   // pixel dimensions (unused by CLIs)
    .ws_ypixel = 0,
};
openpty(&master_fd, &slave_fd, nullptr, nullptr, &ws);
```

## 11.3 Resize Events (SIGWINCH)

When Doorway's UI window is resized, the terminal sessions should adapt. This is done by:

1. Calculate new dimensions from UI layout
2. Call `ioctl(master_fd, TIOCSWINSZ, &new_ws)` to update PTY dimensions
3. This automatically sends SIGWINCH to the child process
4. Child process calls `tcgetattr()` or handles SIGWINCH to discover new dimensions
5. Child re-wraps its output accordingly

For Doorway's multi-session model, all sessions share the same "terminal panel" dimensions. When the panel resizes, all master file descriptors are updated simultaneously.

---

# 12. Signal Handling — The Full Map

## 12.1 Signals You Send to Child Processes

| Signal | How to Send | When |
|---|---|---|
| SIGTERM | `kill(pid, SIGTERM)` | Graceful shutdown request |
| SIGKILL | `kill(pid, SIGKILL)` | Force kill (unresponsive process) |
| SIGINT | inject `\x03` to master | User pressed Ctrl+C (interactive) |
| SIGWINCH | `ioctl(TIOCSWINSZ)` | Terminal resized (auto-sent by ioctl) |
| SIGHUP | close master_fd | Terminal disconnected (process should exit) |

**Graceful shutdown sequence:**
1. Send SIGTERM
2. Wait 5 seconds
3. If still alive, send SIGKILL
4. Call `waitpid()` to collect exit status

## 12.2 Signals You Handle in Your Own Process

| Signal | Action |
|---|---|
| SIGCHLD | Child process state changed — call `waitpid()` to collect status |
| SIGPIPE | Write to closed pipe/PTY — handle EPIPE in write() instead, ignore SIGPIPE |

**Critical: Handle SIGPIPE.** If you write to a master_fd whose slave is closed, `write()` returns EPIPE. If you don't handle `SIGPIPE` (by setting `SIG_IGN` or a handler), the default action is to terminate your entire process. Set `signal(SIGPIPE, SIG_IGN)` on startup or handle `EPIPE` in every write call.

```rust
// On startup
signal(Signal::SIGPIPE, SigHandler::SigIgn)?;

// In write loop
Err(Errno::EPIPE) => {
    // slave closed — process exited
    handle_process_exited(session_id);
    return Ok(());
}
```

---

# 13. Multi-Session Management — Running Many PTYs Simultaneously

## 13.1 The Session Registry

```rust
pub struct SessionRegistry {
    sessions: HashMap<SessionId, Session>,
    epoll_fd: RawFd,              // single epoll instance watches all master fds
    fd_to_session: HashMap<RawFd, SessionId>,  // reverse lookup
}
```

One `epoll` instance watches all master file descriptors. When any session produces output, `epoll_wait()` returns with the relevant file descriptor. The registry looks up which session that fd belongs to and routes the bytes accordingly.

This is the standard pattern for handling many file descriptors efficiently. 100 concurrent PTY sessions, one thread, no overhead.

## 13.2 The Session Loop (Single-Threaded Async)

```rust
async fn session_loop(registry: Arc<Mutex<SessionRegistry>>) {
    let epoll_fd = registry.lock().epoll_fd;
    let mut events = [EpollEvent::empty(); 64];
    
    loop {
        let n = epoll_wait(epoll_fd, &mut events, 100)?;  // 100ms timeout
        
        for event in &events[..n] {
            let fd = event.data() as RawFd;
            let session_id = registry.lock().fd_to_session[&fd];
            
            if event.events().contains(EPOLLIN) {
                let bytes = read_available_bytes(fd);
                process_session_output(session_id, bytes);
            }
            if event.events().contains(EPOLLHUP | EPOLLERR) {
                handle_session_exit(session_id);
            }
        }
        
        // Periodic health checks (not every loop iteration — throttled)
        health_check_all_sessions(&registry);
    }
}
```

## 13.3 Session Isolation

Sessions are completely isolated from each other at the PTY layer. Session A's output bytes never mix with Session B's. The registry enforces this through the `fd_to_session` mapping — each fd belongs to exactly one session.

Context sharing between sessions (Pillar 3 — unified thread) happens at the Brain layer, not the PTY layer. The PTY layer knows nothing about "threads" or "agents" — it only knows file descriptors, processes, and bytes.

---

# 14. The Read Buffer Design

## 14.1 Ring Buffer for Output

Each session maintains a ring buffer of its recent output (post-parsing, clean text only):

```rust
pub struct OutputRingBuffer {
    lines: VecDeque<OutputLine>,
    max_lines: usize,             // default: 10,000 lines
    total_bytes: usize,
}

pub struct OutputLine {
    pub content: String,
    pub timestamp: Instant,
    pub line_type: LineType,      // Code | Text | Prompt | System
}
```

The ring buffer serves:
- Crash recovery (last N lines before crash)
- State detection (scan recent output for question patterns)
- Session archaeology (searchable history)
- UI rendering (display session content)

## 14.2 Backpressure

When a process generates output faster than Doorway can process it (unlikely but possible for very large code generation), the read loop must handle backpressure.

The `O_NONBLOCK` flag + `EAGAIN` handling in the read loop provides natural backpressure. If the processing pipeline is busy, we stop reading from the master fd temporarily — the kernel buffers it in the PTY's internal buffer (default 4096 bytes on Linux; can be increased via `ioctl(TIOCPKT)`).

If the kernel buffer fills, the child process's `write()` will block. This provides end-to-end backpressure all the way back to the CLI's output. In practice this never happens — text output is far slower than any processing pipeline.

---

# 15. What Claude CLI Actually Looks Like on PTY

## 15.1 Startup Sequence

When Claude CLI launches:

```
\x1b[?2004h                    ← enable bracketed paste
\x1b]0;Claude\x07              ← set window title to "Claude"
\x1b[?25l                      ← hide cursor
\x1b[2J\x1b[H                  ← clear screen, go to home
\x1b[?25h                      ← show cursor
\x1b[1;36mClaude\x1b[0m        ← "Claude" in cyan
 \x1b[2mv0.2.x\x1b[0m\n        ← version in dim
\n
\x1b[1;32m>\x1b[0m \x1b[?25h   ← green prompt "> ", show cursor
```

The initial prompt is `> ` with the `>` in green. This is the AWAITING_INPUT state pattern.

## 15.2 While Processing (Thinking)

After input is submitted:

```
\x1b[?25l                      ← hide cursor (processing)
\x1b[2K\r                      ← clear current line
\x1b[2mThinking...\x1b[0m      ← dim "Thinking..." text
\r\x1b[K                       ← spinner update (overwrites "Thinking...")
\x1b[2m⠋\x1b[0m Thinking...    ← braille spinner character
```

The spinner is implemented as `\r` + new character + same text. The parser must recognize the `\r` overwrite pattern to avoid capturing spinner frames as output content.

## 15.3 Output Phase

When Claude begins responding:

```
\x1b[2K\r                      ← clear the "Thinking..." line
\n                              ← blank line before response
\x1b[0m                        ← reset attributes
Here is the fix for your issue:\n
\n
\x1b[38;5;242m```typescript\x1b[0m\n    ← fenced code block opening in gray
\x1b[32mconst\x1b[0m token = \x1b[33mjwt\x1b[0m.verify(input)\n
\x1b[38;5;242m```\x1b[0m\n      ← fenced code block closing
\n
The key change is on line 3...\n
\n
\x1b[1;32m>\x1b[0m \x1b[?25h   ← back to prompt after completion
```

**The return-to-prompt is the COMPLETE signal.** When the green `> ` prompt reappears after output, the response is done.

## 15.4 When Claude Asks a Question

```
\n
\x1b[1;33m?\x1b[0m             ← yellow "?" character
 Should I also update the tests? [y/n]\n
\n
\x1b[1;32m>\x1b[0m \x1b[?25h   ← waiting for input
```

The question pattern: yellow `?` followed by question text, then back to prompt. The semantic detector looks for the yellow `?` (SGR color 33) preceding a line with a `?` character and question syntax.

---

# 16. What Codex CLI Actually Looks Like on PTY

## 16.1 Startup Sequence

Codex CLI startup is different:

```
\x1b[?1049h                    ← switch to alternate screen buffer
\x1b[2J\x1b[H                  ← clear screen
\x1b[1mCodex\x1b[0m by OpenAI\n
\x1b[2m─────────────────────\x1b[0m\n
\n
\x1b[36m❯\x1b[0m               ← cyan arrow prompt
```

**Note the `\x1b[?1049h`** — Codex switches to the alternate screen buffer. This means Codex's output does not go to the scrollback. When Codex exits and restores the main buffer with `\x1b[?1049l`, everything it showed disappears. Doorway must capture content while Codex is on the alternate screen.

## 16.2 The Alternate Screen Problem

Since Codex uses the alternate screen:

1. When Codex switches to alternate screen (`\x1b[?1049h`), the parser switches to tracking `alt_buffer` in the ScreenModel
2. All output during Codex's session is captured from `alt_buffer`
3. When Codex exits (`\x1b[?1049l`), the `alt_buffer` content is preserved in the scrollback before the model switches back to `main_buffer`

Without this, all Codex output would be lost on session exit.

## 16.3 Codex Output Formatting

Codex uses heavier box-drawing and structured output:

```
\x1b[2m┌─ Analyzing codebase ─────────────────┐\x1b[0m
\x1b[2m│\x1b[0m Found 3 relevant files
\x1b[2m└──────────────────────────────────────┘\x1b[0m
```

Box-drawing characters (U+2500 range) are printable Unicode — they pass through the VT100 parser as regular characters. The clean text extractor should strip them (they're decorative) or preserve them (they're structural). Doorway's default: strip box-drawing from extracted clean text, preserve in raw capture.

---

# 17. State Detection From Raw Output

## 17.1 The Pattern Library

State detection uses a pattern library maintained per provider. These patterns are learned from observation and updated as CLI versions change.

```rust
pub struct ProviderPatterns {
    // Patterns that indicate AWAITING_INPUT
    pub input_prompts: Vec<Pattern>,
    
    // Patterns that indicate THINKING (processing)
    pub thinking_indicators: Vec<Pattern>,
    
    // Patterns that indicate output started
    pub output_start: Vec<Pattern>,
    
    // Patterns that indicate output complete (return to prompt)
    pub output_complete: Vec<Pattern>,
    
    // Patterns that indicate a question being asked
    pub question_patterns: Vec<Pattern>,
    
    // Error patterns
    pub error_patterns: Vec<ErrorPattern>,
}

pub struct Pattern {
    pub regex: Regex,
    pub requires_cursor_at_end: bool,  // must cursor be at end of line?
    pub min_silence_after_ms: u64,     // how long after match to confirm state
    pub confidence: f32,
}
```

## 17.2 Multi-Signal State Confirmation

No single signal is 100% reliable. State transitions are confirmed when multiple signals agree:

**AWAITING_INPUT confirmation (requires 3 of 4):**
1. Prompt pattern matched in last line of output
2. Process stdin is blocked (OS-level check)
3. No new bytes for 500ms
4. Cursor is at the end of the prompt line

**THINKING confirmation (requires 2 of 3):**
1. Thinking indicator pattern matched
2. Process CPU active (not sleeping on stdin)
3. Bytes arriving in stream

**COMPLETE confirmation (requires 2 of 3):**
1. Output complete / return to prompt pattern matched
2. Process stdin blocked again
3. 1000ms silence after last output byte

---

# 18. Cross-Platform: Unix vs Windows ConPTY

## 18.1 Unix (macOS and Linux)

Identical `openpty()` / `forkpty()` API. Differences:

| | Linux | macOS |
|---|---|---|
| PTY device | `/dev/pts/N` | `/dev/ttysN` |
| Process state | `/proc/PID/status` | `proc_pidinfo()` |
| Async I/O | `epoll` | `kqueue` |
| PTY buffer size | 4096 bytes (adjustable) | 1024 bytes (fixed) |

**macOS PTY buffer is smaller.** More frequent partial reads. The parser's partial sequence handling is more important on macOS.

## 18.2 Windows ConPTY

Windows ConPTY was introduced in Windows 10 1809. It is not compatible with Unix PTY — completely different API.

```c
// Windows ConPTY creation
CreatePseudoConsole(
    size,          // COORD with width and height
    hInput,        // HANDLE for input pipe
    hOutput,       // HANDLE for output pipe  
    0,             // flags
    &hPCon         // returns HPCON
);
```

Instead of a single file descriptor, ConPTY gives you two pipes — one for input and one for output. The pipes are `HANDLE` values, not file descriptors.

**Key differences:**

| | Unix PTY | Windows ConPTY |
|---|---|---|
| API | openpty() + fork() | CreatePseudoConsole() + CreateProcess() |
| I/O model | single fd (bidirectional) | two separate HANDLEs (input + output) |
| Async I/O | epoll / kqueue | IOCP (Completion Ports) |
| Signal sending | kill(pid, signal) | TerminateProcess() / GenerateConsoleCtrlEvent() |
| VT sequence support | Full VT220 | Subset — some sequences not supported |
| PTY buffer | 4096+ bytes | 8192 bytes default |

**The `portable-pty` crate abstracts all of this** — on Unix it uses `openpty()`, on Windows it uses ConPTY. This is why `portable-pty` is the correct choice rather than writing your own abstraction.

## 18.3 VT Sequence Differences on Windows

Windows ConPTY does not support all VT sequences. Sequences Doorway must handle gracefully on Windows (treat as no-op if unsupported):

- OSC 8 hyperlinks — rendered as plain text
- Some 256-color sequences — may fall back to 16 colors
- Sixel graphics — not supported
- Some cursor movement sequences — behavior may differ

The VT parser's graceful-ignore path for unknown sequences is the safety net here. Unknown sequences are discarded without corrupting the parser state.

---

# 19. The Rust Sidecar Architecture

## 19.1 Why a Separate Process

The terminal harness runs as a separate Rust process (the sidecar), not as native code inside the Electron main process. Reasons:

**Memory safety isolation.** A bug in the PTY handling code that corrupts memory will crash the sidecar, not the entire Doorway UI. The user sees a reconnection message, not a lost session.

**Performance isolation.** High-throughput terminal I/O doesn't compete with UI rendering for CPU time.

**Crash resilience.** If the sidecar crashes, it restarts automatically. Session state is preserved in SQLite. The reconnected sidecar restores session state.

**Upgradability.** The sidecar binary can be updated independently of the UI.

## 19.2 The IPC Channel

Sidecar ↔ Electron main process communication via:
- **Unix:** Unix domain socket at `~/.doorway/sidecar.sock`
- **Windows:** Named pipe at `\\.\pipe\doorway-sidecar`

Messages are newline-delimited JSON. The protocol is bidirectional and asynchronous.

## 19.3 Sidecar Lifecycle

```
Electron app starts
  → Spawn sidecar binary as child process
  → Connect to sidecar socket
  → Sidecar sends "ready" message
  → Electron sends session restoration requests (from SQLite)
  → Normal operation begins

Electron app closes
  → Send "shutdown" message to sidecar
  → Sidecar gracefully terminates all PTY sessions
  → Sidecar saves final state to SQLite
  → Sidecar exits

Sidecar crashes unexpectedly
  → Electron detects socket closed
  → Wait 1 second
  → Respawn sidecar
  → Reconnect socket
  → Send session restoration requests
  → Running sessions resumed within 3 seconds
```

## 19.4 Key Sidecar Crate Dependencies

```toml
[dependencies]
# PTY substrate
portable-pty = "0.8"

# VT100 parser
vte = "0.13"

# Async runtime
tokio = { version = "1", features = ["full"] }

# OS-specific process management
nix = { version = "0.27", features = ["process", "signal", "ioctl"] }

# Serialization (IPC protocol)
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# SQLite (session persistence)
rusqlite = { version = "0.31", features = ["bundled"] }

# Logging
tracing = "0.1"
tracing-subscriber = "0.3"

# Ring buffer
circular-buffer = "0.1"

# Regex (pattern matching)
regex = "1"
```

---

# 20. Implementation Checklist

Use this to track Layer 1 implementation completeness.

## Phase 1 — Core PTY (Week 1)

- [ ] Integrate `portable-pty` crate
- [ ] Implement spawn sequence with correct termios settings
- [ ] Implement non-blocking read loop with epoll/kqueue
- [ ] Handle EIO on master read (process exit detection)
- [ ] Handle SIGCHLD and waitpid() for exit status collection
- [ ] Handle SIGPIPE / EPIPE in write path
- [ ] Basic write() injection with EAGAIN handling
- [ ] Set TERM=xterm-256color and COLUMNS=220 on spawn
- [ ] Implement TIOCSWINSZ for terminal resize

## Phase 2 — VT100 Parser (Week 1-2)

- [ ] Implement parser state machine (all states)
- [ ] Handle all CSI sequences (SGR, cursor movement, erase)
- [ ] Handle OSC sequences (window title, hyperlinks)
- [ ] Handle DCS sequences (discard gracefully)
- [ ] Handle mode setting sequences (?1049h alternate screen)
- [ ] Handle CR+LF and lone CR (overwrite detection)
- [ ] Implement UTF-8 multi-byte sequence handling
- [ ] Handle partial sequences across read() boundaries
- [ ] Implement screen model (cells grid, cursor tracking)
- [ ] Implement scrollback buffer
- [ ] Implement clean text extractor
- [ ] Implement delta engine

## Phase 3 — State Detection (Week 2)

- [ ] Implement pattern library for Claude CLI
- [ ] Implement pattern library for Codex CLI
- [ ] Implement multi-signal AWAITING_INPUT detection
- [ ] Implement THINKING state detection
- [ ] Implement COMPLETE state detection
- [ ] Implement process stdin blocking detection (OS level)
- [ ] Implement question pattern detection (NLP patterns)
- [ ] Echo suppression for injected input

## Phase 4 — Process Supervisor (Week 2-3)

- [ ] Implement ProcessRecord and ProcessState
- [ ] Implement hang detector with configurable timeouts
- [ ] Implement crash classification (output pattern scanning)
- [ ] Implement graceful + hard kill sequence
- [ ] Implement recovery context capture
- [ ] Implement resume prompt construction
- [ ] Implement context compaction trigger
- [ ] Implement /compact injection for approaching context limit
- [ ] Implement exponential backoff for network errors
- [ ] Implement rate limit detection and wait

## Phase 5 — Multi-Session (Week 3)

- [ ] Implement SessionRegistry with single epoll
- [ ] Implement fd_to_session reverse lookup
- [ ] Implement per-session ring buffer
- [ ] Verify session isolation (no cross-session byte mixing)
- [ ] Implement concurrent spawn of multiple sessions

## Phase 6 — IPC & Sidecar (Week 3-4)

- [ ] Implement Unix domain socket server (Linux/macOS)
- [ ] Implement Named Pipe server (Windows)
- [ ] Implement newline-delimited JSON protocol
- [ ] Implement session restoration on sidecar restart
- [ ] Implement sidecar crash detection and respawn in Electron
- [ ] Implement graceful shutdown sequence

## Phase 7 — Windows ConPTY (Week 4)

- [ ] Verify portable-pty ConPTY integration
- [ ] Test VT sequence subset on Windows
- [ ] Implement IOCP-based async I/O on Windows
- [ ] Test graceful shutdown on Windows (GenerateConsoleCtrlEvent)
- [ ] Verify VT parser graceful-ignore on unsupported sequences

## Phase 8 — Testing (Week 4-5)

- [ ] Unit tests for VT100 parser (all escape sequence types)
- [ ] Unit tests for state machine transitions
- [ ] Integration test: spawn Claude CLI, detect question, inject response
- [ ] Integration test: spawn Codex CLI, detect completion
- [ ] Integration test: simulate process crash, verify recovery
- [ ] Integration test: simulate hang, verify restart
- [ ] Integration test: context overflow, verify compaction
- [ ] Load test: 8 concurrent sessions, verify no cross-contamination
- [ ] Cross-platform test matrix: macOS, Ubuntu, Windows

---

*End of Document*

---

**Doorway Layer 1 — Terminal Harness Technical Specification**
*Classification: Internal — Litchi Studio*
*This document covers the complete PTY substrate through the clean event output. Implementation begins here.*
