/**
 * Ceviz.ai - Background Service Worker (Manifest V3)
 * 
 * Smart Router Architecture:
 * 1. BYOK Mode (Direct OpenRouter / Groq HTTPS fetch)
 * 2. Gumroad License Mode (Supabase Edge Function: https://placeholder.supabase.co/functions/v1/chat)
 * 3. 4-Tier Fallback for OpenRouter
 * 4. Automatic Smart Fallback to Secondary Mode / Chrome Local AI (window.ai)
 */

try {
  importScripts('./mcp-client.js');
  importScripts('./crypto-vault.js');
} catch (e) {
  console.warn('importScripts failed:', e);
}

const mcpClient = typeof globalThis.MCPClient !== 'undefined' ? new globalThis.MCPClient() : null;

// Open side panel automatically when extension toolbar icon is clicked
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.warn('Side panel behavior error:', err);
  });
}

// 4-Tier Fallback Chain for OpenRouter Default Mode
const OPENROUTER_FALLBACK_CHAIN = [
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3-8b-instruct:free',
  'deepseek/deepseek-chat:free',
  'openrouter/free'
];

const SUPABASE_EDGE_ENDPOINT = 'https://placeholder.supabase.co/functions/v1/chat';

const DEFAULT_SETTINGS = {
  usageMode: 'byok', // 'byok', 'gumroad', 'chrome_local'
  byokProvider: 'openrouter',
  activeProvider: 'openrouter',
  openrouterApiKey: '',
  openrouterModel: 'auto_fallback',
  groqApiKey: '',
  groqModel: 'llama-3.3-70b-versatile',
  gumroadLicenseKey: ''
};

function getGeminiNanoSetupGuide(reason = '') {
  return `💡 **Chrome Local AI (Gemini Nano) Aktif Değil**

${reason ? `*Durum: ${reason}*\n\n` : ''}Gemini Nano'yu tarayıcınızda sıfır gecikmeli ve tamamen internetsiz (cihaz içi) kullanmak için lütfen aşağıdaki adımları uygulayın:

---

### 1️⃣ Chrome Bayraklarını (Flags) Açın:
1. Adres çubuğuna **\`chrome://flags\`** yazın ve gidin.
2. **\`#optimization-guide-on-device-model\`** bayrağını bulun ➔ **\`Enabled Bypassperfrequirement\`** seçin.
3. **\`#prompt-api-for-gemini-nano\`** bayrağını bulun ➔ **\`Enabled\`** seçin.
4. Sayfanın altındaki **Relaunch (Yeniden Başlat)** butonuna tıklayarak Chrome'u yeniden başlatın.

---

### 2️⃣ Modeli İndirin ve Kontrol Edin:
1. Adres çubuğuna **\`chrome://on-device-internals\`** yazın.
2. **Model Status** bölümünde **\`Optimization Guide On Device Model\`** indiriliyor veya yüklendi olarak görünmelidir.
3. Alternatif olarak **\`chrome://components\`** sayfasına gidip **\`Optimization Guide On Device Model\`** yanında **Check for update (Güncellemeleri kontrol et)** butonuna tıklayın.

---

İndirme tamamlandıktan sonra Ceviz.ai Yan Paneli üzerinden doğrudan cihaz içi yapay zeka ile konuşabilirsiniz! 🚀`;
}

/**
 * Get current settings from chrome.storage.local
 */
async function getSettings() {
  const data = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...data };
}

/**
 * Execute Chrome Local AI (window.ai)
 */
async function executeChromeLocalAI(messages) {
  const aiApi = globalThis.ai || globalThis.window?.ai;
  if (!aiApi?.languageModel) {
    return getGeminiNanoSetupGuide('window.ai.languageModel API ortamda aktif değil.');
  }
  try {
    const session = await aiApi.languageModel.create();
    const promptText = messages.map(m => `${m.role === 'user' ? 'Kullanıcı' : m.role === 'system' ? 'Sistem' : 'Asistan'}: ${m.content}`).join('\n');
    const result = await session.prompt(promptText);
    if (typeof session.destroy === 'function') session.destroy();
    return result;
  } catch (err) {
    return getGeminiNanoSetupGuide(`Gemini Nano çalıştırılırken bir hata oluştu: ${err.message}`);
  }
}

/**
 * Execute Supabase Edge Function with Gumroad License Authorization header
 */
