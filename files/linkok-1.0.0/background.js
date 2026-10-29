'use strict';

const SB_ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';
const BATCH_SIZE = 500; // limite da API por requisição
const MAX_URLS = 2000;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 5000;

/** url -> { ts, threats: string[] } (vive enquanto o service worker estiver ativo) */
const cache = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

  if (msg && msg.type === 'SB_LOOKUP' && Array.isArray(msg.urls)) {
    const urls = msg.urls.filter((u) => typeof u === 'string').slice(0, MAX_URLS);
    lookup(urls).then(sendResponse, (err) => sendResponse({ error: err.message }));
    return true; // resposta assíncrona
  }

  if (msg && msg.type === 'REPORT' && sender.tab && sender.tab.id != null) {
    const counts = msg.counts || { warn: 0, danger: 0 };
    const flagged = (counts.warn || 0) + (counts.danger || 0);
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: flagged ? String(flagged) : '' });
    chrome.action.setBadgeBackgroundColor({
      tabId: sender.tab.id,
      color: counts.danger ? '#C62828' : '#B7791F'
    });
  }
});

async function lookup(urls) {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey) return { error: 'NO_KEY' };

  const now = Date.now();
  const threats = {};
  const pending = [];

  for (const url of new Set(urls)) {
    const hit = cache.get(url);
    if (hit && now - hit.ts < CACHE_TTL_MS) {
      if (hit.threats.length) threats[url] = hit.threats;
    } else {
      pending.push(url);
    }
  }

  if (cache.size > CACHE_MAX_ENTRIES) cache.clear();

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const res = await fetch(SB_ENDPOINT + '?key=' + encodeURIComponent(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: {
          clientId: 'linkok-extension',
          clientVersion: chrome.runtime.getManifest().version
        },
        threatInfo: {
          threatTypes: [
            'MALWARE',
            'SOCIAL_ENGINEERING',
            'UNWANTED_SOFTWARE',
            'POTENTIALLY_HARMFUL_APPLICATION'
          ],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: batch.map((url) => ({ url }))
        }
      })
    });

    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = (body.error && body.error.message) || '';
      } catch (_) {
        /* resposta sem JSON */
      }
      throw new Error('HTTP ' + res.status + (detail ? ' – ' + detail : ''));
    }

    const data = await res.json();
    const found = {};
    for (const match of data.matches || []) {
      const key = match.threat && match.threat.url;
      if (!key) continue;
      const list = (found[key] = found[key] || []);
      if (!list.includes(match.threatType)) list.push(match.threatType);
    }

    for (const url of batch) {
      const list = found[url] || [];
      cache.set(url, { ts: now, threats: list });
      if (list.length) threats[url] = list;
    }
  }

  return { threats };
}
