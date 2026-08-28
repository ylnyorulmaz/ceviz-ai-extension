/**
 * Ceviz.ai - Model Context Protocol (MCP) Client Module
 * 
 * Provides tool definitions, OpenAI Function Schema formatting,
 * and execution dispatch for OpenRouter and Groq APIs.
 */

class MCPClient {
  constructor() {
    this.tools = new Map();
    this.registerBuiltInTools();
  }

  /**
   * Registers default built-in browser tools available via activeTab
   */
  registerBuiltInTools() {
    this.registerTool({
      name: 'get_active_tab_info',
      description: 'Get title and URL of the currently active browser tab.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          return { error: 'Aktif sekme bulunamadı.' };
        }
        return {
          id: tab.id,
          title: tab.title || 'Başlıksız Sekme',
          url: tab.url || ''
        };
      }
    });

    this.registerTool({
      name: 'get_page_content',
      description: 'Extract raw text content from the currently active tab.',
      parameters: {
        type: 'object',
        properties: {
          maxLength: {
            type: 'number',
            description: 'Maximum characters to retrieve (default 4000).'
          }
        },
        required: []
      },
      handler: async (args) => {
        const maxLen = args?.maxLength || 4000;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          return { error: 'Aktif sekme bulunamadı.' };
        }

        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => document.body?.innerText || ''
          });

          const text = results[0]?.result || '';
          return {
            title: tab.title,
            url: tab.url,
            content: text.slice(0, maxLen),
            truncated: text.length > maxLen
          };
        } catch (err) {
          return { error: `Sayfa içeriği okunamadı: ${err.message}` };
        }
      }
    });
  }

  /**
   * Registers a new tool to the MCP Client
   */
  registerTool(tool) {
    if (!tool.name || !tool.description || !tool.handler) {
      throw new Error('Tool name, description, and handler are required.');
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Formats all registered tools into OpenAI Tool Call Schema (for OpenRouter & Groq)
   */
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

  /**
   * Executes a tool call requested by the model
   */
  async executeToolCall(toolName, args = {}) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { error: `Bilinmeyen araç: ${toolName}` };
    }

    try {
      const result = await tool.handler(args);
      return result;
    } catch (error) {
      return { error: `Araç çalıştırma hatası: ${error.message}` };
    }
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.MCPClient = MCPClient;
}
