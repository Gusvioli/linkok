'use strict';

const $ = (selector) => document.querySelector(selector);
const DEFAULTS = { auto: true, markSafe: false, blockDanger: true };

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ? tab.id : null;
}

async function askPage(type) {
  const tabId = await activeTabId();
  if (tabId == null) return null;
  try {
    return await chrome.tabs.sendMessage(tabId, { type });
  } catch (_) {
    return null; // página sem content script (chrome://, Web Store, aba antiga)
  }
}

function setVerdict(level, title, detail) {
  const box = $('#verdict');
  box.className = level;
  $('#verdict-title').textContent = title;
  $('#verdict-detail').textContent = detail;
}

function plural(n, one, many) {
  return n + ' ' + (n === 1 ? one : many);
}

function render(report) {
  const list = $('#flagged');
  list.replaceChildren();
  $('#tally').hidden = true;
  $('#sb-status').textContent = '';
  $('#sb-status').className = '';

  if (!report) {
    setVerdict(
      '',
      'Não foi possível verificar esta página',
      'Páginas internas do Chrome e a Chrome Web Store não permitem extensões. Em outras páginas, recarregue a aba e tente de novo.'
    );
    return;
  }

  if (!report.scanned) {
    setVerdict('', 'Página ainda não verificada', 'A verificação automática está desligada. Use "Verificar agora".');
    return;
  }

  const { danger, warn, ok } = report.counts;
  $('#n-danger').textContent = danger;
  $('#n-warn').textContent = warn;
  $('#n-ok').textContent = ok;
  $('#tally').hidden = false;

  if (danger) {
    setVerdict('danger', plural(danger, 'link perigoso', 'links perigosos'), 'Evite clicar neles. Veja os motivos abaixo.');
  } else if (warn) {
    setVerdict('warn', plural(warn, 'link suspeito', 'links suspeitos'), 'Confira o endereço antes de clicar.');
  } else {
    setVerdict(
      'ok',
      'Nenhum alerta encontrado',
      report.total + ' links analisados. Isso reduz o risco, mas não garante que todos sejam seguros.'
    );
  }

  for (const item of report.flagged) {
    const li = document.createElement('li');
    li.className = item.level;

    const url = document.createElement('span');
    url.className = 'f-url';
    url.textContent = item.url;
    url.title = item.url;

    const reasons = document.createElement('ul');
    reasons.className = 'f-reasons';
    for (const reason of item.reasons) {
      const r = document.createElement('li');
      r.textContent = reason;
      reasons.appendChild(r);
    }

    li.append(url, reasons);
    list.appendChild(li);
  }

  const status = $('#sb-status');
  if (report.sbStatus === 'ok') {
    status.textContent = 'Google Safe Browsing: consulta ativa.';
  } else if (report.sbStatus === 'error') {
    status.textContent = 'Google Safe Browsing indisponível (' + report.sbError + '). Usando só a análise local.';
    status.className = 'error';
  } else {
    status.textContent = 'Análise local do endereço. Adicione uma chave da API nas configurações para consultar o Google Safe Browsing.';
  }
}

async function loadSettings() {
  const stored = await chrome.storage.local.get([...Object.keys(DEFAULTS), 'apiKey']);
  const s = { ...DEFAULTS, ...stored };
  $('#opt-auto').checked = s.auto;
  $('#opt-block').checked = s.blockDanger;
  $('#opt-safe').checked = s.markSafe;
  $('#api-key').placeholder = stored.apiKey ? 'Chave salva (cole outra para trocar)' : 'Cole sua chave aqui';
}

$('#opt-auto').addEventListener('change', (e) => chrome.storage.local.set({ auto: e.target.checked }));
$('#opt-block').addEventListener('change', (e) => chrome.storage.local.set({ blockDanger: e.target.checked }));
$('#opt-safe').addEventListener('change', (e) => chrome.storage.local.set({ markSafe: e.target.checked }));

$('#save-key').addEventListener('click', async () => {
  const input = $('#api-key');
  const key = input.value.trim();
  const msg = $('#key-msg');
  if (!key) {
    await chrome.storage.local.remove('apiKey');
    msg.textContent = 'Chave removida. A extensão usará só a análise local.';
  } else {
    await chrome.storage.local.set({ apiKey: key });
    msg.textContent = 'Chave salva. Verificando a página…';
  }
  input.value = '';
  await loadSettings();
  render(await askPage('RESCAN'));
});

$('#rescan').addEventListener('click', async () => {
  const button = $('#rescan');
  button.disabled = true;
  render(await askPage('RESCAN'));
  button.disabled = false;
});

(async () => {
  await loadSettings();
  render(await askPage('GET_REPORT'));
})();
