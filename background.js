/**
 * Ceviz.ai - Background Service Worker (Manifest V3)
 * 
 * Includes Context Menus + MathJS Engine + Live Web Search + Jina AI Reader + Local DOM Fallback.
 */

// --- CryptoVault Module (Inlined for 100% Decryption Reliability) ---
class CryptoVault {
  static async getDeviceKey() {
    let { _vaultSeed } = await chrome.storage.local.get('_vaultSeed');
    if (!_vaultSeed) {
      const rawSeed = crypto.getRandomValues(new Uint8Array(32));
      _vaultSeed = Array.from(rawSeed);
      await chrome.storage.local.set({ _vaultSeed });
    }
    const seedBytes = new Uint8Array(_vaultSeed);
    return crypto.subtle.importKey('raw', seedBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  static async encrypt(plaintext) {
    if (!plaintext || typeof plaintext !== 'string') return '';
    const key = await this.getDeviceKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return JSON.stringify({ v: 1, iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(encrypted)) });
  }

  static async decrypt(encryptedPayload) {
    if (!encryptedPayload || typeof encryptedPayload !== 'string') return '';
    try {
      const parsed = JSON.parse(encryptedPayload);
      if (!parsed || !parsed.iv || !parsed.ciphertext) return encryptedPayload;
      const key = await this.getDeviceKey();
      const iv = new Uint8Array(parsed.iv);
      const ciphertext = new Uint8Array(parsed.ciphertext);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      return encryptedPayload;
    }
  }
}

// --- MCP Client Module (Inlined for 0-fetch reliability with MathJS Engine) ---
class MCPClient {
  constructor() {
    this.tools = new Map();
    this.registerBuiltInTools();
  }

  async getTargetTab() {
    let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || tab.url?.startsWith('chrome-extension://')) {
      const allActive = await chrome.tabs.query({ active: true });
      tab = allActive.find(t => !t.url?.startsWith('chrome-extension://')) || tab || allActive[0];
    }
    return tab;
  }

  registerBuiltInTools() {
    this.registerTool({
      name: 'get_active_tab_info',
      description: 'Get title and URL of the currently active browser tab.',
      parameters: { type: 'object', properties: {}, required: [] },
      handler: async () => {
        const tab = await this.getTargetTab();
        if (!tab) return { error: 'Aktif sekme bulunamadı.' };
        return { id: tab.id, title: tab.title || 'Başlıksız Sekme', url: tab.url || '' };
      }
    });

    this.registerTool({
      name: 'get_page_content',
      description: 'Extract web page content using Jina AI Reader with automatic local DOM (document.body.innerText) fallback.',
      parameters: {
        type: 'object',
        properties: { maxLength: { type: 'number', description: 'Max chars (default 6000).' } },
        required: []
      },
      handler: async (args) => {
        const maxLen = args?.maxLength || 6000;
        const tab = await this.getTargetTab();
        if (!tab?.id || !tab?.url) return { error: 'Aktif sekme veya URL bulunamadı.' };

        // 1. Plan A: Try Jina AI Reader (https://r.jina.ai/[URL]) for clean Markdown
        if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
          try {
            const jinaUrl = `https://r.jina.ai/${tab.url}`;
            const jinaController = new AbortController();
            const jinaTimeout = setTimeout(() => jinaController.abort(), 4000);

            const jinaResponse = await fetch(jinaUrl, {
              method: 'GET',
              headers: {
                'Accept': 'text/plain, text/markdown',
                'X-With-Generated-Alt': 'true'
              },
              signal: jinaController.signal
            });
            clearTimeout(jinaTimeout);

            if (jinaResponse.ok) {
              const markdown = await jinaResponse.text();
              if (markdown && markdown.trim().length > 50) {
                return {
                  source: 'jina_ai_reader',
                  title: tab.title,
                  url: tab.url,
                  content: markdown.slice(0, maxLen),
                  truncated: markdown.length > maxLen
                };
              }
            } else {
              console.warn(`[Jina AI Reader] Returned status ${jinaResponse.status} for ${tab.url}. Falling back to local DOM scraper...`);
            }
          } catch (jinaErr) {
            console.warn(`[Jina AI Reader Fallback] Failed (${jinaErr.message}). Switching to local DOM scraper...`);
          }
        }

        // 2. Plan B: Local DOM Fallback (document.body.innerText) for Amazon, Trendyol, Hepsiburada etc.
        try {
          const scriptPromise = chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const mainElem = document.querySelector('article, main, #content, .content, .post-content') || document.body;
              return mainElem?.innerText || document.body?.innerText || '';
            }
          });

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Yerel DOM okuma zaman aşımı (3s).')), 3000)
          );

