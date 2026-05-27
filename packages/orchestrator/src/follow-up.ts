import { BrainService } from './brain/brain-service.js';
import type { AgentEvent } from './index.js';

export interface AuditResult {
  fulfilled: boolean;
  gaps: string[];
  conflicts: string[];
  summary: string;
}

export class FollowUpEngine {
  constructor(private readonly brain: BrainService) {}

  async auditCompletion(
    goal: string,
    events: readonly AgentEvent[],
    provider: string
  ): Promise<AuditResult> {
    const rawOutput = events
      .filter((e) => e.type === 'stdout' || e.type === 'stderr')
      .map((e) => e.data)
      .join('');
    
    // We don't want to blow up the prompt, so we take the last 8k characters of output
    const recentOutput = rawOutput.slice(-8000);

    const auditPrompt = `
Original user request: "${goal}"

What was actually done by ${provider}:
${recentOutput}

Evaluate:
1. Was the user's full request fulfilled?
2. Are there any gaps between what was asked and what was done?
3. Are there any conflicts between what different agents did?
4. What should the user know about what was done?

Respond ONLY with JSON:
{
  "fulfilled": true,
  "gaps": [],
  "conflicts": [],
  "summary": "Brief summary of what was accomplished"
}
`;

    try {
      const response = await this.brain.executeRole('reviewer', {
        messages: [{ role: 'user', content: auditPrompt }],
        temperature: 0.1,
      });
      const cleaned = response.replace(/^[\s\S]*?```json\n?|\n?```[\s\S]*$/g, '').trim();
      
      // Fallback parse
      const parsed = JSON.parse(cleaned.startsWith('{') ? cleaned : response);
      return {
        fulfilled: Boolean(parsed.fulfilled),
        gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
        conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
        summary: String(parsed.summary || ''),
      };
    } catch (e) {
      console.error('[FollowUpEngine] Failed to audit completion', e);
      return {
        fulfilled: true,
        gaps: [],
        conflicts: [],
        summary: 'Audit completed with warnings (parsing error).',
      };
    }
  }

  async synthesizeResponse(goal: string, audit: AuditResult): Promise<string> {
    const synthPrompt = `
User asked: "${goal}"

Audit Summary: ${audit.summary}
Gaps: ${audit.gaps.join(', ')}
Conflicts: ${audit.conflicts.join(', ')}

Create a clear, structured response that:
1. Directly answers what the user asked
2. Shows what was done
3. Highlights any decisions made and why
4. Notes anything the user should review
5. Keeps it tight — no padding, no repeating what's obvious

Format: use headers sparingly, show changed files as a clean list, keep explanations brief. Do NOT use markdown code blocks to wrap the entire response.
    `;

    try {
      const response = await this.brain.executeRole('reviewer', {
        messages: [{ role: 'user', content: synthPrompt }],
        temperature: 0.3,
      });
      return response;
    } catch (e) {
      console.error('[FollowUpEngine] Failed to synthesize response', e);
      return 'Synthesis failed.';
    }
  }
}