async function executeSupabaseRequest(messages, settings) {
  let rawLicense = '';
  if (settings.gumroadLicenseKey && globalThis.CryptoVault) {
    rawLicense = await globalThis.CryptoVault.decrypt(settings.gumroadLicenseKey);
  } else {
    rawLicense = settings.gumroadLicenseKey || '';
  }

  if (!rawLicense || !rawLicense.trim()) {
    throw new Error('🔑 Gumroad Lisans Anahtarı eksik. Lütfen Ceviz Pro lisans kodunuzu Eklenti Ayarlarından girin.');
  }

  const payload = {
    messages: messages,
    stream: false
  };

  const response = await fetch(SUPABASE_EDGE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${rawLicense.trim()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    let detail = errText;
    try {
      const errJson = JSON.parse(errText);
      detail = errJson.error?.message || errJson.message || errText;
    } catch (e) {}
    throw new Error(`Supabase Edge Function Hatası (${response.status}): ${detail}`);
  }

  const data = await response.json();
  return data.reply || data.choices?.[0]?.message?.content || data.content || '';
}

/**
 * Execute BYOK Request directly to OpenRouter or Groq with 4-tier fallback
 */
async function executeBYOKRequest(messages, settings, targetModelOverride = null, attemptedModels = []) {
  const providerKey = settings.byokProvider || settings.activeProvider || 'openrouter';

  const isGroq = providerKey === 'groq';
  const baseUrl = isGroq
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';

  const encryptedKey = isGroq ? settings.groqApiKey : settings.openrouterApiKey;
  let rawApiKey = '';
  if (encryptedKey && globalThis.CryptoVault) {
    rawApiKey = await globalThis.CryptoVault.decrypt(encryptedKey);
  } else {
    rawApiKey = encryptedKey || '';
  }

  if (!rawApiKey || !rawApiKey.trim()) {
    throw new Error(`🔑 BYOK API Key eksik (${isGroq ? 'Groq' : 'OpenRouter'}). Lütfen API anahtarınızı Eklenti Ayarlarından girin.`);
  }

  const isAutoFallbackMode = !isGroq && (!settings.openrouterModel || settings.openrouterModel === 'auto_fallback');

  let modelToUse = targetModelOverride;
  if (!modelToUse) {
    if (isAutoFallbackMode) {
      modelToUse = OPENROUTER_FALLBACK_CHAIN[0];
    } else {
      modelToUse = isGroq ? settings.groqModel : settings.openrouterModel;
    }
  }

  const toolsSchema = mcpClient?.getOpenAIToolsSchema ? mcpClient.getOpenAIToolsSchema() : undefined;

  const headers = isGroq ? {
    'Authorization': `Bearer ${rawApiKey.trim()}`,
    'Content-Type': 'application/json'
  } : {
    'Authorization': `Bearer ${rawApiKey.trim()}`,
    'HTTP-Referer': 'https://github.com/ylnyorulmaz/ceviz-ai-extension',
    'X-Title': 'Ceviz.ai Browser Assistant',
    'Content-Type': 'application/json'
  };

  const payload = {
    model: modelToUse,
    messages: messages,
    ...(toolsSchema ? { tools: toolsSchema } : {})
  };

  let response;
  try {
    response = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  } catch (netErr) {
    if (isAutoFallbackMode) {
      const nextAttempted = [...attemptedModels, modelToUse];
      const nextModel = OPENROUTER_FALLBACK_CHAIN.find(m => !nextAttempted.includes(m));
      if (nextModel) {
        console.warn(`[OpenRouter Fallback] ${modelToUse} network error. Trying next model: ${nextModel}...`);
        return executeBYOKRequest(messages, settings, nextModel, nextAttempted);
      }
    }
    throw new Error(`🔌 BYOK İnternet/Ağ Bağlantı Hatası: Sunucuya erişilemedi. (${netErr.message})`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    let detail = errorText;
    try {
      const errJson = JSON.parse(errorText);
      detail = errJson.error?.message || errJson.message || errorText;
    } catch (e) {}

    // Silent 4-tier fallback loop for OpenRouter
    if (isAutoFallbackMode && response.status !== 401) {
      const nextAttempted = [...attemptedModels, modelToUse];
      const nextModel = OPENROUTER_FALLBACK_CHAIN.find(m => !nextAttempted.includes(m));
      if (nextModel) {
        console.warn(`[OpenRouter Fallback] Model ${modelToUse} failed (${response.status}: ${detail}). Silently trying next: ${nextModel}...`);
        return executeBYOKRequest(messages, settings, nextModel, nextAttempted);
      }
    }

    if (response.status === 401) {
      throw new Error(`🔑 Yetkilendirme Başarısız (BYOK 401): ${detail}. Lütfen API Anahtarınızı kontrol edin.`);
    }
    if (response.status === 403) {
      throw new Error(`🚫 Erişim Engellendi (BYOK 403): ${detail}. Lütfen bakiye ve izinlerinizi kontrol edin.`);
    }
    if (response.status === 404) {
      throw new Error(`🔍 Model veya Endpoint Bulunamadı (BYOK 404 - Model: "${modelToUse}"): ${detail}.`);
    }
    if (response.status === 429) {
      throw new Error(`⚠️ Kota / Hız Limiti Aşıldı (BYOK 429 - Model: "${modelToUse}"): ${detail}.`);
    }
    throw new Error(`❌ BYOK API Hatası (${response.status} - Model: "${modelToUse}"): ${detail}`);
  }

  const result = await response.json();
  const choice = result.choices?.[0];
  const choiceMessage = choice?.message;

  if (!choiceMessage) {
    throw new Error('API geçerli bir yanıt dönmedi.');
  }

  // Handle Tool Calls (MCP Loop)
  if (choiceMessage.tool_calls && choiceMessage.tool_calls.length > 0 && mcpClient) {
    const updatedMessages = [...messages, choiceMessage];

    for (const toolCall of choiceMessage.tool_calls) {
      const functionName = toolCall.function?.name;
      let args = {};
      try {
        args = JSON.parse(toolCall.function?.arguments || '{}');
      } catch (e) {}

      const toolResult = await mcpClient.executeToolCall(functionName, args);

      updatedMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: functionName,
        content: JSON.stringify(toolResult)
      });
    }

    return executeBYOKRequest(messages, settings, modelToUse, attemptedModels);
  }

  return choiceMessage.content || '';
}