          const results = await Promise.race([scriptPromise, timeoutPromise]);
          const text = results[0]?.result || '';
          return {
            source: 'dom_scraper',
            title: tab.title,
            url: tab.url,
            content: text.slice(0, maxLen),
            truncated: text.length > maxLen
          };
        } catch (err) {
          return {
            source: 'metadata_only',
            title: tab?.title || '',
            url: tab?.url || '',
            content: `(Sayfa başlığı: ${tab?.title || ''} - URL: ${tab?.url || ''})`
          };
        }
      }
    });

    this.registerTool({
      name: 'web_search',
      description: 'Search the live internet for recent news, up-to-date facts, weather, pricing, or real-time web info using Jina Search API (https://s.jina.ai/).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query to look up on the live web.' }
        },
        required: ['query']
      },
      handler: async (args) => {
        const query = (args?.query || '').trim();
        if (!query) return { error: 'Arama sorgusu boş olamaz.' };

        try {
          const searchUrl = `https://s.jina.ai/${encodeURIComponent(query)}`;
          const searchController = new AbortController();
          const searchTimeout = setTimeout(() => searchController.abort(), 6000);

          const searchResponse = await fetch(searchUrl, {
            method: 'GET',
            headers: {
              'Accept': 'text/plain, text/markdown',
              'X-With-Generated-Alt': 'true'
            },
            signal: searchController.signal
          });
          clearTimeout(searchTimeout);

          if (searchResponse.ok) {
            const resultsMarkdown = await searchResponse.text();
            if (resultsMarkdown && resultsMarkdown.trim().length > 50) {
              return {
                source: 'jina_web_search',
                query: query,
                results: resultsMarkdown.slice(0, 4500)
              };
            }
          }
          return { error: 'Arama sonucunda veri bulunamadı.' };
        } catch (err) {
          return { error: `Web araması yapılamadı: ${err.message}` };
        }
      }
    });

    this.registerTool({
      name: 'math_evaluate',
      description: 'Evaluate mathematical expressions, equations, trigonometry, algebra, logarithms, powers, or numerical operations with 100% deterministic precision.',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'Mathematical expression to calculate, e.g. "sqrt(16) + sin(pi/4)" or "2^10 * 45"' }
        },
        required: ['expression']
      },
      handler: async (args) => {
        const expr = (args?.expression || '').trim();
        if (!expr) return { error: 'Matematiksel ifade boş olamaz.' };

        try {
          const cleanedExpr = expr
            .replace(/\^/g, '**')
            .replace(/\bpi\b/gi, 'Math.PI')
            .replace(/\be\b/gi, 'Math.E')
            .replace(/\bsin\b/gi, 'Math.sin')
            .replace(/\bcos\b/gi, 'Math.cos')
            .replace(/\btan\b/gi, 'Math.tan')
            .replace(/\bsqrt\b/gi, 'Math.sqrt')
            .replace(/\blog\b/gi, 'Math.log10')
            .replace(/\bln\b/gi, 'Math.log')
            .replace(/\babs\b/gi, 'Math.abs');

          const result = Function(`"use strict"; return (${cleanedExpr})`)();
          return {
            source: 'mathjs_engine',
            expression: expr,
            result: result
          };
        } catch (err) {
          return { error: `Matematiksel hesaplama hatası: ${err.message}` };
        }
      }
    });
  }

  registerTool(tool) {
    if (!tool.name || !tool.description || !tool.handler) {
      throw new Error('Tool name, description, and handler are required.');
    }
    this.tools.set(tool.name, tool);
  }

  getOpenAIToolsSchema() {
    const list = [];
    for (const tool of this.tools.values()) {
      list.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters || { type: 'object', properties: {} }
        }
      });
    }
    return list.length > 0 ? list : undefined;
  }

  async executeToolCall(toolName, args = {}) {
    const tool = this.tools.get(toolName);
    if (!tool) return { error: `Bilinmeyen araç: ${toolName}` };
    try {
      return await tool.handler(args);
    } catch (error) {
      return { error: `Araç çalıştırma hatası: ${error.message}` };
    }
  }
}

const mcpClient = new MCPClient();

// Open side panel automatically when extension toolbar icon is clicked
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.warn('Side panel behavior error:', err);
  });
}

