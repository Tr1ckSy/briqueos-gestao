const API = 'http://localhost:8000';
let usuario = null;

function init() {
  const token = localStorage.getItem('bq_token');
  if (!token) { window.location.href = 'login.html'; return; }
  const raw = localStorage.getItem('bq_usuario');
  if (raw) populateUI(JSON.parse(raw));
  fetchMe();
  const t = localStorage.getItem('bq_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', t);
}

async function fetchMe() {
  const token = localStorage.getItem('bq_token');
  try {
    const r = await fetch(`${API}/auth/me`, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) { logout(); return; }
    const data = await r.json();
    localStorage.setItem('bq_usuario', JSON.stringify(data));
    populateUI(data);
  } catch (e) {}
}

function populateUI(u) {
  usuario = u;
  const initials = getInitials(u.nome);
  const fotoUrl = localStorage.getItem('bq_foto_' + u.id) || u.foto_url || null;

  document.getElementById('hero-nome').textContent = u.nome;
  document.getElementById('hero-email').textContent = u.email;
  document.getElementById('hero-init').textContent = initials;
  if (fotoUrl) {
    const img = document.getElementById('hero-img');
    img.src = fotoUrl;
    img.classList.add('loaded');
    document.getElementById('hero-init').style.display = 'none';
  }

  document.getElementById('sf-nome').textContent = u.nome;
  document.getElementById('sf-init').textContent = initials;
  const sfImg = document.getElementById('sf-img');
  if (fotoUrl) { sfImg.src = fotoUrl; sfImg.style.display = 'block'; document.getElementById('sf-init').style.display = 'none'; }

  if (u.criado_em) {
    const d = new Date(u.criado_em);
    document.getElementById('hm-since').textContent = 'Membro desde ' + d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
  }

  document.getElementById('f-email').value = u.email;
  document.getElementById('f-nome').value = u.nome;

  const plano = u.plano || 'gratis';
  const chip = document.getElementById('plano-chip');
  const sfLbl = document.getElementById('sf-plano-label');
  const planoLabels = { gratis: 'Grátis', pro: 'Pro ⚡', business: 'Business 🏢' };
  const planoColors = {
    gratis: { color: '#FF6B2B', bg: 'rgba(255,107,43,0.08)', border: 'rgba(255,107,43,0.3)' },
    pro: { color: '#00D48A', bg: 'rgba(0,212,138,0.08)', border: 'rgba(0,212,138,0.3)' },
    business: { color: '#A855F7', bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.3)' },
  };
  const pc = planoColors[plano] || planoColors.gratis;
  if (chip) {
    chip.textContent = planoLabels[plano] || plano;
    chip.style.cssText = `color:${pc.color};border-color:${pc.border};background:${pc.bg};`;
  }
  if (sfLbl) sfLbl.textContent = planoLabels[plano] || 'Revendedor';

  renderPlanoCard(u);
}

function getInitials(nome) {
  if (!nome) return '?';
  return nome.trim().split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

function handleAvatarChange(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  if (file.size > 5 * 1024 * 1024) { toast('Imagem muito grande (máx 5MB)', 'err'); return; }
  if (!file.type.startsWith('image/')) { toast('Formato inválido', 'err'); return; }

  const reader = new FileReader();
  reader.onload = function (e) {
    const base64 = e.target.result;
    const heroImg = document.getElementById('hero-img');
    heroImg.src = base64;
    heroImg.classList.add('loaded');
    document.getElementById('hero-init').style.display = 'none';
    const sfImg = document.getElementById('sf-img');
    sfImg.src = base64;
    sfImg.style.display = 'block';
    document.getElementById('sf-init').style.display = 'none';
    uploadFoto(base64);
  };
  reader.readAsDataURL(file);
}

async function uploadFoto(base64) {
  const prog = document.getElementById('upload-prog');
  const bar = document.getElementById('up-bar');
  const lbl = document.getElementById('up-label');
  prog.classList.add('show');
  lbl.textContent = 'Enviando foto...';
  bar.style.width = '30%';

  const token = localStorage.getItem('bq_token');
  try {
    await new Promise(r => setTimeout(r, 300));
    bar.style.width = '65%';
    const r = await fetch(`${API}/auth/me/foto`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ foto_url: base64 })
    });
    bar.style.width = '100%';
    if (r.ok) {
      if (usuario) localStorage.setItem('bq_foto_' + usuario.id, base64);
      lbl.textContent = '✓ Foto salva!';
      toast('Foto de perfil atualizada!', 'ok');
    } else {
      if (usuario) localStorage.setItem('bq_foto_' + usuario.id, base64);
      lbl.textContent = '✓ Foto salva localmente';
      toast('Foto salva localmente', 'ok');
    }
  } catch (e) {
    bar.style.width = '100%';
    if (usuario) localStorage.setItem('bq_foto_' + usuario.id, base64);
    lbl.textContent = '✓ Foto salva localmente';
  }
  setTimeout(() => { prog.classList.remove('show'); bar.style.width = '0'; }, 2000);
}

