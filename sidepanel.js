/**
 * Ceviz.ai - Side Panel UI Controller
 * 
 * Features:
 * 1. Right-Click Context Menu listener & pickup
 * 2. Chat History Persistence (save & restore from chrome.storage.local)
 * 3. Export Chat as Markdown (.md) Blob
 * 4. Drag & Drop File Uploads (.pdf, .txt, .md, .js, .json, .py)
 * 5. KaTeX LaTeX Math Engine
 * 6. Side Panel Optimized System Prompt
 * 7. Overflow-X Scroll Protection & Collapsible Accordion
 * 8. Quick Action Chips & Feynman ELA Engine
 * 9. One-Click Copy & Text-to-Speech (TTS Audio) Buttons
 */

document.addEventListener('DOMContentLoaded', async () => {
  const chatBox = document.getElementById('chat-box');
  const userInput = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const settingsBtn = document.getElementById('open-settings');
  const newChatBtn = document.getElementById('new-chat-btn');
  const exportChatBtn = document.getElementById('export-chat-btn');
  const quickActions = document.getElementById('quick-actions');
  const fileInput = document.getElementById('file-input');

  const INITIAL_SYSTEM_PROMPT = {
    role: 'system',
    content: 'Sen bir tarayıcı yan paneli (Side Panel) asistanısın. Yanıtların her zaman maksimum 2-3 kısa paragraf veya net madde işaretleri (bullet points) şeklinde olsun. Matematiksel denklemler için LaTeX ($...$ veya $$...$$) formatı kullan. Uzun ve boğucu metinlerden kaçın, doğrudan konuya gir.'
  };

  let history = [INITIAL_SYSTEM_PROMPT];
  let lastTopic = 'web sayfasındaki konu';
  let currentUtterance = null;

  // Restore Chat History from local storage if available
  const savedData = await chrome.storage.local.get(['cevizChatHistory', 'pendingPrompt']);
  if (savedData.cevizChatHistory && Array.isArray(savedData.cevizChatHistory) && savedData.cevizChatHistory.length > 1) {
    history = savedData.cevizChatHistory;
    restoreChatUI(history);
  }

  // Check if opened from Right-Click Context Menu
  if (savedData.pendingPrompt) {
    const promptToRun = savedData.pendingPrompt;
    await chrome.storage.local.remove('pendingPrompt');
    setTimeout(() => { sendMessage(promptToRun); }, 300);
  }

  // Listen for storage changes (Context Menu clicks while sidepanel is already open)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pendingPrompt?.newValue) {
      const promptToRun = changes.pendingPrompt.newValue;
      chrome.storage.local.remove('pendingPrompt');
      sendMessage(promptToRun);
    }
  });

  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 1. New Chat Button
  newChatBtn.addEventListener('click', async () => {
    if (confirm('Sohbet geçmişi temizlenip yeni bir oturum başlatılsın mı?')) {
      history = [INITIAL_SYSTEM_PROMPT];
      await chrome.storage.local.remove('cevizChatHistory');
      chatBox.innerHTML = '<div class="message system">Yeni Ceviz.ai sohbeti başlatıldı.</div>';
    }
  });

  // 2. Export Chat Button (.md file)
  exportChatBtn.addEventListener('click', () => {
    if (history.length <= 1) {
      alert('İndirilecek sohbet geçmişi bulunmuyor.');
      return;
    }

    let mdText = `# 🥜 Ceviz.ai Sohbet Geçmişi\n*Tarih: ${new Date().toLocaleString('tr-TR')}*\n\n---\n\n`;

    history.forEach(m => {
      if (m.role === 'user') {
        mdText += `### 👤 Kullanıcı:\n${m.content}\n\n`;
      } else if (m.role === 'assistant') {
        mdText += `### 🤖 Ceviz.ai:\n${m.content}\n\n---\n\n`;
      }
    });

    const blob = new Blob([mdText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ceviz_ai_chat_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // 3. File Input Listener (.txt, .md, .pdf, .js, .json)
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleUploadedFile(file);
  });

  // 4. Drag & Drop File Handling on Chat Container
  chatBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    chatBox.classList.add('drag-over');
  });

  chatBox.addEventListener('dragleave', () => {
    chatBox.classList.remove('drag-over');
  });

  chatBox.addEventListener('drop', (e) => {
    e.preventDefault();
    chatBox.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleUploadedFile(files[0]);
    }
  });

  /**
   * Reads uploaded file text and submits for AI analysis
   */
  function handleUploadedFile(file) {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const fileContent = evt.target.result || '';
      const prompt = `Yüklenen "${file.name}" dosya içeriğini incele, ana hatlarını ve özeti ver:\n\n\`\`\`\n${fileContent.slice(0, 5000)}\n\`\`\``;
      sendMessage(prompt);
    };
    reader.onerror = () => {
      appendSystemMessage('❌ Dosya okunamadı.');
    };
    reader.readAsText(file);
  }

  // Quick Action Chips Event Delegation
  quickActions.addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-btn');
    if (btn) {
      const prompt = btn.getAttribute('data-prompt');
      if (prompt) {
        sendMessage(prompt);
      }
    }
  });

  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', () => sendMessage());

  /**
   * Helper to trigger KaTeX LaTeX rendering on an HTML element
   */
  function triggerKaTeXRender(container) {
    if (typeof renderMathInElement === 'function' && container) {
      try {
        renderMathInElement(container, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          throwOnError: false
        });
      } catch (e) {
        console.warn('KaTeX render error:', e);
      }
    }
  }

  /**
   * Restores UI from saved chat history array
   */
  function restoreChatUI(historyArr) {
    chatBox.innerHTML = '';
    historyArr.forEach(msg => {
      if (msg.role === 'user') {
        appendUserMessage(msg.content, false);
      } else if (msg.role === 'assistant') {
        appendAssistantMessage(msg.content, '', false);
      }
    });
  }

  /**
   * Save chat history to storage
   */
  async function persistChatHistory() {
    try {
      await chrome.storage.local.set({ cevizChatHistory: history });
    } catch (e) {}
  }

  /**
   * Converts raw Markdown syntax into clean HTML with Code Block Scroll Protection (overflow-x: auto)
   */
  function formatMarkdown(text) {
    if (!text || typeof text !== 'string') return '';

    let htmlText = text;

    // Code Blocks Handling (```lang ... ```) with overflow-x scroll container
    htmlText = htmlText.replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/gim, (match, lang, code) => {
      const cleanCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const langName = lang ? lang.toUpperCase() : 'KOD';
      return `<div class="code-block-container"><div class="code-block-header"><span>💻 ${langName}</span><span>overflow-x: auto</span></div><pre class="code-block-content">${cleanCode}</pre></div>`;
    });

    const lines = htmlText.split('\n');
    const processedLines = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // If line is already inside code block container, preserve it
      if (line.includes('class="code-block-container"') || line.includes('class="code-block-content"') || line.includes('class="code-block-header"')) {
        processedLines.push(line);
        continue;
      }

      // Escape raw HTML tags
      line = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      // Headings: ### Header, ## Header, # Header -> Cool accent headings
      if (/^###\s+(.*$)/.test(line)) {
        line = line.replace(/^###\s+(.*$)/, '<h4 style="margin: 8px 0 4px 0; color: #38bdf8; font-size: 0.95rem; font-weight: 700;">$1</h4>');
      } else if (/^##\s+(.*$)/.test(line)) {
        line = line.replace(/^##\s+(.*$)/, '<h3 style="margin: 10px 0 4px 0; color: #38bdf8; font-size: 1.02rem; font-weight: 700; border-bottom: 1px solid rgba(56, 189, 248, 0.25); padding-bottom: 3px;">$1</h3>');
      } else if (/^#\s+(.*$)/.test(line)) {
        line = line.replace(/^#\s+(.*$)/, '<h2 style="margin: 12px 0 6px 0; color: #38bdf8; font-size: 1.1rem; font-weight: 700;">$1</h2>');
      }

      // Bullet Lists: - item or * item -> Sleek Bullet list with 🔹 icon
      if (/^\s*[-*]\s+(.*$)/.test(line)) {
        line = line.replace(/^\s*[-*]\s+(.*$)/, '<div style="display: flex; gap: 8px; margin: 3px 0; align-items: baseline;"><span style="color: #38bdf8; font-size: 0.78rem; flex-shrink: 0;">🔹</span><span>$1</span></div>');
      }

      // Bold text: **text** -> Sleek White Bold
      line = line.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #f8fafc; font-weight: 700;">$1</strong>');
      line = line.replace(/__(.*?)__/g, '<strong style="color: #f8fafc; font-weight: 700;">$1</strong>');

      // Italic text: *text* -> Muted italic
      line = line.replace(/\*(.*?)\*/g, '<em style="color: #cbd5e1;">$1</em>');

      // Inline Code: `code` -> Styled code pill
      line = line.replace(/`(.*?)`/g, '<code style="background: rgba(15, 23, 42, 0.7); color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.82rem; border: 1px solid rgba(56, 189, 248, 0.2);">$1</code>');

      processedLines.push(line);
    }

    return processedLines.join('<br>').replace(/(<br>\s*){3,}/g, '<br><br>');
  }

  /**
   * Main function to send message to background Smart Router
   */
  async function sendMessage(overrideText = null, isElaRequest = false) {
    const text = (overrideText || userInput.value).trim();
    if (!text) return;

    if (!isElaRequest) {
      lastTopic = text;
      appendUserMessage(text);
      history.push({ role: 'user', content: text });
      userInput.value = '';
    } else {
      appendUserMessage(text);
      history.push({ role: 'user', content: text });
    }

    persistChatHistory();
    sendBtn.disabled = true;

    // Step-by-Step Live Process Status Pill
    const loadingElem = appendSystemMessage('🌐 Jina AI ile sayfa içeriği okunuyor...');
    const statusTimer = setTimeout(() => {
      if (loadingElem && loadingElem.isConnected) {
        loadingElem.textContent = '🧠 Yapay zeka yanıt üretiyor...';
      }
    }, 1400);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_COMPLETION',
        messages: history
      });

      clearTimeout(statusTimer);
      loadingElem.remove();

      if (response?.success) {
        const replyRaw = response.reply || '';
        const badgeText = response.badge || '';

        appendAssistantMessage(replyRaw, badgeText);
        history.push({ role: 'assistant', content: replyRaw });
        persistChatHistory();
      } else {
        const errText = response?.error || 'Bir hata oluştu.';
        appendSystemMessage(`❌ Hata: ${errText}`);
      }
    } catch (err) {
      clearTimeout(statusTimer);
      loadingElem.remove();
      appendSystemMessage(`❌ Hata: ${err.message}`);
    } finally {
      sendBtn.disabled = false;
      userInput.focus();
    }
  }

  /**
   * Builds the exact Feynman ELA Prompt for Age 6, 12, 18, 24, 32+
   */
  function buildElaPrompt(topic, ageLabel, ageValue) {
    const sanitizedTopic = (topic || 'mevcut konu').replace(/"/g, "'");

    return `Explain "${sanitizedTopic}" to me as if I am exactly ${ageValue} years old. Use the "Feynman Technique" adapted for this specific age level.

Persona Constraints:

Age 6: Use sensory metaphors (touch, taste, play). Avoid all jargon. Use "Imagine if..." storytelling.

Age 12: Use analogies from digital life (gaming, social media, apps). Explain the "why" and "how it affects me."

Age 18: Use first-principles thinking. Structured, evidence-based, and systemic. Treat me as an adult learner entering university.

Age 24: Professional/Expert level. Use industry-standard terminology, discuss mechanical tensions, trade-offs, and practical application.

Age 32+: Executive level. Focus on strategic impact, efficiency, long-term ROI, and "Bottom Line Up Front" (BLUF) delivery.

Constraints:

Word count: Aim for a comprehensive depth of up to 300 words.

Format: Use Markdown for structure (bolding, lists) and LaTeX ($...$) for any math formulas.

IMPORTANT: Return ONLY a valid JSON object with NO additional text before or after, matching this exact JSON schema:
{
  "explanation": "Detailed Markdown explanation text...",
  "relatedConcepts": ["Next concept step 1", "Next concept step 2", "Next concept step 3"],
  "clarityScore": 85,
  "evolutionSummary": null
}`;
  }

  /**
   * Helper to parse JSON from AI response
   */
  function parseJsonResponse(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;

    let jsonStr = rawText.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    try {
      const data = JSON.parse(jsonStr);
      if (data && typeof data === 'object' && data.explanation) {
        return data;
      }
    } catch (e) {}
    return null;
  }

  /**
   * Renders User Message
   */
  function appendUserMessage(text, doScroll = true) {
    const group = document.createElement('div');
    group.className = 'message-group user';

    const msgDiv = document.createElement('div');
    msgDiv.className = 'message user';
    msgDiv.textContent = text;

    group.appendChild(msgDiv);
    chatBox.appendChild(group);
    if (doScroll) scrollToBottom();
  }

  /**
   * Renders System Message
   */
  function appendSystemMessage(text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message system';
    msgDiv.textContent = text;
    chatBox.appendChild(msgDiv);
    scrollToBottom();
    return msgDiv;
  }

  /**
   * Renders Assistant Message with KaTeX LaTeX Rendering, Collapsible Accordion & Code Block Scroll Protection
   */
  function appendAssistantMessage(replyRaw, badgeText = '', doScroll = true) {
    const group = document.createElement('div');
    group.className = 'message-group assistant';

    // Model Escalation Badge
    if (badgeText) {
      const badgeDiv = document.createElement('div');
      badgeDiv.className = 'model-badge';
      badgeDiv.textContent = badgeText;
      group.appendChild(badgeDiv);
    }

    const parsedJson = parseJsonResponse(replyRaw);
    const mainText = parsedJson ? parsedJson.explanation : replyRaw;

    // Message Body with Collapsible Accordion for Long Responses (>750 chars)
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message assistant';

    if (mainText.length > 750) {
      const summaryPart = mainText.slice(0, 450);
      const detailPart = mainText.slice(450);

      msgDiv.innerHTML = formatMarkdown(summaryPart);

      const accordion = document.createElement('div');
      accordion.className = 'details-accordion';

      const toggleBtn = document.createElement('div');
      toggleBtn.className = 'accordion-toggle';
      toggleBtn.innerHTML = '<span>🔍 Detayların Devamını Göster</span><span>▼</span>';

      const contentDiv = document.createElement('div');
      contentDiv.className = 'accordion-content';
      contentDiv.innerHTML = formatMarkdown(detailPart);

      toggleBtn.addEventListener('click', () => {
        const isOpen = contentDiv.classList.toggle('open');
        toggleBtn.querySelector('span:last-child').textContent = isOpen ? '▲' : '▼';
        toggleBtn.querySelector('span:first-child').textContent = isOpen ? '🔍 Detayları Gizle' : '🔍 Detayların Devamını Göster';
        triggerKaTeXRender(contentDiv);
      });

      accordion.appendChild(toggleBtn);
      accordion.appendChild(contentDiv);
      msgDiv.appendChild(accordion);
    } else {
      msgDiv.innerHTML = formatMarkdown(mainText);
    }

    // Trigger KaTeX LaTeX Render on assistant message
    triggerKaTeXRender(msgDiv);

    group.appendChild(msgDiv);

    // Action Bar (Copy & Speech TTS)
    const actionBar = document.createElement('div');
    actionBar.className = 'action-bar';

    // 1. Copy Button
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'action-btn';
    copyBtn.innerHTML = '📋 Kopyala';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(mainText);
        copyBtn.innerHTML = '✅ Kopyalandı';
        setTimeout(() => { copyBtn.innerHTML = '📋 Kopyala'; }, 2000);
      } catch (err) {
        copyBtn.innerHTML = '❌ Hata';
      }
    });

    // 2. Text-to-Speech (TTS) Button
    const ttsBtn = document.createElement('button');
    ttsBtn.type = 'button';
    ttsBtn.className = 'action-btn';
    ttsBtn.innerHTML = '🔊 Sesli Oku';

    ttsBtn.addEventListener('click', () => {
      if ('speechSynthesis' in window) {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          ttsBtn.innerHTML = '🔊 Sesli Oku';
          return;
        }

        const cleanTextForSpeech = mainText.replace(/[*#_`~$]/g, '');
        currentUtterance = new SpeechSynthesisUtterance(cleanTextForSpeech);
        currentUtterance.lang = 'tr-TR';
        currentUtterance.rate = 1.0;

        currentUtterance.onstart = () => {
          ttsBtn.innerHTML = '⏹️ Durdur';
        };
        currentUtterance.onend = () => {
          ttsBtn.innerHTML = '🔊 Sesli Oku';
        };
        currentUtterance.onerror = () => {
          ttsBtn.innerHTML = '🔊 Sesli Oku';
        };

        window.speechSynthesis.speak(currentUtterance);
      } else {
        alert('Tarayıcınız sesli okuma özelliğini desteklemiyor.');
      }
    });

    actionBar.appendChild(copyBtn);
    actionBar.appendChild(ttsBtn);
    group.appendChild(actionBar);

    // Render Clarity Score Progress Bar if present in JSON
    if (parsedJson && typeof parsedJson.clarityScore === 'number') {
      const score = Math.min(100, Math.max(0, parsedJson.clarityScore));

      const clarityContainer = document.createElement('div');
      clarityContainer.className = 'clarity-container';

      const label = document.createElement('div');
      label.className = 'clarity-label';
      label.textContent = '💡 Kavramsal Açıklık:';

      const barBg = document.createElement('div');
      barBg.className = 'clarity-bar-bg';

      const barFill = document.createElement('div');
      barFill.className = 'clarity-bar-fill';
      barFill.style.width = `${score}%`;

      barBg.appendChild(barFill);

      const val = document.createElement('div');
      val.className = 'clarity-val';
      val.textContent = `%${score}`;

      clarityContainer.appendChild(label);
      clarityContainer.appendChild(barBg);
      clarityContainer.appendChild(val);

      group.appendChild(clarityContainer);
    }

    // Render Related Concepts (Next Steps) if present in JSON
    if (parsedJson && Array.isArray(parsedJson.relatedConcepts) && parsedJson.relatedConcepts.length > 0) {
      const nextBox = document.createElement('div');
      nextBox.className = 'next-steps-box';

      const nextLabel = document.createElement('div');
      nextLabel.className = 'next-steps-label';
      nextLabel.textContent = '🌱 Sonraki Mantıklı Adımlar:';
      nextBox.appendChild(nextLabel);

      const chipsWrapper = document.createElement('div');
      parsedJson.relatedConcepts.forEach(conceptText => {
        const stepChip = document.createElement('button');
        stepChip.type = 'button';
        stepChip.className = 'next-step-chip';
        stepChip.textContent = `➔ ${conceptText}`;
        stepChip.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          sendMessage(`"${conceptText}" kavramını detaylı anlatır mısın?`);
        });
        chipsWrapper.appendChild(stepChip);
      });

      nextBox.appendChild(chipsWrapper);
      group.appendChild(nextBox);
    }

    // ELA (Explain Like Age) Buttons (6, 12, 18, 24, 32+)
    const elaContainer = document.createElement('div');
    elaContainer.className = 'ela-container';

    const elaTitle = document.createElement('div');
    elaTitle.className = 'ela-title';
    elaTitle.textContent = '👶 ELA (Feynman Tekniği - Yaş Seviyesi Seç):';
    elaContainer.appendChild(elaTitle);

    const chipsDiv = document.createElement('div');
    chipsDiv.className = 'ela-chips';

    const ageLevels = [
      { label: '👶 6 Yaş', ageVal: '6' },
      { label: '👦 12 Yaş', ageVal: '12' },
      { label: '🧑 18 Yaş', ageVal: '18' },
      { label: '👨 24 Yaş', ageVal: '24' },
      { label: '💼 32+ Yaş', ageVal: '32+' }
    ];

    ageLevels.forEach(item => {
      const chipBtn = document.createElement('button');
      chipBtn.type = 'button';
      chipBtn.className = 'ela-chip';
      chipBtn.textContent = item.label;
      chipBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const elaPrompt = buildElaPrompt(lastTopic, item.label, item.ageVal);
        sendMessage(elaPrompt, true);
      });
      chipsDiv.appendChild(chipBtn);
    });

    elaContainer.appendChild(chipsDiv);
    group.appendChild(elaContainer);

    chatBox.appendChild(group);
    if (doScroll) scrollToBottom();
  }

  function scrollToBottom() {
    chatBox.scrollTop = chatBox.scrollHeight;
  }
});