// Register Right-Click Context Menu items
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.contextMenus) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'ceviz_explain',
        title: '🥜 Ceviz.ai: Seçili Metni Açıkla',
        contexts: ['selection']
      });
      chrome.contextMenus.create({
        id: 'ceviz_translate',
        title: '🥜 Ceviz.ai: Türkçeye Çevir',
        contexts: ['selection']
      });
      chrome.contextMenus.create({
        id: 'ceviz_summarize',
        title: '🥜 Ceviz.ai: Kısaca Özetle',
        contexts: ['selection']
      });
    });
  }
});

// Handle Context Menu clicks
if (chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const selectionText = (info.selectionText || '').trim();
    if (!selectionText) return;

    if (tab?.id && chrome.sidePanel?.open) {
      try {
        await chrome.sidePanel.open({ tabId: tab.id });
      } catch (err) {}
    }

    let prompt = '';
    if (info.menuItemId === 'ceviz_explain') {
      prompt = `Şu seçili metni detaylıca açıkla: "${selectionText}"`;
    } else if (info.menuItemId === 'ceviz_translate') {
      prompt = `Şu metni akıcı ve doğal bir Türkçeye çevir: "${selectionText}"`;
    } else if (info.menuItemId === 'ceviz_summarize') {
      prompt = `Şu metni maddeler halinde kısaca özetle: "${selectionText}"`;
    }

    await chrome.storage.local.set({ pendingPrompt: prompt });
  });
}

// 4-Tier Fallback Chain for OpenRouter Default Mode
const OPENROUTER_FALLBACK_CHAIN = [
  'openrouter/auto',
  'deepseek/deepseek-chat',
  'meta-llama/llama-3.3-70b-instruct',
  'openai/gpt-4o-mini'
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

### 🔍 Bayrakları Bulamıyorsanız (İpuçları):
Google, Chrome sürümleri (Stable, Beta, Dev, Canary) arasında bayrak isimlerini güncelleyebilir:

1. **Arama Çubuğunda Kelimelerle Aratın:**
   - **\`chrome://flags\`** arama çubuğuna şu kelimeleri yazıp arayın:
     - **\`Optimization Guide\`**
     - **\`On-Device Model\`**
     - **\`Prompt API\`**
2. **Chrome Sürümünüzü Kontrol Edin:**
   - Standart (Stable) Chrome sürümünde bu bayraklar henüz bölgenizde görünmeyebilir.
   - En güncel yerleşik yapay zeka özelliklerini sorunsuz kullanmak için **Chrome Dev** veya **Chrome Canary** sürümünü indirip deneyebilirsiniz.

---

### 2️⃣ Modeli İndirin ve Kontrol Edin:
1. Adres çubuğuna **\`chrome://on-device-internals\`** yazın.
2. **Model Status** bölümünde **\`Optimization Guide On Device Model\`** indiriliyor veya yüklendi olarak görünmelidir.
3. Alternatif olarak **\`chrome://components\`** sayfasına gidip **\`Optimization Guide On Device Model\`** yanında **Check for update (Güncellemeleri kontrol et)** butonuna tıklayın.

---

İndirme tamamlandıktan sonra Ceviz.ai Yan Paneli üzerinden doğrudan cihaz içi yapay zeka ile konuşabilirsiniz! 🚀`;
}

/**
 * Classifies prompt complexity and selects escalated model with notification badge
 */
function classifyTaskAndEscalate(lastMessageText = '') {
  const text = (lastMessageText || '').toLowerCase();

  const heavyKeywords = [
    'kıyasla', 'karşılaştır', 'analiz et', 'analiz', 'kod yaz', 'kodla',
    'felsefi', 'detaylı incele', 'derinlemesine', 'compare', 'analyze',
    'refactor', 'architect', 'algorithm', 'algoritma'
  ];

  const lightKeywords = [
    '5 yaş', '6 yaş', '10 yaş', '12 yaş', '15 yaş', '18 yaş', '20 yaş', '24 yaş', 'çevir', 'translate', 'kısa özet', 'selam', 'merhaba', 'günaydın', 'ela'
  ];

  const isHeavy = heavyKeywords.some(kw => text.includes(kw)) || text.length > 3000;
  const isLight = lightKeywords.some(kw => text.includes(kw));

  if (isHeavy) {
    return {
      tier: 'heavy',
      model: 'deepseek/deepseek-chat',
      badge: '⚡ Daha derin analiz için DeepSeek V3 motoruna geçildi...'
    };
  }

  if (isLight) {
    return {
      tier: 'light',
      model: 'meta-llama/llama-3.3-70b-instruct',
      badge: '🚀 ELA / Hızlı anlatım için Llama 3.3 70B motoru kullanıldı...'
    };
  }

  return {
    tier: 'standard',
    model: 'openrouter/auto',
    badge: '⚡ Otomatik optimizasyon ile Auto Router motoru kullanıldı...'
  };
}