async function salvarNome() {
  const nome = document.getElementById('f-nome').value.trim();
  hideAlerts('nome');
  if (!nome || nome.length < 2) { showAlert('nome', 'err', 'Nome deve ter ao menos 2 caracteres'); return; }
  const btn = document.getElementById('btn-nome');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Salvando...';
  const token = localStorage.getItem('bq_token');
  try {
    const r = await fetch(`${API}/auth/me/nome`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ nome })
    });
    if (r.ok) {
      const u = await r.json();
      localStorage.setItem('bq_usuario', JSON.stringify(u));
      populateUI(u);
      showAlert('nome', 'ok');
      toast('Nome atualizado!', 'ok');
    } else {
      const d = await r.json();
      showAlert('nome', 'err', d.detail || 'Erro ao salvar nome');
    }
  } catch (e) { showAlert('nome', 'err', 'Não foi possível conectar ao servidor'); }
  finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Salvar nome`;
  }
}

async function salvarSenha() {
  const atual = document.getElementById('s-atual').value;
  const nova = document.getElementById('s-nova').value;
  const conf = document.getElementById('s-conf').value;
  hideAlerts('senha');
  if (!atual) { showAlert('senha', 'err', 'Informe sua senha atual'); return; }
  if (!nova || nova.length < 6) { showAlert('senha', 'err', 'Nova senha deve ter ao menos 6 caracteres'); return; }
  if (nova !== conf) { showAlert('senha', 'err', 'As senhas não coincidem'); return; }
  if (nova === atual) { showAlert('senha', 'err', 'A nova senha deve ser diferente da atual'); return; }

  const btn = document.getElementById('btn-senha');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Verificando...';
  const token = localStorage.getItem('bq_token');
  try {
    const r = await fetch(`${API}/auth/me/senha`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ senha_atual: atual, nova_senha: nova })
    });
    if (r.ok) {
      showAlert('senha', 'ok');
      document.getElementById('s-atual').value = '';
      document.getElementById('s-nova').value = '';
      document.getElementById('s-conf').value = '';
      document.getElementById('pw-strength').classList.remove('show');
      document.getElementById('conf-hint').style.display = 'none';
      toast('Senha alterada com sucesso!', 'ok');
    } else {
      const d = await r.json();
      showAlert('senha', 'err', d.detail || 'Erro ao alterar senha');
    }
  } catch (e) { showAlert('senha', 'err', 'Não foi possível conectar ao servidor'); }
  finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Alterar senha`;
  }
}

function checkStrength(v) {
  const el = document.getElementById('pw-strength');
  const lbl = document.getElementById('pw-label');
  const bars = [1, 2, 3, 4].map(i => document.getElementById('pb' + i));
  if (!v) { el.classList.remove('show'); return; }
  el.classList.add('show');
  let score = 0;
  if (v.length >= 6) score++;
  if (v.length >= 10) score++;
  if (/[A-Z]/.test(v) && /[0-9]/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  const levels = ['weak', 'fair', 'good', 'strong'];
  const labels = ['Fraca', 'Razoável', 'Boa', 'Forte'];
  const level = levels[score - 1] || 'weak';
  bars.forEach((b, i) => { b.className = 'pw-bar' + (i < score ? ' active ' + level : ''); });
  lbl.className = 'pw-label ' + (score > 0 ? level : '');
  lbl.textContent = score > 0 ? labels[score - 1] : '—';
}

function checkConfirm() {
  const nova = document.getElementById('s-nova').value;
  const conf = document.getElementById('s-conf').value;
  const hint = document.getElementById('conf-hint');
  if (!conf) { hint.style.display = 'none'; return; }
  hint.style.display = 'block';
  if (nova === conf) { hint.style.color = 'var(--green)'; hint.textContent = '✓ Senhas coincidem'; }
  else { hint.style.color = 'var(--red)'; hint.textContent = '✗ Senhas não coincidem'; }
}

function togglePw(id, btn) {
  const input = document.getElementById(id);
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.querySelector('svg').innerHTML = isText
    ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
    : '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
}

function showAlert(prefix, type, msg) {
  if (type === 'err') {
    const el = document.getElementById(prefix + '-err');
    document.getElementById(prefix + '-err-txt').textContent = msg;
    el.classList.add('show');
  } else {
    document.getElementById(prefix + '-ok').classList.add('show');
  }
}

function hideAlerts(prefix) {
  document.getElementById(prefix + '-err').classList.remove('show');
  document.getElementById(prefix + '-ok').classList.remove('show');
}

function toast(msg, type = 'ok') {
  const wrap = document.getElementById('toast-wrap');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  const icon = type === 'ok'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  t.innerHTML = icon + msg;
  wrap.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3000);
}

