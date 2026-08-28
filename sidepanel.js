/**
 * Ceviz.ai - Side Panel UI Controller
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

  sendBtn.addEventListener('click', sendMessage);

  async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    appendMessage('user', text);
    history.push({ role: 'user', content: text });
    userInput.value = '';
    sendBtn.disabled = true;

    const loadingElem = appendMessage('system', 'Ceviz.ai yanıtlıyor...');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_COMPLETION',
        messages: history
      });

      loadingElem.remove();

      if (response?.success) {
        appendMessage('assistant', response.reply);
        history.push({ role: 'assistant', content: response.reply });
      } else {
        appendMessage('system', response?.error || 'Bir hata oluştu.');
      }
    } catch (err) {
      loadingElem.remove();
      appendMessage('system', `Hata: ${err.message}`);
    } finally {
      sendBtn.disabled = false;
      userInput.focus();
    }
  }

  function appendMessage(role, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    msgDiv.textContent = text;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return msgDiv;
  }
});
