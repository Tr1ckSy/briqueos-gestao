/**
 * BriqueOS — Frontend Utilities (versão corrigida)
 * 
 * Correções incluídas:
 *   1. sanitize(): previne XSS em todas as interpolações de HTML
 *   2. Lookups O(1) via Map em vez de Array.find() em loop
 *   3. API_URL via variável de ambiente (injetada no build ou meta tag)
 *   4. Debounce para filtros de busca (evita render a cada keystroke)
 */

// ─── 1. API URL (nunca hardcoded) ────────────────────────────────────
// Em produção: injete via <meta name="api-url" content="https://api.seudominio.com">
const API = document.querySelector('meta[name="api-url"]')?.content
  || window.BRIQUEOS_API_URL
  || 'http://localhost:8000';

// ─── 2. Sanitização contra XSS ───────────────────────────────────────
/**
 * Escapa qualquer string antes de inserir em innerHTML.
 * Previne XSS mesmo se a API retornar dados maliciosos.
 */
function sanitize(str) {
  if (str == null) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '/': '&#x2F;' };
  return String(str).replace(/[&<>"'/]/g, c => map[c]);
}

// ─── 3. Lookups O(1) ─────────────────────────────────────────────────
let _comprasMap = new Map();   // id → compra
let _vendidasSet = new Set();  // Set de compra_ids que foram vendidos

/**
 * Reconstruir os maps sempre que compras/vendas forem recarregados.
 * Chame após cada loadData().
 */
function rebuildIndexes() {
  _comprasMap = new Map(compras.map(c => [c.id, c]));
  _vendidasSet = new Set(vendas.map(v => v.compra_id));
}

/** Antes: O(n) por chamada. Depois: O(1) */
function iBI(id) {
  return _comprasMap.get(Number(id));
}

/** Antes: O(n) por chamada. Depois: O(1) */
function isV(id) {
  return _vendidasSet.has(Number(id));
}

/** Lucro total: cachear para não recalcular em cada render */
let _lucroCache = null;
function ltot() {
  if (_lucroCache === null) {
    _lucroCache = vendas.reduce((a, v) => a + (v.lucro || 0), 0);
  }
  return _lucroCache;
}

/** Invalidar caches ao recarregar dados */
function invalidateCaches() {
  _lucroCache = null;
  rebuildIndexes();
}

// ─── 4. Debounce para filtros ─────────────────────────────────────────
function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Usar assim nos event listeners de busca:
// <input oninput="debouncedFilter()">
const debouncedCT = debounce(rCTFiltered);
const debouncedVT = debounce(rVTFiltered);
const debouncedProd = debounce(rProdFiltered);

// ─── 5. Exemplo de render seguro ─────────────────────────────────────
/**
 * Exemplo de como construir HTML de forma segura.
 * Nunca interpoler dados da API diretamente em template literals sem sanitize().
 *
 * ERRADO (vulnerável a XSS):
 *   tb.innerHTML += `<td><strong>${c.titulo}</strong></td>`;
 *
 * CORRETO:
 *   tb.innerHTML += `<td><strong>${sanitize(c.titulo)}</strong></td>`;
 *
 * Alternativamente, use createElement/textContent para DOM seguro:
 */
function createTableRow(compra) {
  const tr = document.createElement('tr');

  const tdTitulo = document.createElement('td');
  const strong = document.createElement('strong');
  strong.textContent = compra.titulo;  // textContent é sempre seguro
  tdTitulo.appendChild(strong);

  if (compra.marca) {
    const small = document.createElement('br');
    const span = document.createElement('span');
    span.className = 'txt2';
    span.style.fontSize = '10px';
    span.textContent = `${compra.marca}${compra.modelo ? ' ' + compra.modelo : ''}`;
    tdTitulo.appendChild(small);
    tdTitulo.appendChild(span);
  }

  tr.appendChild(tdTitulo);
  return tr;
}

// ─── 6. Autenticação: token em sessionStorage ─────────────────────────
/**
 * CORREÇÃO de segurança: usar sessionStorage em vez de localStorage
 * reduz a janela de ataque a XSS (token não persiste após fechar a aba).
 * Alternativa mais segura: usar cookies HttpOnly (requer mudança no backend).
 *
 * Para implementar cookies HttpOnly:
 *   Backend: Set-Cookie: access_token=xxx; HttpOnly; Secure; SameSite=Strict
 *   Frontend: fetch com credentials: 'include'
 */

// Migração automática do localStorage para sessionStorage
(function migrateToken() {
  const oldToken = localStorage.getItem('bq_token');
  if (oldToken && !sessionStorage.getItem('bq_token')) {
    sessionStorage.setItem('bq_token', oldToken);
    sessionStorage.setItem('bq_usuario', localStorage.getItem('bq_usuario') || '');
    // Não remover do localStorage ainda para não quebrar sessões ativas
  }
})();

function getToken() {
  return sessionStorage.getItem('bq_token') || localStorage.getItem('bq_token');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + getToken(),
  };
}
