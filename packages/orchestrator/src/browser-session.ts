import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { EventEmitter } from 'node:events';

export interface BrowserAction {
  readonly timestamp: Date;
  readonly type: string;
  readonly selector?: string;
  readonly text?: string;
  readonly url?: string;
  readonly screenshot?: string; // base64
}

export interface BrowserSessionState {
  readonly url: string;
  readonly title: string;
  readonly isLoading: boolean;
  readonly isAgentControlled: boolean;
}

/**
 * BrowserSessionService
 *
 * Manages controlled Playwright sessions for Computer Use.
 */
export class BrowserSessionService extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private isAgentControlled = true;
  private actions: BrowserAction[] = [];

  /**
   * Launch a new controlled browser session.
   */
  async launch(options: { url?: string; headless?: boolean } = {}): Promise<void> {
    this.browser = await chromium.launch({
      headless: options.headless ?? false,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
    });

    this.page = await this.context.newPage();

    if (options.url) {
      await this.page.goto(options.url);
    }

    // Set up listeners for action trace
    this.setupPageListeners();

    this.emit('state-change', this.getState());
  }

  private setupPageListeners() {
    if (!this.page) return;

    this.page.on('load', () => {
      this.recordAction({ type: 'load', url: this.page?.url() });
      this.emit('state-change', this.getState());
    });

    this.page.on('console', (msg) => {
      this.emit('console', { type: msg.type(), text: msg.text() });
    });

    this.page.on('pageerror', (err) => {
      this.recordAction({ type: 'error', text: err.message });
      this.emit('error', err.message);
    });
  }

  /**
   * Take over control from agent.
   */
  pauseAgent() {
    this.isAgentControlled = false;
    this.emit('state-change', this.getState());
  }

  /**
   * Return control to agent.
   */
  resumeAgent() {
    this.isAgentControlled = true;
    this.emit('state-change', this.getState());
  }

  private recordAction(action: Partial<BrowserAction>) {
    const fullAction: BrowserAction = {
      timestamp: new Date(),
      type: 'unknown',
      ...action,
    };
    this.actions.push(fullAction);
    this.emit('action', fullAction);
  }

  getState(): BrowserSessionState {
    return {
      url: this.page?.url() ?? '',
      title: this.page ? 'Browser' : '',
      isLoading: false,
      isAgentControlled: this.isAgentControlled,
    };
  }

  getActions(): readonly BrowserAction[] {
    return [...this.actions];
  }

  async close() {
    await this.browser?.close();
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}
