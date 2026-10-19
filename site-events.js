/* Public-site activity only. Never observes passwords, form bodies, or arbitrary query parameters. */
(() => {
  'use strict';
  if (window.__publicVisitorActivity) return;
  window.__publicVisitorActivity = true;
  const endpoint = 'https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/api/v1/visitors';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const trackedQueryKeys = ['p', 'a', 'b', 'betaPlayer'];
  let visitorId = '', memorySession = null;
  const clean = value => String(value || '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200);
  function trackedPath(value = location.href) {
    try {
      const url = new URL(value, location.href);
      const query = new URLSearchParams();
      for (const key of trackedQueryKeys) {
        const parameter = url.searchParams.get(key) || '';
        if (/^[A-Za-z0-9_-]{1,96}$/.test(parameter)) query.set(key, parameter);
      }
      const suffix = query.toString();
      return url.pathname + (suffix ? `?${suffix}` : '');
    } catch {
      return location.pathname;
    }
  }
  try {
    visitorId = localStorage.getItem('bohaVisitorId') || '';
    if (!uuid.test(visitorId)) { visitorId = crypto.randomUUID(); localStorage.setItem('bohaVisitorId', visitorId); }
  } catch { visitorId = ''; }
  function session() {
    const now = Date.now();
    let current = memorySession;
    try { current = JSON.parse(localStorage.getItem('publicVisitorSession') || 'null') || current; } catch {}
    if (!current || !uuid.test(current.id) || now - current.last > 30 * 60 * 1000) current = {id:crypto.randomUUID(), last:now};
    current.last = now; memorySession = current;
    try { localStorage.setItem('publicVisitorSession', JSON.stringify(current)); } catch {}
    return current.id;
  }
  let referrer = '';
  try { referrer = document.referrer ? new URL(document.referrer).origin : ''; } catch {}
  function record(eventType, detail = '', path = trackedPath()) {
    fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store', credentials:'omit', keepalive:true,
      body:JSON.stringify({visitorId, sessionId:session(), eventType, detail:clean(detail), path, referrer})
    }).then(async response => {
      if (response.status !== 403) return;
      const result = await response.json().catch(() => ({}));
      if (!result.blocked) return;
      window.stop(); document.title = 'Access blocked';
      document.body.textContent = 'Access blocked. You do not have permission to access this website.';
    }).catch(() => {}); // Telemetry must not prevent normal site use.
  }
  const previous = new Map();
  let playerName = '';
  function state() {
    const params = new URL(location.href).searchParams;
    const fields = [['playerSearch','search','Player search'],['matchesSearch','search','Match search'],['matchesMap','search','Map filter'],
      ['p','player_view','Player'],['a','player_view','Compare player A'],['b','player_view','Compare player B'],['replay','replay_view','Replay']];
    for (const [key,type,label] of fields) {
      let value = params.get(key) || '';
      if (previous.get(key) === value) continue;
      previous.set(key,value);
      if (key === 'p' && value && playerName) value = playerName;
      if (key === 'replay' && value) { try { value = new URL(value,location.href).pathname.split('/').pop() || 'Replay'; } catch { value = 'Replay'; } }
      if (value) record(type, label + ': ' + value);
    }
  }
  let timer;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(state, 1000); };
  window.addEventListener('public-site-state', event => {playerName = event.detail?.playerName || '';schedule();});
  window.addEventListener('message', event => {
    if (event.origin === location.origin && event.data?.type === 'boha:page-state') schedule();
  });
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    try {
      const url = new URL(link.href,location.href);
      if (url.origin !== location.origin || /\/(?:wzstats|admin)(?:\/|$)/i.test(url.pathname)) return;
      record(link.hasAttribute('data-replay-analyzer-url')?'replay_view':'navigation',clean(link.textContent.trim()) || url.pathname,trackedPath(url));
    } catch {}
  });
  record('page_view'); state();
})();
