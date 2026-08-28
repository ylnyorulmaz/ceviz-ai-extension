/**
 * Ceviz.ai - Secure Crypto Vault (Web Crypto API - AES-GCM 256)
 * 
 * Provides client-side encryption at rest for sensitive API keys (BYOK)
 * and license keys stored in chrome.storage.local.
 * 
 * Features:
 * - AES-GCM 256-bit encryption via native W3C crypto.subtle
 * - Unique device key seed generated per extension installation
 * - Decrypts keys only transiently on-demand at fetch execution time
 */

export class CryptoVault {
  /**
   * Generates or retrieves the unique device key seed stored in chrome.storage.local
   */
  static async getDeviceKey() {
    let { _vaultSeed } = await chrome.storage.local.get('_vaultSeed');
    if (!_vaultSeed) {
      const rawSeed = crypto.getRandomValues(new Uint8Array(32));
      _vaultSeed = Array.from(rawSeed);
      await chrome.storage.local.set({ _vaultSeed });
    }
    const seedBytes = new Uint8Array(_vaultSeed);

    return crypto.subtle.importKey(
      'raw',
      seedBytes,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypts plaintext string using AES-GCM 256-bit
   * Returns JSON string containing IV and Ciphertext arrays
   */
  static async encrypt(plaintext) {
    if (!plaintext || typeof plaintext !== 'string') return '';

    const key = await this.getDeviceKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    return JSON.stringify({
      v: 1,
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(encrypted))
    });
  }

  /**
   * Decrypts AES-GCM ciphertext payload JSON back into plaintext string
   * Handles legacy unencrypted strings gracefully for backward compatibility
   */
  static async decrypt(encryptedPayload) {
    if (!encryptedPayload || typeof encryptedPayload !== 'string') return '';

    try {
      const parsed = JSON.parse(encryptedPayload);
      if (!parsed || !parsed.iv || !parsed.ciphertext) {
        return encryptedPayload; // Fallback if legacy plaintext
      }

      const key = await this.getDeviceKey();
      const iv = new Uint8Array(parsed.iv);
      const ciphertext = new Uint8Array(parsed.ciphertext);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (e) {
      // Return raw payload if it was unencrypted legacy string
      return encryptedPayload;
    }
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.CryptoVault = CryptoVault;
}
