/**
 * Ceviz.ai - Background Service Worker (Manifest V3)
 * 
 * Handles background operations, OpenRouter, Groq, and Chrome Local AI (Gemini Nano)
 * requests, sidePanel behavior, and MCP Client tool call loops.
 */

import { MCPClient } from './mcp-client.js';

const mcpClient = new MCPClient();

// Open side panel automatically when extension toolbar icon is clicked
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.warn('Side panel behavior error:', err);
  });
}

const DEFAULT_SETTINGS = {
  activeProvider: 'openrouter',
  openrouterApiKey: '',
  openrouterModel: 'openrouter/auto',
  groqApiKey: '',
  groqModel: 'llama-3.3-70b-versatile'
};

const PROVIDER_CONFIGS = {
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    getHeaders: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/ylnyorulmaz/ceviz-ai-extension',
      'X-Title': 'Ceviz.ai Browser Assistant',
      'Content-Type': 'application/json'
    })
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    getHeaders: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    })
  },
  chrome_local: {
    name: 'Chrome Local AI (Gemini Nano)'
  }
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
 * Perform completion request with tool use loop
 */
async function generateCompletion(messages, customProvider = null, targetModelOverride = null) {
  const settings = await getSettings();
  const providerKey = customProvider || settings.activeProvider;

  // Handle Chrome Local AI (Gemini Nano)
  if (providerKey === 'chrome_local') {
    const aiApi = globalThis.ai || globalThis.window?.ai;
    if (!aiApi?.languageModel) {
      return getGeminiNanoSetupGuide('Gemini Nano API (window.ai.languageModel) arka plan servisinde aktif değil.');
    }
    try {
      const session = await aiApi.languageModel.create();
      const promptText = messages.map(m => `${m.role === 'user' ? 'Kullanıcı' : m.role === 'system' ? 'Sistem' : 'Asistan'}: ${m.content}`).join('\n');
      const result = await session.prompt(promptText);
      session.destroy?.();
      return result;
    } catch (err) {
      return getGeminiNanoSetupGuide(`Gemini Nano çalıştırılırken bir hata oluştu: ${err.message}`);
    }
  }

  const config = PROVIDER_CONFIGS[providerKey];
  if (!config) {
    throw new Error(`Bilinmeyen sağlayıcı: ${providerKey}`);
  }

  const apiKey = providerKey === 'openrouter' ? settings.openrouterApiKey : settings.groqApiKey;
  const model = targetModelOverride || (providerKey === 'openrouter' ? settings.openrouterModel : settings.groqModel);

  if (!apiKey || !apiKey.trim()) {
    throw new Error(`🔑 ${config.name} API Key eksik. Lütfen Eklenti Seçenekleri (Ayarlar) sayfasından ${config.name} API anahtarınızı kaydedin.`);
  }

  const toolsSchema = mcpClient.getOpenAIToolsSchema();

  const payload = {
    model: model,
    messages: messages,
    ...(toolsSchema ? { tools: toolsSchema } : {})
  };

  let response;
  try {
    response = await fetch(config.baseUrl, {
      method: 'POST',
      headers: config.getHeaders(apiKey.trim()),
      body: JSON.stringify(payload)
    });
  } catch (netErr) {
    throw new Error(`🔌 İnternet/Ağ Bağlantı Hatası: ${config.name} sunucusuna erişilemedi. (${netErr.message})`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    let detail = errorText;
    try {
      const errJson = JSON.parse(errorText);
      detail = errJson.error?.message || errJson.message || errorText;
    } catch (e) {}

    if (response.status === 401) {
      throw new Error(`🔑 Yetkilendirme Başarısız (${config.name} 401): ${detail}. Lütfen OpenRouter API Anahtarınızı kontrol edin.`);
    }
    if (response.status === 403) {
      throw new Error(`🚫 Erişim Engellendi (${config.name} 403): ${detail}. Lütfen bakiye ve izinlerinizi kontrol edin.`);
    }
    if (response.status === 404) {
      throw new Error(`🔍 Model veya Endpoint Bulunamadı (${config.name} 404 - Model: "${model}"): ${detail}. Lütfen Eklenti Ayarlarından aktif bir model seçin.`);
    }
    if (response.status === 429) {
      throw new Error(`⚠️ Kota / Hız Limiti Aşıldı (${config.name} 429 - Model: "${model}"): ${detail}. Lütfen biraz bekleyin.`);
    }
    throw new Error(`❌ ${config.name} API Hatası (${response.status} - Model: "${model}"): ${detail}`);
  }

  const result = await response.json();
  const choice = result.choices?.[0];
  const choiceMessage = choice?.message;

  if (!choiceMessage) {
    throw new Error('API geçerli bir yanıt dönmedi.');
  }

  // Handle Tool Calls (MCP Loop)
  if (choiceMessage.tool_calls && choiceMessage.tool_calls.length > 0) {
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

    // Recursively resolve tool results with second API call
    return generateCompletion(updatedMessages, providerKey, model);
  }

  return choiceMessage.content || '';
}

// Handle runtime messages from sidepanel and options
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GENERATE_COMPLETION') {
    generateCompletion(request.messages, request.provider)
      .then((reply) => sendResponse({ success: true, reply }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'GET_SETTINGS') {
    getSettings().then((settings) => sendResponse({ success: true, settings }));
    return true;
  }
});
