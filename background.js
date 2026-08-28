/**
 * Ceviz.ai - Background Service Worker (Manifest V3)
 * 
 * Handles background operations, OpenRouter & Groq API requests,
 * and MCP Client tool call loops.
 */

import { MCPClient } from './mcp-client.js';

const mcpClient = new MCPClient();

const DEFAULT_SETTINGS = {
  activeProvider: 'openrouter',
  openrouterApiKey: '',
  openrouterModel: 'anthropic/claude-3.5-sonnet',
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
  }
};

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
async function generateCompletion(messages, customProvider = null) {
  const settings = await getSettings();
  const providerKey = customProvider || settings.activeProvider;
  const config = PROVIDER_CONFIGS[providerKey];

  if (!config) {
    throw new Error(`Bilinmeyen sağlayıcı: ${providerKey}`);
  }

  const apiKey = providerKey === 'openrouter' ? settings.openrouterApiKey : settings.groqApiKey;
  const model = providerKey === 'openrouter' ? settings.openrouterModel : settings.groqModel;

  if (!apiKey || !apiKey.trim()) {
    throw new Error(`🔑 ${config.name} API Key eksik. Lütfen Eklenti Seçenekleri (Ayarlar) sayfasından ${config.name} API anahtarınızı kaydedin.`);
  }

  const toolsSchema = mcpClient.getOpenAIToolsSchema();

  const payload = {
    model: model,
    messages: messages,
    ...(toolsSchema ? { tools: toolsSchema } : {})
  };

  const response = await fetch(config.baseUrl, {
    method: 'POST',
    headers: config.getHeaders(apiKey.trim()),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let detail = errorText;
    try {
      const errJson = JSON.parse(errorText);
      detail = errJson.error?.message || errJson.message || errorText;
    } catch (e) {}

    if (response.status === 401) {
      throw new Error(`🔑 Yetkilendirme Başarısız (${config.name} 401): ${detail}. Lütfen API Anahtarınızı kontrol edin.`);
    }
    if (response.status === 403) {
      throw new Error(`🚫 Erişim Engellendi (${config.name} 403): ${detail}. Lütfen bakiye ve izinlerinizi kontrol edin.`);
    }
    if (response.status === 429) {
      throw new Error(`⚠️ Kota / Hız Limiti Aşıldı (${config.name} 429): ${detail}. Lütfen biraz bekleyin.`);
    }
    throw new Error(`❌ ${config.name} API Hatası (${response.status}): ${detail}`);
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
    return generateCompletion(updatedMessages, providerKey);
  }

  return choiceMessage.content || '';
}

// Handle runtime messages from popup and options
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
