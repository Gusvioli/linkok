/*
 * LinkOK – analisador local de links.
 * Funções puras, sem acesso à rede. Carregado como content script
 * (antes de content.js) e testável em Node.
 */
(function (root) {
  'use strict';

  const SHORTENERS = new Set([
    'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly',
    'cutt.ly', 'rebrand.ly', 'shorturl.at', 't.ly', 'rb.gy', 'lnkd.in',
    'tiny.cc', 's.id', 'bit.do'
  ]);

  const SUSPICIOUS_TLDS = new Set([
    'tk', 'ml', 'ga', 'cf', 'gq', 'zip', 'mov', 'top', 'click', 'loan',
    'work', 'rest', 'fit', 'buzz', 'icu', 'cyou'
  ]);

  // Marcas muito imitadas em golpes de phishing (palavra -> domínios oficiais).
  const BRANDS = [
    'paypal', 'google', 'microsoft', 'apple', 'amazon', 'facebook',
    'instagram', 'netflix', 'whatsapp', 'nubank', 'itau', 'bradesco',
    'santander', 'caixa', 'mercadolivre', 'mercadopago'
  ];

  const OFFICIAL_DOMAINS = new Set([
    'google.com', 'google.com.br', 'googleusercontent.com', 'gstatic.com',
    'googleapis.com', 'googlevideo.com', 'microsoft.com', 'microsoftonline.com',
    'live.com', 'office.com', 'apple.com', 'icloud.com', 'amazon.com',
    'amazon.com.br', 'amazonaws.com', 'facebook.com', 'fb.com', 'instagram.com',
    'whatsapp.com', 'whatsapp.net', 'netflix.com', 'paypal.com', 'nubank.com.br',
    'itau.com.br', 'bradesco.com.br', 'santander.com.br', 'caixa.gov.br',
    'mercadolivre.com.br', 'mercadopago.com.br', 'mercadolibre.com'
  ]);

  const SECOND_LEVELS = new Set(['com', 'net', 'org', 'gov', 'edu', 'co', 'ac']);

  const EXECUTABLE_RE = /\.(exe|scr|msi|bat|cmd|apk|jar|vbs|ps1|dmg|pkg)$/i;

  const THREAT_LABELS = {
    MALWARE: 'malware',
    SOCIAL_ENGINEERING: 'phishing / engenharia social',
    UNWANTED_SOFTWARE: 'software indesejado',
    POTENTIALLY_HARMFUL_APPLICATION: 'aplicativo potencialmente nocivo'
  };

  function threatLabel(type) {
    return THREAT_LABELS[type] || type;
  }

  /** Aproximação do "domínio registrável" (sem a Public Suffix List completa). */
  function registrableDomain(host) {
    const parts = host.split('.');
    if (parts.length <= 2) return host;
    const tld = parts[parts.length - 1];
    const sld = parts[parts.length - 2];
    if (tld.length === 2 && SECOND_LEVELS.has(sld)) return parts.slice(-3).join('.');
    return parts.slice(-2).join('.');
  }

  function isIPv4(host) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  }

  function isIPv6(host) {
    return host.startsWith('[');
  }

  /** Se o texto do link parece um endereço, devolve o host dele; senão null. */
  function hostFromLinkText(text) {
    const t = (text || '').trim();
    if (!t || /\s/.test(t) || t.length > 120) return null;
    if (!/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(t)) return null;
    try {
      return new URL(/^https?:\/\//i.test(t) ? t : 'http://' + t).hostname.toLowerCase();
    } catch (_) {
      return null;
    }
  }

  /**
   * Analisa uma URL.
   * @returns {{level:'ok'|'warn'|'danger', score:number, reasons:string[]}}
   *   level 'ok' significa "nenhum alerta encontrado", não "garantidamente seguro".
   */
  function analyze(urlString, opts) {
    const options = opts || {};
    const reasons = [];
    let score = 0;
    const add = (points, message) => {
      score += points;
      reasons.push(message);
    };

    let u;
    try {
      u = new URL(urlString);
    } catch (_) {
      return { level: 'ok', score: 0, reasons: [] };
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { level: 'ok', score: 0, reasons: [] };
    }

    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    const domain = registrableDomain(host);
    const labels = host.split('.');
    const mainLabel = domain.split('.')[0];

    if (isIPv4(host) || isIPv6(host)) {
      add(3, 'O endereço usa um IP numérico em vez de um nome de domínio');
    }

    if (labels.some((l) => l.startsWith('xn--'))) {
      add(3, 'O domínio usa caracteres internacionais (punycode), comum em imitações de sites conhecidos');
    }

    if (u.username || u.password) {
      add(4, 'A URL contém "usuário@" antes do domínio, truque usado para disfarçar o destino real');
      if (u.username.includes('.')) {
        add(2, 'O trecho antes do "@" parece um endereço de site');
      }
    }

    if (u.protocol === 'http:') {
      add(1, 'Conexão sem criptografia (HTTP)');
    }

    if (SHORTENERS.has(host)) {
      add(1, 'Encurtador de link: o destino final fica oculto');
    }

    const tld = labels[labels.length - 1];
    if (SUSPICIOUS_TLDS.has(tld)) {
      add(1, 'Extensão de domínio (.' + tld + ') muito usada em golpes');
    }

    if (labels.length - domain.split('.').length >= 3) {
      add(1, 'Excesso de subdomínios');
    }

    if ((host.match(/-/g) || []).length >= 4) {
      add(1, 'Domínio com muitos hifens');
    }

    if (u.port && u.port !== '80' && u.port !== '443') {
      add(1, 'Porta incomum (' + u.port + ')');
    }

    if (EXECUTABLE_RE.test(u.pathname)) {
      add(2, 'O link baixa um arquivo executável ou instalador');
    }

    // Imitação de marca: nome da marca no endereço, mas o domínio não é o oficial.
    if (!OFFICIAL_DOMAINS.has(domain)) {
      const brand = BRANDS.find((b) => host.includes(b) && mainLabel !== b);
      if (brand) {
        add(3, 'O endereço cita "' + brand + '", mas o domínio real é "' + domain + '"');
      }
    }

    // Texto do link mostra um endereço diferente do destino real.
    const textHost = hostFromLinkText(options.text);
    if (textHost && registrableDomain(textHost) !== domain) {
      add(3, 'O texto do link mostra "' + textHost + '", mas o destino é "' + host + '"');
    }

    const level = score >= 5 ? 'danger' : score >= 2 ? 'warn' : 'ok';
    return { level, score, reasons };
  }

  const api = { analyze, registrableDomain, threatLabel };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LinkOK = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
