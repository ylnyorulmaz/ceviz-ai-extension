/**
 * Ceviz.ai - Options UI Controller with Client-Side Web Crypto API Encryption
 */

import { CryptoVault } from './crypto-vault.js';

document.addEventListener('DOMContentLoaded', async () => {
  const activeProviderInput = document.getElementById('active-provider');
  const openrouterKeyInput = document.getElementById('openrouter-key');
  const openrouterModelInput = document.getElementById('openrouter-model');
  const groqKeyInput = document.getElementById('groq-key');
  const groqModelInput = document.getElementById('groq-model');
  const gumroadKeyInput = document.getElementById('gumroad-key');
  const form = document.getElementById('settings-form');
  const statusDiv = document.getElementById('status');

  // Load and decrypt saved settings
  const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  if (response?.success && response.settings) {
    const s = response.settings;
    if (s.activeProvider) activeProviderInput.value = s.activeProvider;
    if (s.openrouterModel) openrouterModelInput.value = s.openrouterModel;
    if (s.groqModel) groqModelInput.value = s.groqModel;

    // Decrypt keys for user display in password fields
    if (s.openrouterApiKey) {
      openrouterKeyInput.value = await CryptoVault.decrypt(s.openrouterApiKey);
    }
    if (s.groqApiKey) {
      groqKeyInput.value = await CryptoVault.decrypt(s.groqApiKey);
    }
    if (s.gumroadLicenseKey) {
      gumroadKeyInput.value = await CryptoVault.decrypt(s.gumroadLicenseKey);
    }
  }

  // Save settings with AES-GCM 256 encryption at rest
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const rawOpenRouter = openrouterKeyInput.value.trim();
    const rawGroq = groqKeyInput.value.trim();
    const rawGumroad = gumroadKeyInput.value.trim();

    // Encrypt sensitive keys before writing to chrome.storage.local
    const encryptedOpenRouter = rawOpenRouter ? await CryptoVault.encrypt(rawOpenRouter) : '';
    const encryptedGroq = rawGroq ? await CryptoVault.encrypt(rawGroq) : '';
    const encryptedGumroad = rawGumroad ? await CryptoVault.encrypt(rawGumroad) : '';

    const newSettings = {
      activeProvider: activeProviderInput.value,
      openrouterApiKey: encryptedOpenRouter,
      openrouterModel: openrouterModelInput.value,
      groqApiKey: encryptedGroq,
      groqModel: groqModelInput.value,
      gumroadLicenseKey: encryptedGumroad
    };

    await chrome.storage.local.set(newSettings);

    showStatus('🔒 Ayarlar AES-GCM 256-bit ile şifrelenerek güvenle kaydedildi!', 'success');
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status-msg ${type}`;
    setTimeout(() => {
      statusDiv.className = 'status-msg';
    }, 3500);
  }
});
