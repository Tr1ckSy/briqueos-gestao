const API = 'http://localhost:8000';
const _resetToken = new URLSearchParams(window.location.search).get('reset_token');

function setLoading(id, on, label) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = on;
  btn.classList.toggle('loading', on);
  if (label) btn.querySelector('.btn-txt').textContent = label;
}

function togglePw(id, btn) {
  const el = document.getElementById(id);
  const show = el.type === 'password';
  el.type = show ? 'text' : 'password';
  btn.querySelector('svg').innerHTML = show
    ? '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
}

function showMsg(id, type, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `msg ${type} show`;
  const sp = el.querySelector('span');
  if (sp && text) sp.textContent = text;
}

function hideAllMsgs() {
  document.querySelectorAll('.msg').forEach(el => el.classList.remove('show'));
}

function switchTab(tab) {
  ['login', 'cadastro', 'forgot', 'reset'].forEach(t => {
    document.getElementById('tab-' + t)?.classList.toggle('active', t === tab);
  });
  const tabs = document.getElementById('auth-tabs');
  if (tabs) tabs.style.display = ['login', 'cadastro'].includes(tab) ? 'flex' : 'none';
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-btn-' + tab)?.classList.add('active');
  const foot = document.getElementById('auth-foot');
  if (foot) foot.innerHTML = {
    login: 'Não tem conta? <span onclick="switchTab(\'cadastro\')">Cadastre-se grátis</span>',
    cadastro: 'Já tem conta? <span onclick="switchTab(\'login\')">Entrar</span>',
    forgot: '<span onclick="switchTab(\'login\')">← Voltar ao login</span>',
    reset: '',
  }[tab] || '';
  hideAllMsgs();
}

function salvarSessao(d) {
  localStorage.setItem('bq_token', d.access_token);
  localStorage.setItem('bq_usuario', JSON.stringify(d.usuario));
}

function irParaApp(u) { window.location.href = u?.is_admin ? 'admin.html' : 'index.html'; }

async function doLogin() {
  hideAllMsgs();
  const email = document.getElementById('l-email').value.trim();
  const senha = document.getElementById('l-senha').value;
  if (!email || !senha) { showMsg('login-err', 'err', 'Preencha e-mail e senha.'); return; }
  setLoading('btn-login', true, 'Entrando...');
  try {
    const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) });
    const d = await r.json();
    if (!r.ok) { showMsg('login-err', 'err', d.detail || 'E-mail ou senha incorretos'); return; }
    salvarSessao(d); irParaApp(d.usuario);
  } catch { showMsg('login-err', 'err', 'Sem conexão com o servidor.'); }
  finally { setLoading('btn-login', false, 'Entrar'); }
}

async function doCadastro() {
  hideAllMsgs();
  const nome = document.getElementById('c-nome').value.trim();
  const email = document.getElementById('c-email').value.trim();
  const senha = document.getElementById('c-senha').value;
  if (!nome || !email || !senha) { showMsg('cad-err', 'err', 'Preencha todos os campos.'); return; }
  if (senha.length < 6) { showMsg('cad-err', 'err', 'Senha deve ter ao menos 6 caracteres.'); return; }
  setLoading('btn-cad', true, 'Criando conta...');
  try {
    const r = await fetch(`${API}/auth/cadastro`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, email, senha }) });
    const d = await r.json();
    if (!r.ok) { showMsg('cad-err', 'err', d.detail || 'Erro ao criar conta'); return; }
    salvarSessao(d); irParaApp(d.usuario);
  } catch { showMsg('cad-err', 'err', 'Sem conexão com o servidor.'); }
  finally { setLoading('btn-cad', false, 'Criar minha conta'); }
}

async function doForgotPassword() {
  hideAllMsgs();
  const email = document.getElementById('f-email').value.trim();
  if (!email || !email.includes('@')) { showMsg('forgot-err', 'err', 'Informe um e-mail válido.'); return; }
  setLoading('btn-forgot', true, 'Enviando...');
  try {
    const r = await fetch(`${API}/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    if (r.ok) {
      showMsg('forgot-ok', 'ok', null);
      setLoading('btn-forgot', false, 'Link enviado!');
    } else {
      const d = await r.json();
      showMsg('forgot-err', 'err', d.detail || 'Erro ao enviar.');
      setLoading('btn-forgot', false, 'Enviar link de redefinição');
    }
  } catch { showMsg('forgot-err', 'err', 'Sem conexão.'); setLoading('btn-forgot', false, 'Enviar link de redefinição'); }
}

async function doResetPassword() {
  hideAllMsgs();
  const nova = document.getElementById('r-senha').value;
  const conf = document.getElementById('r-conf').value;
  if (!nova || nova.length < 6) { showMsg('reset-err', 'err', 'Senha deve ter ao menos 6 caracteres.'); return; }
  if (nova !== conf) { showMsg('reset-err', 'err', 'As senhas não coincidem.'); return; }
  setLoading('btn-reset', true, 'Salvando...');
  try {
    const r = await fetch(`${API}/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: _resetToken, nova_senha: nova }) });
    const d = await r.json();
    if (r.ok) {
      showMsg('reset-ok', 'ok', null);
      setLoading('btn-reset', false, 'Salvo!');
      setTimeout(() => { history.replaceState({}, '', location.pathname); switchTab('login'); }, 2000);
    } else { showMsg('reset-err', 'err', d.detail || 'Token inválido.'); setLoading('btn-reset', false, 'Salvar nova senha'); }
  } catch { showMsg('reset-err', 'err', 'Sem conexão.'); setLoading('btn-reset', false, 'Salvar nova senha'); }
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const id = document.activeElement?.id;
  if (['l-email', 'l-senha'].includes(id)) doLogin();
  if (['c-nome', 'c-email', 'c-senha'].includes(id)) doCadastro();
  if (id === 'f-email') doForgotPassword();
  if (['r-senha', 'r-conf'].includes(id)) doResetPassword();
});

if (_resetToken) { switchTab('reset'); }
else {
  const tok = localStorage.getItem('bq_token');
  const usr = JSON.parse(localStorage.getItem('bq_usuario') || 'null');
  if (tok) irParaApp(usr);
}

document.documentElement.setAttribute('data-theme', localStorage.getItem('bq_theme') || 'dark');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});