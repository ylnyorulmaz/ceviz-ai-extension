/**
 * Ceviz.ai - Side Panel UI Controller with Feynman ELA Prompt Engine & Rich JSON Rendering
 */

document.addEventListener('DOMContentLoaded', () => {
  const chatBox = document.getElementById('chat-box');
  const userInput = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const settingsBtn = document.getElementById('open-settings');

  const history = [
    {
      role: 'system',
      content: 'Sen Ceviz.ai adında zeki bir web asistanısın. Kullanıcıya net, kısa ve yardımcı yanıtlar ver.'
    }
  ];

  let lastTopic = 'web sayfasındaki konu';

  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', () => sendMessage());

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
    const loadingElem = appendSystemMessage('Ceviz.ai yanıtlıyor...');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_COMPLETION',
        messages: history
      });

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
   * Helper to parse JSON from AI response (including markdown ```json ... ``` blocks)
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
   * Renders Assistant Message with ELA Buttons, Clarity Score, and Next Logical Steps
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

    // Message Body
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message assistant';
    msgDiv.textContent = mainText;
    group.appendChild(msgDiv);

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