/**
 * Smart Router with Priority Mode Execution & Automatic Secondary / Local AI Fallback
 */
async function smartRouteCompletion(messages) {
  const settings = await getSettings();
  const usageMode = settings.usageMode || 'byok';

  let hasBYOK = false;
  if (settings.openrouterApiKey) {
    const raw = await globalThis.CryptoVault?.decrypt(settings.openrouterApiKey);
    if (raw && raw.trim()) hasBYOK = true;
  }
  if (!hasBYOK && settings.groqApiKey) {
    const raw = await globalThis.CryptoVault?.decrypt(settings.groqApiKey);
    if (raw && raw.trim()) hasBYOK = true;
  }

  let hasGumroad = false;
  if (settings.gumroadLicenseKey) {
    const raw = await globalThis.CryptoVault?.decrypt(settings.gumroadLicenseKey);
    if (raw && raw.trim()) hasGumroad = true;
  }

  // 1. Try Primary Chosen Mode
  try {
    if (usageMode === 'byok' && hasBYOK) {
      return await executeBYOKRequest(messages, settings);
    } else if (usageMode === 'gumroad' && hasGumroad) {
      return await executeSupabaseRequest(messages, settings);
    } else if (usageMode === 'chrome_local') {
      return await executeChromeLocalAI(messages);
    }
  } catch (primaryErr) {
    console.warn(`[Smart Router] Primary mode (${usageMode}) failed:`, primaryErr.message);

    // 2. Try Secondary Mode Fallback (BYOK <-> Gumroad)
    if (usageMode === 'byok' && hasGumroad) {
      try {
        console.warn('[Smart Router] Falling back to secondary mode: Gumroad / Supabase Edge');
        return await executeSupabaseRequest(messages, settings);
      } catch (secErr) {
        console.warn('[Smart Router] Secondary mode (Gumroad) failed:', secErr.message);
      }
    } else if (usageMode === 'gumroad' && hasBYOK) {
      try {
        console.warn('[Smart Router] Falling back to secondary mode: BYOK');
        return await executeBYOKRequest(messages, settings);
      } catch (secErr) {
        console.warn('[Smart Router] Secondary mode (BYOK) failed:', secErr.message);
      }
    }
  }

  // If primary was BYOK/Gumroad but keys were missing, try the other if key exists
  if (usageMode !== 'chrome_local') {
    if (hasBYOK) {
      try {
        return await executeBYOKRequest(messages, settings);
      } catch (e) {}
    }
    if (hasGumroad) {
      try {
        return await executeSupabaseRequest(messages, settings);
      } catch (e) {}
    }
  }

  // 3. Last Resort Fallback: Chrome Local AI (window.ai)
  try {
    const localReply = await executeChromeLocalAI(messages);
    return `${localReply}\n\n💡 *Not: API limitleriniz dolduğu veya sunucuya erişilemediği için yanıt cihaz içi AI (Chrome Local AI) tarafından üretilmiştir.*`;
  } catch (localErr) {
    throw new Error('❌ Tüm bağlantı yöntemleri ve yerel AI başarısız oldu. Lütfen API anahtarlarınızı veya lisansınızı kontrol edin.');
  }
}

// Handle runtime messages from sidepanel and options
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GENERATE_COMPLETION') {
    smartRouteCompletion(request.messages)
      .then((reply) => sendResponse({ success: true, reply }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'GET_SETTINGS') {
    getSettings().then((settings) => sendResponse({ success: true, settings }));
    return true;
  }
});
