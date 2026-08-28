/**
 * Ceviz.ai - Options UI Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const activeProviderInput = document.getElementById('active-provider');
  const openrouterKeyInput = document.getElementById('openrouter-key');
  const openrouterModelInput = document.getElementById('openrouter-model');
  const groqKeyInput = document.getElementById('groq-key');
  const groqModelInput = document.getElementById('groq-model');
  const form = document.getElementById('settings-form');
  const statusDiv = document.getElementById('status');

  // Load saved settings
  const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  if (response?.success && response.settings) {
    const s = response.settings;
    if (s.activeProvider) activeProviderInput.value = s.activeProvider;
    if (s.openrouterApiKey) openrouterKeyInput.value = s.openrouterApiKey;
    if (s.openrouterModel) openrouterModelInput.value = s.openrouterModel;
    if (s.groqApiKey) groqKeyInput.value = s.groqApiKey;
    if (s.groqModel) groqModelInput.value = s.groqModel;
  }

  // Save settings on form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newSettings = {
      activeProvider: activeProviderInput.value,
      openrouterApiKey: openrouterKeyInput.value.trim(),
      openrouterModel: openrouterModelInput.value,
      groqApiKey: groqKeyInput.value.trim(),
      groqModel: groqModelInput.value
    };

    await chrome.storage.local.set(newSettings);

    showStatus('✅ Ayarlar başarıyla kaydedildi!', 'success');
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status-msg ${type}`;
    setTimeout(() => {
      statusDiv.className = 'status-msg';
    }, 3500);
  }
});
