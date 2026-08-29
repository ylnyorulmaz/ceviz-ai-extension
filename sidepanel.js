/**
 * Ceviz.ai - Side Panel UI Controller with Rich Markdown & Cool UI Rendering
 * 
 * Features:
 * 1. Rich Markdown HTML Renderer (converts raw ## and ** into clean, sleek HTML elements)
 * 2. Quick Action Chips (📝 Sayfayı Özetle, 🔑 Ana Fikirler, 🎯 3 Önemli Nokta)
 * 3. Step-by-Step Live Process Status Pill
 * 4. One-Click Copy & Text-to-Speech (TTS Audio) Buttons
 * 5. Feynman ELA Engine (6, 12, 18, 24, 32+ Age Buttons)
 * 6. Clarity Progress Bar & Next Step Chips
 */

document.addEventListener('DOMContentLoaded', () => {
  const chatBox = document.getElementById('chat-box');
  const userInput = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const settingsBtn = document.getElementById('open-settings');
  const quickActions = document.getElementById('quick-actions');

  const history = [
    {
      role: 'system',
      content: 'Sen Ceviz.ai adında zeki ve şık bir web asistanısın. Yanıtlarını kullanıcı dostu, düzenli listeler, emoji vurguları ve temiz bir düzenle ver. Karmaşık ve ham markdown başlıkları (#) yerine şık başlıklar ve maddeler kullan.'
    }
  ];

  let lastTopic = 'web sayfasındaki konu';
  let currentUtterance = null;

  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

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
   * Converts raw Markdown syntax (##, **, -, `code`) into ultra-cool, clean HTML elements
   */
  function formatMarkdown(text) {
    if (!text || typeof text !== 'string') return '';

    // Split lines for clean block-level formatting
    const lines = text.split('\n');
    const processedLines = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Escape raw HTML tags
      line = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      // Headings: ### Header, ## Header, # Header -> Cool accent headings without '#'
      if (/^###\s+(.*$)/.test(line)) {
        line = line.replace(/^###\s+(.*$)/, '<h4 style="margin: 10px 0 4px 0; color: #38bdf8; font-size: 0.95rem; font-weight: 700;">$1</h4>');
      } else if (/^##\s+(.*$)/.test(line)) {
        line = line.replace(/^##\s+(.*$)/, '<h3 style="margin: 12px 0 6px 0; color: #38bdf8; font-size: 1.05rem; font-weight: 700; border-bottom: 1px solid rgba(56, 189, 248, 0.25); padding-bottom: 4px;">$1</h3>');
      } else if (/^#\s+(.*$)/.test(line)) {
        line = line.replace(/^#\s+(.*$)/, '<h2 style="margin: 14px 0 8px 0; color: #38bdf8; font-size: 1.15rem; font-weight: 700;">$1</h2>');
      }

      // Bullet Lists: - item or * item -> Sleek Bullet list with 🔹 icon
      if (/^\s*[-*]\s+(.*$)/.test(line)) {
        line = line.replace(/^\s*[-*]\s+(.*$)/, '<div style="display: flex; gap: 8px; margin: 4px 0; align-items: baseline;"><span style="color: #38bdf8; font-size: 0.8rem; flex-shrink: 0;">🔹</span><span>$1</span></div>');
      }

      // Bold text: **text** -> Sleek White Bold
      line = line.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #f8fafc; font-weight: 700;">$1</strong>');
      line = line.replace(/__(.*?)__/g, '<strong style="color: #f8fafc; font-weight: 700;">$1</strong>');

      // Italic text: *text* -> Muted italic
      line = line.replace(/\*(.*?)\*/g, '<em style="color: #cbd5e1;">$1</em>');

      // Inline Code: `code` -> Styled code pill
      line = line.replace(/`(.*?)`/g, '<code style="background: rgba(15, 23, 42, 0.7); color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.85rem; border: 1px solid rgba(56, 189, 248, 0.2);">$1</code>');

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

Word count: Aim for a comprehensive depth of up to 400 words.

Format: Use Markdown for structure (bolding, lists).

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
  function appendUserMessage(text) {
    const group = document.createElement('div');
    group.className = 'message-group user';

    const msgDiv = document.createElement('div');
    msgDiv.className = 'message user';
    msgDiv.textContent = text;

    group.appendChild(msgDiv);
    chatBox.appendChild(group);
    scrollToBottom();
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
   * Renders Assistant Message with Rich HTML Markdown, Copy/TTS Action Bar & ELA Buttons
   */
  function appendAssistantMessage(replyRaw, badgeText = '') {
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

    // Message Body with Rich Markdown HTML Formatting
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message assistant';
    msgDiv.innerHTML = formatMarkdown(mainText);
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

        const cleanTextForSpeech = mainText.replace(/[*#_`~]/g, '');
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
    scrollToBottom();
  }

  function scrollToBottom() {
    chatBox.scrollTop = chatBox.scrollHeight;
  }
});
