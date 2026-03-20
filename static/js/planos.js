const API = 'http://localhost:8000';
const _token   = localStorage.getItem('bq_token');
const _usuario = JSON.parse(localStorage.getItem('bq_usuario') || 'null');
function authH() { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (_token || '') }; }

let billing = 'mensal';
const PRICES = { pro: { mensal: 29, anual: 20, anualTotal: 243 }, biz: { mensal: 79, anual: 55, anualTotal: 663 } };

function setBilling(b) {
  billing = b;
  document.getElementById('btn-mensal').classList.toggle('active', b === 'mensal');
  document.getElementById('btn-anual').classList.toggle('active', b === 'anual');
  const a = b === 'anual';
  document.getElementById('pro-amt').textContent = a ? PRICES.pro.anual : PRICES.pro.mensal;
  document.getElementById('biz-amt').textContent = a ? PRICES.biz.anual : PRICES.biz.mensal;
  document.getElementById('pro-save').textContent = a ? 'R$ 243/ano — economia de R$ 105' : '';
  document.getElementById('biz-save').textContent = a ? 'R$ 663/ano — economia de R$ 285' : '';
  document.getElementById('pro-btn').textContent = a ? 'Assinar Pro — R$ 243/ano' : 'Assinar Pro — R$ 29/mês';
  document.getElementById('biz-btn').textContent = a ? 'Assinar Business — R$ 663/ano' : 'Assinar Business — R$ 79/mês';
}

function toggleFaq(el) { el.classList.toggle('open'); }

let _plano = 'pro', _txId = null, _poll = null, _timer = null;

function openPix(plano) {
  _plano = plano;
  if (!_token) {
    toast('Faça login primeiro!', false);
    setTimeout(() => window.location.href = 'login.html', 1500);
    return;
  }
  const a = billing === 'anual';
  const prices = { pro: { m: 29, a: 243 }, biz: { m: 79, a: 663 } };
  const p = plano === 'pro' ? prices.pro : prices.biz;
  const val = a ? p.a : p.m;
  const dias = a ? '365 dias' : '30 dias';
  document.getElementById('pix-title').textContent = plano === 'pro' ? 'Assinar Plano Pro' : 'Assinar Business';
  document.getElementById('pix-desc').textContent = `Plano ${plano === 'pro' ? 'Pro' : 'Business'} — ${dias}`;
  document.getElementById('pix-price').textContent = `R$ ${val},00`;
  document.getElementById('pix-form').style.display = 'block';
  document.getElementById('pix-qr').style.display = 'none';
  document.getElementById('pix-nome').value = _usuario?.nome || '';
  document.getElementById('pix-cpf').value = '';
  const btn = document.getElementById('pix-btn');
  btn.disabled = false; btn.textContent = 'Gerar QR Code PIX';
  document.getElementById('ov-pix').classList.add('open');
}

function closePix() {
  document.getElementById('ov-pix').classList.remove('open');
  clearInterval(_poll); clearInterval(_timer); _txId = null;
}

async function gerarPix() {
  const nome = document.getElementById('pix-nome').value.trim();
  const cpf  = document.getElementById('pix-cpf').value.replace(/\D/g, '');
  if (!nome) { toast('Informe seu nome', false); return; }
  if (cpf.length !== 11) { toast('CPF inválido — 11 dígitos', false); return; }

  const btn = document.getElementById('pix-btn');
  btn.disabled = true;
  btn.innerHTML = '<svg style="animation:spin .6s linear infinite" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Gerando...';

  try {
    const r = await fetch(`${API}/pagamento/pix`, {
      method: 'POST', headers: authH(),
      body: JSON.stringify({ nome, cpf, plano: _plano, tipo: billing })
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || 'Erro ao gerar PIX'); }
    const data = await r.json();
    const raw = data.raw || data;
    _txId = data.transaction_id || raw.id;
    const pixChave  = data.qr_code  || raw.qrCodeText;
    const pixImagem = data.qr_image || raw.qrCodeBase64;

    document.getElementById('pix-form').style.display = 'none';
    document.getElementById('pix-qr').style.display = 'block';

    const img = document.getElementById('pix-img');
    const ld  = document.getElementById('pix-loading');
    if (pixImagem) {
      img.src = 'data:image/png;base64,' + pixImagem;
      img.style.display = 'block';
      ld.style.display = 'none';
    } else {
      ld.textContent = 'Use a chave Copia e Cola abaixo';
    }

    document.getElementById('pix-key').textContent = pixChave || 'Chave não disponível';

    let seg = data.expires_in || 600;
    clearInterval(_timer);
    _timer = setInterval(() => {
      seg--;
      const m = String(Math.floor(seg / 60)).padStart(2, '0'), s = String(seg % 60).padStart(2, '0');
      const el = document.getElementById('pix-countdown');
      if (el) el.textContent = `${m}:${s}`;
      if (seg <= 0) { clearInterval(_timer); const st = document.getElementById('pix-status'); if (st) st.textContent = 'PIX expirado. Feche e gere um novo.'; }
    }, 1000);

    clearInterval(_poll);
    _poll = setInterval(() => checkStatus(_txId), 5000);

  } catch (e) {
    toast('Erro: ' + e.message, false);
    btn.disabled = false; btn.textContent = 'Gerar QR Code PIX';
  }
}

async function checkStatus(id) {
  try {
    const r = await fetch(`${API}/pagamento/pix/status?id=${id}&plano=${_plano}&tipo=${billing}`, { headers: authH() });
    if (!r.ok) return;
    const data = await r.json();
    const st = (data.status || '').toUpperCase();
    const el = document.getElementById('pix-status');
    if (st === 'COMPLETED') {
      clearInterval(_poll); clearInterval(_timer);
      el.style.background = 'var(--gd)'; el.style.color = 'var(--green)';
      el.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="display:inline;vertical-align:middle;margin-right:5px;"><polyline points="20 6 9 17 4 12"/></svg> Pagamento confirmado! Plano ativado.';
      if (_usuario) { _usuario.plano = _plano; localStorage.setItem('bq_usuario', JSON.stringify(_usuario)); }
      setTimeout(() => { closePix(); window.location.href = 'index.html'; }, 2500);
    } else if (st === 'EXPIRED' || st === 'CANCELLED') {
      clearInterval(_poll);
      if (el) el.textContent = 'PIX expirado ou cancelado. Gere um novo.';
    }
  } catch (e) {}
}

function copyPix() {
  const txt = document.getElementById('pix-key').textContent;
  navigator.clipboard.writeText(txt)
    .then(() => toast('Chave PIX copiada!'))
    .catch(() => { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); toast('Copiado!'); });
}

function toast(msg, ok = true) {
  document.getElementById('tdot').style.background = ok ? 'var(--green)' : 'var(--red)';
  document.getElementById('tmsg').textContent = msg;
  const t = document.getElementById('toast');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

document.getElementById('ov-pix').addEventListener('click', function (e) { if (e.target === this) closePix(); });
const _t = localStorage.getItem('bq_theme') || 'dark';
document.documentElement.setAttribute('data-theme', _t);
const s = document.createElement('style');
s.textContent = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
document.head.appendChild(s);