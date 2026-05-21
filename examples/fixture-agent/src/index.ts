#!/usr/bin/env node

/**
 * Deterministic Fixture Agent
 *
 * A simple, deterministic CLI agent for testing the Doorway terminal runtime.
 * It accepts a prompt, produces known output, optionally edits a fixture file,
 * and exits with a predictable exit code.
 *
 * Usage:
 *   fixture-agent --prompt "implement feature X"
 *   fixture-agent --prompt "run tests" --exit-code 0
 *   fixture-agent --prompt "modify file" --edit fixtures/output.txt --exit-code 0
 */

import { parseArgs } from 'node:util';

interface FixtureAgentOptions {
  prompt: string;
  exitCode: number;
  editFile?: string;
  sleepMs: number;
  outputLines: string[];
}

function parseArguments(): FixtureAgentOptions {
  const { values } = parseArgs({
    options: {
      prompt: {
        type: 'string',
        short: 'p',
        required: true,
      },
      'exit-code': {
        type: 'string',
        default: '0',
      },
      edit: {
        type: 'string',
      },
      sleep: {
        type: 'string',
        default: '100',
      },
      output: {
        type: 'string',
        multiple: true,
      },
    },
  });

  const outputLines = values.output ?? [
    '> Analyzing task...',
    '> Planning implementation...',
    '> Implementing changes...',
    `> Task: ${values.prompt}`,
    '> Changes complete.',
    '> Done.',
  ];

  return {
    prompt: values.prompt ?? '',
    exitCode: parseInt(values['exit-code'] ?? '0', 10),
    editFile: values.edit,
    sleepMs: parseInt(values.sleep ?? '100', 10),
    outputLines,
  };
}

async function runFixtureAgent(options: FixtureAgentOptions): Promise<void> {
  const { prompt, exitCode, editFile, sleepMs, outputLines } = options;

  // Output each line with a small delay to simulate real agent behavior
  for (const line of outputLines) {
    console.log(line);
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }

  // If an edit file is specified, write the prompt to it
  if (editFile) {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { dirname } = await import('node:path');

    try {
      // Ensure directory exists
      const dir = dirname(editFile);
      mkdirSync(dir, { recursive: true });

      // Write the prompt as output
      writeFileSync(editFile, `Fixture agent output for: ${prompt}\n`);
      console.log(`> Wrote output to ${editFile}`);
    } catch (error) {
      console.error(`> Error writing to file: ${error}`);
    }
  }

  // Exit with specified code
  process.exit(exitCode);
}

// Main entry point
const options = parseArguments();
runFixtureAgent(options).catch((error) => {
  console.error('Fixture agent error:', error);
  process.exit(1);
});