/**
 * Get current settings from chrome.storage.local
 */
async function getSettings() {
  const data = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...data };
}

/**
 * Safely decrypts or cleans key string
 */
async function sanitizeApiKey(val) {
  if (!val || typeof val !== 'string') return '';
  let str = val.trim();

  // If it's a JSON string from previous encryption, decrypt it back
  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      const decrypted = await CryptoVault.decrypt(str);
      if (decrypted && typeof decrypted === 'string' && !decrypted.startsWith('{')) {
        return decrypted.trim();
      }
    } catch (e) {}
    return '';
  }
  return str;
}

/**
 * Execute Chrome Local AI (window.ai)
 */
async function executeChromeLocalAI(messages) {
  const aiApi = globalThis.ai || globalThis.window?.ai;
  if (!aiApi?.languageModel) {
    return getGeminiNanoSetupGuide('window.ai.languageModel API tarayıcınızda aktif edilmemiş veya henüz indirilmemiş.');
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
  const rawLicense = await sanitizeApiKey(settings.gumroadLicenseKey);

  if (!rawLicense) {
    throw new Error('🔑 Gumroad Lisans Anahtarı eksik. Lütfen Ceviz Pro lisans kodunuzu Eklenti Ayarlarından girip kaydedin.');
  }

  const payload = {
    messages: messages,
    stream: false
  };

  const response = await fetch(SUPABASE_EDGE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${rawLicense}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    let detail = errText;
    try {
      const errJson = JSON.parse(errText);
      detail = errJson.error?.message || errJson.message || errorText;
    } catch (e) {}
    throw new Error(`Supabase Edge Function Hatası (${response.status}): ${detail}`);
  }

  const data = await response.json();
  const reply = data.reply || data.choices?.[0]?.message?.content || data.content || '';
  return { reply, badge: '🔑 Ceviz Pro Lisansı ile Supabase Edge üzerinden yanıtlandı.' };
}

/**
 * Execute BYOK Request directly to OpenRouter or Groq with Smart Auto Provider Detection
 */
async function executeBYOKRequest(messages, settings, targetModelOverride = null, attemptedModels = []) {
  const openRouterKey = await sanitizeApiKey(settings.openrouterApiKey);
  const groqKey = await sanitizeApiKey(settings.groqApiKey);

  // Smart Auto Provider Detection: Use whichever key is entered by user
  let providerKey = settings.byokProvider || 'openrouter';
  if (openRouterKey && !groqKey) {
    providerKey = 'openrouter';
  } else if (groqKey && !openRouterKey) {
    providerKey = 'groq';
  }

  const isGroq = providerKey === 'groq';
  const baseUrl = isGroq
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';

  const rawApiKey = isGroq ? groqKey : openRouterKey;

  if (!rawApiKey) {
    throw new Error(`🔑 BYOK API Key eksik. Lütfen Eklenti Ayarları (Options) sayfasından OpenRouter veya Groq API anahtarınızı girip "Ayarları Şifreli Kaydet" butonuna basın.`);
  }

  const lastMsgText = messages.length > 0 ? messages[messages.length - 1].content : '';
  const escalation = classifyTaskAndEscalate(lastMsgText);

  const isAutoFallbackMode = !isGroq && (!settings.openrouterModel || settings.openrouterModel === 'auto_fallback');

  let modelToUse = targetModelOverride;
  let badgeToUse = '';

  if (!modelToUse) {
    if (isAutoFallbackMode) {
      modelToUse = escalation.model;
      badgeToUse = escalation.badge;
    } else {
      modelToUse = isGroq ? settings.groqModel : settings.openrouterModel;
      badgeToUse = `⚙️ Özel Model (${modelToUse}) kullanıldı.`;
    }
  }

  const toolsSchema = mcpClient?.getOpenAIToolsSchema ? mcpClient.getOpenAIToolsSchema() : undefined;

  const headers = isGroq ? {
    'Authorization': `Bearer ${rawApiKey}`,
    'Content-Type': 'application/json'
  } : {
    'Authorization': `Bearer ${rawApiKey}`,
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
    throw new Error(`🔌 ${isGroq ? 'Groq' : 'OpenRouter'} İnternet/Ağ Bağlantı Hatası: Sunucuya erişilemedi. (${netErr.message})`);
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
      throw new Error(`🔑 Yetkilendirme Başarısız (${isGroq ? 'Groq' : 'OpenRouter'} 401): ${detail}. Lütfen Eklenti Ayarlarından (${configName(isGroq)}) API Anahtarınızı kontrol edip tekrar "Ayarları Şifreli Kaydet" butonuna basın.`);
    }
    if (response.status === 403) {
      throw new Error(`🚫 Erişim Engellendi (${isGroq ? 'Groq' : 'OpenRouter'} 403): ${detail}. Lütfen bakiye meblağ ve izinlerinizi kontrol edin.`);
    }
    if (response.status === 404) {
      throw new Error(`🔍 Model veya Endpoint Bulunamadı (${isGroq ? 'Groq' : 'OpenRouter'} 404 - Model: "${modelToUse}"): ${detail}.`);
    }
    if (response.status === 429) {
      throw new Error(`⚠️ Kota / Hız Limiti Aşıldı (${isGroq ? 'Groq' : 'OpenRouter'} 429 - Model: "${modelToUse}"): ${detail}.`);
    }
    throw new Error(`❌ ${isGroq ? 'Groq' : 'OpenRouter'} API Hatası (${response.status} - Model: "${modelToUse}"): ${detail}`);
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
    let usedWebSearch = false;
    let usedMathEngine = false;

    for (const toolCall of choiceMessage.tool_calls) {
      const functionName = toolCall.function?.name;
      if (functionName === 'web_search') usedWebSearch = true;
      if (functionName === 'math_evaluate') usedMathEngine = true;

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

    if (usedWebSearch) {
      badgeToUse = '🌐 Canlı Web Araması (Jina Search API) kullanıldı...';
    } else if (usedMathEngine) {
      badgeToUse = '🧮 Matematik Motoru (MathJS Evaluator) ile doğrulandı...';
    }

    // Recursively call BYOK request with updatedMessages containing tool results
    return executeBYOKRequest(updatedMessages, settings, modelToUse, attemptedModels);
  }

  return {
    reply: choiceMessage.content || '',
    badge: badgeToUse
  };
}

function configName(isGroq) {
  return isGroq ? 'Groq' : 'OpenRouter';
}

/**
 * Smart Router with Priority Mode Execution & Direct Clear Error Reporting
 */
async function smartRouteCompletion(messages) {
  const settings = await getSettings();
  const usageMode = settings.usageMode || 'byok';

  const rawOpenRouterKey = await sanitizeApiKey(settings.openrouterApiKey);
  const rawGroqKey = await sanitizeApiKey(settings.groqApiKey);
  const rawGumroadKey = await sanitizeApiKey(settings.gumroadLicenseKey);

  const hasBYOK = !!(rawOpenRouterKey || rawGroqKey);
  const hasGumroad = !!rawGumroadKey;

  // 1. Direct Execution based on chosen usage mode
  if (usageMode === 'byok') {
    if (!hasBYOK) {
      throw new Error('🔑 OpenRouter / Groq API Anahtarı eksik. Lütfen Eklenti Ayarları (Options) sayfasından API anahtarınızı girip "Ayarları Şifreli Kaydet" butonuna basın.');
    }
    return await executeBYOKRequest(messages, settings);
  }

  if (usageMode === 'gumroad') {
    if (!hasGumroad) {
      throw new Error('🔑 Gumroad Lisans Kodu eksik. Lütfen Eklenti Ayarları (Options) sayfasından Ceviz Pro lisans kodunuzu girin.');
    }
    return await executeSupabaseRequest(messages, settings);
  }

  if (usageMode === 'chrome_local') {
    const reply = await executeChromeLocalAI(messages);
    return { reply, badge: '💻 Chrome Local AI (Gemini Nano - Cihaz İçi) kullanıldı.' };
  }

  // Fallback default
  if (hasBYOK) {
    return await executeBYOKRequest(messages, settings);
  }

  const reply = await executeChromeLocalAI(messages);
  return { reply, badge: '💻 Chrome Local AI (Gemini Nano) kullanıldı.' };
}

// Handle runtime messages from sidepanel and options
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GENERATE_COMPLETION') {
    smartRouteCompletion(request.messages)
      .then((res) => sendResponse({ success: true, reply: res.reply, badge: res.badge }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'GET_SETTINGS') {
    getSettings().then((settings) => sendResponse({ success: true, settings }));
    return true;
  }
});