async function renderPlanoCard(u) {
  const token = localStorage.getItem('bq_token');
  let planoInfo = null;
  try {
    const r = await fetch(`${API}/meu-plano`, { headers: { Authorization: 'Bearer ' + token } });
    if (r.ok) planoInfo = await r.json();
  } catch (e) {}

  const plano = planoInfo?.plano || u.plano || 'gratis';
  const expira = planoInfo?.plano_expira || u.plano_expira || null;
  const usadas = planoInfo?.compras_usadas || 0;
  const limite = planoInfo?.compras_limite || 15;

  let diasRestantes = null;
  let expirado = false;
  if (expira && plano !== 'gratis') {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const exp = new Date(expira + 'T00:00:00');
    diasRestantes = Math.ceil((exp - hoje) / 86400000);
    if (diasRestantes < 0) { expirado = true; diasRestantes = 0; }
  }

  const planoReal = expirado ? 'gratis' : plano;

  const cfg = {
    gratis: { label: 'Grátis', cor: '#FF6B2B', bg: 'rgba(255,107,43,0.08)', border: 'rgba(255,107,43,0.18)', badgeBg: 'rgba(255,107,43,0.12)', badgeColor: '#FF6B2B' },
    pro: { label: 'Pro ⚡', cor: '#00D48A', bg: 'rgba(0,212,138,0.07)', border: 'rgba(0,212,138,0.18)', badgeBg: 'rgba(0,212,138,0.12)', badgeColor: '#00D48A' },
    business: { label: 'Business 🏢', cor: '#A855F7', bg: 'rgba(168,85,247,0.07)', border: 'rgba(168,85,247,0.18)', badgeBg: 'rgba(168,85,247,0.12)', badgeColor: '#A855F7' },
  };
  const c = cfg[planoReal] || cfg.gratis;

  const badge = document.getElementById('plano-badge');
  if (badge) {
    badge.textContent = expirado ? '⚠ Expirado' : c.label;
    badge.style.cssText = `font-size:11px;font-weight:700;padding:5px 14px;border-radius:20px;display:inline-block;background:${expirado ? 'rgba(255,77,106,0.12)' : c.badgeBg};color:${expirado ? '#FF4D6A' : c.badgeColor};border:1px solid ${expirado ? 'rgba(255,77,106,0.2)' : c.border};`;
  }

  const sub = document.getElementById('plano-sub');
  if (sub) sub.textContent = expirado
    ? 'Seu plano expirou — renove para retomar o acesso premium'
    : plano === 'gratis'
      ? `${usadas} de ${limite} compras utilizadas`
      : diasRestantes === 1
        ? 'Plano expira amanhã!'
        : `Plano ativo · expira em ${diasRestantes} dias`;

  const body = document.getElementById('plano-body');
  if (!body) return;

  if (planoReal === 'gratis') {
    const pct = Math.min(usadas / limite * 100, 100);
    const barColor = pct >= 90 ? '#FF4D6A' : pct >= 60 ? '#FFB800' : '#00D48A';
    body.innerHTML = `<div style="margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:12px;color:var(--txt2);">Compras utilizadas</span>
        <span style="font-size:13px;font-weight:800;color:${barColor};">${usadas} <span style="font-weight:400;color:var(--txt3);">/ ${limite}</span></span>
      </div>
      <div style="height:8px;background:var(--bg4);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${barColor};border-radius:4px;transition:width .6s ease;box-shadow:0 0 8px ${barColor}60;"></div>
      </div>
      ${pct >= 90 ? `<div style="font-size:11px;color:#FF4D6A;margin-top:6px;font-weight:600;">⚠ Quase no limite — faça upgrade para continuar cadastrando</div>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <a href="planos.html" style="display:block;text-align:center;background:linear-gradient(135deg,#FF6B2B,#FF3D00);color:#fff;font-size:12px;font-weight:700;padding:11px 16px;border-radius:10px;text-decoration:none;">⚡ Pro — R$ 29/mês</a>
      <a href="planos.html" style="display:block;text-align:center;background:linear-gradient(135deg,#A855F7,#7C3AED);color:#fff;font-size:12px;font-weight:700;padding:11px 16px;border-radius:10px;text-decoration:none;">🏢 Business — R$ 79/mês</a>
    </div>`;
    return;
  }

  if (expirado) {
    body.innerHTML = `<div style="background:rgba(255,77,106,0.07);border:1px solid rgba(255,77,106,0.2);border-radius:12px;padding:20px;text-align:center;margin-bottom:16px;">
      <div style="font-size:28px;margin-bottom:10px;">⏰</div>
      <div style="font-size:14px;font-weight:700;color:#FF4D6A;margin-bottom:6px;">Plano ${cfg[plano]?.label || plano} expirado</div>
      <div style="font-size:12px;color:var(--txt2);line-height:1.6;">Renove agora para retomar o acesso premium.</div>
    </div>
    <a href="planos.html" style="display:block;text-align:center;background:linear-gradient(135deg,#FF6B2B,#FF3D00);color:#fff;font-size:13px;font-weight:700;padding:13px;border-radius:10px;text-decoration:none;">Renovar plano →</a>`;
    return;
  }

  const diasColor = diasRestantes <= 5 ? '#FF4D6A' : diasRestantes <= 10 ? '#FFB800' : c.cor;
  const pctDias = Math.min((diasRestantes || 0) / 30 * 100, 100);
  const featsPro = ['Compras ilimitadas', 'Relatórios avançados', 'Exportação CSV', 'Foto dos produtos', 'Alertas de estoque', 'Suporte via app'];
  const featsBiz = ['Tudo do Pro incluído', 'Até 5 usuários', 'Backup diário', 'API de integração', 'Relatórios custom', 'WhatsApp prioritário'];
  const feats = plano === 'business' ? featsBiz : featsPro;

  body.innerHTML = `${diasRestantes !== null ? `<div style="margin-bottom:20px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span style="font-size:12px;color:var(--txt2);">Dias restantes</span>
      <span style="font-size:15px;font-weight:900;color:${diasColor};font-family:'Syne',sans-serif;">${diasRestantes}<span style="font-size:11px;font-weight:500;color:var(--txt3);"> dias</span></span>
    </div>
    <div style="height:8px;background:var(--bg4);border-radius:4px;overflow:hidden;">
      <div style="height:100%;width:${pctDias}%;background:${diasColor};border-radius:4px;box-shadow:0 0 8px ${diasColor}60;"></div>
    </div>
    ${diasRestantes <= 5 ? `<div style="font-size:11px;color:#FF4D6A;margin-top:6px;font-weight:600;">⚠ Plano expira em breve</div>` : ''}
  </div>` : ''}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;">
    <div style="background:${c.bg};border:1px solid ${c.border};border-radius:10px;padding:14px;">
      <div style="font-size:10px;color:${c.cor};text-transform:uppercase;letter-spacing:.8px;font-weight:700;margin-bottom:6px;">Plano</div>
      <div style="font-size:15px;font-weight:800;color:var(--txt);font-family:'Syne',sans-serif;">${c.label}</div>
    </div>
    <div style="background:var(--bg4);border:1px solid var(--border);border-radius:10px;padding:14px;">
      <div style="font-size:10px;color:var(--txt3);text-transform:uppercase;letter-spacing:.8px;font-weight:700;margin-bottom:6px;">Expira em</div>
      <div style="font-size:15px;font-weight:800;color:var(--txt);font-family:'Syne',sans-serif;">${expira ? new Date(expira + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:18px;">
    ${feats.map(f => `<div style="display:flex;align-items:center;gap:7px;font-size:11px;color:var(--txt2);">
      <span style="width:18px;height:18px;border-radius:5px;background:${c.bg};border:1px solid ${c.border};display:inline-flex;align-items:center;justify-content:center;font-size:10px;color:${c.cor};flex-shrink:0;">✓</span>${f}</div>`).join('')}
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;padding-top:16px;border-top:1px solid var(--border);">
    <span style="font-size:11px;color:var(--txt3);">Renove antes de expirar.</span>
    <a href="planos.html" style="font-size:11px;font-weight:700;color:${c.cor};text-decoration:none;background:${c.bg};border:1px solid ${c.border};padding:6px 14px;border-radius:8px;">Renovar →</a>
  </div>`;
}

const SECTION_TITLES = { perfil: 'Meu Perfil', seguranca: 'Segurança', plano: 'Meu Plano' };

function gotoSection(id, el) {
  document.querySelectorAll('.psec').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.ni[id^="nav-"]').forEach(n => n.classList.remove('active'));
  document.getElementById('sec-' + id)?.classList.add('active');
  if (el) el.classList.add('active');
  const pt = document.getElementById('page-title');
  if (pt) pt.textContent = SECTION_TITLES[id] || id;
  closeSidebar();
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sb-overlay');
  sb.classList.toggle('open');
  ov.classList.toggle('active', sb.classList.contains('open'));
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sb-overlay')?.classList.remove('active');
}

function irParaApp() { window.location.href = 'index.html'; }
function logout() { localStorage.removeItem('bq_token'); localStorage.removeItem('bq_usuario'); window.location.href = 'login.html'; }

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.activeElement && ['f-nome'].includes(document.activeElement.id)) salvarNome();
    if (document.activeElement && ['s-atual', 's-nova', 's-conf'].includes(document.activeElement.id)) salvarSenha();
  }
});

init();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});