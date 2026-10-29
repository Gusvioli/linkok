(() => {
  'use strict';
  if (window.__linkOkLoaded) return;
  window.__linkOkLoaded = true;

  const LG = globalThis.LinkOK;
  const DEFAULTS = { auto: true, markSafe: false, blockDanger: true };
  const LEVEL_RANK = { ok: 0, warn: 1, danger: 2 };
  const MAX_LINKS = 3000;
  const DEBOUNCE_MS = 800;
  const BACKOFF_MS = 60 * 1000;

  let settings = { ...DEFAULTS };
  let hasScanned = false;
  let scanning = false;
  let rescanQueued = false;
  let timer = null;

  // Estado da consulta ao Google Safe Browsing
  let sbStatus = 'off'; // 'off' | 'ok' | 'error'
  let sbError = '';
  let sbDisabled = false; // sem chave de API configurada
  let sbBackoffUntil = 0;
  const sbChecked = new Set();
  const sbThreats = new Map(); // url -> tipos de ameaça

  const marks = new WeakMap(); // <a> -> { level, reasons }
  let lastReport = emptyReport();

  function emptyReport() {
    return {
      scanned: false,
      total: 0,
      counts: { ok: 0, warn: 0, danger: 0 },
      flagged: [],
      sbStatus: 'off',
      sbError: ''
    };
  }

  async function loadSettings() {
    const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
    settings = { ...DEFAULTS, ...stored };
  }

  function collectLinks() {
    const items = [];
    for (const a of document.querySelectorAll('a[href]')) {
      if (items.length >= MAX_LINKS) break;
      if (!(a instanceof HTMLAnchorElement)) continue; // ignora <a> de SVG
      if (!/^https?:/i.test(a.href)) continue;
      const text = (a.textContent || '').trim().slice(0, 200) || a.getAttribute('aria-label') || '';
      items.push({ el: a, url: a.href, text });
    }
    return items;
  }

  async function lookupSafeBrowsing(urls) {
    if (sbDisabled || Date.now() < sbBackoffUntil) return;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'SB_LOOKUP', urls });
      if (!res) throw new Error('sem resposta da extensão');
      if (res.error === 'NO_KEY') {
        sbDisabled = true;
        sbStatus = 'off';
        return;
      }
      if (res.error) throw new Error(res.error);
      for (const url of urls) {
        sbChecked.add(url);
        const threats = res.threats[url];
        if (threats && threats.length) sbThreats.set(url, threats);
      }
      sbStatus = 'ok';
      sbError = '';
    } catch (err) {
      sbStatus = 'error';
      sbError = err.message;
      sbBackoffUntil = Date.now() + BACKOFF_MS;
    }
  }

  function clearMark(el) {
    el.removeAttribute('data-linkok');
    if (el.hasAttribute('data-lg-title')) {
      const original = el.getAttribute('data-lg-title');
      if (original) el.setAttribute('title', original);
      else el.removeAttribute('title');
      el.removeAttribute('data-lg-title');
    }
    marks.delete(el);
  }

  function mark(el, level, reasons) {
    if (level === 'ok' && !settings.markSafe) {
      if (el.hasAttribute('data-linkok')) clearMark(el);
      return;
    }
    if (!el.hasAttribute('data-lg-title')) {
      el.setAttribute('data-lg-title', el.getAttribute('title') || '');
    }
    const original = el.getAttribute('data-lg-title');
    const heading =
      level === 'danger'
        ? '⚠ LinkOK: link perigoso'
        : level === 'warn'
          ? '⚠ LinkOK: link suspeito'
          : '✓ LinkOK: nenhum alerta encontrado';
    const detail = reasons.length ? '\n• ' + reasons.join('\n• ') : '';
    el.setAttribute('data-linkok', level);
    el.setAttribute('title', heading + detail + (original ? '\n\n' + original : ''));
    marks.set(el, { level, reasons });
  }

  function apply(items) {
    const byUrl = new Map(); // url -> { url, text, level, reasons }

    for (const { el, url, text } of items) {
      const result = LG.analyze(url, { text, pageUrl: location.href });
      let level = result.level;
      const reasons = result.reasons.slice();

      const threats = sbThreats.get(url);
      if (threats) {
        level = 'danger';
        reasons.unshift('Google Safe Browsing: ' + threats.map(LG.threatLabel).join(', '));
      }

      mark(el, level, reasons);

      const prev = byUrl.get(url);
      if (!prev || LEVEL_RANK[level] > LEVEL_RANK[prev.level]) {
        byUrl.set(url, { url, text, level, reasons });
      }
    }

    const counts = { ok: 0, warn: 0, danger: 0 };
    const flagged = [];
    for (const entry of byUrl.values()) {
      counts[entry.level]++;
      if (entry.level !== 'ok') flagged.push(entry);
    }
    flagged.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);

    lastReport = {
      scanned: true,
      total: byUrl.size,
      counts,
      flagged: flagged.slice(0, 100),
      sbStatus,
      sbError
    };
    chrome.runtime.sendMessage({ type: 'REPORT', counts }).catch(() => {});
  }

  async function scan() {
    if (scanning) {
      rescanQueued = true;
      return;
    }
    scanning = true;
    try {
      const items = collectLinks();
      const fresh = [...new Set(items.map((i) => i.url))].filter((u) => !sbChecked.has(u));
      if (fresh.length) await lookupSafeBrowsing(fresh);
      apply(items);
      hasScanned = true;
    } finally {
      scanning = false;
      if (rescanQueued) {
        rescanQueued = false;
        schedule(300);
      }
    }
  }

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(scan, delay);
  }

  // Links adicionados depois do carregamento (SPAs, rolagem infinita etc.)
  const observer = new MutationObserver((mutations) => {
    if (!settings.auto) return;
    for (const m of mutations) {
      if (m.type === 'attributes') return schedule(DEBOUNCE_MS);
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if ((node.matches && node.matches('a[href]')) || (node.querySelector && node.querySelector('a[href]'))) {
          return schedule(DEBOUNCE_MS);
        }
      }
    }
  });

  // Pede confirmação antes de abrir um link marcado como perigoso.
  function guardClick(event) {
    if (!settings.blockDanger || !(event.target instanceof Element)) return;
    const a = event.target.closest('a[data-linkok="danger"]');
    if (!a) return;
    const info = marks.get(a);
    const reasons = info ? info.reasons.map((r) => '• ' + r).join('\n') : '';
    const ok = window.confirm(
      'LinkOK: este link foi marcado como PERIGOSO.\n\n' + reasons + '\n\nDeseja continuar mesmo assim?'
    );
    if (!ok) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  document.addEventListener('click', guardClick, true);
  document.addEventListener('auxclick', guardClick, true);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === 'GET_REPORT') {
      sendResponse(lastReport);
    } else if (msg.type === 'RESCAN') {
      scan().then(() => sendResponse(lastReport));
      return true;
    }
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes.apiKey) {
      sbDisabled = false;
      sbBackoffUntil = 0;
      sbChecked.clear();
      sbThreats.clear();
    }
    await loadSettings();
    if (settings.auto || hasScanned) schedule(100);
  });

  (async () => {
    await loadSettings();
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href']
    });
    if (settings.auto) scan();
  })();
})();
