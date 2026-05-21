/**
 * Doorway Credential Vault
 *
 * Securely stores API keys and other secrets using Electron's safeStorage.
 * safeStorage uses the OS keychain (Keychain Access on macOS, DPAPI on Windows).
 */

import { safeStorage } from 'electron';
import { PersistenceError } from '@doorway/core';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';

/**
 * Vault Service for managing named secrets.
 */
class VaultService {
  private vaultPath: string;
  private data: Record<string, string> = {}; // key -> encryptedBase64

  constructor() {
    this.vaultPath = path.join(homedir(), '.doorway', 'vault.json');
  }

  /**
   * Initialize the vault by loading from disk.
   */
  async init(): Promise<void> {
    if (existsSync(this.vaultPath)) {
      try {
        const content = await fs.readFile(this.vaultPath, 'utf-8');
        this.data = JSON.parse(content);
      } catch (err) {
        console.error('[Vault] Failed to load vault:', err);
        this.data = {};
      }
    }
  }

  /**
   * Check if encryption is available on the current system.
   */
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  /**
   * Store a secret securely with a name.
   */
  async set(name: string, secret: string): Promise<string> {
    if (!this.isAvailable()) {
      throw new PersistenceError('Secure storage is not available on this system.');
    }

    const encrypted = safeStorage.encryptString(secret);
    this.data[name] = encrypted.toString('base64');

    await this.save();
    return `keychain:${name}`;
  }

  /**
   * Retrieve a secret by name.
   */
  get(name: string): string {
    if (!this.isAvailable()) {
      throw new PersistenceError('Secure storage is not available on this system.');
    }

    const encryptedBase64 = this.data[name];
    if (!encryptedBase64) {
      throw new Error(`Secret not found in vault: ${name}`);
    }

    try {
      const buffer = Buffer.from(encryptedBase64, 'base64');
      return safeStorage.decryptString(buffer);
    } catch (error) {
      throw new PersistenceError(
        'Failed to decrypt secret. The OS keychain may have changed or is locked.',
        { error: String(error) }
      );
    }
  }

  /**
   * Remove a secret.
   */
  async delete(name: string): Promise<void> {
    delete this.data[name];
    await this.save();
  }

  private async save(): Promise<void> {
    const dir = path.dirname(this.vaultPath);
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(this.vaultPath, JSON.stringify(this.data, null, 2));
  }
}

export const vault = new VaultService();
