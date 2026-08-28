/**
 * Ceviz.ai - Options UI Controller with Tabbed Navigation
 */

document.addEventListener('DOMContentLoaded', async () => {
  const usageModeInput = document.getElementById('usage-mode');
  const byokProviderInput = document.getElementById('byok-provider');
  const openrouterKeyInput = document.getElementById('openrouter-key');
  const openrouterModelInput = document.getElementById('openrouter-model');
  const groqKeyInput = document.getElementById('groq-key');
  const groqModelInput = document.getElementById('groq-model');
  const gumroadKeyInput = document.getElementById('gumroad-key');
  const form = document.getElementById('settings-form');
  const statusDiv = document.getElementById('status');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Tab switching logic
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(targetTab)?.classList.add('active');
    });
  });

  // Helper to extract clean key from stored string
  function cleanKey(val) {
    if (!val || typeof val !== 'string') return '';
    const trimmed = val.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.v || parsed.iv) return ''; // Clear corrupted JSON string
      } catch (e) {}
    }
    return trimmed;
  }

  // Load saved settings
  const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  if (response?.success && response.settings) {
    const s = response.settings;
    if (s.usageMode) usageModeInput.value = s.usageMode;
    if (s.byokProvider) byokProviderInput.value = s.byokProvider;
    if (s.openrouterModel) openrouterModelInput.value = s.openrouterModel;
    if (s.groqModel) groqModelInput.value = s.groqModel;

    if (s.openrouterApiKey) openrouterKeyInput.value = cleanKey(s.openrouterApiKey);
    if (s.groqApiKey) groqKeyInput.value = cleanKey(s.groqApiKey);
    if (s.gumroadLicenseKey) gumroadKeyInput.value = cleanKey(s.gumroadLicenseKey);
  }

  // Save settings in isolated chrome.storage.local
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const rawOpenRouter = cleanKey(openrouterKeyInput.value);
    const rawGroq = cleanKey(groqKeyInput.value);
    const rawGumroad = cleanKey(gumroadKeyInput.value);

    const newSettings = {
      usageMode: usageModeInput.value,
      byokProvider: byokProviderInput.value,
      activeProvider: usageModeInput.value === 'byok' ? byokProviderInput.value : usageModeInput.value,
      openrouterApiKey: rawOpenRouter,
      openrouterModel: openrouterModelInput.value,
      groqApiKey: rawGroq,
      groqModel: groqModelInput.value,
      gumroadLicenseKey: rawGumroad
    };

    await chrome.storage.local.set(newSettings);

    showStatus('✅ Ayarlar izole yerel depolamaya (chrome.storage.local) başarıyla kaydedildi!', 'success');
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status-msg ${type}`;
    setTimeout(() => {
      statusDiv.className = 'status-msg';
    }, 3500);
  }
});
