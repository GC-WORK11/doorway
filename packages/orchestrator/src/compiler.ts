import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ProjectMemoryLoader } from './memory.js';

const RELEVANT_FILE_CHAR_LIMIT = 5000;

export interface CompilerContext {
  readonly projectId: string;
  readonly goal: string;
  readonly cwd: string;
  readonly importantFiles?: readonly string[];
  readonly previousSummary?: string;
  readonly memoryLoader?: ProjectMemoryLoader;
  readonly peerAgents?: readonly { readonly id: string; readonly role: string; readonly displayName: string; }[];
}

export function relevantFileContentForPrompt(content: string): string {
  return content.slice(0, RELEVANT_FILE_CHAR_LIMIT);
}

/**
 * Context Compiler
 *
 * Gathers project state and builds high-quality prompts for agents.
 */
export class ContextCompiler {
  /**
   * Compile a full context prompt for an agent.
   */
  static async compile(ctx: CompilerContext): Promise<string> {
    let prompt = '';

    // 1. Project Memory (Rules)
    if (ctx.memoryLoader) {
      const memoryItems = await ctx.memoryLoader.getActiveMemory(ctx.projectId);
      const memoryPrompt = ctx.memoryLoader.formatForPrompt(memoryItems);
      if (memoryPrompt) {
        prompt += `${memoryPrompt}\n\n`;
      }
    }

    prompt += `GOAL: ${ctx.goal}\n\n`;

    if (ctx.previousSummary) {
      prompt += `PREVIOUS PROGRESS:\n${ctx.previousSummary}\n\n`;
    }

    if (ctx.peerAgents && ctx.peerAgents.length > 0) {
      prompt += `PEER AGENT CONTEXT (CROSS-THREADING):\n`;
      prompt += `You are operating in a multi-agent environment. The following peer agents are currently running alongside you in this thread:\n`;
      for (const peer of ctx.peerAgents) {
        prompt += `- ${peer.displayName} (ID: ${peer.id}, Role: ${peer.role})\n`;
      }
      prompt += `\nYou can communicate with them using the terminal action block. To send a message, emit the following EXACT format to your standard output:\n\n`;
      prompt += `\`\`\`doorway-action\n`;
      prompt += `type: send_message\n`;
      prompt += `to: [AGENT ID OR NAME]\n`;
      prompt += `kind: question\n`;
      prompt += `message: "Your message here"\n`;
      prompt += `\`\`\`\n\n`;
      prompt += `To pull messages sent to you, emit:\n\n`;
      prompt += `\`\`\`doorway-action\n`;
      prompt += `type: pull_messages\n`;
      prompt += `\`\`\`\n\n`;
    }

    // Add project structure
    const structure = await this.getProjectStructure(ctx.cwd);
    prompt += `PROJECT STRUCTURE:\n${structure}\n\n`;

    // Add important files content
    if (ctx.importantFiles && ctx.importantFiles.length > 0) {
      prompt += `RELEVANT FILES:\n`;
      for (const file of ctx.importantFiles) {
        try {
          const content = await fs.readFile(path.join(ctx.cwd, file), 'utf-8');
          prompt += `--- ${file} ---\n${relevantFileContentForPrompt(content)}\n\n`;
        } catch {
          // Skip if file doesn't exist
        }
      }
    }

    prompt += `INSTRUCTION:\nPlease implement the requested changes. Use the terminal to run tests and verify your work.`;

    return prompt;
  }

  private static async getProjectStructure(cwd: string): Promise<string> {
    // Simple list of top-level files/dirs
    try {
      const files = await fs.readdir(cwd, { withFileTypes: true });
      return files
        .filter((f) => !f.name.startsWith('.'))
        .map((f) => `${f.isDirectory() ? '[DIR]' : '[FILE]'} ${f.name}`)
        .join('\n');
    } catch {
      return 'Unknown';
    }
  }
}
