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

  function getGeminiNanoSetupGuide(reason = '') {
    return `💡 Chrome Local AI (Gemini Nano) Aktif Değil

${reason ? `Durum: ${reason}\n\n` : ''}Gemini Nano'yu tarayıcınızda sıfır gecikmeli ve tamamen internetsiz (cihaz içi) kullanmak için lütfen aşağıdaki adımları uygulayın:

---
1️⃣ Chrome Bayraklarını (Flags) Açın:
1. Adres çubuğuna chrome://flags yazın ve gidin.
2. #optimization-guide-on-device-model bayrağını bulun -> Enabled Bypassperfrequirement seçin.
3. #prompt-api-for-gemini-nano bayrağını bulun -> Enabled seçin.
4. Sayfanın altındaki Relaunch (Yeniden Başlat) butonuna tıklayarak Chrome'u yeniden başlatın.

---
2️⃣ Modeli İndirin ve Kontrol Edin:
1. Adres çubuğuna chrome://on-device-internals yazın.
2. Model Status bölümünde Optimization Guide On Device Model indiriliyor veya yüklendi olarak görünmelidir.
3. Alternatif olarak chrome://components sayfasına gidip Optimization Guide On Device Model yanında Check for update butonuna tıklayın.

İndirme tamamlandıktan sonra doğrudan cihaz içi yapay zeka ile konuşabilirsiniz! 🚀`;
  }

  async function handleChromeLocalAI(messages) {
    const aiApi = window.ai || globalThis.ai;
    if (!aiApi?.languageModel) {
      return getGeminiNanoSetupGuide('window.ai.languageModel API tarayıcınızda aktif edilmemiş.');
    }

    try {
      const session = await aiApi.languageModel.create();
      const promptText = messages.map(m => `${m.role === 'user' ? 'Kullanıcı' : m.role === 'system' ? 'Sistem' : 'Asistan'}: ${m.content}`).join('\n');
      const result = await session.prompt(promptText);
      if (typeof session.destroy === 'function') {
        session.destroy();
      }
      return result;
    } catch (err) {
      return getGeminiNanoSetupGuide(`Gemini Nano çalıştırılırken hata: ${err.message}`);
    }
  }

  async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    appendMessage('user', text);
    history.push({ role: 'user', content: text });
    userInput.value = '';
    sendBtn.disabled = true;

    const loadingElem = appendMessage('system', 'Ceviz.ai yanıtlıyor...');

    try {
      const settingsResp = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      const activeProvider = settingsResp?.settings?.activeProvider || 'openrouter';

      let replyText = '';

      if (activeProvider === 'chrome_local') {
        replyText = await handleChromeLocalAI(history);
      } else {
        const response = await chrome.runtime.sendMessage({
          type: 'GENERATE_COMPLETION',
          messages: history
        });

        if (response?.success) {
          replyText = response.reply;
        } else {
          replyText = response?.error || 'Bir hata oluştu.';
        }
      }

      loadingElem.remove();
      appendMessage('assistant', replyText);
      history.push({ role: 'assistant', content: replyText });
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
