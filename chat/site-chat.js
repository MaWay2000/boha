(() => {
  'use strict';
  const button = document.getElementById('siteChatButton');
  const dialog = document.getElementById('siteChatDialog');
  if (!button || !dialog) return;
  const form = dialog.querySelector('form');
  const name = form.elements.nickname;
  const message = form.elements.message;
  const send = form.querySelector('button[type="submit"]');
  const list = dialog.querySelector('.site-chat-messages');
  const empty = dialog.querySelector('.site-chat-empty');
  const status = dialog.querySelector('[role="status"]');
  const endpoint = ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://127.0.0.1:8787/wzstats/api/v1/chat/'
    : 'https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/api/v1/chat/';
  let token = '', joinedName = '', sending = false, polling = false, timer, generation = 0;
  let previous = '', pending = null, messageVersion = 0, connectionFailed = false;
  try { name.value = localStorage.getItem('boha-chat-nickname') || ''; } catch {}
  async function request(action, payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(endpoint + action, {
        method: payload ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit', signal: controller.signal,
        ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {})
      });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || 'Chat is unavailable. Please try again.');
        error.status = response.status; throw error;
      }
      return data;
    } catch (error) {
      if (error.status) throw error;
      throw new Error('Cannot reach chat. Please check your connection and try again.');
    } finally { clearTimeout(timeout); }
  }
  function render(messages) {
    if (!Array.isArray(messages)) return;
    const signature = JSON.stringify(messages);
    if (signature === previous) return;
    previous = signature;
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 70;
    const oldScroll = list.scrollTop;
    const fragment = document.createDocumentFragment();
    for (const item of messages) {
      const row = document.createElement('li'); row.className = 'site-chat-message';
      const header = document.createElement('header');
      const author = document.createElement('strong'); author.textContent = item.name;
      const time = document.createElement('time');
      const date = new Date(item.sentAt);
      if (Number.isFinite(date.getTime())) {
        time.dateTime = date.toISOString(); time.textContent = date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      }
      const text = document.createElement('p'); text.textContent = item.text;
      header.append(author, time); row.append(header, text); fragment.append(row);
    }
    list.replaceChildren(fragment); empty.hidden = messages.length > 0;
    list.scrollTop = atBottom ? list.scrollHeight : oldScroll;
  }
  function schedule() {
    clearTimeout(timer);
    if (dialog.open && !document.hidden) timer = setTimeout(refresh, 5000);
  }
  async function refresh() {
    if (!dialog.open || document.hidden || polling) return;
    const current = generation, version = messageVersion; polling = true;
    try {
      const data = await request('messages');
      if (current === generation && !sending && version === messageVersion) {
        render(data.messages);
        if (connectionFailed || status.textContent === 'Connecting…') status.textContent = '';
        connectionFailed = false;
      }
    } catch (error) { if (current === generation && !sending) { connectionFailed = true; status.textContent = error.message; } }
    finally { polling = false; schedule(); }
  }
  button.addEventListener('click', () => {
    dialog.showModal(); document.body.classList.add('site-chat-open');
    generation++; status.textContent = 'Connecting…'; refresh();
  });
  dialog.querySelector('.site-chat-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.body.classList.remove('site-chat-open'); generation++; clearTimeout(timer); button.focus();
  });
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer); if (!document.hidden && dialog.open) refresh();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (sending) return;
    const nickname = name.value.trim().replace(/\s+/gu, ' ');
    const text = message.value.trim();
    if (!nickname || [...nickname].length > 24 || !text || [...text].length > 500) {
      status.textContent = 'Enter a nickname (1–24 characters) and a message (1–500 characters).'; return;
    }
    sending = true; messageVersion++; connectionFailed = false;
    send.disabled = true; name.disabled = true; status.textContent = 'Sending…';
    try {
      if (!token || joinedName !== nickname) {
        const session = await request('sessions', { name: nickname }); token = session.token; joinedName = nickname;
        try { localStorage.setItem('boha-chat-nickname', nickname); } catch {}
      }
      if (!pending || pending.text !== text || pending.name !== nickname) {
        const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
        pending = { nonce, text, name: nickname };
      }
      const data = await request('messages', { token, text, nonce: pending.nonce });
      render(data.messages); list.scrollTop = list.scrollHeight;
      if (message.value.trim() === text) message.value = '';
      pending = null; status.textContent = 'Message sent.';
    } catch (error) {
      if (error.status === 401) { token = ''; pending = null; }
      status.textContent = error.message;
    } finally { sending = false; send.disabled = false; name.disabled = false; if (dialog.open) message.focus(); }
  });
})();
