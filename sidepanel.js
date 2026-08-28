/**
 * Ceviz.ai - Side Panel UI Controller with ELA Chips and Model Escalation Badges
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
  async function sendMessage(overrideText = null) {
    const text = (overrideText || userInput.value).trim();
    if (!text) return;

    appendUserMessage(text);
    history.push({ role: 'user', content: text });
    if (!overrideText) userInput.value = '';
    sendBtn.disabled = true;

    const loadingElem = appendSystemMessage('Ceviz.ai yanıtlıyor...');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_COMPLETION',
        messages: history
      });

      loadingElem.remove();

      if (response?.success) {
        const replyText = response.reply || '';
        const badgeText = response.badge || '';

        appendAssistantMessage(replyText, badgeText);
        history.push({ role: 'assistant', content: replyText });
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
   * Renders Assistant Message with Model Badge and ELA (Explain Like Age) Chips
   */
  function appendAssistantMessage(text, badgeText = '') {
    const group = document.createElement('div');
    group.className = 'message-group assistant';

    // Model Escalation Badge
    if (badgeText) {
      const badgeDiv = document.createElement('div');
      badgeDiv.className = 'model-badge';
      badgeDiv.textContent = badgeText;
      group.appendChild(badgeDiv);
    }

    // Message Body
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message assistant';
    msgDiv.textContent = text;
    group.appendChild(msgDiv);

    // ELA (Explain Like Age) Chips
    const elaContainer = document.createElement('div');
    elaContainer.className = 'ela-container';

    const elaTitle = document.createElement('div');
    elaTitle.className = 'ela-title';
    elaTitle.textContent = '👶 ELA (Farklı Yaş Seviyesine Göre Açıkla):';
    elaContainer.appendChild(elaTitle);

    const chipsDiv = document.createElement('div');
    chipsDiv.className = 'ela-chips';

    const ageLevels = [
      { label: '👶 5 Yaş', age: '5' },
      { label: '👦 10 Yaş', age: '10' },
      { label: '🧑 15 Yaş', age: '15' },
      { label: '👨 20 Yaş', age: '20' }
    ];

    ageLevels.forEach(item => {
      const chipBtn = document.createElement('button');
      chipBtn.type = 'button';
      chipBtn.className = 'ela-chip';
      chipBtn.textContent = item.label;
      chipBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const elaPrompt = `Bu konuyu ${item.age} yaşındaki birinin anlayacağı basit kelimeler, somut kavramlar ve eğlenceli benzetmelerle yeniden açıkla.`;
        sendMessage(elaPrompt);
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
